# Relatório de Auditoria de Segurança — Módulo de Chat
**Data:** 2026-05-13
**Escopo:** Componentes React/TypeScript do chat + migrations SQL relacionadas
**Metodologia:** Revisão estática de código (deep), análise de RLS, rastreamento de fluxo de dados

---

## Resumo Executivo

Foram identificados **7 achados críticos**, **9 alertas** e **5 itens informativos** distribuídos entre vulnerabilidades de autorização no banco de dados, bypasses da proteção view-once, escalada de privilégio em RPCs, injeção de dados não sanitizados em iframe, ausência de validação de tipo/tamanho de arquivo no cliente e falhas de integridade na lógica de broadcast/Realtime.

O risco mais grave é a combinação de uma RPC `SECURITY DEFINER` sem verificação de autorização (`chat_delete_for_me`) com políticas UPDATE excessivamente permissivas, que permitem que qualquer participante de conversa marque como deletado o conteúdo de mensagens de outros usuários.

---

## CRÍTICO

---

### C-01: RPC `chat_delete_for_me` aceita `p_user_id` arbitrário — qualquer usuário pode deletar mensagens de outros

**Arquivo:** `supabase/migrations/20260512150000_chat_delete_for_me_rpc.sql:1-10`
**Arquivo chamador:** `src/components/chat/ChatDetailPanel.tsx:563`

**Descrição:**
A função `SECURITY DEFINER` recebe `p_user_id uuid` como parâmetro externo e o usa diretamente no UPDATE, sem validar que `p_user_id = auth.uid()`:

```sql
CREATE OR REPLACE FUNCTION public.chat_delete_for_me(p_message_id uuid, p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE chat_messages
  SET deleted_for = array_append(COALESCE(deleted_for, '{}'), p_user_id)
  WHERE id = p_message_id
    AND NOT (p_user_id = ANY(COALESCE(deleted_for, '{}')));
$$;
```

O chamador no frontend passa `myId`:
```ts
await supabase.rpc('chat_delete_for_me', { p_message_id: msgId, p_user_id: myId });
```

Mas qualquer usuário autenticado pode chamar a RPC substituindo `p_user_id` com o UUID de outra pessoa via Supabase JS SDK ou diretamente via `curl`/`Postman`, fazendo com que mensagens desapareçam da visão de usuários alheios sem consentimento deles.

**Impacto:** Usuário A pode fazer com que o usuário B não veja mais nenhuma de suas mensagens, efetivamente censurando conversas alheias.

**Correção:**
```sql
CREATE OR REPLACE FUNCTION public.chat_delete_for_me(p_message_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE chat_messages
  SET deleted_for = array_append(COALESCE(deleted_for, '{}'), auth.uid())
  WHERE id = p_message_id
    AND NOT (auth.uid() = ANY(COALESCE(deleted_for, '{}')));
$$;
```
Remover o parâmetro `p_user_id` e usar exclusivamente `auth.uid()` internamente.

---

### C-02: Política UPDATE excessivamente permissiva em `chat_messages` — qualquer participante pode alterar campos de outros

**Arquivo:** `supabase/migrations/20260512130000_chat_messages_group_support.sql:36-53`
**Arquivo também afetado:** `supabase/migrations/20260325030000_chat_soft_delete.sql:23-29`

**Descrição:**
A política `chat_messages_update_participants` permite que qualquer participante de uma conversa (sender OU receiver OU membro do grupo) faça UPDATE em qualquer mensagem dessa conversa:

```sql
CREATE POLICY chat_messages_update_participants
ON public.chat_messages FOR UPDATE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR (group_id IS NOT NULL AND public.is_chat_group_member(group_id))
  )
)
WITH CHECK ( /* mesma condição */ );
```

Isso significa que o destinatário de uma mensagem pode atualizar `content`, `media_url`, `is_deleted`, `view_once`, `view_once_opened` de mensagens enviadas por terceiros. Um atacante pode:
1. Alterar o conteúdo de uma mensagem que recebeu para forjar o que o remetente disse.
2. Setar `view_once_opened = true` em mensagens que ainda não abriu, sem passar pelo controle do frontend.
3. Setar `is_deleted = true` em mensagens de outros para apagá-las para todos.
4. Setar `view_once = false` numa mensagem view-once antes de abri-la, removendo a proteção.

**Impacto:** Manipulação de histórico de conversas, bypass completo de view-once, falsificação de mensagens.

