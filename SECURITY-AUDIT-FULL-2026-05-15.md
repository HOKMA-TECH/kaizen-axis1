# Relatorio completo de seguranca e vulnerabilidades - Kaizen Axis

Data da revisao: 2026-05-15  
Escopo: frontend React/Vite, Supabase Auth, Edge Functions, RLS/policies por tabela, Storage, CAPTCHA no login/cadastro/reset, MFA, brute force, rate limit, API Vercel `/api/apuracao`, auditoria e dependencias npm.  
Metodo: revisao estatica local do repositorio, leitura das migrations recentes, busca por padroes sensiveis e `npm audit --json`. Nao houve consulta ao painel Supabase em producao; os itens marcados como "confirmar em producao" dependem de secrets/configuracoes do painel.

## Sumario executivo

O projeto esta com uma base de seguranca madura para um SaaS em Supabase. Foram encontrados controles importantes: lockdown global de RLS, revogacao de `anon`, `FORCE ROW LEVEL SECURITY` em tabelas criticas, login via Edge Function com rate limit por IP, Turnstile validado server-side quando configurado, MFA TOTP, auditoria via Edge Function, webhook de leads com HMAC, documentos privados com signed URL mediada por autorizacao, e rate limit persistente em varios endpoints.

Nao encontrei evidencia de uma tabela critica totalmente aberta para `anon`. O risco principal hoje esta em tres frentes:

- configuracao de producao: CAPTCHA, CORS, MFA obrigatorio e Auth provider precisam estar travados no painel;
- abuso autenticado: endpoints caros/sensiveis ainda precisam de quotas mais completas por usuario/dia e escopo mais fino;
- storage/chat/notificacoes: algumas policies permitem acesso amplo a usuarios autenticados quando o ideal seria escopo por participante/destinatario.

## Classificacao rapida

| Severidade | Achado | Estado |
|---|---|---|
| Alto | CAPTCHA pode ficar opcional se `REQUIRE_CAPTCHA`/Turnstile secrets nao forem configurados em producao | Confirmado por codigo, depende de env |
| Alto | `/api/apuracao` valida JWT e tamanho, mas nao tem rate limit persistente proprio | Confirmado |
| Medio/Alto | `chat-media` permite SELECT para qualquer usuario autenticado que conheca o path | Confirmado |
| Medio | MFA existe, mas obrigatoriedade para roles criticas nao esta provada no repo | Confirmar em producao |
| Medio | `receive-lead` tem HMAC, mas sem rate limit persistente e replay cache apenas em memoria | Confirmado |
| Medio | `notifications` permite que qualquer usuario autenticado insira notificacao para `target_user_id` arbitrario | Confirmado |
| Medio | `audit-log` aceita `action/entity` arbitrarios, embora user_id seja derivado do JWT | Confirmado |
| Medio | Buckets publicos/semipublicos de treinamentos e empreendimentos permitem escrita por qualquer autenticado em migrations antigas | Confirmar estado final em producao |
| Baixo/Medio | `secure-login` bloqueia na tentativa numero 10 quando o limite diz 10 | Confirmado |
| Medio | 9 vulnerabilidades npm na raiz; `server/` sem vulnerabilidades | Confirmado |

## Pontos fortes

- `src/pages/Login.tsx` usa `secure-login` em vez de `signInWithPassword` direto no browser.
- `supabase/functions/secure-login/index.ts` aplica rate limit por IP antes de chamar `/auth/v1/token`.
- `secure-login` valida Turnstile server-side quando `TURNSTILE_SECRET_KEY` existe e falha fechado se `REQUIRE_CAPTCHA=true` sem secret.
- MFA TOTP esta implementado no login e em configuracoes.
- `supabase/migrations/20260330162000_rls_lockdown_all_public_tables.sql` revoga `anon`, liga RLS e cria deny-all para tabelas criticas sem policy.
- `get-doc-url-v2` valida JWT, consulta `client_documents` via RLS e so depois assina o arquivo com service role.
- `audit-log`, `checkin-geo`, `kai-agent`, `export-pipeline-corretor`, `send-push` e `get-doc-url-v2` usam contador persistente via `increment_request_counter`.
- `/api/apuracao` valida JWT no Supabase Auth e limita payload a 3 MB/2M caracteres.
- `receive-lead` usa HMAC-SHA256, timestamp e comparacao constant-time.

