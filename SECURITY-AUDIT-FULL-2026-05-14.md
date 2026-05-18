# Relatorio completo de seguranca e vulnerabilidades - Kaizen Axis

Data da revisao: 2026-05-14  
Escopo: frontend React/Vite, Supabase Auth, Edge Functions, RLS/policies por tabela, Storage, CAPTCHA, MFA, brute force, rate limit, API Vercel `/api/apuracao`, auditoria e dependencias npm.  
Metodo: revisao estatica local do repositorio, leitura das migrations relevantes, busca por padroes sensiveis e `npm audit --json`. Nao houve consulta live ao painel Supabase; confirmar em producao com as queries do final.

## Sumario executivo

O projeto esta em um nivel de seguranca acima da media para um SaaS Supabase. Ha lockdown global de RLS, revogacao de `anon`, FORCE RLS em tabelas criticas, autenticao por Edge Function no login, validacao server-side de Turnstile quando configurado, MFA TOTP, auditoria, eventos de seguranca, HMAC em webhook de leads, Storage privado para documentos e rate limit persistente em varios endpoints sensiveis.

Os riscos principais restantes estao menos em "RLS totalmente aberto" e mais em consistencia operacional:

- configuracoes que ainda falham permissivas em producao (`APP_ORIGIN`, `TURNSTILE_SECRET_KEY`);
- CORS permissivo em varias Edge Functions, inclusive `get-doc-url-v2` com `*`;
- alguns limits sao fail-open quando a RPC de rate limit falha;
- auditoria ainda aceita inserts diretos do cliente;
- `chat-media` permite SELECT para qualquer autenticado se souber o path;
- rotas/fluxos legados ainda coexistem (`get-doc-url`, `generate-view-once-url`, signed URL direta);
- API `/api/apuracao` valida JWT, mas nao tem throttle/body-size defensivo proprio;
- dependencias npm da raiz ainda apresentam 9 vulnerabilidades, 6 high e 3 moderate.

## Classificacao rapida

| Severidade | Achado | Estado |
|---|---|---|
| Alto | CORS permissivo/fallback `*` em Edge Functions sensiveis | Confirmado |
| Alto | CAPTCHA do login e reset depende de env; sem `TURNSTILE_SECRET_KEY` o backend nao exige desafio | Confirmado |
| Alto | `/api/apuracao` recebe texto sensivel, sem rate limit/body limit proprio no handler | Confirmado |
| Medio/Alto | Rate limit de algumas functions e fail-open se `increment_request_counter` falhar | Confirmado |
| Medio | `audit_logs` permite insert direto por authenticated e action/entity arbitrarios | Confirmado |
| Medio | `audit-log` Edge Function usa rate limit em memoria, nao persistente | Confirmado |
| Medio | `chat-media` privado, mas SELECT para qualquer usuario autenticado por path conhecido | Confirmado |
| Medio | `get-doc-url` legada convive com `get-doc-url-v2` | Confirmado |
| Medio | Fluxo legado chama `generate-view-once-url`, function ausente no repositorio | Confirmado |
| Medio | `receive-lead` tem HMAC e timestamp, mas replay cache e apenas in-memory | Confirmado |
| Baixo/Medio | `count >= limit` bloqueia exatamente na N-esima tentativa configurada | Confirmado |
| Medio | 9 vulnerabilidades npm na raiz; `server/` sem vulnerabilidades | Confirmado |

## Autenticacao, login, CAPTCHA e MFA

### Pontos fortes

- O login usa `supabase.functions.invoke('secure-login')` em vez de `signInWithPassword` direto no browser (`src/pages/Login.tsx:202`).
- `secure-login` valida CAPTCHA server-side quando `TURNSTILE_SECRET_KEY` existe (`supabase/functions/secure-login/index.ts:79`).
- `secure-login` aplica contador persistente por IP antes de chamar GoTrue (`supabase/functions/secure-login/index.ts:107`).
- A autenticacao real e feita pelo endpoint Supabase Auth `/auth/v1/token?grant_type=password`, com anon key, nao service role (`supabase/functions/secure-login/index.ts:142`).
- O frontend faz `setSession` com o token retornado e checa MFA/AAL (`src/pages/Login.tsx:232`, `src/pages/Login.tsx:245`).
- O fluxo de MFA usa challenge/verify TOTP (`src/pages/Login.tsx:293`, `src/pages/Login.tsx:296`).
- Reset de senha e cadastro passam CAPTCHA quando o site key esta configurado (`src/pages/Login.tsx:181`, `src/pages/Login.tsx:491`).