**Correção:**
Separar as políticas por caso de uso:
```sql
-- Apenas remetente pode marcar is_deleted=true (apagar para todos)
CREATE POLICY chat_messages_update_sender_delete
ON public.chat_messages FOR UPDATE TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

-- Qualquer participante pode atualizar apenas deleted_for e view_once_opened
-- Implementar via RPC SECURITY DEFINER com validação de auth.uid()
```
Aplicar column-level grants ou mover todas as atualizações sensíveis para RPCs que enforcem o `auth.uid()` correto.

---

### C-03: Bypass de view-once — receptor pode ler conteúdo via API direta antes de marcar como aberta

**Arquivo:** `src/components/chat/ChatDetailPanel.tsx:617-625` e `supabase/migrations/20260513201000_add_view_once_to_messages.sql`

**Descrição:**
A proteção view-once é implementada **exclusivamente no frontend**. O campo `view_once_opened` é gravado no banco apenas quando o usuário clica no botão de abertura no componente React. Porém:

1. O conteúdo completo (`media_url`, `content`) é sempre retornado pelo SELECT, independentemente de `view_once_opened`.
2. Um usuário pode chamar diretamente `supabase.from('chat_messages').select('*').eq('id', msgId)` e obter a URL da mídia sem nunca acionar `onMarkViewOnceOpened`.
3. A URL de mídia está no bucket `chat-media` com política de leitura **pública** (sem autenticação), então qualquer pessoa com a URL pode baixar o arquivo indefinidamente.
4. No frontend, o próprio viewer não previne screen capture nem impede download — o botão de download é apenas ocultado para mensagens view-once, mas a URL está disponível no DOM (atributo `src` da tag `<img>` ou `<video>`).

**Impacto:** A feature de "visualização única" não oferece proteção real. O conteúdo pode ser acessado múltiplas vezes por qualquer meio além do componente React.

**Correção:**
- No banco: não retornar `media_url` e `content` quando `view_once = true AND view_once_opened = true` (via view ou computed column).
- No Storage: usar URLs temporárias (signed URLs com TTL curto) em vez de URLs públicas permanentes para mídias view-once.
- Criar uma RPC que atomicamente leia o conteúdo e marque `view_once_opened = true` em uma única transação, retornando a URL apenas nessa chamada.
- Remover `media_url` do bucket público para arquivos view-once — armazenar em path privado e gerar signed URL na abertura.

---

### C-04: Bucket `chat-media` com leitura pública irrestrita — URLs de mídia são permanentes e não autenticadas

**Arquivo:** `supabase/migrations/20260513100000_chat_media_bucket.sql:22-24`

**Descrição:**
```sql
CREATE POLICY "chat_media_select" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'chat-media');
```

O bucket é `public: true` e a policy de SELECT é para `public` (não autenticado). Isso significa:
1. Qualquer pessoa na internet com a URL pode acessar imagens, vídeos, áudios e documentos do chat.
2. URLs de mídia uma vez vazadas (ex: em logs, histórico de browser, Realtime events) são permanentemente válidas.
3. Não há validação de que quem acessa a URL é participante da conversa.
4. Isso agrava diretamente o C-03 (view-once bypass).

**Impacto:** Exposição irrestrita de mídias privadas de chat para qualquer pessoa na internet.

**Correção:**
```sql
-- Mudar bucket para privado
UPDATE storage.buckets SET public = false WHERE id = 'chat-media';

-- Restringir SELECT a autenticados (ainda não ideal, mas melhor)
DROP POLICY "chat_media_select" ON storage.objects;
CREATE POLICY "chat_media_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-media');
```
A solução ideal é verificar se o usuário autenticado é participante da conversa que originou o arquivo (via `storage.foldername(name)[1]` = `conversationId` e checar membership).

---

### C-05: Política de INSERT em `chat_media_update` não restringe ownership — qualquer autenticado pode sobrescrever arquivo de outro

**Arquivo:** `supabase/migrations/20260513100000_chat_media_bucket.sql:17-19`

**Descrição:**
```sql
CREATE POLICY "chat_media_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'chat-media');
```

A política de UPDATE não verifica `auth.uid()`. Qualquer usuário autenticado pode sobrescrever o objeto de storage de outro usuário se souber o path. Os paths seguem o padrão previsível `{conversationId}/{timestamp}_{tipo}.{ext}`. Um atacante que participou de uma conversa conhece o `conversationId` e pode tentar sobrescrever mídias alheias dentro dessa mesma conversa.

