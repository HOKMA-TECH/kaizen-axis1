# Novo Relatório de Segurança e Vulnerabilidades - 2026-05-15

## 1. Resumo executivo

Foi feita uma nova revisão do estado atual do repositório com foco em autenticação, RLS, Edge Functions, storage, vazamento de dados, rate limit, secrets e dependências.

O sistema melhorou novamente desde o relatório anterior. A parte mais importante é que a mídia comum de chat, que antes ainda dependia de `createSignedUrl` no frontend, agora tem uma Edge Function dedicada (`get-chat-media-url`) e uma migration para remover o SELECT amplo do bucket `chat-media`.

Classificação atual: **MUITO BOM em arquitetura, BOM+ em prontidão prática**.

Nota estimada: **8.6/10**.

Ainda não dou 9+/10 porque há riscos residuais em over-fetch de dados pessoais, envio de anexos por e-mail em base64, dependências vulneráveis na raiz, configurações de produção não verificáveis pelo repo e alguns detalhes de storage/logs.

## 2. Principais melhorias encontradas

### 2.1. `chat-media` agora tem caminho correto para fechar vazamento

Foi encontrada a migration:

- `supabase/migrations/20260514230000_restrict_chat_media_select.sql`

Ela remove:

- `chat_media_select_authenticated`
- `chat_media_select`
- `Give users access to own folder`

E não cria policy SELECT substituta. A intenção é correta: o frontend deixa de gerar signed URL diretamente e passa a usar `get-chat-media-url`, que valida participação em conversa/grupo antes de assinar.

Arquivos relevantes:

- `supabase/functions/get-chat-media-url/index.ts`
- `src/pages/ChatDetail.tsx`
- `src/components/chat/ChatDetailPanel.tsx`

Essa mudança reduz bastante o risco de vazamento interno por path conhecido.

### 2.2. Mídia view-once corrigida no `ChatDetailPanel`

No relatório anterior, havia fluxo de view-once no `ChatDetailPanel.tsx` que ainda enviava mídia para `chat-media`.

Agora os handlers de áudio, galeria, documento e câmera usam:

```ts
const bucket = isViewOnce ? 'chat-media-private' : 'chat-media';
```

Isso alinha o comportamento com a migration de `chat-media-private`, que não tem SELECT direto para usuários autenticados.

### 2.3. Avatares saíram de signed URL de 1 ano

O avatar de chat agora usa bucket `avatars` com `getPublicUrl`, e não mais signed URL longa no `chat-media`.

Isso remove o risco de uma URL assinada de 1 ano circular como bearer token.

### 2.4. `send-email` recebeu endurecimento

A função `send-email` agora tem:

- JWT obrigatório;
- anon key obrigatória;
- limite de 5 e-mails/minuto;
- quota diária de 50 e-mails por usuário;
- máximo de 5 destinatários;
- máximo de 5 anexos;
- limite de 10 MB em anexos;
- regex de e-mail mais conservadora.

Ainda resta risco residual de anexos em base64, detalhado abaixo.

### 2.5. `secure-login` ajustou CAPTCHA server-side

O `secure-login` valida Turnstile no backend e não repassa o token para o Supabase Auth, evitando dupla verificação de token single-use.

Também mantém:

- rate limit por IP;
- auditoria de falhas;
- falha fechada quando `REQUIRE_CAPTCHA=true` e `TURNSTILE_SECRET_KEY` está ausente.

## 3. Veredito por área