### A-01 Alto - CAPTCHA falha permissivo se env faltar

Evidencias:

- Frontend so exige token se `VITE_TURNSTILE_SITE_KEY` existir (`src/pages/Login.tsx:56`).
- Backend so valida Turnstile se `TURNSTILE_SECRET_KEY` existir (`supabase/functions/secure-login/index.ts:79`).

Impacto: um deploy sem secret/site key perde o CAPTCHA sem bloquear login/reset/cadastro. O rate limit ainda existe, mas o custo de brute force e abuso aumenta.

Recomendacao:

- Criar `REQUIRE_CAPTCHA=true` no backend.
- Em producao, retornar 500/503 se `REQUIRE_CAPTCHA=true` e `TURNSTILE_SECRET_KEY` estiver ausente.
- Para login/reset/cadastro, exigir `captchaToken` quando `REQUIRE_CAPTCHA=true`.
- No CI/deploy, validar secrets obrigatorios antes de publicar.

### A-02 Medio - MFA esta disponivel, mas nao comprovadamente obrigatorio para roles criticas

Evidencia: o frontend bloqueia se o Supabase indicar `nextLevel === 'aal2'` e nao houver AAL2 atual (`src/pages/Login.tsx:248`). Isso depende da configuracao de Auth/Assurance no Supabase; o repositorio nao prova que ADMIN/DIRETOR/GERENTE sao obrigados a usar MFA.

Impacto: se AAL2 nao estiver exigido no painel ou nas policies, usuarios administrativos podem operar so com senha.

Recomendacao:

- Exigir MFA para ADMIN/DIRETOR/GERENTE via Supabase Auth quando possivel.
- Adicionar checagem server-side em RPCs/functions administrativas para `aal2`.
- Registrar evento de seguranca quando role sensivel estiver sem fator TOTP verificado.

### A-03 Baixo - limite de login bloqueia na tentativa numero 10

Evidencia: `LOGIN_LIMIT = 10` e bloqueio com `count >= LOGIN_LIMIT.limit` (`supabase/functions/secure-login/index.ts:11`, `supabase/functions/secure-login/index.ts:123`).

Impacto: a configuracao efetiva permite 9 tentativas e bloqueia a 10a. Nao e vulnerabilidade, mas deve ser intencional/documentado.

Recomendacao: manter se desejado; caso o texto operacional seja "10 permitidas", alterar para `count > limit`.

## Brute force, rate limit e anti-abuso

### Pontos fortes

- Infra persistente: `request_throttles` e `increment_request_counter` existem e so `service_role` executa a RPC (`supabase/migrations/20260327000000_security_layers.sql:108`, `supabase/migrations/20260327000000_security_layers.sql:145`, `supabase/migrations/20260327000000_security_layers.sql:166`).
- Login usa rate limit por IP (`supabase/functions/secure-login/index.ts:107`).
- `rate-guard` limita `login`, `clients_query` e `document_upload` (`supabase/functions/rate-guard/index.ts:10`).
- `checkin-geo` limita 3 tentativas/minuto por usuario (`supabase/functions/checkin-geo/index.ts:93`).
- `kai-agent` limita 20 mensagens/minuto por usuario (`supabase/functions/kai-agent/index.ts:357`).
- `export-pipeline-corretor` limita 10 exportacoes/minuto por usuario (`supabase/functions/export-pipeline-corretor/index.ts:76`).
- `send-push` limita 20 envios/minuto por usuario.
- O trigger `detect_suspicious_activity` gera eventos para brute force, acesso massivo a clientes e download massivo de documentos (`supabase/migrations/20260327000000_security_layers.sql:170`).

