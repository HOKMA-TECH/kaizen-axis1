# Relatório Geral de Segurança e Vulnerabilidades - 2026-05-15

## 1. Resumo executivo

O sistema evoluiu bastante desde as auditorias anteriores. A base atual tem uma arquitetura de segurança significativamente melhor: RLS está presente nas tabelas críticas, há funções Edge autenticadas por JWT, limites de requisição foram adicionados em fluxos sensíveis, URLs assinadas de mídia foram reduzidas para 1 hora, o envio de e-mail agora passa por backend, e fluxos importantes como documentos privados, check-in, QR code e apuração já têm controles dedicados.

Classificação geral atual: **BOM, caminhando para MUITO BOM**.

Para produção, eu classificaria como **produção próxima / produção com pendências de segurança P1**, não como "pronto sem ressalvas". O maior risco residual não é ausência de segurança, e sim autorização fina: algumas operações já exigem login, mas ainda precisam provar no servidor que o usuário pode agir sobre aquele destinatário, conversa, documento ou anexo.

Nota estimada: **8.0/10** se as variáveis de produção estiverem corretas. Sem validar CAPTCHA/MFA/CORS/secrets no ambiente real, a nota prática cai para **7.0-7.5/10**.

## 2. Escopo revisado

Foram revisados, por busca e leitura direta no repositório:

- Edge Functions em `supabase/functions`
- políticas RLS em `supabase/migrations`
- fluxos de login, CAPTCHA, MFA e sessão
- rate limits e anti-bruteforce
- storage privado e URLs assinadas
- notificações
- envio de e-mail
- documentos privados
- mídia de chat e visualização única
- dependências via `npm audit --json`

Comandos principais executados:

- `rg` sobre autenticação, CAPTCHA, MFA, RLS, storage, notifications, e rate limit
- `npm audit --json` na raiz
- `npm audit --json` em `server`
- inspeção de arquivos específicos de Edge Functions, migrations e frontend

## 3. Veredito por área

| Área | Situação | Avaliação |
| --- | --- | --- |
| RLS geral | Boa cobertura, várias tabelas críticas com lockdown, `FORCE ROW LEVEL SECURITY` e policies por escopo | **Bom/Muito bom** |
| Login e bruteforce | `secure-login` com JWT, CAPTCHA opcional/obrigatório via env, rate limit e suporte a MFA | **Bom** |
| CAPTCHA | Suportado por Turnstile e falha fechado com `REQUIRE_CAPTCHA=true` | **Bom, depende de produção** |
| MFA | Fluxo de AAL2/TOTP existe, mas enforcement por perfil/role não foi provado no repo | **Médio/Bom** |
| Edge Functions | Melhoraram bastante: JWT em funções sensíveis, service role encapsulado e CORS mais restrito | **Bom** |
| Rate limit | Cobertura ampla em login, apuração, KAI, lead, e-mail, notificações, documentos e view-once | **Bom/Muito bom** |
| Storage documentos | `client-documents` protegido via `get-doc-url-v2`; frontend bloqueia acesso direto | **Muito bom** |
| Storage mídia chat | Bucket privado e TTL menor, mas SELECT é amplo para qualquer autenticado | **Médio** |
| Notificações | Função Edge existe, mas policy antiga pode continuar permitindo insert direto | **Médio/Risco alto pontual** |
| E-mail | Agora exige JWT e rate limit; faltam autorização semântica de anexos e quota diária | **Bom com pendências** |
| Dependências | Raiz ainda tem 9 vulnerabilidades; `server` está limpo | **Médio** |

## 4. Pontos fortes encontrados

### 4.1. RLS e lockdown do banco

O repositório contém migrations de endurecimento de RLS, revogação de acesso anônimo, policies por escopo e restrições em tabelas sensíveis. Há uso de funções auxiliares como `app_user_in_scope` e padrões de separação por hierarquia/role em áreas como clientes, tarefas, agendamentos, check-ins, documentos e auditoria.

Isso coloca o projeto em um nível acima do comum para aplicações Supabase: a maior parte dos dados críticos não parece depender apenas de filtros no frontend.

### 4.2. Login, CAPTCHA e MFA

A função `secure-login` tem boas propriedades:

- valida método HTTP
- usa rate limit por identificador
- suporta Turnstile
- se `REQUIRE_CAPTCHA=true` e `TURNSTILE_SECRET_KEY` estiver ausente, falha fechado
- frontend verifica necessidade de AAL2/MFA após login

Risco residual: a proteção real contra bots depende de confirmar em produção:

- `REQUIRE_CAPTCHA=true`
- `TURNSTILE_SECRET_KEY` configurada
- site key correta no frontend
- MFA obrigatório para administradores/diretoria/financeiro, se essa for a política desejada

### 4.3. Rate limit e quotas

Há uma cobertura consistente de rate limit:

- `secure-login`: login limitado
- `rate-guard`: inclui `apuracao`, `apuracao_daily`, `clients_query`, `document_upload`
- `api/apuracao.ts`: limite por minuto e quota diária de 100/dia
- `kai-agent`: quota diária
- `receive-lead`: limite por IP/origem
- `get-doc-url-v2`: limite por usuário
- `generate-view-once-url`: limite por usuário
- `send-email`: 5 e-mails/minuto por usuário
- `send-notification`: 30 notificações/minuto por usuário
- `send-push`: rate limit e logs estruturados

Observação técnica: várias funções usam comparação `count >= limit` após incrementar contador. Isso torna o limite efetivo um pouco mais restritivo, por exemplo o quinto evento pode ser bloqueado quando a intenção era permitir cinco e bloquear o sexto. Não é vulnerabilidade grave, mas vale padronizar para evitar UX ruim.

### 4.4. Documentos privados

O fluxo de `client-documents` melhorou. O frontend em `src/context/AppContext.tsx` bloqueia acesso direto ao bucket e orienta usar `get-doc-url-v2`, que executa validação no backend e gera URL assinada. Esse é um bom desenho para documentos sensíveis.

## 5. Achados críticos e importantes

### P1-01. Migração de bloqueio de `notifications` pode não remover a policy vulnerável

Severidade: **Alta**

A migration `20260514190000_notifications_lock_to_service_role.sql` tenta remover inserts diretos de usuários autenticados e deixar inserção apenas via Edge Function. A intenção é correta.

O problema: ela remove policies com estes nomes:

- `"authenticated users can insert notifications"`
- `"Users can insert notifications"`
- `"allow_insert_notifications"`

Mas a policy criada/recriada nas migrations anteriores se chama:

- `"notifications_insert_authenticated"`

Essa policy aparece em `20260514180000_fix_notifications_r02_revert_scope.sql` e, se não for removida por outra migration aplicada depois, pode continuar permitindo que qualquer usuário autenticado insira notificação com `target_user_id IS NOT NULL`.

Impacto:

- spam interno
- engenharia social dentro do app
- notificações falsas parecendo legítimas
- possível enumeração/abuso de UUIDs de usuários

Correção recomendada:

```sql
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;
DROP POLICY IF EXISTS "authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "allow_insert_notifications" ON public.notifications;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
```

Depois, manter inserts apenas por funções internas, triggers confiáveis ou Edge Function com service role.

### P1-02. `send-notification` autentica usuário, mas não valida relação entre emissor e destinatário

Severidade: **Alta/Média**

A função `send-notification` exige JWT, valida UUID, limita tipos e checa se os destinatários existem em `profiles`. Isso é bom.

O que ainda falta: a função não comprova que o usuário autenticado tem permissão semântica para notificar aqueles destinatários. Hoje, conhecendo UUIDs válidos, um usuário autenticado pode pedir à função para criar notificações para outros usuários existentes.

Correção recomendada:

- validar `target_user_id` com `app_user_in_scope(target_user_id)` ou regra equivalente
- para chat, validar participação real na conversa antes de notificar membro
- para cliente, validar que o usuário tem acesso ao cliente/gestor relacionado
- considerar tipos de notificação permitidos por role

### P1-03. `chat-media` privado ainda tem leitura ampla para todos os autenticados

Severidade: **Alta/Média**

A migration `20260514200000_create_chat_media_private_bucket.sql` torna o bucket `chat-media` privado e reduz a exposição por URLs públicas. Isso é uma melhoria importante.

Ainda assim, a policy de SELECT permite leitura de qualquer objeto do bucket por qualquer usuário autenticado:

```sql
USING (bucket_id = 'chat-media')
```

Como o frontend chama `createSignedUrl` diretamente em `src/pages/ChatDetail.tsx` e `src/components/chat/ChatDetailPanel.tsx`, a autorização real para assinar URLs depende dessa policy ampla. Se um usuário autenticado descobrir ou inferir um path, ele pode tentar gerar URL assinada.

Correção recomendada:

- mover geração de URL assinada para Edge Function
- validar no servidor se o usuário participa da conversa relacionada ao arquivo
- modelar path com `conversation_id` e checar membership antes de assinar
- ou criar tabela `chat_media_objects` com `conversation_id`, `path`, `uploaded_by` e policy baseada em participantes