**Impacto:** Substituição de conteúdo de mídia já enviado (imagens, documentos) por conteúdo malicioso ou constrangedor.

**Correção:**
```sql
DROP POLICY "chat_media_update" ON storage.objects;
CREATE POLICY "chat_media_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[2]);
```
Ajustar a estrutura de path para incluir o `user_id` como segundo segmento: `{conversationId}/{userId}/{timestamp}_{tipo}.{ext}`.

---

### C-06: Injeção via `src` em `<iframe>` sem sanitização — potencial XSS via `media_url` controlado por atacante

**Arquivo:** `src/components/chat/ChatMessageBubble.tsx:424-430`

**Descrição:**
```tsx
{message.type === 'document' && isPdf && (
  <iframe
    src={`${message.mediaUrl}#toolbar=1&navpanes=0`}
    title={mediaName}
    className="w-full h-full max-w-5xl bg-white border-0 shadow-sm"
  />
)}
```

O `message.mediaUrl` vem diretamente do banco de dados (`media_url`) sem validação de origem. Se um atacante conseguir inserir uma mensagem com `media_url` apontando para uma página HTML externa (ex: `https://evil.com/exploit.html`), ela será carregada no iframe. Embora o Supabase valide MIME types no upload, a coluna `media_url` no banco pode receber qualquer valor via:
- Inserção direta via API (o `WITH CHECK` da policy apenas valida `sender_id = auth.uid()`, não valida o conteúdo da mensagem).
- A política INSERT atual não restringe o valor de `media_url`.

**Impacto:** Se `media_url` puder ser controlada para uma URL externa, o iframe pode carregar conteúdo HTML arbitrário com acesso ao `window.opener` e à origem do app, dependendo do `sandbox` aplicado (que aqui está ausente).

**Correção:**
```tsx
// Validar que a URL pertence ao domínio do Supabase Storage antes de renderizar
const isSafeUrl = (url?: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === new URL(import.meta.env.VITE_SUPABASE_URL).hostname;
  } catch { return false; }
};

// No JSX:
{message.type === 'document' && isPdf && isSafeUrl(message.mediaUrl) && (
  <iframe
    src={`${message.mediaUrl}#toolbar=1&navpanes=0`}
    sandbox="allow-scripts allow-same-origin"
    ...
  />
)}
```

---

### C-07: Conteúdo de texto de mensagem renderizado via `ReactMarkdown` sem `rehype-sanitize` — XSS em mensagens KAI

**Arquivo:** `src/components/chat/ChatMessageBubble.tsx:243-250`

**Descrição:**
```tsx
<ReactMarkdown>{message.text || ''}</ReactMarkdown>
```

`ReactMarkdown` por padrão escapa HTML, mas se a biblioteca estiver configurada com `rehype-raw` ou plugins que permitem HTML bruto, ou se a versão em uso tiver vulnerabilidades, conteúdo malicioso pode ser executado. Mais importante: mensagens `kai_reply` são persistidas no banco pelo próprio frontend sem sanitização do lado do servidor. Se o endpoint da Edge Function `kai-agent` for comprometido ou retornar conteúdo inesperado, ele será renderizado via `ReactMarkdown`.

Adicionalmente, links gerados pelo Markdown (`[texto](javascript:alert(1))`) podem ser executados dependendo da versão do `react-markdown`.

**Impacto:** XSS em mensagens do assistente KAI se a resposta da Edge Function incluir conteúdo malicioso.

**Correção:**
```tsx
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeSanitize]}
  components={{
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
    ),
  }}
>
  {message.text || ''}