### B-01 Medio/Alto - rate limit fail-open em endpoints sensiveis

Evidencias:

- `checkin-geo` bloqueia apenas se nao houver erro na RPC: `if (!checkinRateErr && ... >= 3)` (`supabase/functions/checkin-geo/index.ts:98`).
- `kai-agent` segue a mesma estrategia (`supabase/functions/kai-agent/index.ts:361`).
- `export-pipeline-corretor` segue a mesma estrategia (`supabase/functions/export-pipeline-corretor/index.ts:81`).
- `send-push` loga erro de throttle, mas continua.

Impacto: se a RPC de rate limit falhar por permissao, indisponibilidade ou erro de schema, endpoints caros/sensiveis continuam operando. Isso afeta custo OpenAI, check-in, exportacao de dados e push.

Recomendacao:

- Para `secure-login`, `kai-agent`, `export-pipeline-corretor`, `checkin-geo` e `send-push`, usar fail-closed ou fail-soft por risco:
  - auth/login/export/docs: fail-closed;
  - KAI/push: fail-closed com mensagem de instabilidade;
  - check-in: fail-closed ou fallback local curto, auditado.
- Registrar `security_events` quando o throttle estiver indisponivel.

### B-02 Medio - `audit-log` usa rate limit em memoria

Evidencia: `inMemoryRateLimiter = new Map()` e `MAX_EVENTS_PER_WINDOW = 120` (`supabase/functions/audit-log/index.ts:24`, `supabase/functions/audit-log/index.ts:26`).

Impacto: cold start, escala horizontal ou multiplas instancias reiniciam o contador; um atacante autenticado ou com anon key pode gerar mais eventos que o esperado.

Recomendacao: trocar para `increment_request_counter` por IP + usuario. Manter deduplicacao local apenas como otimizacao.

### B-03 Medio - `/api/apuracao` sem throttle/body-size defensivo no handler

Evidencia: o handler valida JWT (`api/apuracao.ts:2823`, `api/apuracao.ts:2837`), mas nao ha contador/rate limit por usuario/IP nem limite manual de tamanho do body antes de acumular `rawBody` (`api/apuracao.ts:2853`).

Impacto: endpoint processa extratos bancarios sensiveis e pode ser usado para consumo excessivo de CPU/memoria ou tentativa de DoS autenticado.

Recomendacao:

- Adicionar rate limit persistente por usuario/IP para `apuracao`.
- Rejeitar payload acima de limite definido (ex.: 1-3 MB para texto extraido; ou limite por documento no upload antes do OCR).
- Registrar auditoria de uso sem armazenar conteudo bancario bruto.

## Edge Functions

| Function | Auth | Service role | Rate limit | Avaliacao |
|---|---:|---:|---:|---|
| `secure-login` | Pre-auth por IP/CAPTCHA | Sim | Sim, fail-closed | Boa base; precisa CAPTCHA/CORS fail-closed em prod |
| `rate-guard` | Anon para login; JWT nos demais | Sim | Sim | Bom desenho; poucos escopos expostos |
| `audit-log` | apikey anon; JWT opcional | Sim | In-memory | Melhorar allowlist e throttle persistente |
| `checkin-geo` | JWT | Sim | Sim, mas fail-open | Boa validacao QR/GPS/horario; ajustar fail-open |
| `get-doc-url-v2` | JWT + RLS antes de assinar | Sim | Nao observado | Bom gate; adicionar throttle e CORS restrito |
| `get-doc-url` | JWT + apikey + RLS/storage | Sim | Nao observado | Legada; remover se v2 cobre todos os fluxos |
| `export-pipeline-corretor` | JWT + ADMIN/DIRETOR + escopo diretor | Sim | Sim, mas fail-open | Melhorou; ajustar fail-open e CORS |
| `kai-agent` | JWT | Sim para KB/RPC | Sim, mas fail-open | Bom; adicionar quota diaria e fail-closed |
| `receive-lead` | HMAC + timestamp | Sim | Nao observado | Forte; replay cache precisa persistencia |
| `send-push` | JWT claims + role + escopo | Sim | Sim, mas fail-open | Bom; ajustar fail-open |

