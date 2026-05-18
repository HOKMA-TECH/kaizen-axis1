# Relatorio de Seguranca - Nova Verificacao

Data: 15/05/2026  
Projeto: KAIZEN AXIS  
Escopo: vazamento de dados/segredos, SQL injection, XSS, Supabase RLS/Storage/Edge Functions e dependencias npm.

## Sumario Executivo

A aplicacao tem bons controles importantes ja ativos: RLS ligado em todas as tabelas publicas auditadas, buckets sensiveis de chat/documentos privados, uso predominante do Supabase Query Builder em vez de SQL bruto no frontend e sanitizacao no chat com `rehype-sanitize`.

Mesmo assim, foram encontrados riscos que precisam de acao imediata antes de qualquer nova exposicao do repositorio:

1. **Critico:** ha segredo real da OpenAI no arquivo local `.env.local`.
2. **Critico:** `wf_check.json` e `wf_live.json` estao versionados e contem chave real da Evolution API, dados de workflow n8n, telefones/identificadores de WhatsApp e dados pessoais de atendimento.
3. **Alto:** `npm audit` encontrou 7 vulnerabilidades, sendo 3 altas e 4 moderadas, incluindo `tar`, `undici`, `@vercel/node`, `ajv` e `esbuild`.
4. **Alto:** Supabase Advisor apontou varias funcoes `SECURITY DEFINER` executaveis por usuarios autenticados e funcoes sem `search_path` fixo.
5. **Medio:** Supabase Auth esta com protecao contra senhas vazadas desativada.
6. **Medio:** policies antigas em Storage/tabelas usam `roles = {public}` em alguns pontos; varias ainda checam `auth.role() = 'authenticated'` ou `auth.uid()`, mas devem ser limpas para reduzir ambiguidade e risco futuro.

## Achados Criticos

### C-01 - Chave OpenAI exposta em arquivo local

Evidencia: `.env.local:4` contem uma chave real da OpenAI, redigida neste relatorio.

Impacto:
- Qualquer copia, backup, print, upload ou commit acidental desse arquivo permite uso indevido da conta OpenAI.
- Como a chave ja esteve no workspace durante auditorias e logs, ela deve ser tratada como comprometida.

Correcao imediata:
- Revogar/rotacionar a chave no painel da OpenAI.
- Gerar nova chave e manter apenas em variavel de ambiente segura do provedor.
- Confirmar que `.env.local` esta no `.gitignore`.
- Rodar varredura antes de commits: `rg -n "sk-proj|OPENAI_API_KEY|SUPABASE_SERVICE|EVOLUTION_API_KEY|apikey"`.

### C-02 - Workflows n8n versionados com segredo e PII

Evidencias:
- `wf_check.json` esta versionado.
- `wf_live.json` esta versionado.
- Ambos contem chave Evolution API redigida como `429683C4...`, endpoints de Evolution/n8n, dados de credenciais n8n, telefone/notificacao e historico/identificadores WhatsApp (`remoteJid`, `pushName`, estados de conversa).

Impacto:
- Vazamento de chave permite chamada direta na Evolution API.
- Vazamento de `remoteJid`, nomes e estado de atendimento expoe dados pessoais de clientes/leads.
- Se o repositorio ja foi enviado para remoto, remover o arquivo no commit atual nao apaga o historico.

Correcao imediata:
- Rotacionar a chave da Evolution API.
- Remover `wf_check.json` e `wf_live.json` do versionamento.
- Adicionar exports reais, `.last_exec.json` e dumps n8n ao `.gitignore`.
- Substituir chaves por env vars nos workflows.
- Se o repo remoto for compartilhado, purgar historico com ferramenta propria e forcar troca das credenciais.

## Achados Altos

### A-01 - Dependencias com vulnerabilidades conhecidas

Resultado de `npm audit --json`:
- Total: 7 vulnerabilidades.
- Altas: 3.
- Moderadas: 4.

Principais pacotes:
- `tar`: path traversal/arbitrary file overwrite via `@mapbox/node-pre-gyp`.
- `undici`: advisories altos/moderados via `@vercel/node`.
- `@vercel/node`: requer atualizacao major para corrigir cadeia afetada.
- `ajv`: ReDoS via `@vercel/static-config`.
- `esbuild`: risco no dev server em versoes afetadas.