## Autenticacao, login, CAPTCHA e MFA

### A-01 Alto - CAPTCHA depende de configuracao correta

Evidencias:

- `src/pages/Login.tsx` so exige token quando `VITE_TURNSTILE_SITE_KEY` existe.
- `supabase/functions/secure-login/index.ts` so valida Turnstile quando `TURNSTILE_SECRET_KEY` existe.
- O backend ja suporta `REQUIRE_CAPTCHA=true`, mas isso precisa estar ativo em producao.

Impacto: um deploy sem `REQUIRE_CAPTCHA=true` ou sem secrets pode operar sem CAPTCHA em login, cadastro e reset. O rate limit ainda reduz brute force, mas o custo de abuso cai bastante.

Recomendacao:

- Em producao, definir `REQUIRE_CAPTCHA=true`.
- Tratar ausencia de `TURNSTILE_SECRET_KEY` como erro bloqueante no deploy.
- Confirmar no painel Supabase que CAPTCHA/Auth esta coerente com a Edge Function.
- Adicionar teste de smoke: login sem `captchaToken` deve retornar 400/503 em producao.

### A-02 Medio - MFA existe, mas obrigatoriedade por role nao esta garantida pelo repo

Evidencias:

- Login checa AAL e bloqueia se Supabase indicar necessidade de AAL2.
- `Settings.tsx` permite enrolar/desenrolar TOTP.
- Nao ha policy/RPC local exigindo `aal2` para `ADMIN`, `DIRETOR` ou `GERENTE`.

Impacto: se a obrigatoriedade nao estiver configurada no painel Supabase, roles administrativas podem acessar apenas com senha.

Recomendacao:

- Exigir MFA para `ADMIN`, `DIRETOR`, `GERENTE` e, idealmente, `COORDENADOR`.
- Em RPCs/functions administrativas, validar AAL2 quando disponivel.
- Criar alerta/auditoria para usuario privilegiado sem fator TOTP verificado.

### A-03 Baixo/Medio - limite efetivo de login e 9 tentativas permitidas

Evidencia: `LOGIN_LIMIT = { limit: 10, windowSeconds: 60 }` e bloqueio com `count >= limit`.

Impacto: a decima tentativa ja e bloqueada. Nao e falha de seguranca, mas pode gerar divergencia operacional.

Recomendacao: manter se intencional, ou trocar para `count > limit` se a regra desejada for "10 tentativas permitidas".

## Brute force, rate limit e anti-abuso

| Superficie | Limite observado | Avaliacao |
|---|---:|---|
| `secure-login` | 10/min por IP | Bom, fail-closed em erro de RPC |
| `rate-guard` | login 10/min, clients 60/min, upload 20/min | Bom para chamadas frontend |
| `audit-log` | 120/min por IP, memoria + persistente | Bom, falta allowlist |
| `checkin-geo` | 3/min por usuario | Bom, fail-closed |
| `get-doc-url-v2` | 60/min por usuario | Bom |
| `kai-agent` | 20/min por usuario | Bom, falta quota diaria/custo |
| `export-pipeline-corretor` | 10/min por usuario | Bom |
| `send-push` | 20/min por usuario | Bom |
| `receive-lead` | Nao observado | Precisa persistir limite |
| `/api/apuracao` | Nao observado | Precisa rate limit persistente |

### B-01 Alto - `/api/apuracao` sem rate limit persistente proprio

Evidencias:

- `api/apuracao.ts` valida JWT via `/auth/v1/user`.
- O handler tem limite de `Content-Length` e `textoExtrato`, mas nao chama `increment_request_counter` nem outro throttle.