</ReactMarkdown>
```

---

## ALTO

---

### A-01: `chat_delete_for_me` é chamada sem verificar o retorno de erro — silencia falhas de autorização

**Arquivo:** `src/components/chat/ChatDetailPanel.tsx:560-564`

**Descrição:**
```ts
const handleDeleteForMe = useCallback(async (msgId: string) => {
  if (!myId) return;
  setMessages(prev => prev.filter(m => m.id !== msgId));
  await supabase.rpc('chat_delete_for_me', { p_message_id: msgId, p_user_id: myId });
}, [myId]);
```

A mensagem é removida do estado local antes da confirmação do banco. Se a RPC falhar (erro de rede, violação de RLS), a mensagem desaparece da UI mas permanece visível na próxima sessão. Nenhum erro é mostrado ao usuário.

**Correção:** Verificar o retorno da RPC e reverter o estado local em caso de erro.

---

### A-02: `handleMarkViewOnceOpened` não verifica `sender_id` — receptor marca como aberta mas policy UPDATE permite qualquer participante

**Arquivo:** `src/components/chat/ChatDetailPanel.tsx:617-625`

**Descrição:**
```ts
const handleMarkViewOnceOpened = useCallback(async (msgId: string) => {
  setMessages(prev => prev.map(m =>
    m.id === msgId ? { ...m, viewOnceOpened: true } : m
  ));
  await supabase
    .from('chat_messages')
    .update({ view_once_opened: true })
    .eq('id', msgId);
}, []);
```

A query não filtra por `receiver_id = myId`. Em conjunto com a política UPDATE permissiva (C-02), o remetente poderia chamar essa função para marcar suas próprias mensagens como abertas, enganando a UI sobre o status de leitura.

**Correção:** Adicionar `.eq('receiver_id', myId)` ao filtro do UPDATE.

---

### A-03: Política de reactions SELECT irrestrita — qualquer usuário autenticado vê reações de conversas que não participa

**Arquivo:** `supabase/migrations/20260512140000_chat_reactions.sql:14-17`

**Descrição:**
```sql
CREATE POLICY "reactions_select"
ON public.chat_message_reactions FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);
```

A condição `auth.uid() IS NOT NULL` é verdadeira para qualquer usuário autenticado. Qualquer usuário pode enumerar reações de todas as mensagens do sistema se souber o `message_id`.

**Impacto:** Vazamento de metadados de conversas privadas (quem reagiu a quê, com qual emoji, quando).

**Correção:**
```sql
CREATE POLICY "reactions_select"
ON public.chat_message_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_messages cm
    WHERE cm.id = chat_message_reactions.message_id
      AND (
        cm.sender_id = auth.uid()
        OR cm.receiver_id = auth.uid()
        OR (cm.group_id IS NOT NULL AND public.is_chat_group_member(cm.group_id))
      )
  )
);
```

---

### A-04: Validação de tipo de arquivo feita apenas via `accept` HTML — bypass trivial via API

**Arquivo:** `src/components/chat/ChatDetailPanel.tsx:711-723`

**Descrição:**
```tsx
<input
  ref={galleryInputRef}
  type="file"
  accept="image/jpeg,image/png,image/gif,image/webp,image/heic,video/mp4,video/quicktime,video/webm"
  onChange={handleGalleryFile}