### P1-04. Mismatch provável entre policy de upload de `chat-media` e path usado pelo frontend

Severidade: **Média/Alta por risco funcional**

A policy de INSERT do bucket `chat-media` exige:

```sql
(storage.foldername(name))[1] = auth.uid()::text
```

Mas o frontend envia paths assim:

```ts
`${conversationId}/${Date.now()}_${type}.${ext}`
`${conversationId}/${crypto.randomUUID()}.${ext}`
```

Ou seja: o primeiro segmento do path é `conversationId`, não `auth.uid()`. Isso pode fazer uploads falharem em produção após a migration, a menos que exista outra policy aplicada fora do repo ou que `conversationId` coincida com o user id, o que não parece ser o caso normal.

Correção recomendada:

- alinhar frontend e policy
- opção A: path `${auth.uid()}/${conversationId}/${file}`
- opção B: policy baseada em tabela de participantes da conversa
- opção C: upload via Edge Function que valida membership e grava no storage com service role

### P1-05. Bucket `chat-media-private` é usado, mas não há migration versionando sua criação/policies

Severidade: **Média/Alta**

O frontend faz upload de mídia view-once para `chat-media-private`, e `generate-view-once-url` tenta buscar primeiro nesse bucket. Porém, nas migrations do repo, não foi encontrada criação/policy explícita para `chat-media-private`.

Impacto:

- ambiente novo pode quebrar view-once
- produção pode depender de configuração manual
- difícil auditar se o bucket é privado, quais MIME types aceita e quem pode ler/escrever

Correção recomendada:

- criar migration idempotente para `chat-media-private`
- definir bucket privado
- restringir upload
- proibir SELECT direto amplo
- gerar URLs apenas via Edge Function com validação de destinatário e expiração curta

### P1-06. `send-email` está mais seguro, mas anexos ainda não têm autorização comprovada no servidor

Severidade: **Média/Alta**

A função `send-email` agora exige:

- `apikey` anon
- JWT válido
- rate limit por usuário
- máximo de 5 destinatários
- máximo de 5 anexos
- limite total de 10 MB
- sanitização básica de filename
- `RESEND_API_KEY` no backend

Isso remove um risco anterior importante.

Pendência: a função recebe anexos já em base64. Ela não sabe se aquele conteúdo veio de um documento que o usuário podia acessar. O frontend pode ter baixado via `get-doc-url-v2`, mas o backend de e-mail não tem prova disso.

Correção recomendada:

- enviar `document_ids` para a função, não base64 direto, quando o anexo vier de `client-documents`
- a função deve validar acesso ao documento/cliente no servidor
- só então buscar o arquivo com service role e anexar
- manter upload manual separado, com limites e auditoria
- adicionar quota diária, por exemplo 50/dia por usuário ou por tenant

### P2-01. Validação de e-mail ainda é básica

Severidade: **Média/Baixa**

`send-email` filtra destinatários por `includes('@')`. Isso reduz erro básico, mas não impede formatos ruins, domínios proibidos ou abuso operacional.

Recomendado:

- regex simples e conservadora para formato
- denylist/allowlist de domínio se aplicável
- logs de destinatário, assunto e contagem, sem armazenar corpo sensível
- alertas para volume anormal

### P2-02. Dependências da raiz ainda têm vulnerabilidades

Severidade: **Média**

Resultado de `npm audit --json` na raiz:

- total: **9 vulnerabilidades**
- high: **6**
- moderate: **3**
- critical: **0**

Principais cadeias:

- `@vercel/node`
- `@vercel/build-utils`
- `@vercel/python-analysis`
- `path-to-regexp`
- `undici`
- `minimatch`
- `smol-toml`
- `ajv`

O fix sugerido envolve upgrade major de `@vercel/node` para `4.0.0`, então precisa teste de build/deploy.

Resultado em `server`: **0 vulnerabilidades**.

### P2-03. Configurações reais de produção não são totalmente verificáveis pelo repo

Severidade: **Média**

O código suporta boas configurações, mas o nível real depende do ambiente:

- `REQUIRE_CAPTCHA=true`
- `TURNSTILE_SECRET_KEY`
- `APP_ORIGIN` correto nas Edge Functions
- `SUPABASE_SERVICE_ROLE_KEY` apenas no backend
- JWT verification habilitado no deploy das funções que exigem usuário
- MFA obrigatório para roles sensíveis, se necessário
- buckets realmente privados em produção
- migrations aplicadas na ordem correta

Recomendado executar checklist de produção diretamente no Supabase antes de liberar.

## 6. RLS por domínio