Impacto: endpoint processa extratos bancarios sensiveis e pode consumir CPU/memoria de forma significativa. Um usuario autenticado pode automatizar chamadas dentro dos limites da plataforma.

Recomendacao:

- Adicionar rate limit por usuario e IP, por exemplo 20/min e 200/dia.
- Registrar auditoria de uso com hash/metadata, sem persistir conteudo bancario bruto.
- Considerar fila/worker se arquivos grandes entrarem no fluxo.

### B-02 Medio - `receive-lead` sem throttle persistente e replay cache local

Evidencias:

- HMAC e timestamp estao corretos.
- `SEEN_SIGNATURES` e um `Map` em memoria da Edge Function.
- Nao ha chamada a `increment_request_counter`.

Impacto: replay fica bloqueado apenas no mesmo isolate e por ate 5 minutos. Um atacante com secret vazado ou integracao comprometida pode gerar volume alto.

Recomendacao:

- Persistir nonce/event_id/signature hash em tabela com TTL.
- Rate limit por IP/origem e por `directorate_id`.
- Exigir `event_id` unico do provedor.

### B-03 Medio - KAI precisa quota de custo alem de limite por minuto

Evidencia: `kai-agent` limita 20 mensagens/min por usuario e chama OpenAI.

Impacto: limite por minuto nao impede custo mensal alto por uso continuo autenticado.

Recomendacao:

- Adicionar quota diaria/mensal por usuario/role.
- Registrar tokens estimados, modelo e latencia.
- Bloquear prompts acima de tamanho esperado e limitar historico ja no cliente e no servidor.

## Edge Functions

| Function | Auth | Service role | Rate limit | Avaliacao |
|---|---:|---:|---:|---|
| `secure-login` | Pre-auth por IP + CAPTCHA opcional/obrigatorio por env | Sim | Sim | Boa; depende de `REQUIRE_CAPTCHA` em prod |
| `rate-guard` | Anon para login; JWT nos demais | Sim | Sim | Bom desenho |
| `audit-log` | `apikey` anon; JWT opcional | Sim | Sim | Bom; falta allowlist de eventos |
| `checkin-geo` | JWT | Sim | Sim | Bom; GPS/QR/horario coerentes |
| `get-doc-url-v2` | JWT + RLS | Sim | Sim | Bom; manter v1 bloqueada |
| `get-doc-url` | Retorna 410 | Nao aplicavel | Nao aplicavel | Legado bloqueado corretamente |
| `generate-view-once-url` | JWT + RLS + RPC atomica | Sim | Nao observado | Boa logica, adicionar throttle |
| `kai-agent` | JWT | Sim | Sim | Bom, precisa quota diaria |
| `export-pipeline-corretor` | JWT + role + escopo | Sim | Sim | Bom |
| `receive-lead` | HMAC + timestamp | Sim | Nao | Precisa throttle/replay persistente |
| `send-push` | JWT claims + role + escopo | Sim | Sim | Bom; CORS fallback `*` merece ajuste |

### E-01 Medio - CORS depende de `APP_ORIGIN`; `send-push` tem fallback `*`

Evidencias:

- Varias functions usam `Deno.env.get('APP_ORIGIN') ?? ''`.
- `send-push` usa `Deno.env.get('APP_ORIGIN') ?? '*'`.

Impacto: CORS nao substitui autenticacao, mas origin permissivo facilita abuso em caso de token exposto/XSS e aumenta superficie de chamadas browser-origin.

Recomendacao:

- Criar helper unico de CORS com allowlist por ambiente.
- Em producao, falhar fechado se `APP_ORIGIN` estiver vazio.
- Remover fallback `*` de `send-push`.

### E-02 Medio - `generate-view-once-url` sem rate limit observado

Evidencia: a function valida JWT e usa RPC atomica `chat_open_view_once`, mas nao aplica `increment_request_counter`.

Impacto: abuso autenticado pode martelar a function, gerando carga e logs. O dano funcional e limitado pela RPC atomica, mas ainda ha custo.

Recomendacao: adicionar limite por usuario, por exemplo 60/min.