/>
```

O atributo `accept` é uma dica de UI ao sistema operacional — pode ser contornado ao renomear um arquivo (ex: `exploit.html` → `exploit.jpg`) ou ao chamar `supabase.storage.from('chat-media').upload()` diretamente via JS sem passar pelo input HTML.

O handler `handleGalleryFile` verifica apenas `file.type.startsWith('video/')` para distinguir vídeo de imagem, mas `file.type` é definido pelo browser com base na extensão, não no conteúdo real do arquivo. Um arquivo `.html` renomeado para `.jpg` terá `type = 'image/jpeg'` em alguns browsers.

O bucket tem `allowed_mime_types` configurado, o que é a defesa correta no servidor. No entanto, não há verificação de tamanho no frontend antes do upload (o limite de 50MB só é aplicado pelo Supabase ao receber o arquivo), e não há validação de conteúdo (magic bytes).

**Correção:** Adicionar verificação de tamanho no frontend antes de iniciar o upload:
```ts
const MAX_SIZE = 50 * 1024 * 1024;
if (file.size > MAX_SIZE) {
  alert('Arquivo muito grande. Limite: 50MB.');
  return;
}
```

---

### A-05: Path de upload previsível sem componente de aleatoriedade suficiente — race condition e enumeração de arquivos

**Arquivo:** `src/components/chat/ChatDetailPanel.tsx:437-439, 472-474, 532`

**Descrição:**
Todos os uploads usam o padrão:
```ts
const path = `${conversationId}/${Date.now()}_${type}.${ext}`;
```

`Date.now()` retorna milissegundos, o que é previsível para um atacante que sabe aproximadamente quando o arquivo foi enviado. Em combinação com o bucket público (C-04), um atacante que conhece o `conversationId` pode enumerar arquivos por força bruta de timestamps dentro de uma janela de tempo.

**Correção:** Adicionar um componente aleatório ao path:
```ts
const randomId = crypto.randomUUID().slice(0, 8);
const path = `${conversationId}/${Date.now()}_${randomId}_${type}.${ext}`;
```

---

### A-06: Payload de broadcast não validado — usuário pode injetar nome/tipo arbitrário no indicador "digitando"

**Arquivo:** `src/components/chat/ChatDetailPanel.tsx:176-185`

**Descrição:**
```ts
.on('broadcast', { event: 'chat-activity' }, ({ payload }) => {
  if (!payload || payload.userId === myId) return;
  if (payload.type === 'typing' || payload.type === 'recording') {
    setRemoteActivity({ name: payload.name || otherName || 'Usuario', type: payload.type });
```

O `payload.name` vem diretamente do broadcast sem sanitização. Qualquer participante do canal Realtime pode enviar um broadcast com `name: '<script>...</script>'` ou qualquer string arbitrária. Embora isso seja renderizado em um contexto JSX (protegido contra XSS por escaping do React), o usuário pode exibir qualquer texto no indicador de atividade.

Em canais de grupo, qualquer membro pode enviar broadcast com `userId` de outro membro (o filtro `payload.userId === myId` apenas ignora o próprio userId do viewer, não valida autenticidade do remetente).

**Impacto:** Spoofing do indicador "está digitando" — um membro pode fazer parecer que outro membro está digitando/gravando indefinidamente.

**Correção:** Não confiar no `payload.name` do broadcast. Resolver o nome do usuário pelo `payload.userId` via `allProfiles` local, que é carregado de forma autenticada:
```ts
const remoteName = allProfiles?.find(p => p.id === payload.userId)?.chat_display_name
  || allProfiles?.find(p => p.id === payload.userId)?.name
  || otherName || 'Usuario';
setRemoteActivity({ name: remoteName, type: payload.type });
```

---

### A-07: `wa_conversations` — política RLS `USING (true)` sem restrição de role expõe dados de leads

**Arquivo:** `supabase/migrations/20260304040000_wa_conversations.sql:30-31`

**Descrição:**
```sql
CREATE POLICY "service_role full access" ON public.wa_conversations
  USING (true) WITH CHECK (true);
```

O comentário diz "Somente service_role acessa", mas a policy não restringe por role. `USING (true)` com RLS habilitado significa que a política permite acesso a qualquer role que passe pelo RLS — incluindo usuários autenticados via anon key. A restrição a `service_role` ocorre porque o `service_role` bypassa RLS por padrão, mas isso significa que usuários autenticados comuns também teriam acesso se o RLS for o único mecanismo.

**Impacto:** Potencial exposição de dados de leads e histórico de conversas WhatsApp com IA para usuários internos do app.

**Correção:**
```sql
-- Revogar acesso de authenticated e anon
REVOKE ALL ON public.wa_conversations FROM authenticated, anon;
-- Ou adicionar restrição explícita na policy
DROP POLICY "service_role full access" ON public.wa_conversations;
-- Não criar nenhuma policy pública — service_role já bypassa RLS
```

---

### A-08: Ausência de `Authorization` header na chamada à Edge Function KAI

**Arquivo:** `src/services/kaiAgent.ts:11-17`

**Descrição:**
```ts
const res = await fetch(`${SUPABASE_URL}/functions/v1/kai-agent`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  },
  body: JSON.stringify({ message, history }),
});
```

A Edge Function recebe apenas `apikey` (anon key) mas não o JWT do usuário autenticado (`Authorization: Bearer <token>`). Isso significa que a Edge Function não tem como verificar a identidade do usuário que está enviando a mensagem. Qualquer pessoa com a anon key (que é pública, embutida no bundle do app) pode chamar a Edge Function sem estar autenticada.

**Impacto:** A Edge Function KAI pode ser chamada por qualquer pessoa, não apenas usuários autenticados do app. Dependendo do custo da API de IA usada no backend, isso pode resultar em abuso de quota/custo.

**Correção:**
```ts
const session = await supabase.auth.getSession();
const accessToken = session.data.session?.access_token;

const res = await fetch(`${SUPABASE_URL}/functions/v1/kai-agent`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ message, history }),
});
```
Na Edge Function, verificar o JWT via `supabase.auth.getUser()`.

---

### A-09: Conteúdo de `chat_status_text` e `chat_display_name` renderizado sem sanitização

**Arquivo:** `src/components/chat/ChatInfoModal.tsx:293`

**Descrição:**
```tsx
<p className="text-sm text-text-primary">{userInfo?.chat_status_text?.trim() || 'Sem status definido.'}</p>
```

Embora o React escape strings por padrão (protegendo contra XSS básico), o campo `chat_status_text` não tem limitação de tamanho no banco (`text` sem CHECK). Um usuário pode definir um status de texto com milhares de caracteres, causando layout overflow ou degradação visual. Não é XSS, mas é um vetor de abuso de conteúdo.

Mais relevante: o campo `chat_display_name` é usado em notificações construídas por string interpolation:
```ts
message: `${myName} colocou vc no grupo ${groupInfo.name}`,
```

Se `myName` contiver caracteres de controle ou sequências especiais dependendo do sistema de notificação push, pode causar comportamento inesperado.

**Correção:** Adicionar `CHECK (char_length(chat_status_text) <= 200)` na coluna do banco e truncar no frontend antes de exibir.

---

## MÉDIO

---

### M-01: Arquivo de migration SQL com conteúdo de prompt de IA injetado acidentalmente

**Arquivo:** `supabase/migrations/20260309_chat_improvements.sql:15+`

**Descrição:**
A partir da linha 15, o arquivo de migration SQL contém um prompt extenso de n8n/Gemini que claramente foi colado por acidente. O arquivo começa com SQL válido (linhas 1-14) e depois contém texto em português descrevendo um workflow de WhatsApp com IA.

Embora o PostgreSQL provavelmente ignore o texto extra após as queries válidas (dependendo do cliente usado para executar), isso indica que:
1. O processo de criação de migrations não tem revisão de código.
2. O arquivo pode falhar silenciosamente em alguns contextos de execução.
3. Informações sobre arquitetura interna (URLs de API, estrutura de integração com IA) são expostas no repositório de código.

**Correção:** Limpar o arquivo para conter apenas o SQL válido (linhas 1-14).

---

### M-02: Lógica de autorização para remoção de membros duplicada em cliente e servidor sem sincronização garantida

**Arquivo:** `src/components/chat/ChatDetailPanel.tsx:292-312`

**Descrição:**
```ts
const handleRemoveGroupMember = useCallback(async (memberId: string) => {
  if (!groupId || !myId || groupInfo?.created_by !== myId || memberId === myId) return;
  // ...
  const { error } = await supabase
    .from('chat_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', memberId);
```

A verificação `groupInfo?.created_by !== myId` usa dados carregados em memória (`groupInfo`). Se o grupo tiver mudado de criador entre o carregamento e a execução (ex: via outro cliente), a verificação client-side estará desatualizada, mas a política RLS do servidor (`creator_remove_members`) cobrirá esse caso. O problema é o caminho inverso: se `groupInfo.created_by === myId` mas o usuário não é mais o criador no banco, o frontend tentará a operação e receberá erro sem tratar adequadamente (apenas `alert`).

**Correção:** Menor prioridade dado que o RLS cobre o caso, mas verificar o retorno de erro e atualizar o `groupInfo` local em caso de falha de autorização.

---

### M-03: `handleDeleteForAll` não verifica `sender_id` antes do UPDATE — depende apenas de RLS

**Arquivo:** `src/components/chat/ChatDetailPanel.tsx:566-578`

**Descrição:**
```ts
const handleDeleteForAll = useCallback(async (msgId: string) => {
  if (!myId) return;
  setMessages(prev => prev.map(m =>
    m.id === msgId && m.isMe  // ← verifica isMe apenas no estado local
      ? { ...m, is_deleted: true, ... }
      : m
  ));
  await supabase
    .from('chat_messages')
    .update({ is_deleted: true, content: null, media_url: null })
    .eq('id', msgId)
    .eq('sender_id', myId);  // ← filtro correto, mas estado local é alterado antes
```

O estado local é modificado antes da confirmação do servidor. Se o UPDATE falhar, a mensagem aparece como deletada na UI mas permanece intacta no banco. Na próxima recarga, ela reaparece. Além disso, `m.isMe` no estado local pode diferir da realidade no banco se `sender_id` não for o usuário (em mensagens carregadas com bug).

**Correção:** Aguardar a confirmação do banco antes de atualizar o estado local, ou reverter em caso de erro.

---

### M-04: `conversationId` para DMs é construído com `sort()` no cliente — inconsistência se a lógica diferir no banco

**Arquivo:** `src/components/chat/ChatDetailPanel.tsx:63-69`

**Descrição:**
```ts
const conversationId = isKAI
  ? `kai-${myId}`
  : isGroup
    ? otherId
    : otherId && myId
      ? [myId, otherId].sort().join('-')
      : null;
```

O `conversationId` de DMs é gerado por `[myId, otherId].sort().join('-')`. Isso é correto para garantir consistência, mas o banco não tem um índice ou constraint que garanta que o `conversation_id` siga exatamente esse formato. Um usuário mal-intencionado poderia inserir uma mensagem com `conversation_id = 'uuid-B-uuid-A'` (ordem invertida) ao invés de `'uuid-A-uuid-B'`, criando uma conversa paralela com a mesma dupla de usuários.

**Impacto:** Divisão de histórico de conversas, possível confusão de RLS se a policy de SELECT checar apenas `sender_id` e `receiver_id` (o que é o caso atual).

**Correção:** Adicionar um CHECK constraint no banco que garanta o formato ordenado do `conversation_id` para DMs, ou usar uma função de geração de conversation_id no banco via trigger.

---

### M-05: `groupInfo.name` usado diretamente em `confirm()` sem escape — possível UI spoofing

**Arquivo:** `src/components/chat/ChatDetailPanel.tsx:373`

**Descrição:**
```ts
if (!confirm(`Excluir o grupo "${groupInfo.name}"? Essa ação removerá o grupo para todos.`)) return;
```

O nome do grupo é inserido diretamente na string do `confirm()`. Embora o `window.confirm` seja um diálogo nativo do browser (imune a XSS), nomes de grupo muito longos ou com caracteres de nova linha (`\n`) podem distorcer o texto do diálogo, fazendo parecer que o diálogo pergunta outra coisa (UI redress/social engineering).

**Correção:** Truncar o nome do grupo antes de exibir no `confirm`, ou usar um componente de modal customizado já existente no projeto.

---

## BAIXO / INFORMATIVO

---

### I-01: `REPLICA IDENTITY FULL` em `chat_messages` expõe dados completos nos logs de replicação

**Arquivo:** `supabase/migrations/20260309b_chat_replica_identity.sql`

**Descrição:**
`ALTER TABLE chat_messages REPLICA IDENTITY FULL` faz com que o Write-Ahead Log (WAL) do PostgreSQL inclua o valor completo de todas as colunas em cada operação de UPDATE/DELETE, incluindo `content` e `media_url`. Esses dados circulam pelo pipeline de Realtime do Supabase. Se houver algum vazamento no pipeline de Realtime (ex: configuração incorreta de canal público), mensagens deletadas ou atualizadas poderão expor o conteúdo anterior.

**Recomendação:** Avaliar se `REPLICA IDENTITY FULL` é estritamente necessário ou se `REPLICA IDENTITY DEFAULT` (apenas a PK) seria suficiente para os casos de uso de Realtime.

---

### I-02: `audioContextRef` não é fechado em todos os caminhos de erro no `startRecording`

**Arquivo:** `src/components/chat/ChatInputBar.tsx:80-127`

**Descrição:**
Se `getUserMedia` falhar após a criação do `AudioContext`, o contexto é criado mas o fluxo de erro não o fecha. O `AudioContext` consome recursos do sistema operacional e tem limite por aba/origin em alguns browsers.

**Correção:** Fechar o `audioContext` no bloco catch.

---

### I-03: `downloadMedia` cria elemento `<a>` no DOM e não trata falha de fetch adequadamente

**Arquivo:** `src/components/chat/ChatMessageBubble.tsx:73-95`

**Descrição:**
O fallback de download em caso de erro de fetch cria um `<a>` com `a.href = message.mediaUrl` diretamente, sem validação da URL. Para URLs externas (caso C-06), isso poderia redirecionar o usuário para conteúdo malicioso ao clicar em "baixar".

---

### I-04: `console.error` com dados de erro de rede em produção

**Arquivo:** `src/components/chat/ChatDetailPanel.tsx:115`, `src/services/kaiAgent.ts:28`

**Descrição:**
Mensagens de erro são logadas com `console.error` incluindo detalhes do erro. Em produção, isso pode expor stack traces, detalhes de infraestrutura ou dados de requisição em ferramentas de DevTools de usuários.

**Recomendação:** Usar um serviço de logging estruturado (ex: Sentry) com filtragem de dados sensíveis, e remover `console.error` direto em produção.

---

### I-05: Sem limite no tamanho do grupo — grupos com milhares de membros podem degradar queries de RLS

**Arquivo:** `supabase/migrations/20260512120000_chat_groups.sql`

**Descrição:**
Não há CHECK constraint ou trigger limitando o número de membros por grupo. As policies RLS que usam `is_chat_group_member()` executam subqueries na tabela `chat_group_members` em cada operação. Com grupos muito grandes, isso pode degradar a performance de todas as queries de chat.

**Recomendação:** Adicionar um limite de membros por grupo (ex: 256) via trigger ou constraint, e considerar cache de membership em tabela desnormalizada.

---

## Tabela Resumo

| ID   | Severidade | Arquivo Principal                                      | Categoria                        |
|------|-----------|-------------------------------------------------------|----------------------------------|
| C-01 | CRÍTICO   | chat_delete_for_me_rpc.sql + ChatDetailPanel.tsx:563  | Escalada de privilégio / RPC     |
| C-02 | CRÍTICO   | chat_messages_group_support.sql:36-53                 | RLS permissivo / UPDATE irrestrito |
| C-03 | CRÍTICO   | ChatDetailPanel.tsx:617 + add_view_once.sql           | View-once bypass / proteção nula |
| C-04 | CRÍTICO   | chat_media_bucket.sql:22-24                           | Exposição de mídia pública       |
| C-05 | CRÍTICO   | chat_media_bucket.sql:17-19                           | Sobrescrita de arquivo alheio    |
| C-06 | CRÍTICO   | ChatMessageBubble.tsx:424-430                         | iframe sem validação / XSS      |
| C-07 | CRÍTICO   | ChatMessageBubble.tsx:243-250                         | ReactMarkdown sem sanitização    |
| A-01 | ALTO      | ChatDetailPanel.tsx:560-564                           | Erro silenciado / rollback ausente |
| A-02 | ALTO      | ChatDetailPanel.tsx:617-625                           | UPDATE sem filtro de receiver    |
| A-03 | ALTO      | chat_reactions.sql:14-17                              | RLS SELECT irrestrito            |
| A-04 | ALTO      | ChatDetailPanel.tsx:711-723                           | Validação de arquivo client-only |
| A-05 | ALTO      | ChatDetailPanel.tsx:437,472,532                       | Path previsível no Storage       |
| A-06 | ALTO      | ChatDetailPanel.tsx:176-185                           | Broadcast spoofing               |
| A-07 | ALTO      | wa_conversations.sql:30-31                            | RLS policy sem restrição de role |
| A-08 | ALTO      | kaiAgent.ts:11-17                                     | Edge Function sem JWT auth       |
| A-09 | ALTO      | ChatInfoModal.tsx:293                                 | Campos sem limitação de tamanho  |
| M-01 | MÉDIO     | 20260309_chat_improvements.sql:15+                    | Conteúdo acidental em migration  |
| M-02 | MÉDIO     | ChatDetailPanel.tsx:292-312                           | Estado local dessincronizado     |
| M-03 | MÉDIO     | ChatDetailPanel.tsx:566-578                           | Otimistic update sem rollback    |
| M-04 | MÉDIO     | ChatDetailPanel.tsx:63-69                             | conversationId sem constraint DB |
| M-05 | MÉDIO     | ChatDetailPanel.tsx:373                               | UI spoofing via nome de grupo    |
| I-01 | INFO      | chat_replica_identity.sql                             | WAL expõe dados em replicação    |
| I-02 | INFO      | ChatInputBar.tsx:80-127                               | AudioContext vazamento de recurso|
| I-03 | INFO      | ChatMessageBubble.tsx:73-95                           | Download sem validação de URL    |
| I-04 | INFO      | ChatDetailPanel.tsx:115 / kaiAgent.ts:28              | console.error em produção        |
| I-05 | INFO      | chat_groups.sql                                       | Sem limite de membros por grupo  |

---

## Prioridade de Correção Recomendada

**Imediato (antes do próximo deploy):**
1. C-01 — corrigir RPC para usar `auth.uid()` internamente
2. C-02 — segregar política UPDATE por operação/coluna
3. C-04 — tornar bucket `chat-media` privado
4. A-08 — adicionar JWT na chamada à Edge Function KAI

**Curto prazo (próximo sprint):**
5. C-03 — redesenhar view-once com signed URLs e RPC atômica
6. C-05 — adicionar owner check na policy UPDATE do storage
7. C-06 — validar domínio da URL antes de renderizar no iframe
8. A-03 — restringir SELECT de reactions a participantes da conversa
9. A-06 — resolver nome do broadcast por `allProfiles` local

**Médio prazo:**
10. C-07 — adicionar `rehype-sanitize` ao ReactMarkdown
11. Demais achados de nível ALTO e MÉDIO

---

_Auditoria realizada em: 2026-05-13_
_Auditor: Revisão estática automatizada (Claude Code)_