### E-01 Alto - CORS permissivo em functions sensiveis

Evidencias:

- Varios handlers usam `APP_ORIGIN ?? '*'`: `secure-login`, `rate-guard`, `audit-log`, `checkin-geo`, `kai-agent`, `receive-lead`, `export-pipeline-corretor` (`supabase/functions/secure-login/index.ts:13`, `supabase/functions/rate-guard/index.ts:18`, `supabase/functions/audit-log/index.ts:13`, `supabase/functions/checkin-geo/index.ts:44`, `supabase/functions/kai-agent/index.ts:16`, `supabase/functions/receive-lead/index.ts:9`, `supabase/functions/export-pipeline-corretor/index.ts:7`).
- `get-doc-url-v2` tem `Access-Control-Allow-Origin: "*"` fixo (`supabase/functions/get-doc-url-v2/index.ts:7`).
- `get-doc-url` tambem usa `*`.

Impacto: CORS nao substitui auth, mas fallback `*` aumenta superficie em caso de token roubado, XSS em outro origin, automacao cross-origin ou erro de deploy.

Recomendacao:

- Criar helper unico de CORS com allowlist por ambiente.
- Em producao, se `APP_ORIGIN`/allowlist estiver vazia, falhar fechado.
- Para webhook server-to-server (`receive-lead`), CORS pode ser minimo ou omitido para browsers.

### E-02 Medio - `get-doc-url-v2` nao tem throttle

Evidencia: `get-doc-url-v2` valida JWT e RLS antes de assinar, mas nao chama `increment_request_counter`.

Impacto: usuario autenticado e autorizado pode gerar grande volume de signed URLs e eventos de download, elevando custo/logs e facilitando exfiltracao em massa dentro do proprio escopo.

Recomendacao:

- Adicionar rate limit por usuario: por exemplo 60 signed URLs/min e 300/h.
- Registrar server-side `document_downloaded` na propria function.
- Considerar alerta em `security_events` por volume.

### E-03 Medio - function legada `get-doc-url` ainda exposta

Evidencia: `supabase/functions/get-doc-url/index.ts` ainda existe e assina por bucket/path apos validar RLS por cliente.

Impacto: duas superficies para o mesmo dado aumentam drift, auditoria duplicada e risco de correcao aplicada so na v2.

Recomendacao: migrar chamadas restantes para `get-doc-url-v2`, remover deploy da v1 ou manter v1 bloqueada por feature flag.

### E-04 Medio - `receive-lead` agora usa HMAC, mas replay e in-memory

Ponto positivo: `receive-lead` exige `X-Webhook-Timestamp`, `X-Webhook-Signature`, HMAC-SHA256 de `timestamp.rawBody` e comparacao constant-time (`supabase/functions/receive-lead/index.ts:95`, `supabase/functions/receive-lead/index.ts:111`, `supabase/functions/receive-lead/index.ts:122`).

Risco residual: `SEEN_SIGNATURES` e um `Map` em memoria (`supabase/functions/receive-lead/index.ts:58`). Isso bloqueia replay apenas dentro do mesmo isolate e dentro da janela de 5 minutos.

Recomendacao:

- Persistir `event_id`/nonce/hash da assinatura em tabela com TTL.
- Aplicar rate limit por IP/origem.
- Rejeitar `directorate_id` fora de allowlist se o webhook nao deve escolher diretoria livremente.

## RLS por tabela e grupos de dados

### Baseline global

- `REVOKE ALL` em tabelas/sequences para `anon` (`supabase/migrations/20260330162000_rls_lockdown_all_public_tables.sql:5`).
- Habilita e forca RLS nas tabelas criticas (`supabase/migrations/20260330162000_rls_lockdown_all_public_tables.sql:53`, `supabase/migrations/20260330162000_rls_lockdown_all_public_tables.sql:54`).
- Remove policies que concedem explicitamente a `anon`/`public` (`supabase/migrations/20260330162000_rls_lockdown_all_public_tables.sql:73`).
- Cria deny-all para tabelas criticas sem policy authenticated/service_role (`supabase/migrations/20260330162000_rls_lockdown_all_public_tables.sql:139`).