## RLS por tabela e areas de dados

### Baseline global

- `anon` sem privilegios gerais em tabelas/sequences.
- RLS habilitado em todas as tabelas publicas.
- `FORCE RLS` aplicado em conjunto critico.
- Policies publicas/anon removidas em lockdown.
- Tabelas criticas sem policy recebem deny-all para `authenticated`.

### Matriz por area

| Area/tabelas | Estado observado | Risco residual |
|---|---|---|
| `profiles` | Escopo por role/hierarquia; helper SECURITY DEFINER para resolver recursao | Alta complexidade; requer testes por role |
| `clients` | `clients_select_scoped` consolidada por owner/coordenador/gerente/diretor/admin | Bom; testar regressao de escopo |
| `client_documents` | RLS por cliente; URL assinada via `get-doc-url-v2` | Bom |
| `daily_qr_tokens` | SELECT restrito a admin/diretor/gerente | Bom |
| `daily_checkins` | Usuario ve proprio historico; todos veem fila de hoje; gestores veem tudo | Aceitavel se fila publica for intencional |
| `checkin_always_present_users` | Todos autenticados veem enabled=true | Aceitavel se lista ativa nao for sensivel |
| `audit_logs` | Insert direto removido; service role via function | Bom; falta allowlist |
| `notifications` | Insert restrito parcialmente | Risco de spam individual |
| `distribution_control` | RLS sem policy para usuarios | Bom |
| `chat_messages` | Policies de participante/grupo e view-once atomico | Bom; testar grupos |
| `chat-media` | Bucket privado, SELECT para qualquer autenticado | Precisa escopo por participante/path |
| `wa_conversations`, `n8n_chat_histories` | Restrito a service role em migrations recentes | Bom |
| `trainings`, `developments` storage | Migrations antigas permitem escrita ampla por authenticated | Confirmar estado final no banco |

### R-01 Medio/Alto - `chat-media` escopado apenas por autenticacao

Evidencia: migration `20260514110000_fix_chat_media_select.sql` remove `public`, mas cria `SELECT TO authenticated` para `bucket_id = 'chat-media'`.

Impacto: qualquer usuario logado que obtenha ou adivinhe um path valido pode ler o objeto. Para midia de chat, o escopo correto e participante/remetente/destinatario/grupo, nao "qualquer autenticado".

Recomendacao:

- Mover midia sensivel para bucket privado sem SELECT direto.
- Servir midia por Edge Function que valida `chat_messages` via RLS antes de assinar.
- Para arquivos normais, criar estrutura de path com `sender_id` e policy que confira relacao com mensagem.

### R-02 Medio - `notifications` permite alvo individual arbitrario

Evidencia: `20260514150000_restrict_notifications_insert.sql` permite roles nao gestoras inserirem notificacoes quando `target_user_id IS NOT NULL` e sem `target_role/directorate_id`.

Impacto: usuario autenticado pode gerar spam/assediar qualquer UUID de usuario se conseguir descobrir IDs.

Recomendacao:

- Exigir `app_user_in_scope(target_user_id)` tambem para notificacao individual.
- Ou mover criacao de notificacao para RPC/Edge Function por tipo de evento permitido.
- Adicionar rate limit de insert em notificacoes, se ainda nao houver trigger/controle.

### R-03 Medio - storage de treinamentos/empreendimentos precisa confirmacao final

Evidencias:

- Migrations antigas criam buckets publicos `trainings` e `developments`.
- Migrations antigas permitem INSERT/UPDATE/DELETE em storage para qualquer `authenticated`.

Impacto: se essas policies seguem ativas em producao, qualquer usuario logado pode sobrescrever/deletar materiais ou midias publicas.

Recomendacao:

- Confirmar policies atuais com query no final deste relatorio.
- Restringir escrita a `ADMIN`, `DIRETOR`, `GERENTE`/criador, conforme regra de negocio.
- Manter leitura publica apenas quando o conteudo realmente for publico.

## Auditoria e monitoramento

