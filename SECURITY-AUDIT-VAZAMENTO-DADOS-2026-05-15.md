# Relatório de Segurança, Vulnerabilidades e Vazamento de Dados - 2026-05-15

## 1. Resumo executivo

Foi feita uma nova avaliação do repositório com foco em **segurança**, **vulnerabilidades técnicas** e **risco de vazamento de dados**. O sistema está em um nível **bom e próximo de produção**, com avanços claros em relação à auditoria anterior.

As correções mais importantes já aparecem no código/migrations:

- `notifications_insert_authenticated` agora é removida explicitamente em `20260514210000_fix_notifications_p1_01.sql`.
- `chat-media-private` agora está versionado em migration.
- `send-notification` passou a validar relação entre emissor e destinatário para usuários não privilegiados.
- `send-email` exige JWT e o frontend já envia `Authorization`.
- `get-doc-url-v2` mantém documentos privados atrás de validação RLS e URL assinada.
- `api/apuracao.ts` exige JWT, aplica rate limit por minuto e quota diária.

Classificação atual: **BOM+ / quase MUITO BOM**.

Ainda não classifico como “muito bom sem ressalvas” por três motivos principais:

1. mídia comum de chat ainda pode vazar se o path for conhecido, porque `chat-media` permite SELECT para qualquer usuário autenticado;
2. o app carrega muitos dados pessoais em massa no frontend, incluindo clientes, históricos, documentos e proponentes;
3. ainda existem 9 vulnerabilidades de dependências na raiz do projeto.

Nota estimada: **8.2/10** no repositório. Em produção, pode chegar a **8.5/10** se CAPTCHA, CORS, MFA, secrets e migrations estiverem corretamente aplicados.

## 2. Escopo da nova revisão

Foram revisados:

- Edge Functions em `supabase/functions`
- API Vercel em `api/apuracao.ts`
- migrations de RLS e storage em `supabase/migrations`
- storage buckets e policies de `client-documents`, `chat-media`, `chat-media-private`, `trainings` e `developments`
- login, CAPTCHA, MFA, brute force e rate limit
- envio de e-mail e anexos
- notificações
- vazamento por URLs assinadas, logs, `.env`, over-fetch e dados pessoais no frontend
- dependências via `npm audit --json`

## 3. Veredito geral

| Área | Estado atual | Risco |
| --- | --- | --- |
| RLS geral | Boa cobertura e várias migrations de lockdown | Baixo/Médio |
| Login/bruteforce | JWT, Turnstile opcional/obrigatório via env e rate limit | Baixo/Médio |
| CAPTCHA | Suportado, mas depende de `REQUIRE_CAPTCHA=true` em produção | Médio |
| MFA | Fluxo existe, mas enforcement por role não foi provado no repo | Médio |
| Documentos privados | Bom desenho com `get-doc-url-v2` e RLS | Baixo |
| Mídia view-once | Melhorou com `chat-media-private`, TTL de 30s e RPC atômica | Baixo/Médio |
| Mídia comum de chat | Bucket privado, mas leitura ampla para autenticados | Médio/Alto |
| Avatares de chat | URL assinada de 1 ano armazenada no perfil | Médio |
| Notificações | Melhorou; insert direto foi fechado por migration nova | Baixo/Médio |
| E-mail | JWT, rate limit e limites de anexos; ainda recebe base64 | Médio |
| Dependências | Raiz tem 9 vulnerabilidades; server limpo | Médio |
| Secrets | `.env.local` ignorado; existe chave local preenchida | Médio operacional |

## 4. Achados críticos e relevantes

### P1-01. `chat-media` ainda permite leitura por qualquer usuário autenticado

Severidade: **Alta/Média**

A migration `20260514110000_fix_chat_media_select.sql` removeu acesso público e deixou o bucket privado. Isso foi um avanço.

O problema residual é que a policy ainda permite SELECT para qualquer usuário autenticado:

```sql
CREATE POLICY "chat_media_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND auth.uid() IS NOT NULL
);
```

Impacto:

- qualquer usuário logado que descubra o path de um arquivo em `chat-media` pode tentar gerar uma URL assinada;
- arquivos de conversas não são validados por participação na conversa no momento de assinar;
- o frontend chama `createSignedUrl` diretamente em `ChatDetail.tsx` e `ChatDetailPanel.tsx`.

Isso é menos grave do que bucket público, mas ainda é um risco real de vazamento interno.

Correção recomendada:

- remover SELECT amplo de `chat-media`;
- criar Edge Function `get-chat-media-url`;
- validar no servidor se o usuário participa da conversa/grupo;
- gerar URL assinada apenas após validação;
- opcionalmente manter tabela `chat_media_objects` com `conversation_id`, `path`, `uploaded_by`, `message_id`.

### P1-02. Avatares de chat usam signed URL de 1 ano

Severidade: **Média**

Em `src/components/chat/ChatSidebar.tsx`, o avatar é salvo no bucket `chat-media` e uma URL assinada de **1 ano** é gerada:

```ts
createSignedUrl(path, 60 * 60 * 24 * 365)
```

Essa URL parece ser gravada no perfil como `chat_avatar_url`. URL assinada funciona como bearer token: quem tiver o link consegue acessar enquanto ele estiver válido.

Impacto:

- vazamento duradouro de avatar se o link aparecer em log, print, cache, devtools, notificação ou export;
- contraria o endurecimento de signed URLs curtas feito nas mídias de chat.

Correção recomendada:

- usar bucket público separado para avatares não sensíveis; ou
- salvar apenas o path e gerar signed URL curta na renderização; ou
- reduzir TTL para minutos/horas e renovar quando necessário.

### P1-03. View-once melhorou, mas há fluxo que ainda envia mídia view-once para `chat-media`

Severidade: **Média**

`src/pages/ChatDetail.tsx` tem fluxo específico para `chat-media-private`. Isso é bom.

Mas em `src/components/chat/ChatDetailPanel.tsx`, os handlers de áudio, galeria, documento e câmera usam sempre `chat-media`, mesmo quando `viewOnce` está ativo. O registro no banco recebe `view_once: isViewOnce`, mas o arquivo nasce no bucket comum.

Mesmo com `generate-view-once-url` usando TTL de 30 segundos e RPC `chat_open_view_once`, o fato de o arquivo estar em `chat-media` reduz a proteção, porque esse bucket ainda tem SELECT para qualquer autenticado.

Correção recomendada:

- quando `isViewOnce === true`, fazer upload para `chat-media-private`;
- persistir somente `media_path`, não signed URL longa/temporária em `media_url`;
- gerar URL exclusivamente via `generate-view-once-url`.

### P1-04. Over-fetch de dados pessoais no frontend

Severidade: **Média/Alta**

`src/context/AppContext.tsx` carrega clientes com:

```ts
select('*, history:client_history(*), documents:client_documents(*), proponents:client_proponents(*)')
```

Isso joga para o frontend uma carga grande de PII:

- CPF
- e-mail
- telefone
- endereço
- profissão
- renda
- histórico do cliente
- documentos/metadados
- proponentes

RLS limita quem pode ver, mas depois que os dados chegam ao browser, qualquer XSS, extensão maliciosa, devtools, log acidental ou bug de componente pode expor tudo.

Correção recomendada:

- trocar `select('*')` por colunas mínimas por tela;
- carregar documentos/proponentes/histórico sob demanda na página do cliente;
- mascarar CPF/telefone em listas;
- criar views/RPCs específicas para listagem com dados reduzidos.

### P1-05. `send-email` ainda recebe anexos em base64

Severidade: **Média**

O fluxo melhorou: o frontend usa `get-doc-url-v2` para baixar anexos de documentos, e `send-email` exige JWT, anon key e rate limit.

Risco residual: `send-email` ainda recebe o conteúdo final do anexo em base64. A função valida tamanho e quantidade, mas não comprova a origem server-side do conteúdo.

Impacto:

- um usuário autenticado pode enviar qualquer base64 como anexo, dentro dos limites;
- não há política de destinatário/domínio;
- não há quota diária, só 5/minuto.

Correção recomendada:

