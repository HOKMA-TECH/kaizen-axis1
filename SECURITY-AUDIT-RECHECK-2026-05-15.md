# Rechecagem de seguranca e vulnerabilidades - Kaizen Axis

Data da rechecagem: 2026-05-15  
Escopo: React/Vite, Supabase Auth, Edge Functions, RLS, Storage, CAPTCHA, MFA, brute force, rate limit, API Vercel `/api/apuracao`, auditoria, notificacoes, chat media, dependencias npm.  
Metodo: revisao estatica local, busca por padroes sensiveis, leitura das migrations finais de 2026-05-14/2026-05-15, leitura das Edge Functions e execucao de `npm audit --json`. Nao houve consulta live ao painel Supabase; itens de segredo/env continuam exigindo confirmacao operacional.

## Sumario executivo

Esta rechecagem encontrou uma postura melhor que a registrada no relatorio anterior. Algumas recomendacoes ja aparecem implementadas no workspace:

- `/api/apuracao` agora chama `rate-guard` com escopo `apuracao` e falha fechado se o guard estiver indisponivel.
- `rate-guard` agora inclui `apuracao: 20/min`.
- `receive-lead` ganhou rate limit persistente por IP.
- `generate-view-once-url` ganhou rate limit persistente por usuario.
- `kai-agent` ganhou quota diaria de 100 mensagens por usuario.
- `audit-log` ganhou allowlist de `action` e `entity`.
- storage de `trainings` e `developments` ganhou migration restringindo escrita a `ADMIN`, `DIRETOR`, `GERENTE`.
- `send-push` nao usa mais fallback CORS `*`; usa `APP_ORIGIN ?? ''`.

O risco principal restante nao parece ser exposicao ampla por `anon`; o risco agora esta em permissoes amplas para usuarios autenticados em alguns fluxos privados, TTLs longos de signed URLs de chat, e configuracoes de producao que nao podem ser provadas pelo repositorio.

## Status rapido

| Severidade | Achado atual | Estado |
|---|---|---|
| Alto | `chat-media` gera signed URLs de 1 ano no cliente e SELECT do bucket e amplo para autenticados | Confirmado |
| Alto | `send-email` e chamado pelo frontend, mas a Edge Function nao existe no repositorio para auditoria | Confirmado no repo |
| Medio/Alto | `notifications` teve protecao por `app_user_in_scope` revertida; qualquer autenticado pode notificar qualquer `target_user_id` especifico | Confirmado |
| Medio | CAPTCHA ainda depende de `REQUIRE_CAPTCHA=true` e secrets corretos em producao | Confirmar em producao |
| Medio | MFA existe, mas obrigatoriedade por role critica nao esta provada por codigo/migration | Confirmar em producao |
| Medio | `receive-lead` tem rate limit, mas replay protection segue apenas em memoria | Confirmado |
| Medio | `secure-login`, `rate-guard` e varias functions dependem de `APP_ORIGIN`; vazio nao e fail-closed de CORS | Confirmado |
| Medio | Dependencias raiz ainda tem 9 vulnerabilidades npm, 6 high e 3 moderate | Confirmado |
| Baixo/Medio | varios limites usam `count >= limit`, bloqueando na tentativa N do limite | Confirmado |

## Itens corrigidos desde a auditoria anterior

### 1. `/api/apuracao` agora tem rate limit

Evidencias:

- `api/apuracao.ts` valida JWT.
- Depois chama `${SUPABASE_URL}/functions/v1/rate-guard` com `scope: 'apuracao'`.
- Se `rate-guard` retorna 429, responde 429.
- Se `rate-guard` falha, responde 503, ou seja, fail-closed.
- `supabase/functions/rate-guard/index.ts` inclui `apuracao: { limit: 20, windowSeconds: 60 }`.

Avaliacao: o achado anterior de falta de throttle para apuracao foi mitigado. Risco residual: nao ha quota diaria/mensal, e o limite por minuto ainda permite uso pesado sustentado por usuario.

Recomendacao: adicionar cota diaria, por exemplo 100-300 apuracoes/dia por role, e auditoria de volume sem armazenar extrato bruto.

### 2. `receive-lead` agora tem rate limit persistente

Evidencias:

- `receive-lead` valida HMAC antes de processar.
- Depois chama `increment_request_counter` com `_scope: 'receive_lead'`, `_identifier: IP`, janela de 1 minuto.
- Bloqueia em `leadCount >= 10` ou erro de RPC.

Avaliacao: melhora relevante. Risco residual: replay cache ainda e `Map` em memoria; reinicios/cold starts removem historico de assinaturas vistas.

Recomendacao: persistir `event_id` ou hash de assinatura/body em tabela com TTL.

### 3. `generate-view-once-url` agora tem throttle

Evidencias:

- `generate-view-once-url` valida JWT.
- Chama `increment_request_counter` com `_scope: 'view_once_url'`, `_identifier: user.id`.
- Limite: 60/min.

Avaliacao: o risco de abuso autenticado caiu. A logica atomica de `chat_open_view_once` continua sendo o controle principal.

### 4. `kai-agent` agora tem quota diaria

Evidencias:

- Limite por minuto: `_scope: 'kai_agent'`, 20/min.
- Quota diaria: `_scope: 'kai_agent_daily'`, 100/dia.

Avaliacao: bom controle de custo. Risco residual: nao mede tokens/custo por modelo; usuario pode gastar mais com mensagens longas dentro da cota.

### 5. `audit-log` agora tem allowlist

Evidencias:

- `ALLOWED_ACTIONS` e `ALLOWED_ENTITIES` existem em `supabase/functions/audit-log/index.ts`.
- Eventos fora da allowlist retornam 400.
- `user_id` e derivado do JWT quando presente.
- Rate limit local + persistente permanecem.

Avaliacao: achado anterior foi mitigado. Risco residual: `custom` e `test_event` ainda existem; manter apenas se necessario.

### 6. Escrita em `trainings` e `developments` foi restringida

Evidencia:

- `20260514170000_restrict_storage_writes_trainings_developments.sql` remove policies antigas de escrita ampla.
- Novas policies permitem INSERT/UPDATE/DELETE apenas para `ADMIN`, `DIRETOR`, `GERENTE`.

Avaliacao: bom ajuste. Risco residual: leitura continua publica, o que pode ser aceitavel para materiais/catalogo, mas deve ser decisao consciente.

## Achados atuais prioritarios

### C-01 Alto - `chat-media` ainda e amplo demais e usa signed URL de 1 ano

Evidencias:

- `20260514110000_fix_chat_media_select.sql` mudou `chat-media` para bucket privado, mas criou SELECT para qualquer `authenticated`.
- `src/pages/ChatDetail.tsx` define `SIGNED_URL_TTL = 60 * 60 * 24 * 365`.
- `src/components/chat/ChatDetailPanel.tsx` tambem define `SIGNED_URL_TTL = 60 * 60 * 24 * 365`.
- O frontend chama `supabase.storage.from('chat-media').createSignedUrl(...)` diretamente em varios pontos.

Impacto:

- Qualquer usuario autenticado que obtenha um path pode gerar signed URL.
- Signed URLs de 1 ano funcionam quase como URLs permanentes.
- Para midia de chat, permissao deveria ser por participante/membro do grupo, nao por login generico.

Recomendacao:

- Criar Edge Function `get-chat-media-url`.
- Validar JWT e consultar `chat_messages` por RLS/participacao antes de assinar.
- Reduzir TTL para 5-15 minutos para midia normal.
- Para avatar publico, usar bucket separado ou path proprio, nao o mesmo bucket de midia privada.
- Ideal: remover SELECT direto de `chat-media` para `authenticated` e servir via function.

### C-02 Alto - `send-email` nao esta auditavel no repositorio

Evidencias:

- `src/pages/SendEmail.tsx` chama `${SUPABASE_URL}/functions/v1/send-email`.
- `rg --files supabase/functions` nao encontrou `send-email`.
- A chamada inclui `apikey`, mas nao envia JWT `Authorization` para a function de envio em si.
- Anexos sao obtidos via `get-doc-url-v2`, mas o envio final depende de uma function ausente.

Impacto:

- Nao da para verificar se `send-email` valida JWT, origem, destinatarios, anexos, rate limit e permissao de cliente.
- Se a function existir apenas em producao e aceitar anon key, pode virar relay de email/anexo.

Recomendacao:

- Trazer `supabase/functions/send-email/index.ts` para o repo.
- Exigir JWT na function.
- Validar que o usuario tem acesso ao cliente/documentos.
- Rate limit por usuario e por destinatario.
- Bloquear anexos grandes e tipos perigosos.
- Auditar assunto, destinatarios, ids de documentos e cliente, sem logar conteudo sensivel.

### C-03 Medio/Alto - policy de `notifications` foi revertida para permitir alvo arbitrario

Evidencias:

- `20260514160000_notifications_insert_scope_check.sql` adicionou `app_user_in_scope(target_user_id)`.
- `20260514180000_fix_notifications_r02_revert_scope.sql` removeu esse check.
- Estado final: usuarios nao gestores podem inserir notification com qualquer `target_user_id`, desde que `target_role` e `directorate_id` sejam nulos.

Impacto:

- Evita blast por role/diretoria, mas permite spam individual para qualquer UUID conhecido.
- Pode ser usado para engenharia social interna, flood de notificacoes ou tentativa de assediar usuarios.

Recomendacao:

- Nao voltar simplesmente para `app_user_in_scope`, pois a propria migration explica que isso quebrou notificacoes ascendentes.
- Criar RPC/Edge Function para notificacoes de chat/grupo com regra semantica:
  - pode notificar membros adicionados ao grupo se o autor e criador/admin do grupo;
  - pode notificar interlocutor de conversa se existe relacao/mensagem;
  - pode notificar gestor/coordenador se a relacao hierarquica existir;
  - impedir inserts diretos em `notifications` para roles comuns.

### C-04 Medio - CAPTCHA ainda e configuracao operacional

Evidencias:

- `secure-login` suporta `REQUIRE_CAPTCHA=true`.
- Sem `TURNSTILE_SECRET_KEY`, CAPTCHA so e obrigatorio se `REQUIRE_CAPTCHA=true`.
- Frontend so renderiza Turnstile quando `VITE_TURNSTILE_SITE_KEY` existe.

Impacto: deploy mal configurado perde CAPTCHA sem mudar codigo.

Recomendacao:

- Em producao, secrets obrigatorios:
  - `REQUIRE_CAPTCHA=true`
  - `TURNSTILE_SECRET_KEY`
  - `VITE_TURNSTILE_SITE_KEY`
- Criar smoke test de producao: login sem token deve falhar.

### C-05 Medio - MFA existe, mas enforcement por role nao esta provado

Evidencias:

- Login checa AAL2 via Supabase Auth.
- Settings permite enroll/unenroll TOTP.
- Nao foi encontrada policy/RPC local exigindo AAL2 para actions de admin.

Impacto: se o painel Supabase nao exigir MFA, admin/diretor/gerente podem operar so com senha.

Recomendacao:

- Exigir MFA para `ADMIN`, `DIRETOR`, `GERENTE`, `COORDENADOR`.
- Em Edge Functions administrativas, validar AAL/claims quando possivel.
- Auditar usuarios privilegiados sem fator verificado.

### C-06 Medio - CORS com `APP_ORIGIN ?? ''` nao e allowlist robusta

Evidencias:

- Varias functions usam `Access-Control-Allow-Origin` baseado em `APP_ORIGIN ?? ''`.
- `send-push` melhorou e nao usa mais `*`.

Impacto: vazio pode quebrar browsers de forma silenciosa; um unico origin fixo nao cobre ambientes preview/staging de modo seguro.

Recomendacao:

- Criar helper de CORS com allowlist explicita.
- Rejeitar origin fora da allowlist.
- Fail-closed quando `APP_ORIGIN` nao estiver definido em producao.

### C-07 Medio - signed URL direta para `client-documents` ainda existe em helper generico

Evidencia:

- `src/context/AppContext.tsx` tem `getDownloadUrl` que chama `supabase.storage.from(bucket).createSignedUrl(path, 60)`.
- Fluxos principais de documentos de cliente (`ClientDetails`, `SendEmail`) usam `get-doc-url-v2`, mas helper generico continua disponivel.

Impacto: se algum componente chamar `getDownloadUrl(path, 'client-documents')`, ele pode contornar rate limit/auditoria centralizada da `get-doc-url-v2`, dependendo das policies de `storage.objects`.

Recomendacao:

- Fazer `getDownloadUrl` recusar `client-documents` e chamar `get-doc-url-v2`.
- Auditar/remover chamadas legadas.

## Edge Functions - matriz atual

