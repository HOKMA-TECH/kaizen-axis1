# Novo teste de seguranca e vulnerabilidades - Kaizen Axis

Data: 2026-05-15  
Escopo: frontend React/Vite, API Vercel, servidor Express, Supabase Edge Functions, RLS/migrations, Storage, chat/media, dependencias npm e busca estatica por segredos/padroes perigosos.  
Metodo: auditoria estatica segura no repositorio, `npm audit`, busca por segredos, revisao manual de Edge Functions e policies recentes. Nao foi feito pentest ativo contra producao nem validacao SQL contra banco remoto.

## Resumo executivo

O projeto esta em estado melhor do que as auditorias anteriores: nao encontrei segredos hardcoded, o endpoint legado `get-doc-url` esta descontinuado com `410`, `get-doc-url-v2` valida acesso via JWT/RLS antes de assinar arquivos, `chat-media-private` esta versionado e sem SELECT direto, e as dependencias de producao estao limpas quando auditadas com `--omit=dev`.

Os riscos restantes mais relevantes sao:

1. `get-chat-media-url` ainda autoriza por conversa, nao por mensagem/arquivo especifico.
2. Upload em `chat-media` ainda aceita qualquer usuario autenticado no bucket, sem validar membership no momento do upload.
3. `receive-lead` pode devolver mensagem interna de erro em resposta 500.
4. O audit completo, incluindo dev/build tooling, ainda aponta 9 vulnerabilidades transientes puxadas por `@vercel/node`.
5. Historico do KAI e alguns `select('*')` ainda aumentam impacto em caso de XSS/dispositivo comprometido.

## Comandos executados

| Comando | Resultado |
|---|---|
| `npm.cmd audit --json` | 9 vulnerabilidades totais: 6 high, 3 moderate, 0 critical |
| `npm.cmd audit --omit=dev --json` | 0 vulnerabilidades de producao |
| `server/npm.cmd audit --json` | 0 vulnerabilidades |
| `server/npm.cmd audit --omit=dev --json` | 0 vulnerabilidades de producao |
| `rg` de segredos (`SERVICE_ROLE`, `OPENAI_API_KEY`, `PRIVATE_KEY`, tokens etc.) | sem matches relevantes |
| `rg` de sinks perigosos (`dangerouslySetInnerHTML`, `eval`, `new Function`, `innerHTML`) | sem matches |

Observacao: os dois audits `--omit=dev` falharam primeiro por rede/sandbox e depois passaram com acesso de rede.

## Achados

### P1-01. `get-chat-media-url` assina por conversa, nao por arquivo de mensagem

Severidade: Medio/Alto

Evidencia:

- `supabase/functions/get-chat-media-url/index.ts:76` recebe `path` direto do corpo.
- `supabase/functions/get-chat-media-url/index.ts:93` valida apenas que o usuario participa de alguma mensagem da conversa.
- `supabase/functions/get-chat-media-url/index.ts:114` assina o `path` recebido.
- TTL atual: `supabase/functions/get-chat-media-url/index.ts:13` usa `3600` segundos.

Impacto:

Um participante legitimo de uma conversa pode solicitar assinatura para qualquer objeto conhecido/adivinhado sob aquele `conversation_id`, mesmo que o arquivo nao esteja vinculado a uma mensagem visivel para ele. O risco fica maior combinado com uploads orfaos ou paths vazados por logs/cache.

Recomendacao:

- Antes de assinar, consultar `chat_messages` e exigir `media_path = path`.
- Aplicar tambem `deleted_for`, `is_deleted`, `view_once` e membership/grupo na mesma validacao.
- Reduzir TTL de midia comum para 5-15 minutos, ou renovar sob demanda.

### P1-02. Upload em `chat-media` ainda e amplo para qualquer autenticado

Severidade: Medio/Alto

Evidencia:

- `supabase/migrations/20260513221000_fix_chat_storage_security.sql:21` cria `chat_media_insert`.
- `supabase/migrations/20260513221000_fix_chat_storage_security.sql:25-27` exige apenas `bucket_id = 'chat-media'` e `auth.uid() IS NOT NULL`.

Impacto:

Qualquer usuario autenticado pode criar objetos no bucket `chat-media`, inclusive em prefixos de conversa arbitrarios. A leitura esta mais protegida agora, mas isso ainda permite abuso de storage/quota, objetos orfaos e plantio de arquivos em paths que depois podem confundir fluxos de assinatura.

Recomendacao:

- Preferir upload via Edge Function que valida participante antes de gravar.
- Alternativa: mudar path para incluir uploader (`conversationId/userId/uuid`) e policy com `storage.foldername(name)`.
- Criar limpeza periodica de objetos sem linha correspondente em `chat_messages.media_path`.

### P2-01. `receive-lead` expoe erro interno em resposta 500

Severidade: Medio

Evidencia:

- `supabase/functions/receive-lead/index.ts:209-211` retorna `e.message || 'Internal error'`.

Impacto:

Erros de banco, constraints ou detalhes de schema podem vazar para o chamador do webhook. O endpoint ja tem HMAC, timestamp e rate limit, mas em caso de integracao parceira comprometida ou erro exploravel, a resposta ajuda enumeracao/debug externo.