### Matriz de RLS por area

| Area/tabelas | Estado observado | Risco residual |
|---|---|---|
| `profiles` | Policy consolidada e depois ajuste para GERENTE por equipe (`20260513250000`, `20260513240000`) | Alta complexidade; precisa teste por role |
| `clients` | `clients_select_scoped` consolidada por owner/coordenador/gerente/diretor/admin (`20260513250000`) | Boa; exports/functions devem respeitar mesmo escopo |
| `client_documents` | RLS por cliente + Storage privado escopado | Bom; preferir sempre `get-doc-url-v2` |
| `appointments`, `tasks` | Policies via `app_user_in_scope` | Bom; precisa fixtures de regressao |
| `daily_qr_tokens` | SELECT restrito a roles administrativas (`20260514120000`) | Bom |
| `daily_checkins` | Proprio usuario, fila de hoje, admin/diretor/gerente (`20260514130000`) | Aceitavel; fila de hoje e intencional |
| `checkin_always_present_users` | Authenticated ve `enabled = true`; gestores veem tudo (`20260514130000`) | Medio/baixo: ainda revela usuarios com excecao ativa |
| `audit_logs` | Admin/diretor leem; service role gerencia; authenticated tambem pode inserir proprio/null | Medio: poluicao/falsificacao de eventos |
| `security_events` | Admin/diretor leem; service role gerencia | Bom |
| `request_throttles` | service_role only | Bom |
| `chat_messages` | SELECT participantes/grupo; INSERT sender; UPDATE sender | Bom |
| `chat_message_reactions` | Reactions visiveis para participantes apos fix | Bom |
| `wa_conversations`, `n8n_chat_histories` | service role only | Bom |
| `developments`, `portals` | SELECT authenticated; CRUD estrategico | Medio se conteudo for confidencial |
| `trainings` | Leitura authenticated; escrita estrategica | Aceitavel se material nao for secreto |
| `notifications` | SELECT/UPDATE/DELETE escopado; INSERT authenticated | Medio: risco de spam/logica se cliente puder inserir notificacoes arbitrarias |
| `push_subscriptions` | Proprio usuario + service role | Bom |
| Storage `client-documents` | SELECT autenticado escopado por `client_documents`/cliente | Bom |
| Storage `chat-media` | Bucket privado; SELECT para qualquer authenticated | Medio |

### R-01 Medio - `audit_logs` aceita insert direto por cliente autenticado

Evidencias:

- Policy `authenticated_insert_own_audit_logs` permite insert com `user_id = auth.uid()` ou null (`supabase/migrations/20260327010000_audit_logs_insert_policy.sql:3`, `supabase/migrations/20260327010000_audit_logs_insert_policy.sql:7`).
- O frontend insere diretamente em `audit_logs` com action/entity/metadata controlados pelo cliente (`src/services/auditLogger.ts:35`).

Impacto: usuario autenticado pode poluir logs, simular actions, gerar falsos positivos ou esconder sinais em ruido. Nao quebra RLS de leitura, mas reduz confianca forense.

Recomendacao:

- Migrar eventos sensiveis para Edge Function `audit-log`.
- No banco, restringir insert direto a allowlist de eventos nao criticos ou remover policy authenticated.
- Derivar `user_id` sempre do JWT no servidor.
- Limitar tamanho de `metadata`.

### R-02 Medio - `notifications_insert_authenticated`

Evidencia: policy `notifications_insert_authenticated` existe (`supabase/migrations/20260331142000_fix_notifications_and_goal_targeting_post_lockdown.sql:71`).

Impacto: dependendo do `WITH CHECK`, usuarios podem criar notificacoes para alvos indevidos ou spam operacional. O relatorio estatico nao prova abuso sem ler o estado final live, mas a superficie merece teste.

Recomendacao: preferir insert por service role/RPC controlada ou limitar `target_user_id`, `target_role`, `directorate_id` ao escopo do actor.

## Storage e documentos

### Pontos fortes