### Pontos fortes

- `audit-log` deriva `user_id` do JWT quando presente.
- Login invalido e auditado server-side em `secure-login`.
- Rate limit de auditoria existe em memoria e persistente.
- `security_events` e `request_throttles` foram modelados para deteccao.

### L-01 Medio - `audit-log` aceita action/entity arbitrarios

Impacto: eventos forenses podem ficar poluidos por clientes autenticados ou pre-auth com anon key. O user_id e derivado corretamente, mas a semantica do evento nao e validada.

Recomendacao:

- Allowlist de `action/entity` por origem.
- Para eventos sensiveis, gerar server-side no proprio endpoint que executou a acao.
- Deduplicar por correlation id.

## Frontend e superficie browser

Pontos positivos:

- Nao foi encontrado uso de `dangerouslySetInnerHTML`, `eval` ou `new Function` em `src`.
- `react-markdown` esta acompanhado de `rehype-sanitize` nas dependencias.
- Rotas protegidas redirecionam usuarios sem sessao, pendentes e inativos.

Riscos:

- Autorizacao frontend e apenas UX; a seguranca real depende de RLS/functions. Isso esta correto, mas precisa testes automatizados por role.
- `localStorage` guarda rascunho de novo cliente. Evitar CPF/renda/documentos sensiveis em storage local se o dispositivo for compartilhado.

## Dependencias

Resultado de `npm audit --json` na raiz:

- total: 9 vulnerabilidades;
- high: 6;
- moderate: 3;
- caminho principal: `@vercel/node` -> `@vercel/build-utils`, `@vercel/static-config`, `path-to-regexp`, `undici`, `minimatch`, `smol-toml`, `ajv`;
- `fixAvailable` sugere downgrade major para `@vercel/node@4.0.0`, entao nao aplicar automaticamente sem validar compatibilidade.

Resultado em `server/`:

- 0 vulnerabilidades.

Recomendacao:

- Avaliar se `@vercel/node` precisa estar em `devDependencies` da raiz.
- Testar uma atualizacao controlada ou pin/override de transitive dependencies quando seguro.
- Rodar build e endpoint `/api/apuracao` apos ajuste.

## Checklist priorizado

1. Ativar e validar `REQUIRE_CAPTCHA=true` + `TURNSTILE_SECRET_KEY` em producao.
2. Remover fallback CORS `*` de `send-push` e padronizar allowlist.
3. Adicionar rate limit persistente em `/api/apuracao` e `receive-lead`.
4. Escopar `chat-media` por participante ou servir exclusivamente via signed URL autorizada.
5. Exigir MFA/AAL2 para roles administrativas no painel e, se possivel, em endpoints sensiveis.
6. Restringir `notifications.target_user_id` com `app_user_in_scope`.
7. Criar allowlist em `audit-log`.
8. Confirmar policies finais de storage para `trainings` e `developments`.
9. Criar testes RLS por role: corretor, coordenador, gerente sem diretoria, diretor, admin, recepcao, analista.
10. Resolver ou justificar as 9 vulnerabilidades npm da raiz.

## Queries de verificacao em producao

```sql
-- Policies por tabela
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;
```

```sql
-- Tabelas publicas sem RLS ou sem FORCE RLS
select schemaname, relname, relrowsecurity, relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by relname;
```

```sql
-- Buckets e exposicao publica
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;
```

```sql
-- Grants perigosos para anon/authenticated
select table_schema, table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

```sql
-- Functions SECURITY DEFINER para revisao manual
select n.nspname as schema, p.proname as function_name, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname;
```

## Conclusao

O sistema nao parece exposto de forma ampla por `anon` e ja tem uma arquitetura defensiva consistente. Os proximos ganhos de seguranca estao em endurecimento operacional e escopo fino: tornar CAPTCHA/MFA/CORS impossiveis de esquecer em producao, limitar abuso autenticado em endpoints caros, e fechar storage/chat/notificacoes para que "usuario autenticado" nao seja tratado como permissao suficiente quando o dado e privado.