Recomendacao:

- Logar `e.message` apenas no servidor.
- Retornar mensagem generica: `Erro interno ao processar lead`.
- Opcional: retornar `request_id`/correlation id para investigacao.

### P2-02. Vulnerabilidades em dependencias de desenvolvimento/build

Severidade: Medio

Resultado:

- Audit completo da raiz: 9 vulnerabilidades, 6 high e 3 moderate.
- Audit de producao (`--omit=dev`): 0 vulnerabilidades.
- `server/`: 0 vulnerabilidades.

Principais pacotes afetados:

- `@vercel/node` direto em `package.json:60`.
- Transientes em `package-lock.json`: `undici 5.28.4`, `path-to-regexp 6.1.0`, `minimatch 10.1.1`, `smol-toml 1.5.2`, `ajv 8.6.3`.

Impacto:

O risco parece concentrado em tooling/dev/build, nao no bundle de producao auditado. Ainda assim, CI, previews e ambientes de build tambem sao superficie de ataque.

Recomendacao:

- Testar upgrade de `@vercel/node` para uma versao sem advisories.
- Se houver quebra por major, isolar em branch e validar `/api/apuracao`.
- Manter `npm audit --omit=dev` como gate de release e audit completo como gate de manutencao.

### P2-03. Historico do KAI pode guardar contexto sensivel no browser

Severidade: Medio

Evidencia:

- `src/pages/ChatDetail.tsx:950` injeta nome/status/telefone do cliente no contexto enviado ao KAI.
- `src/pages/ChatDetail.tsx:963` persiste historico em `localStorage`.
- `src/pages/ChatDetail.tsx:787` recarrega esse historico do `localStorage`.

Impacto:

Dados pessoais e contexto comercial podem ficar persistidos no browser. Isso aumenta impacto de XSS futuro, extensoes maliciosas, maquina compartilhada ou backup/sincronizacao do navegador.

Recomendacao:

- Evitar persistir telefone/dados pessoais no historico local.
- Usar TTL curto e limpeza por logout.
- Persistir apenas IDs/contexto minimo, buscando detalhes sob demanda com RLS.

### P3-01. `select('*')` em contexto global aumenta blast radius

Severidade: Baixo/Medio

Evidencia:

- `src/context/AppContext.tsx:370`, `383`, `792` em `profiles`.
- `src/context/AppContext.tsx:1292` em `appointments`.
- `src/context/AppContext.tsx:1336` em `tasks`.

Impacto:

Mesmo com RLS correto, carregar colunas amplas no frontend aumenta dano de XSS, extensoes de navegador, logs acidentais e bugs de componentes. O risco e especialmente relevante para perfis, contatos e dados comerciais.

Recomendacao:

- Trocar `select('*')` por listas de colunas por tela.
- Criar tipos/DTOs por contexto.
- Revisar campos sensiveis como CPF, telefone, email, renda, documentos e metadados.

## Pontos positivos confirmados

- Nao houve match de segredos sensiveis hardcoded no scan local.
- Nao encontrei uso de `dangerouslySetInnerHTML`, `eval`, `new Function` ou atribuicao direta a `innerHTML`.
- `get-doc-url` legado retorna `410` antes de executar logica antiga.
- `get-doc-url-v2` usa JWT, rate limit, RLS e service role apenas apos autorizacao.
- `secure-login` tem rate limit por IP e pode falhar fechado quando `REQUIRE_CAPTCHA=true`.
- `receive-lead` tem HMAC, timestamp anti-replay e rate limit persistente.
- `send-email` exige JWT, anon key, rate limit por minuto, quota diaria e limites de destinatarios/anexos.
- `chat-media-private` foi versionado como bucket privado sem SELECT direto.
- `chat-media` nao deve mais depender de SELECT direto se a migration `20260514230000_restrict_chat_media_select.sql` estiver aplicada e a Edge Function deployada.

## Checklist operacional para producao

1. Confirmar no Supabase remoto que `chat-media` esta `public = false` e sem policy SELECT para `authenticated`/`public`.
2. Confirmar deploy da Edge Function `get-chat-media-url` apos o commit `b2fc0e6`.
3. Adicionar validacao `media_path = path` em `get-chat-media-url`.
4. Reduzir TTL de signed URLs comuns de chat.
5. Restringir upload em `chat-media` por membership ou mover upload para Edge Function.
6. Ajustar `receive-lead` para nao retornar `e.message`.
7. Rodar upgrade controlado de `@vercel/node` e repetir `npm audit --json`.
8. Criar testes SQL/RLS automatizados para: corretor, coordenador, gerente, diretor e admin.

## Conclusao

O estado atual e bom para um SaaS Supabase com dados sensiveis, especialmente porque os riscos de vazamento publico amplo foram bastante reduzidos. O principal trabalho restante esta no isolamento fino de midias de chat: validar arquivo por mensagem antes de assinar e impedir upload amplo por qualquer autenticado. Depois disso, os proximos ganhos de seguranca virao de reduzir PII no frontend e manter dependencias de build limpas.