- `client-documents` e privado e tem SELECT escopado por documento/cliente (`supabase/migrations/20260330220000_fix_storage_select_scoped_for_client_documents.sql:24`).
- Fluxos principais de abertura de documento usam `get-doc-url-v2` (`src/pages/ClientDetails.tsx:198`, `src/pages/SendEmail.tsx:226`).
- Upload de documentos de cliente usa rate limit via `rateLimiter.enforce('document_upload')` (`src/context/AppContext.tsx:1201`, `src/components/pdf-tools/SaveDocumentModal.tsx:77`).

### S-01 Medio - signed URL direta ainda existe em helper generico

Evidencia: `getDownloadUrl` gera signed URL direto no client para qualquer bucket e registra auditoria client-side (`src/context/AppContext.tsx:1278`, `src/context/AppContext.tsx:1280`).

Impacto: para `client-documents`, o fluxo mais robusto e `get-doc-url-v2`, porque autoriza por RLS de `client_documents`, centraliza TTL e pode auditar server-side. O helper direto aumenta caminhos de acesso e dificulta padronizacao.

Recomendacao: deprecar `getDownloadUrl` para `client-documents`; usar sempre `get-doc-url-v2` por `documentId`.

### S-02 Medio - `chat-media` privado, mas qualquer autenticado pode SELECT por path

Evidencia: policy `chat_media_select_authenticated` permite SELECT quando `bucket_id = 'chat-media' AND auth.uid() IS NOT NULL` (`supabase/migrations/20260514110000_fix_chat_media_select.sql:9`).

Impacto: se um usuario autenticado descobrir path de midia de chat, pode tentar assinar/ler mesmo sem ser participante. O modelo atual melhora em relacao a anon/public, mas nao e isolamento por conversa.

Recomendacao:

- Estruturar path como `<conversation_id>/<message_id>/<filename>` ou `<sender_id>/...` com tabela de mensagem.
- Criar Edge Function para signed URL de chat que valida participante/grupo antes de assinar.
- Ajustar Storage SELECT para validar via `chat_messages` quando possivel.

### S-03 Medio - rota legada de view-once referencia function ausente

Evidencia: `src/pages/ChatDetail.tsx` chama `generate-view-once-url` (`src/pages/ChatDetail.tsx:122`), mas nao ha pasta `supabase/functions/generate-view-once-url`.

Impacto: rota legada pode quebrar view-once ou induzir fallback inconsistente.

Recomendacao: remover rota legada ou implementar function com validacao de participante + TTL curto + uso de `chat_open_view_once`.

## Chat, XSS e conteudo

### Pontos fortes

- Componentes de chat usam `ReactMarkdown` com `rehype-sanitize` (`src/components/chat/ChatMessageBubble.tsx:332`, `src/pages/ChatDetail.tsx:1455`).
- `chat_delete_for_me` e `chat_open_view_once` tiveram grants e hardening (`supabase/migrations/20260513220000_fix_chat_security.sql:32`, `supabase/migrations/20260513220000_fix_chat_security.sql:75`).
- Chat messages foram restritas a participantes/grupos (`supabase/migrations/20260513230000_ensure_chat_access_all_roles.sql:54`).

### C-01 Baixo - sanitizacao esta correta nos pontos observados

Nao encontrei `dangerouslySetInnerHTML` relevante nem `ReactMarkdown` sem `rehype-sanitize` nos pontos de chat atuais. Manter regra de nao renderizar HTML bruto de mensagens.

## API `/api/apuracao`

### Pontos fortes

- Endpoint aceita apenas POST/OPTIONS (`api/apuracao.ts:2819`, `api/apuracao.ts:2820`).
- Valida JWT diretamente no Supabase Auth antes de processar (`api/apuracao.ts:2823`, `api/apuracao.ts:2837`).
- CORS usa origem fixa/env, nao `*` (`api/apuracao.ts:2815`).

### P-01 Alto - falta controle anti-abuso proprio

Risco: a API processa texto de extrato bancario, faz parsing grande e pode consumir CPU/memoria. Mesmo autenticado, sem throttle por usuario/IP e sem limite manual de body antes de acumular chunks, fica exposta a abuso interno/credencial roubada.

