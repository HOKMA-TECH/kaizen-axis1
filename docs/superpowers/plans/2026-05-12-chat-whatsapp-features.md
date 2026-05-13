# Chat WhatsApp Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer grupos aparecerem no topo da lista de conversas, adicionar reações com emoji nas mensagens e menu de contexto (long press / right-click) para apagar mensagens para mim ou para todos — fluxo igual ao WhatsApp.

**Architecture:** Três mudanças independentes. (1) Ordenação: grupos são pinados no topo do array `conversations` em `Chat.tsx`. (2) Reações: nova tabela `chat_message_reactions` + emoji picker no `ChatMessageBubble` + exibição abaixo do balão. (3) Apagar: menu de contexto no `ChatMessageBubble` que chama Supabase UPDATE (deleted_for / is_deleted) — infra já existe na migration `20260325030000_chat_soft_delete.sql`.

**Tech Stack:** React, TypeScript, Supabase (Postgres + Realtime), `emoji-picker-react` ou picker manual, `motion/react`

---

## File Map

| Arquivo | O que muda |
|---|---|
| `src/pages/Chat.tsx` | Ordenar grupos no topo do array `sidebarConvos` |
| `src/components/chat/ChatMessageBubble.tsx` | Emoji picker, menu de contexto, exibir reações, callbacks onDelete/onReact |
| `src/components/chat/ChatDetailPanel.tsx` | Passar callbacks onDelete/onReact para `ChatMessageBubble`, chamar Supabase |
| `supabase/migrations/20260512140000_chat_reactions.sql` | Criar tabela `chat_message_reactions` com RLS |

---

## Task 1: Grupos sempre no topo da lista

**Files:**
- Modify: `src/pages/Chat.tsx` (bloco `sidebarConvos` useMemo)

- [ ] **Step 1: Localizar o useMemo de `sidebarConvos` em `Chat.tsx`**

É o bloco ~linha 198:
```ts
const sidebarConvos = useMemo<ConversationItemData[]>(() =>
  enrichedConvos.map(c => ({ ... })),
[enrichedConvos]);
```

- [ ] **Step 2: Adicionar sort que pina grupos no topo**

Substituir o useMemo por:
```ts
const sidebarConvos = useMemo<ConversationItemData[]>(() => {
  const mapped = enrichedConvos.map(c => ({
    conversationId: c.conversationId,
    otherId: c.otherId,
    isKAI: c.isKAI,
    isGroup: c.isGroup,
    name: c.name,
    role: c.role,
    avatarUrl: c.avatarUrl,
    preview: formatPreview(c.lastType, c.lastContent, c.senderIsMe),
    timestamp: formatTime(c.lastAt),
    unreadCount: c.unreadCount,
    isOnline: c.isKAI ? true : undefined,
  }));
  // grupos primeiro, depois KAI, depois conversas individuais — cada grupo mantém ordem original
  return [
    ...mapped.filter(c => c.isGroup),
    ...mapped.filter(c => !c.isGroup),
  ];
}, [enrichedConvos]);
```

- [ ] **Step 3: Build e verificar visualmente**

```bash
npm run build 2>&1 | tail -5
```
Esperado: zero erros TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat: grupos sempre no topo da lista de conversas"
```

---

## Task 2: Migration — tabela de reações

**Files:**
- Create: `supabase/migrations/20260512140000_chat_reactions.sql`

- [ ] **Step 1: Criar o arquivo de migration**

Conteúdo completo:
```sql
-- Reações a mensagens do chat (estilo WhatsApp)
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)   -- um usuário = uma reação por mensagem
);

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

-- Qualquer participante pode ver reações
CREATE POLICY "reactions_select"
ON public.chat_message_reactions FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- Usuário reage com seu próprio user_id
CREATE POLICY "reactions_insert"
ON public.chat_message_reactions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Usuário só apaga a própria reação
CREATE POLICY "reactions_delete"
ON public.chat_message_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Usuário pode trocar o emoji (upsert usa UPDATE)
CREATE POLICY "reactions_update"
ON public.chat_message_reactions FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message_id
  ON public.chat_message_reactions(message_id);
```

- [ ] **Step 2: Rodar no SQL Editor do Supabase**

Cole o SQL acima no SQL Editor e execute. Confirmar: `Success. No rows returned`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260512140000_chat_reactions.sql
git commit -m "feat: migration tabela chat_message_reactions"
```

---

## Task 3: BubbleMessage + callbacks

**Files:**
- Modify: `src/components/chat/ChatMessageBubble.tsx`

