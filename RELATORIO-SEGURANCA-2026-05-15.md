# Relatorio de seguranca - Kaizen Axis

Data: 2026-05-15  
Tipo: novo relatorio de seguranca e vulnerabilidades  
Escopo: frontend React/Vite, API Vercel, servidor Express, Supabase Edge Functions, migrations/RLS, Storage, chat/media, login, webhooks, dependencias e vazamento de dados.  
Limite: auditoria estatica local. Nao foi executado pentest ativo contra producao nem consulta SQL no banco remoto.

## Sumario executivo

O projeto esta em um bom nivel de seguranca para uma aplicacao Supabase com dados sensiveis. Os maiores vazamentos historicos em chat/media foram reduzidos: `get-chat-media-url` agora usa TTL menor e valida `media_path` contra mensagem real antes de assinar; `receive-lead` tambem deixou de devolver erro interno cru em `500`.

O risco atual ficou mais concentrado em tres areas:

1. Upload amplo no bucket `chat-media`: qualquer usuario autenticado ainda consegue criar objeto no bucket.
2. Superficie de dados no browser: varios `select('*')`, historico local do KAI e drafts em `localStorage` aumentam impacto caso haja XSS ou dispositivo comprometido.
3. Dependencias de tooling/build: audit completo ainda aponta vulnerabilidades, embora producao esteja limpa com `--omit=dev`.

Classificacao geral: bom, com P1 operacional pendente antes de considerar "muito bom".

## Evidencias executadas

| Check | Resultado |
|---|---|
| `npm.cmd audit --json` na raiz | 7 vulnerabilidades: 3 high, 4 moderate, 0 critical |
| `npm.cmd audit --omit=dev --json` na raiz | 0 vulnerabilidades |
| `npm.cmd audit --json` em `server/` | 0 vulnerabilidades |
| Scan de segredos com `rg` | sem segredos hardcoded relevantes |
| Scan de sinks perigosos | sem `dangerouslySetInnerHTML`, `eval`, `new Function`, `rehypeRaw` ou atribuicao direta a `innerHTML` |
| Revisao manual | Edge Functions, Storage, RLS/migrations de maio, login, chat/media |

## Mudancas positivas observadas

### `get-chat-media-url` esta mais forte

Evidencias:

- `supabase/functions/get-chat-media-url/index.ts:13` reduziu `SIGNED_URL_TTL` para 900 segundos.
- `supabase/functions/get-chat-media-url/index.ts:113-121` consulta `chat_messages` e exige `media_path = path`.
- `supabase/functions/get-chat-media-url/index.ts:129` so assina depois da validacao.

Impacto:

Isso corrige um risco importante: antes um participante poderia pedir URL assinada para objeto arbitrario dentro do prefixo da conversa. Agora o objeto precisa estar vinculado a uma mensagem nao apagada.

Risco residual:

A validacao ainda nao considera explicitamente `deleted_for`, nem diferencia midia view-once em `chat-media-private`, mas ja e uma melhora grande.

### `receive-lead` nao retorna mais erro interno cru

Evidencia:

- `supabase/functions/receive-lead/index.ts:211` retorna `Erro interno ao processar lead`.

Impacto:

Reduz vazamento de schema, constraint e detalhes de banco para consumidores do webhook.

### Producao npm esta limpa

Evidencia:

- `npm audit --omit=dev --json`: 0 vulnerabilidades.
- `server/npm audit --json`: 0 vulnerabilidades.

Impacto:

As vulnerabilidades restantes parecem concentradas em tooling/build/dev, nao nas dependencias de producao auditadas.

## Achados prioritarios

### P1-01. Upload em `chat-media` continua amplo para qualquer autenticado

Severidade: Medio/Alto

Evidencia:

- `supabase/migrations/20260513221000_fix_chat_storage_security.sql:21` cria a policy `chat_media_insert`.
- `supabase/migrations/20260513221000_fix_chat_storage_security.sql:25-27` exige apenas `bucket_id = 'chat-media'` e `auth.uid() IS NOT NULL`.

Impacto:

Qualquer usuario autenticado pode criar objetos no bucket `chat-media`. Mesmo que a leitura esteja protegida por Edge Function, isso ainda permite abuso de storage/quota, objetos orfaos, plantio de arquivos em prefixos de conversa e aumento da superficie operacional.

Recomendacao:

- Mover upload de chat para Edge Function que valida participante antes de gravar; ou
- Alterar o path para incluir uploader e validar `storage.foldername(name)` na policy; e
- Criar rotina para limpar objetos sem linha correspondente em `chat_messages.media_path`.

### P1-02. Confirmacao operacional obrigatoria no Supabase remoto

Severidade: Alto operacional

Evidencia local:

- `supabase/migrations/20260514230000_restrict_chat_media_select.sql` remove SELECT amplo de `chat-media`.
- `supabase/migrations/20260514220000_create_chat_media_private_bucket_versioned.sql` cria/versiona `chat-media-private` sem SELECT direto.

Risco:

O repositorio esta correto, mas a seguranca real depende de migrations aplicadas e Edge Functions deployadas. Se `20260514230000` nao estiver aplicada ou a function antiga estiver no ar, o ambiente remoto pode continuar vulneravel.

Checklist recomendado no banco remoto:

```sql
select id, public, file_size_limit
from storage.buckets
where id in ('chat-media', 'chat-media-private', 'client-documents');

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    qual::text like '%chat-media%'
    or with_check::text like '%chat-media%'
  );
```

### P2-01. Dependencias de tooling/build ainda possuem advisories

Severidade: Medio

Resultado atual do audit completo:

- total: 7
- high: 3
- moderate: 4
- critical: 0

Pacotes afetados observados:

- `@mapbox/node-pre-gyp` via `tar`
- `@vercel/node` via `@vercel/static-config`, `esbuild`, `undici`
- `ajv`, `esbuild`, `tar`, `undici`

Mitigacao atual:

`npm audit --omit=dev` retornou 0, entao o risco aparenta estar fora das dependencias de producao.

Recomendacao:

- Testar `npm audit fix` em branch separada.
- Validar impacto em `/api/apuracao` e deploy Vercel.
- Manter audit completo no CI como alerta, e `--omit=dev` como gate minimo de release.

### P2-02. `select('*')` amplia dados no frontend

Severidade: Medio

Evidencias:

- `src/context/AppContext.tsx:370`, `383`, `792` em `profiles`.
- `src/context/AppContext.tsx:821` em `leads`.
- `src/context/AppContext.tsx:1292`, `1336`, `1450`, `1489`, `1617`, `1697`, `1755`, `1802`, `1836` em entidades globais.
- `src/pages/ChatDetail.tsx:620` e `637` em `chat_messages`.

Impacto:

Mesmo com RLS, colunas desnecessarias chegam ao navegador. Isso aumenta o dano de XSS, extensao maliciosa, devtools, logs acidentais ou bugs de UI.

Recomendacao:

- Trocar `select('*')` por DTOs por tela.
- Priorizar `profiles`, `leads`, `clients`, `client_documents`, `chat_messages` e `tasks`.
- Separar queries administrativas de queries comuns.

### P2-03. Dados sensiveis ainda ficam em `localStorage`

Severidade: Medio

Evidencias:

- `src/pages/ChatDetail.tsx:787` le historico KAI em `localStorage`.
- `src/pages/ChatDetail.tsx:964` salva historico KAI local.
- `src/pages/NewClient.tsx:63`, `78`, `91` salvam draft de novo cliente.
- `src/context/ChatUnreadContext.tsx:18`, `26`, `69` guardam estado de conversa.

Impacto:

`localStorage` e persistente, acessivel por qualquer script no mesmo origin e nao tem expiracao nativa. Em caso de XSS ou computador compartilhado, dados comerciais ou de cliente podem ficar expostos.

Recomendacao:

- Evitar salvar telefone, renda, CPF, documentos ou contexto de cliente em `localStorage`.
- Usar TTL e limpeza no logout.
- Considerar IndexedDB com criptografia local ou persistencia server-side com RLS quando realmente necessario.

### P2-04. Login depende de configuracao correta de CAPTCHA

Severidade: Medio

Evidencias:

- `supabase/functions/secure-login/index.ts:79` le `REQUIRE_CAPTCHA`.
- `supabase/functions/secure-login/index.ts:80-86` so falha fechado quando `REQUIRE_CAPTCHA=true` e a secret falta.

Impacto:

O desenho e bom quando `REQUIRE_CAPTCHA=true`, mas se a variavel nao estiver configurada em producao, o CAPTCHA passa a ser opcional quando `TURNSTILE_SECRET_KEY` faltar.

Recomendacao:

- Definir `REQUIRE_CAPTCHA=true` em producao.
- Criar health check de secrets obrigatorias.
- Registrar alerta se login iniciar sem `TURNSTILE_SECRET_KEY`.

### P3-01. Mensagens de erro tecnicas ainda aparecem em alguns fluxos

Severidade: Baixo/Medio

Evidencias:

- `supabase/functions/checkin-geo/index.ts:179` retorna `rpcErr.message`.
- Varios pontos no frontend exibem `error.message` diretamente.

Impacto:

Em frontend autenticado, isso costuma ser aceitavel para UX/debug, mas para endpoints ou dados sensiveis pode revelar detalhe de schema/regra.

Recomendacao:

- Padronizar erro publico generico em Edge Functions.
- Manter detalhe tecnico apenas em logs server-side.

## Pontos fortes

- Sem segredos hardcoded detectados no scan local.
- Sem uso de sinks classicos de XSS (`dangerouslySetInnerHTML`, `eval`, `new Function`).
- `get-doc-url` legado retorna `410`; `get-doc-url-v2` valida JWT/RLS antes de assinar.
- `receive-lead` usa HMAC, timestamp anti-replay e rate limit.
- `send-email` exige JWT, limita destinatarios/anexos e aplica quota por usuario.
- `chat-media-private` tem migration versionada e sem SELECT direto.
- `notifications` tem migrations recentes removendo INSERT direto amplo.
- `daily_qr_tokens` foi restringido a perfis administrativos.

## Plano recomendado

### Antes de nova liberacao

1. Confirmar migrations e Edge Functions no Supabase remoto.
2. Restringir upload em `chat-media`.
3. Criar teste RLS/storage para `chat-media`: usuario fora da conversa nao assina, participante assina somente `media_path` vinculado.
4. Garantir `REQUIRE_CAPTCHA=true` em producao.

### Proxima sprint

1. Reduzir `select('*')` em `AppContext`.
2. Remover PII de `localStorage`.
3. Testar update de `@vercel/node` e transientes vulneraveis.
4. Padronizar erros publicos em Edge Functions.

## Conclusao

O sistema esta caminhando bem: os riscos mais graves de leitura direta de midia e erro interno exposto foram reduzidos no estado atual do codigo. O foco agora deve ser endurecer upload de midia, provar configuracao remota do Supabase e diminuir dados sensiveis no navegador. Com esses ajustes, a postura de seguranca sobe de "boa" para "muito boa para producao".