Correcao recomendada:
- Testar upgrade de `@vercel/node` para a versao corrigida indicada pelo audit.
- Rodar `npm audit fix` apenas em branch/teste, porque envolve major upgrade.
- Depois validar `npm run build` e fluxo de deploy/API.

### A-02 - Funcoes SQL com `search_path` mutavel

Supabase Advisor apontou muitas funcoes publicas sem `SET search_path`, incluindo exemplos:
- `process_training_completion`
- `notify_new_announcement`
- `fazer_checkin`
- `get_presence_report`
- `is_subordinate`
- `set_client_closed_at_on_insert`
- `handle_new_user`
- `notify_new_chat_message`
- `validate_daily_qr`
- `update_goal_progress`

Impacto:
- Funcoes podem resolver objetos por um `search_path` inesperado em cenarios de abuso ou configuracao incorreta.

Correcao:
- Alterar funcoes para usar `SET search_path = public, pg_temp` ou schema minimo necessario.
- Qualificar objetos sensiveis com schema, por exemplo `public.profiles`.
- Revalidar com `supabase db advisors --linked --type security`.

### A-03 - Funcoes `SECURITY DEFINER` expostas a usuarios autenticados

Supabase Advisor apontou funcoes `SECURITY DEFINER` executaveis via RPC por `authenticated`, incluindo:
- `admin_set_profile_team`
- `app_current_user_role`
- `app_current_user_directorate_id`
- `get_report_metrics`
- `get_xp_report`
- `is_security_admin`
- `is_subordinate`
- `tasks_report`
- `redistribuir_pendentes`
- `validate_daily_qr`
- `update_goal_progress`

Impacto:
- `SECURITY DEFINER` roda com privilegio do dono da funcao. Se a funcao nao validar papel/escopo internamente, pode virar escalada de privilegio.

Correcao:
- Revisar uma por uma.
- Manter expostas apenas as RPCs realmente chamadas pelo app e com validacao forte.
- Aplicar `REVOKE EXECUTE ON FUNCTION ... FROM authenticated, anon` nas funcoes internas/triggers.
- Preferir `SECURITY INVOKER` onde nao houver necessidade real de privilegio elevado.

## Achados Medios

### M-01 - Protecao contra senhas vazadas desativada

Supabase Advisor: `auth_leaked_password_protection` desativado.

Impacto:
- Usuarios podem usar senhas ja conhecidas em vazamentos publicos.

Correcao:
- Ativar leaked password protection no Supabase Auth.
- Avaliar politica de senha forte e MFA para administradores/diretores.

### M-02 - Buckets publicos devem ser revisados

Buckets:
- Privados: `chat-media`, `chat-media-private`, `client-documents`, `documents`.
- Publicos: `avatars`, `developments`, `trainings`.

Observacao:
- `avatars` publico e comum para foto de perfil.
- `developments` e `trainings` publicos podem ser aceitaveis se nao contiverem documentos internos, videos privados ou material exclusivo.

Correcao:
- Confirmar regra de negocio para `developments` e `trainings`.
- Se houver conteudo interno, tornar privado e servir por signed URL.
- Manter `client-documents` e chat privado como estao.

### M-03 - Policies `public` legadas e permissivas por desenho

Foram encontradas policies com `roles = {public}` em tabelas/buckets, por exemplo:
- `chat_groups`
- `chat_group_members`
- `client_documents`
- `storage.objects` para alguns buckets

Nem toda policy `{public}` significa acesso anonimo efetivo, pois varias exigem `auth.uid()` ou `auth.role() = 'authenticated'`. Mesmo assim, isso aumenta a superficie de erro.

Correcao:
- Migrar policies que exigem login para `TO authenticated`.
- Evitar `TO public` salvo quando o acesso anonimo for intencional.
- Remover duplicidade de policies antigas em `client_documents` e Storage.

## SQL Injection

Resultado: **nao encontrei SQL bruto perigoso no frontend/API principal**.

Evidencias:
- O app usa majoritariamente Supabase Query Builder (`from`, `select`, `insert`, `update`, `eq`, `in`, `rpc`).
- Nao foi encontrado padrao de concatenacao de SQL executado diretamente por usuario.
- Existem chamadas `.or(...)` com interpolacao de IDs, mas os pontos revisados usam IDs de auth/estado interno. Risco atual baixo, mas deve continuar sendo tratado com cuidado.

Recomendacoes:
- Nunca montar `.or()` com texto livre vindo de input sem validacao.
- Validar UUIDs antes de usar em filtros compostos.
- Centralizar filtros dinamicos em helpers tipados.