- para documentos internos, enviar `document_ids` para a Edge Function;
- a função valida RLS/escopo no servidor e busca o arquivo com service role;
- separar anexo manual de anexo vindo de `client-documents`;
- adicionar quota diária e auditoria de destinatários.

## 5. Achados médios

### P2-01. Secrets locais existem, embora `.env.local` esteja ignorado

Severidade: **Média operacional**

Foi detectado `.env.local` com valores preenchidos, incluindo `OPENAI_API_KEY`. O arquivo está ignorado pelo Git conforme `git check-ignore -v .env.local`, o que é correto.

Risco:

- vazamento por backup, print, zip manual, sincronização de pasta ou suporte remoto;
- se o arquivo já tiver sido compartilhado alguma vez, a chave deve ser rotacionada.

Recomendado:

- manter `.env.local` fora do Git;
- mover chaves sensíveis para Supabase/Vercel secrets;
- rotacionar `OPENAI_API_KEY` se houver qualquer dúvida de exposição;
- garantir que `.env.example` não contenha chaves reais.

### P2-02. `npm audit` ainda aponta 9 vulnerabilidades na raiz

Severidade: **Média**

Resultado atual:

- total: **9**
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

No diretório `server`, o resultado foi **0 vulnerabilidades**.

### P2-03. Rate limit usa bloqueio no `count >= limit`

Severidade: **Baixa/Média**

Vários fluxos incrementam contador e bloqueiam quando `count >= limit`. Na prática, isso pode permitir uma requisição a menos do que o nome do limite sugere.

Isso não cria vazamento; é mais um risco de UX e suporte.

Recomendado padronizar:

- bloquear em `count > limit`, se a intenção for permitir exatamente N chamadas;
- ou documentar que o limite configurado é o primeiro contador bloqueado.

### P2-04. Logs podem registrar identificadores internos

Severidade: **Baixa/Média**

Algumas funções registram UUIDs ou erros internos, por exemplo `send-notification` loga destinatários não autorizados. Não foi visto vazamento direto de senha/token, mas convém reduzir dados sensíveis em logs.

Recomendado:

- logar contagens e hash parcial, não UUIDs completos;
- evitar log de payloads de cliente, CPF, telefone, e-mail e signed URLs;
- manter logs estruturados com `event`, `user_id`, `reason`, sem conteúdo sensível.

## 6. Pontos que melhoraram desde o relatório anterior

### 6.1. Notifications

Antes havia risco de a policy `notifications_insert_authenticated` permanecer ativa. Agora existe a migration `20260514210000_fix_notifications_p1_01.sql`, que remove explicitamente:

- `notifications_insert_authenticated`
- `authenticated users can insert notifications`
- `Users can insert notifications`
- `allow_insert_notifications`
- `notifications_insert_admin`
- `notifications_insert_service`

Isso fecha o insert direto pelo frontend.

### 6.2. `send-notification`

A função agora:

- exige JWT;
- aplica rate limit;
- valida UUIDs;
- limita 50 destinatários por chamada;
- valida tipo de notificação;
- para usuários não privilegiados, verifica relação hierárquica e grupo de chat.

Risco residual: `ADMIN`, `DIRETOR` e `GERENTE` são considerados privilegiados e podem notificar qualquer usuário existente. Isso pode ser aceitável pela regra de negócio, mas deve ser uma decisão consciente.

### 6.3. `chat-media-private`

Agora existe migration versionada para `chat-media-private`:

- bucket privado;
- limite de 50 MB;
- MIME types controlados;
- INSERT para autenticados;
- sem SELECT direto;
- leitura via `generate-view-once-url`.

Esse é um avanço relevante contra vazamento de mídia de visualização única.

### 6.4. `get-doc-url-v2`

O fluxo de documentos privados está bem desenhado:

- exige JWT;
- usa rate limit;
- consulta `client_documents` com client autenticado para deixar RLS decidir acesso;
- só depois gera signed URL com service role;
- tenta não revelar demais em erros.

Essa é a arquitetura recomendada também para mídia de chat.

### 6.5. Login e apuração

`secure-login`:

- valida CAPTCHA server-side quando `TURNSTILE_SECRET_KEY` existe;
- falha fechado se `REQUIRE_CAPTCHA=true` e secret estiver ausente;
- aplica rate limit por IP;
- audita falhas sem registrar senha.