| Área | Estado atual | Avaliação |
| --- | --- | --- |
| RLS geral | Amplo uso de RLS e lockdown em tabelas críticas | Muito bom |
| Login/bruteforce | Edge Function, CAPTCHA, rate limit e auditoria | Muito bom, depende de produção |
| MFA | Fluxo existe, mas enforcement por role não é provado no repo | Bom com ressalva |
| Documentos privados | `get-doc-url-v2` com RLS e signed URL server-side | Muito bom |
| Chat media comum | Agora usa Edge Function e migration remove SELECT amplo | Muito bom, se migration/função forem aplicadas juntas |
| Chat view-once | Bucket privado, TTL curto e upload corrigido | Muito bom |
| Notificações | Insert direto fechado e função valida escopo | Bom/Muito bom |
| E-mail | JWT, quotas e validação melhoraram | Bom, ainda com risco de anexos |
| Secrets | `.env.local` ignorado, mas tem chaves reais locais | Médio operacional |
| Dependências | Raiz ainda tem 9 vulnerabilidades | Médio |
| Over-fetch de PII | Ainda carrega muitos dados no frontend | Médio/Alto |

## 4. Achados ainda pendentes

### P1-01. Over-fetch de PII no `AppContext`

Severidade: **Média/Alta**

O frontend ainda carrega clientes com:

```ts
select('*, history:client_history(*), documents:client_documents(*), proponents:client_proponents(*)')
```

Isso coloca no browser dados sensíveis como:

- CPF;
- telefone;
- e-mail;
- endereço;
- renda;
- documentos/metadados;
- proponentes;
- histórico completo do cliente.

Mesmo com RLS correto, esse padrão aumenta impacto de XSS, extensão maliciosa, devtools, cache, log acidental ou bug de componente.

Recomendação:

- criar queries/views separadas para listagem;
- carregar histórico, documentos e proponentes sob demanda;
- trocar `select('*')` por colunas explícitas;
- mascarar CPF/telefone em listas.

### P1-02. `send-email` ainda recebe anexo final em base64

Severidade: **Média**

O fluxo de e-mail está mais robusto, mas a função ainda recebe:

```ts
attachments?: { filename: string; content: string }[]
```

Ela valida tamanho/quantidade, mas não prova server-side que o conteúdo veio de um documento autorizado.

Recomendação:

- para documentos internos, enviar `document_ids`;
- a Edge Function deve validar acesso via RLS e buscar o arquivo com service role;
- manter base64 apenas para upload manual explícito;
- auditar `document_id`, `client_id`, destinatários e tamanho.

### P1-03. Upload em `chat-media` ainda é amplo para qualquer autenticado

Severidade: **Média**

A leitura foi bem corrigida, mas a policy de INSERT em `chat-media` ainda aceita qualquer autenticado:

```sql
bucket_id = 'chat-media'
AND auth.uid() IS NOT NULL
```

Como leitura passa por Edge Function, isso não gera vazamento direto, mas ainda permite:

- poluição de storage;
- upload em paths de conversas que o usuário não participa;
- custo/abuso operacional;
- arquivos órfãos que nunca são referenciados por mensagem.

Recomendação:

- mover upload comum de chat para Edge Function;
- validar participação antes do upload;
- ou criar tabela `chat_media_objects` e reconcile de objetos órfãos;
- adicionar limpeza periódica para objetos sem mensagem associada.

### P1-04. `get-chat-media-url` autoriza por conversa, não por mensagem/arquivo

Severidade: **Média**

A função valida que o usuário participa da conversa/grupo, o que é o passo certo. Mas ela assina qualquer `path` dentro do `conversationId` informado, sem verificar se aquele path está associado a uma mensagem existente e visível.

Impacto:

- dentro de uma conversa legítima, qualquer participante pode assinar qualquer arquivo no prefixo daquela conversa;
- se houver arquivo órfão no prefixo, ele pode ser acessado pelos participantes.

Recomendação:

- exigir `messageId` além de `path`;
- consultar `chat_messages` via RLS/validação e confirmar `media_path = path`;
- só assinar se o arquivo estiver ligado a uma mensagem existente e não deletada.

### P2-01. Dependências da raiz ainda têm vulnerabilidades

Severidade: **Média**

Resultado de `npm audit --json` na raiz:

- total: **9 vulnerabilidades**
- high: **6**
- moderate: **3**
- critical: **0**

Cadeias principais:

- `@vercel/node`
- `@vercel/build-utils`
- `@vercel/python-analysis`
- `path-to-regexp`
- `undici`
- `minimatch`
- `smol-toml`
- `ajv`