## XSS

Resultado: **nao encontrei uso perigoso de `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou `new Function` no codigo principal auditado**.

Evidencias:
- Busca encontrou apenas comentario/teste relacionado a bloqueio de `javascript:`.
- Chat usa `react-markdown` com `rehype-sanitize`, reduzindo risco em mensagens renderizadas.
- React escapa texto por padrao.

Recomendacoes:
- Manter `rehype-sanitize` no chat.
- Nao introduzir `dangerouslySetInnerHTML`.
- Continuar bloqueando URLs `javascript:` e esquemas desconhecidos para midias.

## Supabase RLS e Storage

RLS:
- Todas as tabelas publicas consultadas estao com `rowsecurity = true`.
- A maioria esta com `forcerowsecurity = true`.
- Algumas tabelas estao com RLS ligado mas sem force RLS: `chat_group_members`, `chat_groups`, `chat_message_reactions`, `checkin_always_present_users`, `kai_knowledge_chunks`, `sales_mirrors`.

Storage:
- `chat-media-private` tem SELECT restrito por relacao com `chat_messages` e `view_once = true`.
- `chat-media` esta privado no bucket, mas ha policy `chat-media-public-read` para `storage.objects` com `roles = {public}`. Como bucket privado nao gera URL publica direta, ainda assim recomendo revisar para evitar leitura ampla via API.
- `client-documents` esta privado e tem policy scoped, mas tambem possui policies antigas amplas de insert/update/delete autenticado.

Correcao recomendada:
- Remover policies duplicadas/amplas.
- Para `chat-media`, preferir SELECT somente autenticado/participante da conversa, nao `public`.
- Para `client-documents`, restringir update/delete/upload ao dono/escopo do cliente, nao apenas bucket autenticado.

## Pontos Positivos

- RLS esta ativo em todas as tabelas publicas auditadas.
- Buckets mais sensiveis nao estao marcados como publicos.
- Chat de visualizacao unica ja usa bucket privado e signed URL por Edge Function.
- Busca de XSS nao encontrou renderizacao HTML direta perigosa.
- SQL injection direto nao apareceu na varredura local.

## Plano de Acao Priorizado

1. **Hoje:** rotacionar OpenAI API key e Evolution API key.
2. **Hoje:** remover `wf_check.json` e `wf_live.json` do git, adicionar dumps/workflows reais ao `.gitignore` e apagar qualquer `.last_exec.json` local.
3. **Hoje:** se o remoto recebeu esses arquivos, purgar historico ou considerar o segredo definitivamente vazado.
4. **Proxima janela segura:** atualizar `@vercel/node` e dependencias afetadas pelo `npm audit`, validando build/deploy.
5. **Proxima janela segura:** revisar RPCs `SECURITY DEFINER`, aplicar `REVOKE EXECUTE` onde forem internas e fixar `search_path`.
6. **Proxima janela segura:** limpar policies `TO public` que exigem autenticacao e restringir Storage de `chat-media`/`client-documents`.
7. **Admin Supabase:** ativar leaked password protection.

## Comandos Executados

```bash
npm audit --json
supabase db advisors --linked --type security --output json
supabase db query --linked "select n.nspname as schemaname, c.relname as tablename, c.relrowsecurity as rowsecurity, c.relforcerowsecurity as forcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname;"
supabase db query --linked "select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id;"
supabase db query --linked "select schemaname, tablename, policyname, roles, cmd, left(coalesce(qual,''),220), left(coalesce(with_check,''),220) from pg_policies where schemaname in ('public','storage') order by schemaname, tablename, policyname;"
rg -n "dangerouslySetInnerHTML|innerHTML|eval|new Function|document.write|javascript:" src supabase api server
rg -n "apikey|apiKey|Authorization|Bearer|sk-proj|OPENAI_API_KEY|SUPABASE_SERVICE|EVOLUTION" wf_check.json wf_live.json build_workflow.js create_n8n_workflow.js .env.local
git ls-files .env.local .last_exec.json wf_live.json wf_check.json create_n8n_workflow.js build_workflow.js
```

## Conclusao

O maior risco atual nao e SQL injection nem XSS; e **vazamento de credenciais/dados operacionais em arquivos locais/versionados**. A prioridade deve ser rotacionar as chaves, remover dumps reais do repositorio e endurecer as funcoes/policies apontadas pelo Supabase Advisor.