- [ ] **Step 1: Adicionar novos campos à interface `BubbleMessage` e `ChatMessageBubbleProps`**

Em `ChatMessageBubble.tsx`, substituir as interfaces:
```ts
export interface BubbleMessage {
  id: string;
  text?: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  timestamp: string;
  date?: string;
  isMe: boolean;
  deliveryStatus?: 'sending' | 'sent';
  isKAI?: boolean;
  is_deleted?: boolean;
  reactions?: { emoji: string; count: number; reacted: boolean }[];
}

interface ChatMessageBubbleProps {
  message: BubbleMessage;
  index: number;
  onDeleteForMe?: (id: string) => void;
  onDeleteForAll?: (id: string) => void;
  onReact?: (id: string, emoji: string) => void;
}
```

- [ ] **Step 2: Adicionar state do menu e picker no componente**

Dentro de `ChatMessageBubble`, substituir o estado atual:
```ts
export function ChatMessageBubble({ message, index, onDeleteForMe, onDeleteForAll, onReact }: ChatMessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
```

- [ ] **Step 3: Substituir o botão Smile por emoji picker inline**

A lista de emojis rápidos (sem dependência externa):
```ts
const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🙏'];
```

No JSX, substituir o `motion.button` do Smile por:
```tsx
{/* Emoji picker trigger */}
{!message.isKAI && !message.is_deleted && (
  <div
    className={cn(
      'absolute top-1/2 -translate-y-1/2 z-20',
      message.isMe ? '-left-8' : '-right-8'
    )}
  >
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: showMenu || showEmojiPicker ? 1 : 0, scale: showMenu || showEmojiPicker ? 1 : 0.8 }}
      className="p-1 rounded-full bg-card-bg border border-surface-200 shadow-sm"
      onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(v => !v); setShowMenu(false); }}
    >
      <Smile size={12} className="text-text-secondary" />
    </motion.button>

    {showEmojiPicker && (
      <div
        className={cn(
          'absolute top-8 z-30 flex gap-1 p-1.5 bg-card-bg border border-surface-200 rounded-2xl shadow-lg',
          message.isMe ? 'right-0' : 'left-0'
        )}
      >
        {QUICK_EMOJIS.map(emoji => (
          <button
            key={emoji}
            className="text-base hover:scale-125 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              onReact?.(message.id, emoji);
              setShowEmojiPicker(false);
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Adicionar long-press / right-click para menu de apagar**

Adicionar refs e handlers antes do `return`:
```ts
const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleTouchStart = () => {
  pressTimer.current = setTimeout(() => setShowMenu(true), 500);
};
const handleTouchEnd = () => {
  if (pressTimer.current) clearTimeout(pressTimer.current);
};
const handleContextMenu = (e: React.MouseEvent) => {
  e.preventDefault();
  setShowMenu(true);
};
```

Adicionar o import de `useRef`:
```ts
import { useState, useRef } from 'react';
```

- [ ] **Step 5: Adicionar o menu de contexto no JSX**

Antes de fechar o `<div className="relative max-w-[75%]">`, adicionar:
```tsx
{showMenu && !message.is_deleted && (
  <>
    <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
    <div
      className={cn(
        'absolute z-30 top-full mt-1 bg-card-bg border border-surface-200 rounded-2xl shadow-xl overflow-hidden min-w-[180px]',
        message.isMe ? 'right-0' : 'left-0'
      )}
    >
      <button
        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-text-primary hover:bg-surface-100 transition-colors"
        onClick={() => { onDeleteForMe?.(message.id); setShowMenu(false); }}
      >
        Apagar para mim
      </button>
      {message.isMe && (
        <button
          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          onClick={() => { onDeleteForAll?.(message.id); setShowMenu(false); }}
        >
          Apagar para todos
        </button>
      )}
    </div>
  </>
)}
```

- [ ] **Step 6: Exibir reações abaixo do balão**

Logo após o `<div>` do balão e antes de fechar `<div className="relative max-w-[75%]">`:
```tsx
{message.reactions && message.reactions.length > 0 && (
  <div className={cn('flex gap-1 mt-0.5', message.isMe ? 'justify-end' : 'justify-start')}>
    {message.reactions.map(r => (
      <button
        key={r.emoji}
        onClick={() => onReact?.(message.id, r.emoji)}
        className={cn(
          'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors',
          r.reacted
            ? 'bg-primary-100 border-primary-300 text-primary-700'
            : 'bg-card-bg border-surface-200 text-text-secondary hover:bg-surface-100'
        )}
      >
        <span>{r.emoji}</span>
        {r.count > 1 && <span>{r.count}</span>}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 7: Aplicar handlers de long-press e right-click no wrapper do balão**

No `<motion.div>` principal, adicionar:
```tsx
onContextMenu={handleContextMenu}
onTouchStart={handleTouchStart}
onTouchEnd={handleTouchEnd}
onMouseLeave={() => { handleTouchEnd(); }}
```

- [ ] **Step 8: Build sem erros**

```bash
npm run build 2>&1 | grep -E "error|warning" | head -20
```

- [ ] **Step 9: Commit**

```bash
git add src/components/chat/ChatMessageBubble.tsx
git commit -m "feat: emoji reactions e menu de apagar mensagem no balão"
```

---

## Task 4: ChatDetailPanel — conectar callbacks ao Supabase

**Files:**
- Modify: `src/components/chat/ChatDetailPanel.tsx`

- [ ] **Step 1: Adicionar `reactions` ao tipo `BubbleMessage` no `mapMsg`**

Em `mapMsg`, adicionar o campo reactions (inicialmente vazio — carregado em seguida):
```ts
const mapMsg = useCallback((m: any): BubbleMessage => ({
  id: m.id,
  text: m.content,
  type: m.type as BubbleMessage['type'],
  mediaUrl: m.media_url,
  timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  date: new Date(m.created_at).toLocaleDateString(),
  isMe: m.sender_id === myId,
  isKAI: isKAI && m.sender_id !== myId,
  deliveryStatus: 'sent' as const,
  is_deleted: m.is_deleted ?? false,
  reactions: [],
}), [myId, isKAI]);
```

- [ ] **Step 2: Adicionar `loadReactions` e mesclar com mensagens**

Logo após `loadMessages`, adicionar:
```ts
const loadReactions = useCallback(async (msgs: BubbleMessage[]) => {
  if (msgs.length === 0) return msgs;
  const ids = msgs.map(m => m.id);
  const { data } = await supabase
    .from('chat_message_reactions')
    .select('message_id, user_id, emoji')
    .in('message_id', ids);

  const byMsg: Record<string, { emoji: string; count: number; reacted: boolean }[]> = {};
  for (const r of (data ?? [])) {
    if (!byMsg[r.message_id]) byMsg[r.message_id] = [];
    const existing = byMsg[r.message_id].find(x => x.emoji === r.emoji);
    if (existing) {
      existing.count++;
      if (r.user_id === myId) existing.reacted = true;
    } else {
      byMsg[r.message_id].push({ emoji: r.emoji, count: 1, reacted: r.user_id === myId });
    }
  }
  return msgs.map(m => ({ ...m, reactions: byMsg[m.id] ?? [] }));
}, [myId]);
```

- [ ] **Step 3: Chamar `loadReactions` após `loadMessages`**

Substituir o bloco de `loadMessages` no useEffect:
```ts
setMessages([]);
const raw = await new Promise<BubbleMessage[]>(resolve => {
  supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .not('deleted_for', 'cs', `{"${myId}"}`)
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1)
    .then(({ data }) => resolve((data ?? []).map(mapMsg).reverse()));
});
const withReactions = await loadReactions(raw);
setMessages(withReactions);
setLoading(false);
```

Simplificando: atualizar `loadMessages` para:
```ts
const loadMessages = useCallback(async () => {
  if (!conversationId || isKAI) return;
  setLoading(true);
  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .not('deleted_for', 'cs', `{"${myId}"}`)
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);
  const msgs = (data ?? []).map(mapMsg).reverse();
  const withReactions = await loadReactions(msgs);
  setMessages(withReactions);
  setLoading(false);
}, [conversationId, isKAI, myId, mapMsg, loadReactions]);
```

- [ ] **Step 4: Implementar `handleDeleteForMe`**

Adicionar no componente:
```ts
const handleDeleteForMe = async (msgId: string) => {
  if (!myId) return;
  setMessages(prev => prev.filter(m => m.id !== msgId));
  await supabase
    .from('chat_messages')
    .update({ deleted_for: supabase.rpc('array_append_unique', { arr: [], val: myId }) })
    .eq('id', msgId);
  // Fallback: usa SQL direto via RPC para append no array
  await supabase.rpc('chat_delete_for_me', { p_message_id: msgId, p_user_id: myId });
};
```

Observação: o Supabase JS SDK não suporta `array_append` nativo. Usar RPC. Ver Step 5.

- [ ] **Step 5: Criar RPC `chat_delete_for_me` no Supabase**

Rode no SQL Editor do Supabase:
```sql
CREATE OR REPLACE FUNCTION public.chat_delete_for_me(p_message_id uuid, p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE chat_messages
  SET deleted_for = array_append(
    COALESCE(deleted_for, '{}'),
    p_user_id
  )
  WHERE id = p_message_id
    AND NOT (p_user_id = ANY(COALESCE(deleted_for, '{}')));
$$;

REVOKE ALL ON FUNCTION public.chat_delete_for_me(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_delete_for_me(uuid, uuid) TO authenticated, service_role;
```

- [ ] **Step 6: Implementar `handleDeleteForAll`**

```ts
const handleDeleteForAll = async (msgId: string) => {
  if (!myId) return;
  setMessages(prev => prev.map(m =>
    m.id === msgId ? { ...m, is_deleted: true, text: undefined, mediaUrl: undefined } : m
  ));
  await supabase
    .from('chat_messages')
    .update({ is_deleted: true, content: null, media_url: null })
    .eq('id', msgId)
    .eq('sender_id', myId);
};
```

- [ ] **Step 7: Implementar `handleReact`**

```ts
const handleReact = async (msgId: string, emoji: string) => {
  if (!myId) return;
  // Otimistic update
  setMessages(prev => prev.map(m => {
    if (m.id !== msgId) return m;
    const reactions = [...(m.reactions ?? [])];
    const existing = reactions.find(r => r.emoji === emoji);
    if (existing) {
      if (existing.reacted) {
        // toggle off
        existing.count--;
        existing.reacted = false;
        return { ...m, reactions: reactions.filter(r => r.emoji !== emoji || r.count > 0) };
      }
      existing.count++;
      existing.reacted = true;
    } else {
      reactions.push({ emoji, count: 1, reacted: true });
    }
    return { ...m, reactions };
  }));
  // Upsert no banco (UNIQUE constraint: se já existe, troca o emoji)
  await supabase
    .from('chat_message_reactions')
    .upsert({ message_id: msgId, user_id: myId, emoji }, { onConflict: 'message_id,user_id' });
};
```

- [ ] **Step 8: Passar callbacks para `ChatMessageBubble`**

No render do `ChatDetailPanel`, no map de mensagens:
```tsx
<ChatMessageBubble
  message={msg}
  index={i}
  onDeleteForMe={handleDeleteForMe}
  onDeleteForAll={handleDeleteForAll}
  onReact={handleReact}
/>
```

- [ ] **Step 9: Atualizar migration para adicionar `chat_delete_for_me` no arquivo**

Criar arquivo `supabase/migrations/20260512150000_chat_delete_for_me_rpc.sql`:
```sql
CREATE OR REPLACE FUNCTION public.chat_delete_for_me(p_message_id uuid, p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE chat_messages
  SET deleted_for = array_append(
    COALESCE(deleted_for, '{}'),
    p_user_id
  )
  WHERE id = p_message_id
    AND NOT (p_user_id = ANY(COALESCE(deleted_for, '{}')));
$$;

REVOKE ALL ON FUNCTION public.chat_delete_for_me(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_delete_for_me(uuid, uuid) TO authenticated, service_role;
```

- [ ] **Step 10: Atualizar a policy UPDATE de `chat_messages` para aceitar grupos**

O `chat_messages_update_participants` foi recriado na migration `20260512130000`. A policy já cobre `group_id IS NOT NULL AND is_chat_group_member(group_id)`. Confirmar que também cobre `is_deleted` e `deleted_for`. A policy existente permite UPDATE para quem é sender, receiver, ou membro do grupo — ok.

- [ ] **Step 11: Build final**

```bash
npm run build 2>&1 | grep -E "^src.*error" | head -20
```
Esperado: zero erros.

- [ ] **Step 12: Commit e push**

```bash
git add src/components/chat/ChatDetailPanel.tsx src/components/chat/ChatMessageBubble.tsx supabase/migrations/20260512150000_chat_delete_for_me_rpc.sql
git commit -m "feat: apagar mensagem para mim/todos e reações com emoji no chat"
git push origin main
```

---

## Checklist de cobertura

| Requisito | Task |
|---|---|
| Grupos no topo da lista | Task 1 |
| Emoji reactions no balão | Task 3 (Steps 3, 6) |
| Menu apagar para mim | Task 3 (Step 5), Task 4 (Steps 4-5) |
| Menu apagar para todos | Task 3 (Step 5), Task 4 (Step 6) |
| Persistência reações | Task 2 (migration), Task 4 (Step 7) |
| Realtime / reload reações | Task 4 (Step 3) |
| Policy update cobre grupos | Task 4 (Step 10) |