O fix sugerido envolve upgrade major de `@vercel/node` para `4.0.0`, então deve ser testado com build/deploy.

Resultado em `server`: **0 vulnerabilidades**.

### P2-02. Secrets locais e `.env`

Severidade: **Média operacional**

Foi detectado `.env.local` com valores reais, incluindo `OPENAI_API_KEY`. O arquivo está ignorado pelo Git:

```txt
.gitignore:7:.env.local
```

Isso é correto, mas ainda há risco operacional por backup, zip manual, print, sincronização de pasta ou compartilhamento acidental.

Recomendação:

- manter `.env.local` fora do Git;
- rotacionar chaves se houve qualquer exposição;
- manter secrets reais apenas em Supabase/Vercel/ambiente seguro;
- garantir que `.env.example` só tenha placeholders.

### P2-03. Logs ainda podem conter identificadores internos

Severidade: **Baixa/Média**

`get-chat-media-url` registra usuário e conversationId em tentativa não autorizada:

```ts
console.warn('[get-chat-media-url] unauthorized access attempt by', user.id, 'for conversation', conversationId);
```

Não é vazamento público, mas logs são superfície sensível.

Recomendação:

- logar hash parcial ou últimos 6 caracteres;
- evitar UUID completo;
- manter razão, status e evento sem expor identificadores completos.

### P2-04. MFA ainda depende de política operacional

Severidade: **Média**

O fluxo TOTP/AAL2 existe no frontend, mas não foi encontrado enforcement obrigatório por role diretamente no repo.

Recomendação:

- exigir MFA para ADMIN, DIRETOR, GERENTE e financeiro/analista;
- validar no backend funções sensíveis se o usuário está em AAL2 quando aplicável;
- documentar política de recuperação de conta.

## 5. Pontos fortes atuais

- RLS está presente e refinado nas áreas críticas.
- Documentos privados passam por `get-doc-url-v2`, com validação via RLS antes de assinar.
- `chat-media` agora tem desenho correto com Edge Function para assinatura.
- `chat-media-private` protege view-once contra SELECT direto.
- `send-notification` valida JWT, rate limit, tipo e escopo/hierarquia.
- `send-email` ganhou quota diária e validação de e-mail melhor.
- `secure-login` tem CAPTCHA server-side, rate limit e auditoria.
- `api/apuracao.ts` exige JWT, rate limit por minuto, quota diária e limite de payload.
- `.env.local` está ignorado pelo Git.

## 6. Checklist de produção recomendado

Antes de considerar o ambiente fechado, validar no Supabase:

```sql
-- chat-media sem SELECT direto para authenticated/public
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    qual::text like '%chat-media%'
    or with_check::text like '%chat-media%'
  )
order by policyname;

-- notifications sem INSERT direto para authenticated
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'notifications'
order by policyname;

-- buckets sensíveis privados
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('client-documents', 'chat-media', 'chat-media-private');
```

Também validar:

- `get-chat-media-url` deployada antes da migration `20260514230000`;
- `REQUIRE_CAPTCHA=true` em produção;
- `TURNSTILE_SECRET_KEY` configurada;
- `APP_ORIGIN` definido em todas as Edge Functions;
- `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `OPENAI_API_KEY` apenas no backend;
- MFA obrigatório para roles sensíveis;
- alertas para picos de login, signed URLs, e-mail, apuração e notificações.

## 7. Conclusão

O sistema subiu de patamar. As correções recentes atacaram os principais riscos apontados anteriormente, especialmente mídia de chat, view-once, avatar e quota de e-mail.

Hoje o maior risco restante não é uma falha aberta óbvia, mas sim **redução de superfície**: carregar menos PII no browser, provar anexos de e-mail no servidor, amarrar mídia a mensagens específicas e atualizar dependências vulneráveis.

Classificação final: **MUITO BOM em arquitetura, BOM+ para produção imediata**.

Depois de corrigir os P1 restantes, eu classificaria como **MUITO BOM para produção** com folga.