| Function | Auth | Service role | Rate limit | Observacao |
|---|---:|---:|---:|---|
| `secure-login` | Pre-auth por IP, CAPTCHA por env | Sim | Sim | Bom; confirmar `REQUIRE_CAPTCHA=true` |
| `rate-guard` | Anon para login, JWT nos demais | Sim | Sim | Inclui `apuracao` |
| `audit-log` | apikey anon, JWT opcional | Sim | Sim | Agora tem allowlist |
| `checkin-geo` | JWT | Sim | Sim | Bom; QR/GPS/horario |
| `get-doc-url-v2` | JWT + RLS | Sim | Sim | Bom |
| `get-doc-url` | 410 descontinuado | N/A | N/A | Superficie bloqueada |
| `generate-view-once-url` | JWT + RLS | Sim | Sim | Bom |
| `kai-agent` | JWT | Sim | Sim + diaria | Bom |
| `receive-lead` | HMAC + timestamp | Sim | Sim | Replay ainda local |
| `send-push` | JWT claims + role + escopo | Sim | Sim | Bom |
| `send-email` | Nao auditavel no repo | Desconhecido | Desconhecido | Risco alto ate trazer codigo |

## RLS e Storage - estado observado

### Bom estado

- Lockdown global de RLS e revogacao de `anon`.
- `request_throttles` gerido por service role.
- `distribution_control` com RLS sem policy para usuarios comuns.
- `daily_qr_tokens` restrito a roles administrativas.
- `daily_checkins` restrito a proprio usuario, fila do dia e gestores.
- `audit_logs` sem insert direto de authenticated; gravacao via function.
- `trainings` e `developments` storage com escrita restrita por role apos migration 20260514170000.

### Riscos residuais

- `chat-media` nao esta escopado por participante.
- `notifications` permite alvo individual arbitrario.
- `chat-media-private` e usado no frontend/function, mas nao encontrei migration criando bucket/policies no repo. Pode existir em producao, mas precisa ser versionado.
- `documents/trainings/` antigo ainda aparece em migrations antigas; confirmar policies atuais em producao.

## Dependencias

Resultado de `npm audit --json` na raiz:

- total: 9 vulnerabilidades;
- high: 6;
- moderate: 3;
- cadeia principal: `@vercel/node` e transitive dependencies (`@vercel/build-utils`, `@vercel/static-config`, `path-to-regexp`, `undici`, `minimatch`, `smol-toml`, `ajv`);
- `fixAvailable` aponta para `@vercel/node@4.0.0` com mudanca major, exigindo teste.

Resultado em `server/`:

- 0 vulnerabilidades.

Recomendacao:

- Validar se `@vercel/node` precisa mesmo ficar na raiz.
- Testar atualizacao controlada ou override seguro para transitive dependencies.
- Rodar build e teste de `/api/apuracao` apos qualquer mudanca.

## Checklist priorizado

1. Trazer `send-email` para o repositorio e auditar auth/rate limit/anexos.
2. Substituir signed URL direta de `chat-media` por Edge Function autorizada e TTL curto.
3. Criar fluxo semantico para notificacoes em vez de insert direto amplo em `notifications`.
4. Confirmar `REQUIRE_CAPTCHA=true` e Turnstile secrets em producao.
5. Exigir MFA para roles criticas e auditar ausencia de fator TOTP.
6. Padronizar CORS com allowlist e fail-closed em producao.
7. Fazer `getDownloadUrl` delegar `client-documents` para `get-doc-url-v2`.
8. Versionar bucket/policies de `chat-media-private`.
9. Adicionar quota diaria para `/api/apuracao`.
10. Resolver ou justificar as 9 vulnerabilidades npm da raiz.

## Queries para confirmar em producao

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;
```

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;
```

```sql
select n.nspname as schema, p.proname as function_name, p.prosecdef, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname;
```

```sql
select table_schema, table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

## Conclusao

A rechecagem mostra evolucao real: varios riscos citados antes foram mitigados. O foco agora deve sair de "colocar rate limit em tudo" e ir para isolamento de dados privados por relacao real: participante de chat, usuario alvo legitimo de notificacao, cliente/documento autorizado e envio de email auditavel. O sistema esta em bom caminho, mas `chat-media` e `send-email` sao os dois pontos que eu trataria primeiro.