| Domínio | Estado observado | Risco residual |
| --- | --- | --- |
| `profiles` | Uso em escopos, roles e validação de destinatários | garantir policies com role mínima |
| `clients` | Escopo por usuário/hierarquia aparece nas migrations | precisa teste automatizado de matriz de roles |
| `client_documents` | Acesso indireto via `get-doc-url-v2` | bom, manter proibido acesso direto no frontend |
| `notifications` | SELECT/UPDATE para destinatário; INSERT deveria ser só backend | policy antiga pode persistir |
| `chat`/mídia | Storage melhorou, mas autorização por conversa ainda fraca | mover assinatura para backend |
| `audit_logs` | Há preocupação explícita com logs e inserção por função | bom, validar retenção e acesso admin |
| `checkins`/QR | Migrations recentes restringem SELECT e funções específicas | bom, testar usuário comum vs admin |
| `request_throttles` | RPC centralizada de contadores | bom, mas padronizar comparação do limite |

## 7. Produção: está bom, muito bom ou ruim?

Não está ruim. Pelo contrário: **está em bom nível e já tem desenho de produção em várias partes**.

Mas eu ainda não chamaria de "muito bom e fechado" por causa destes pontos:

1. `notifications_insert_authenticated` pode continuar ativa.
2. `send-notification` ainda precisa autorização por relação/escopo.
3. mídia de chat ainda permite assinatura por qualquer autenticado que conheça path.
4. policy de upload de chat-media pode estar incompatível com o frontend.
5. `chat-media-private` não está versionado nas migrations encontradas.
6. anexos de e-mail precisam validação server-side de documento/cliente.
7. dependências da raiz ainda têm 9 vulnerabilidades.
8. configuração real de CAPTCHA/MFA/CORS precisa ser confirmada no Supabase/Vercel.

Minha classificação honesta:

- **Antes dessas correções finais:** bom, mas com riscos P1.
- **Depois de corrigir P1-01 a P1-06 e confirmar produção:** muito bom para produção.
- **Depois de adicionar testes automatizados de RLS e monitoramento:** nível forte/maduro.

## 8. Plano de correção recomendado

### Prioridade P1

1. Criar migration removendo explicitamente `notifications_insert_authenticated`.
2. Atualizar `send-notification` para validar escopo do emissor contra destinatários.
3. Resolver `chat-media`: policy e frontend precisam usar o mesmo modelo de path.
4. Remover SELECT amplo de `chat-media` ou mover assinatura de URL para Edge Function com validação de participante.
5. Versionar `chat-media-private` em migration.
6. Alterar `send-email` para anexar documentos por `document_id` validado no servidor.

### Prioridade P2

1. Atualizar `@vercel/node` com testes de build/deploy.
2. Adicionar quota diária em `send-email` e `send-notification`.
3. Melhorar validação de destinatários de e-mail.
4. Criar testes automatizados de RLS por tabela e role.
5. Adicionar alertas para picos de login, e-mail, notificações, URLs assinadas e apuração.

### Prioridade P3

1. Criar runbook de incident response.
2. Validar backup/restore.
3. Documentar matriz de permissões por role.
4. Adicionar verificação periódica de policies ativas em produção.

## 9. Checklist SQL para validar em produção

Executar no SQL Editor do Supabase:

```sql
-- Policies ativas em notifications
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'notifications'
order by policyname;

-- Buckets e privacidade
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('chat-media', 'chat-media-private', 'client-documents');

-- Policies de storage para mídia
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    qual::text like '%chat-media%'
    or with_check::text like '%chat-media%'
    or qual::text like '%chat-media-private%'
    or with_check::text like '%chat-media-private%'
    or qual::text like '%client-documents%'
    or with_check::text like '%client-documents%'
  )
order by policyname;

-- Tabelas sem RLS no schema public
select schemaname, tablename, rowsecurity, forcerowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- Funções SECURITY DEFINER
select n.nspname as schema, p.proname as function_name, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname;
```

## 10. Conclusão

O projeto está **bem acima de um MVP inseguro**. Já existe uma camada real de defesa: RLS, Edge Functions, JWT, service role encapsulado, rate limit, storage privado e auditoria.

O que falta agora é fechar as permissões de segunda ordem: não basta saber que o usuário está logado; o servidor precisa confirmar que ele pode acessar aquela conversa, notificar aquele usuário, anexar aquele documento ou gerar aquela URL assinada.

Se os P1 deste relatório forem corrigidos e as configurações de produção forem confirmadas, eu classificaria o esquema de segurança como **muito bom para produção**. Hoje, ele está **bom, mas ainda com pendências importantes antes de uma liberação tranquila**.