`api/apuracao.ts`:

- exige JWT;
- valida sessão no Supabase Auth;
- usa rate limit 20/min;
- usa quota diária 100/dia;
- limita payload.

## 7. Risco específico de vazamento de dados

| Vetor | Risco atual | Comentário |
| --- | --- | --- |
| Documentos de cliente | Baixo | `get-doc-url-v2` é bom; evitar bypass direto |
| Paths de documentos no frontend | Médio | `client_documents(*)` expõe metadados/path a quem já passou RLS |
| Mídia comum de chat | Médio/Alto | qualquer autenticado pode SELECT no bucket se souber path |
| Mídia view-once | Baixo/Médio | private bucket existe, mas um fluxo ainda usa `chat-media` |
| Avatares | Médio | signed URL de 1 ano |
| Logs | Baixo/Médio | reduzir UUIDs e erros detalhados |
| Secrets locais | Médio operacional | `.env.local` ignorado, mas contém valores reais |
| PII no AppContext | Médio/Alto | muitos dados pessoais carregados globalmente |
| Export de pipeline | Médio | exporta nome, telefone, e-mail, renda e estágio; depende de RLS/role |

## 8. Recomendações prioritárias

### P1

1. Criar `get-chat-media-url` e remover SELECT amplo de `chat-media`.
2. Corrigir `ChatDetailPanel.tsx` para enviar mídia view-once ao `chat-media-private`.
3. Remover signed URL de 1 ano para avatar; salvar path ou usar bucket público próprio.
4. Reduzir over-fetch em `AppContext.tsx` para não carregar PII completa globalmente.
5. Alterar `send-email` para aceitar `document_ids` e validar anexos no servidor.

### P2

1. Atualizar `@vercel/node` e dependências relacionadas.
2. Adicionar quota diária em `send-email` e `send-notification`.
3. Mascarar CPF/telefone/e-mail em listas e logs.
4. Revisar `.env.example` para garantir que só contém placeholders.
5. Criar testes automatizados de RLS para perfis: corretor, coordenador, gerente, diretor, admin.

### P3

1. Adicionar CSP forte contra XSS.
2. Monitorar picos de signed URLs, downloads e e-mails.
3. Criar rotina de rotação de secrets.
4. Criar playbook de resposta a incidente de vazamento.

## 9. Checklist de produção

Antes de considerar produção segura, validar:

```sql
-- Notifications sem INSERT direto para authenticated
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'notifications'
order by policyname;

-- Buckets privados/sensíveis
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('client-documents', 'chat-media', 'chat-media-private');

-- Policies de chat-media
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    qual::text like '%chat-media%'
    or with_check::text like '%chat-media%'
  )
order by policyname;

-- Funções SECURITY DEFINER sem search_path explícito
select n.nspname, p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname;
```

Também validar fora do SQL:

- `REQUIRE_CAPTCHA=true` em produção;
- `TURNSTILE_SECRET_KEY` configurada;
- `APP_ORIGIN` correto em todas Edge Functions;
- `OPENAI_API_KEY`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` apenas em secrets de backend;
- `.env.local` nunca enviado para Git, zip, print ou suporte;
- MFA obrigatório para roles sensíveis, se essa for a política da empresa.

## 10. Conclusão

O sistema está **bem encaminhado e mais seguro que na revisão anterior**. As correções novas fecharam riscos importantes em notificações e mídia view-once.

O principal risco restante de vazamento está em **mídia comum de chat** e **excesso de dados pessoais carregados no frontend**. Esses dois pontos são os que mais impedem a classificação “muito bom”.

Classificação final desta revisão:

- Segurança geral: **BOM+**
- RLS/documentos privados: **MUITO BOM**
- Chat/media: **MÉDIO/BOM, precisa endurecer**
- E-mail/anexos: **BOM com pendência**
- Dependências: **MÉDIO**
- Prontidão para produção: **boa, com P1 pendentes antes de uma liberação tranquila**

Depois de corrigir os P1 deste relatório, a classificação sobe para **MUITO BOM para produção**.