Recomendacao:

- Criar `increment_request_counter` scope `apuracao`.
- Limitar tamanho de `rawBody` durante streaming e abortar cedo.
- Adicionar timeout de processamento.
- Auditar metadados: usuario, hash do input, tamanho, banco detectado, duracao, sem persistir conteudo bruto.

## Dependencias npm

Comandos executados:

- Raiz: `npm.cmd audit --json`
- Server: `npm.cmd audit --json` em `server/`

Resultado:

| Projeto | Total | High | Moderate | Critical |
|---|---:|---:|---:|---:|
| raiz | 9 | 6 | 3 | 0 |
| `server/` | 0 | 0 | 0 | 0 |

Principais cadeias vulneraveis na raiz:

- `@vercel/node` direto.
- `@vercel/build-utils` / `@vercel/python-analysis`.
- `minimatch` ReDoS.
- `path-to-regexp` ReDoS.
- `undici` DoS/request smuggling/WebSocket issues.
- `smol-toml` DoS.
- `ajv` ReDoS com `$data`.

Recomendacao:

- Verificar se `@vercel/node` ainda e necessario no app raiz.
- Testar upgrade/ajuste do runtime Vercel em branch isolada; `npm audit` sugere mudanca major para `@vercel/node@4.0.0`.
- Colocar `npm audit --audit-level=high` no CI, com excecoes documentadas se necessario.

## Plano priorizado de correcao

1. Fazer CAPTCHA e CORS falharem fechado em producao (`REQUIRE_CAPTCHA`, allowlist de origins).
2. Adicionar throttle em `get-doc-url-v2` e `/api/apuracao`.
3. Trocar rate limit fail-open para fail-closed nos endpoints sensiveis.
4. Remover/deprecar `get-doc-url` v1 e helper direto de signed URL para `client-documents`.
5. Migrar auditoria sensivel para Edge Function e restringir insert direto em `audit_logs`.
6. Criar signed URL server-side para `chat-media` com validacao por participante.
7. Persistir nonce/hash de replay do webhook `receive-lead`.
8. Revisar `notifications_insert_authenticated`.
9. Exigir MFA/AAL2 para roles administrativas.
10. Resolver ou documentar vulnerabilidades npm da raiz.
11. Criar testes SQL de RLS por role.

## Testes SQL recomendados em producao

```sql
-- RLS ligado/forcado
select schemaname, tablename, rowsecurity, forcerowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- Policies public/auth/service_role
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- Funcoes SECURITY DEFINER e search_path
select n.nspname, p.proname, p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname;

-- Buckets e exposicao publica
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

-- Grants sensiveis
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('audit_logs', 'security_events', 'request_throttles', 'client_documents', 'clients')
order by table_name, grantee, privilege_type;

-- Policies de maior risco residual
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (tablename in ('audit_logs', 'notifications', 'daily_checkins', 'checkin_always_present_users')
   or (schemaname = 'storage' and qual ilike '%chat-media%'))
order by schemaname, tablename, policyname;
```

## Verificacoes executadas

- `rg --files`
- `rg -n` para auth, CAPTCHA, rate limit, CORS, policies, Storage e Markdown.
- Leitura das Edge Functions: `secure-login`, `rate-guard`, `audit-log`, `checkin-geo`, `get-doc-url`, `get-doc-url-v2`, `kai-agent`, `receive-lead`, `send-push`, `export-pipeline-corretor`.
- Leitura das migrations principais de lockdown/RLS/Storage/check-in/chat.
- `npm.cmd audit --json` na raiz: 9 vulnerabilidades.
- `npm.cmd audit --json` em `server/`: 0 vulnerabilidades.

## Conclusao

O Kaizen Axis tem uma boa fundacao de seguranca: RLS e camada principal, `anon` foi reduzido, documentos usam Storage privado, login passa por backend, ha MFA, Turnstile, auditoria e rate limit persistente. A proxima rodada deve focar em fechar configuracoes permissivas, padronizar CORS/throttle, remover caminhos legados e tornar auditoria/Storage de chat mais server-side e verificavel.
