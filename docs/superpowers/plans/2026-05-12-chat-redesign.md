# Chat Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar o Chat com split-view desktop (lista + detalhe no mesmo painel), KAI card em destaque, bolhas modernas, animações Framer Motion e micro-interações de hover, mantendo consistência visual com o Kaizen Axis.

**Architecture:** Extrair helpers compartilhados para `src/lib/chat-utils.ts`; criar componentes atômicos em `src/components/chat/`; criar `ChatDetailPanel.tsx` como painel direito reutilizável; refatorar `Chat.tsx` para split-view desktop com `selectedId` local; mobile preserva navegação existente via `/chat/:id`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, `motion/react` (Framer Motion), Lucide React, Supabase Realtime, React Router v7.

---

## File Map

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Criar | `src/lib/chat-utils.ts` | Helpers: getColor, getInitials, formatTime, formatPreview |
| Criar | `src/components/chat/ChatKaiCard.tsx` | Card KAI com gradiente + animação pulse |
| Criar | `src/components/chat/ChatConversationItem.tsx` | Item da lista de conversas com hover/seleção |
| Criar | `src/components/chat/ChatSidebar.tsx` | Painel esquerdo: header + KAI card + search + lista |
| Criar | `src/components/chat/ChatDetailHeader.tsx` | Header do painel direito: avatar + status + ações |
| Criar | `src/components/chat/ChatMessageBubble.tsx` | Bolha de mensagem enviada/recebida |
| Criar | `src/components/chat/ChatWelcome.tsx` | Estado vazio do painel direito |
| Criar | `src/components/chat/ChatInputBar.tsx` | Barra de input com textarea + anexos + enviar |
| Criar | `src/components/chat/ChatDetailPanel.tsx` | Painel direito completo: fetch msgs + render |
| Modificar | `src/pages/Chat.tsx` | Split-view desktop + mobile list |
| Modificar | `src/pages/ChatDetail.tsx` | Usar novos componentes visuais (header, bubbles, input) |

---

## Task 1: Shared Chat Utilities

**Files:**
- Create: `src/lib/chat-utils.ts`

- [ ] **Step 1: Criar o arquivo de utilitários**

```typescript
// src/lib/chat-utils.ts

export const CHAT_COLORS = [
  'from-blue-400 to-blue-500',
  'from-violet-400 to-violet-500',
  'from-emerald-400 to-emerald-500',
  'from-rose-400 to-rose-500',
  'from-cyan-400 to-cyan-500',
  'from-pink-400 to-pink-500',
  'from-indigo-400 to-indigo-500',
  'from-teal-400 to-teal-500',
];

export function getColor(id: string): string {
  return CHAT_COLORS[
    id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % CHAT_COLORS.length
  ];
}

export function getInitials(name: string): string {
  return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isYesterday) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function formatPreview(type: string, content: string, isMe: boolean): string {
  const prefix = isMe ? 'Você: ' : '';
  if (type === 'image') return `${prefix}📷 Imagem`;
  if (type === 'video') return `${prefix}🎥 Vídeo`;
  if (type === 'audio') return `${prefix}🎤 Áudio`;
  if (type === 'document') return `${prefix}📄 Documento`;
  return `${prefix}${content || ''}`;
}
```

- [ ] **Step 2: Verificar que não há erros de TypeScript**

```bash
cd kaizen-axis1 && node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

Esperado: sem erros relacionados a `chat-utils.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/chat-utils.ts
git commit -m "feat(chat): extrair helpers compartilhados para chat-utils.ts"
```

---

## Task 2: ChatKaiCard

**Files:**
- Create: `src/components/chat/ChatKaiCard.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/chat/ChatKaiCard.tsx
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

interface ChatKaiCardProps {
  onClick: () => void;
  isSelected?: boolean;
}

export function ChatKaiCard({ onClick, isSelected }: ChatKaiCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      whileHover={{ scale: 1.02, boxShadow: '0 8px 24px rgba(31,111,229,0.3)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full text-left rounded-2xl p-3.5 mb-2 transition-shadow ${
        isSelected
          ? 'bg-gradient-to-r from-primary-700 to-indigo-700 shadow-lg shadow-primary-300/40'
          : 'bg-gradient-to-r from-primary-600 to-indigo-600 shadow-md shadow-primary-200/50 dark:shadow-primary-900/30'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <Sparkles size={17} className="text-white animate-pulse" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-bold text-sm">KAI</p>
          <p className="text-white/70 text-xs">Assistente Inteligente</p>
        </div>
      </div>
      <p className="mt-2.5 text-white/75 text-xs leading-relaxed line-clamp-2">
        Olá! Como posso ajudar hoje?
      </p>
    </motion.button>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | grep -i "ChatKaiCard"
```

Esperado: sem output (sem erros).

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatKaiCard.tsx
git commit -m "feat(chat): criar ChatKaiCard com gradiente e animação pulse"
```

---

## Task 3: ChatConversationItem

**Files:**
- Create: `src/components/chat/ChatConversationItem.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/chat/ChatConversationItem.tsx
import { motion } from 'motion/react';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getColor, getInitials } from '@/lib/chat-utils';

export interface ConversationItemData {
  conversationId: string;
  otherId: string;
  isKAI: boolean;
  name: string;
  role: string;
  avatarUrl?: string | null;
  preview: string;
  timestamp: string;
  unreadCount: number;
  isOnline?: boolean;
}

interface ChatConversationItemProps {
  convo: ConversationItemData;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: () => void;
}

export function ChatConversationItem({
  convo, isSelected, onClick, onContextMenu, onTouchStart, onTouchEnd,
}: ChatConversationItemProps) {
  return (
    <motion.button
      layout
      onClick={onClick}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      whileHover={{ x: 2 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors duration-150 text-left relative overflow-hidden',
        isSelected
          ? 'bg-primary-50 dark:bg-primary-900/20'
          : 'hover:bg-surface-100 dark:hover:bg-surface-200/10'
      )}
    >
      {isSelected && (
        <motion.div
          layoutId="chat-selected-bar"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-primary-500 rounded-r-full"
        />
      )}

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {convo.isKAI ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-indigo-500 flex items-center justify-center">
            <Bot size={18} className="text-white" />
          </div>
        ) : convo.avatarUrl ? (
          <img
            src={convo.avatarUrl}
            alt={convo.name}
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className={cn(
            'w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-semibold text-[11px]',
            getColor(convo.otherId)
          )}>
            {getInitials(convo.name)}
          </div>
        )}
        {convo.isOnline && !convo.isKAI && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-card-bg" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className={cn(
            'text-sm truncate',
            convo.unreadCount > 0 ? 'font-bold text-text-primary' : 'font-semibold text-text-primary'
          )}>
            {convo.name}
          </p>
          <span className="text-[10px] text-text-secondary flex-shrink-0 ml-2">
            {convo.timestamp}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1">
          <p className={cn(
            'text-xs truncate',
            convo.unreadCount > 0 ? 'text-text-primary font-medium' : 'text-text-secondary'
          )}>
            {convo.preview}
          </p>
          {convo.unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="flex-shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {convo.unreadCount > 99 ? '99+' : convo.unreadCount}
            </motion.span>
          )}
        </div>
      </div>
    </motion.button>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | grep -i "ChatConversationItem"
```

Esperado: sem output.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatConversationItem.tsx
git commit -m "feat(chat): criar ChatConversationItem com hover, seleção e badge animado"
```

---

## Task 4: ChatSidebar

**Files:**
- Create: `src/components/chat/ChatSidebar.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/chat/ChatSidebar.tsx
import { useState } from 'react';
import { Search, PenSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { ChatKaiCard } from './ChatKaiCard';
import { ChatConversationItem, ConversationItemData } from './ChatConversationItem';

interface ChatSidebarProps {
  conversations: ConversationItemData[];
  selectedId: string | null;
  totalUnread: number;
  onSelect: (id: string) => void;
  onKaiClick: () => void;
  onNewConversation?: () => void;
  onContextMenu?: (e: React.MouseEvent, convo: ConversationItemData) => void;
  onTouchStart?: (e: React.TouchEvent, convo: ConversationItemData) => void;
  onTouchEnd?: () => void;
  loading?: boolean;
}

export function ChatSidebar({
  conversations, selectedId, totalUnread, onSelect, onKaiClick,
  onNewConversation, onContextMenu, onTouchStart, onTouchEnd, loading,
}: ChatSidebarProps) {
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);

  const filtered = search.trim()
    ? conversations.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  return (
    <div className="flex flex-col h-full bg-card-bg border-r border-surface-200 dark:border-surface-100/10">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-text-primary">Mensagens</h2>
          {totalUnread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="min-w-5 h-5 px-1.5 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </motion.span>
          )}
        </div>
        {onNewConversation && (
          <button
            onClick={onNewConversation}
            className="p-2 rounded-xl text-text-secondary hover:text-gold-600 hover:bg-gold-50 dark:hover:bg-gold-900/20 transition-colors"
            title="Nova conversa"
          >
            <PenSquare size={17} />
          </button>
        )}
      </div>

      {/* KAI Card */}
      <div className="px-3 flex-shrink-0">
        <ChatKaiCard
          onClick={onKaiClick}
          isSelected={selectedId === 'kai-agent'}
        />
      </div>

      {/* Search */}
      <div className="px-3 pb-2 flex-shrink-0">
        <motion.div
          animate={{ boxShadow: focused ? '0 0 0 2px rgba(212,175,55,0.35)' : '0 0 0 0px transparent' }}
          transition={{ duration: 0.12 }}
          className="relative rounded-xl overflow-hidden"
        >
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
          <input
            type="text"
            placeholder="Pesquisar conversas..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="w-full pl-8 pr-3 py-2 bg-surface-100 dark:bg-surface-200/10 rounded-xl text-sm text-text-primary focus:outline-none placeholder:text-text-secondary"
          />
        </motion.div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-1">
        <AnimatePresence mode="popLayout">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 rounded-full border-2 border-surface-200 border-t-primary-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-sm text-text-secondary py-10"
            >
              {search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
            </motion.p>
          ) : (
            filtered.map((convo, i) => (
              <motion.div
                key={convo.conversationId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.2 }}
              >
                <ChatConversationItem
                  convo={convo}
                  isSelected={selectedId === convo.otherId}
                  onClick={() => onSelect(convo.otherId)}
                  onContextMenu={onContextMenu ? e => onContextMenu(e, convo) : undefined}
                  onTouchStart={onTouchStart ? e => onTouchStart(e, convo) : undefined}
                  onTouchEnd={onTouchEnd}
                />
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | grep -i "ChatSidebar"
```

Esperado: sem output.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatSidebar.tsx
git commit -m "feat(chat): criar ChatSidebar com search, KAI card e stagger na lista"
```

---

## Task 5: ChatDetailHeader

**Files:**
- Create: `src/components/chat/ChatDetailHeader.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/chat/ChatDetailHeader.tsx
import { Phone, Video, MoreVertical, Bot, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getColor, getInitials } from '@/lib/chat-utils';

interface ChatDetailHeaderProps {
  name: string;
  role?: string;
  avatarUrl?: string | null;
  otherId: string;
  isKAI?: boolean;
  isOnline?: boolean;
  onBack?: () => void;
  onMore?: () => void;
}

export function ChatDetailHeader({
  name, role, avatarUrl, otherId, isKAI, isOnline, onBack, onMore,
}: ChatDetailHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-100/10 bg-card-bg flex-shrink-0">
      {onBack && (
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-100 transition-colors lg:hidden"
        >
          <ArrowLeft size={18} />
        </button>
      )}

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {isKAI ? (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-indigo-500 flex items-center justify-center">
            <Bot size={16} className="text-white" />
          </div>
        ) : avatarUrl ? (
          <img src={avatarUrl} alt={name} referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className={cn(
            'w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-semibold text-[11px]',
            getColor(otherId)
          )}>
            {getInitials(name)}
          </div>
        )}
        {isOnline && !isKAI && (
          <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-card-bg" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary truncate">{name}</p>
        <p className="text-[11px] text-text-secondary truncate">
          {isKAI ? 'Assistente Inteligente' : isOnline ? (
            <span className="text-emerald-500 font-medium">● Online</span>
          ) : role || 'Offline'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {!isKAI && (
          <>
            <button className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-100 dark:hover:bg-surface-200/10 transition-colors" title="Ligar">
              <Phone size={16} />
            </button>
            <button className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-100 dark:hover:bg-surface-200/10 transition-colors" title="Vídeo">
              <Video size={16} />
            </button>
          </>
        )}
        {onMore && (
          <button
            onClick={onMore}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-100 dark:hover:bg-surface-200/10 transition-colors"
            title="Mais opções"
          >
            <MoreVertical size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | grep -i "ChatDetailHeader"
```

Esperado: sem output.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatDetailHeader.tsx
git commit -m "feat(chat): criar ChatDetailHeader com avatar, status e botões de ação"
```

---

## Task 6: ChatMessageBubble

**Files:**
- Create: `src/components/chat/ChatMessageBubble.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/chat/ChatMessageBubble.tsx
import { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCheck, Check, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

export interface BubbleMessage {
  id: string;
  text?: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  timestamp: string;
  isMe: boolean;
  deliveryStatus?: 'sending' | 'sent';
  isKAI?: boolean;
  is_deleted?: boolean;
}

interface ChatMessageBubbleProps {
  message: BubbleMessage;
  index: number;
}

export function ChatMessageBubble({ message, index }: ChatMessageBubbleProps) {
  const [showReaction, setShowReaction] = useState(false);

  if (message.is_deleted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.02, 0.3), duration: 0.2 }}
        className={cn('flex mb-1', message.isMe ? 'justify-end' : 'justify-start')}
      >
        <div className="px-3 py-1.5 rounded-2xl bg-surface-100 dark:bg-surface-200/10">
          <p className="text-xs text-text-secondary italic">Mensagem apagada</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, x: message.isMe ? 6 : -6 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.3), duration: 0.22, ease: 'easeOut' }}
      className={cn('flex mb-1 group', message.isMe ? 'justify-end' : 'justify-start')}
      onMouseEnter={() => setShowReaction(true)}
      onMouseLeave={() => setShowReaction(false)}
    >
      <div className="relative max-w-[75%]">
        {/* Reaction button on hover */}
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: showReaction ? 1 : 0, scale: showReaction ? 1 : 0.8 }}
          transition={{ duration: 0.15 }}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 p-1 rounded-full bg-card-bg border border-surface-200 shadow-sm z-10',
            message.isMe ? '-left-7' : '-right-7'
          )}
        >
          <Smile size={12} className="text-text-secondary" />
        </motion.button>

        {/* Bubble */}
        <div className={cn(
          'px-3.5 py-2 shadow-sm',
          message.isMe
            ? 'bg-primary-600 text-white rounded-2xl rounded-tr-sm'
            : message.isKAI
              ? 'bg-gradient-to-br from-surface-100 to-surface-50 dark:from-surface-200/20 dark:to-surface-100/10 text-text-primary rounded-2xl rounded-tl-sm border border-surface-200'
              : 'bg-card-bg text-text-primary rounded-2xl rounded-tl-sm border border-surface-200 dark:border-surface-100/10'
        )}>
          {message.type === 'text' && message.isKAI ? (
            <div className={cn(
              'text-sm leading-relaxed prose prose-sm max-w-none',
              'prose-p:my-0.5 prose-ul:my-1 prose-li:my-0',
              'prose-headings:text-text-primary prose-p:text-text-primary prose-li:text-text-primary'
            )}>
              <ReactMarkdown>{message.text || ''}</ReactMarkdown>
            </div>
          ) : message.type === 'image' && message.mediaUrl ? (
            <img
              src={message.mediaUrl}
              alt="imagem"
              className="rounded-xl max-w-full max-h-48 object-cover"
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message.text || ''}
            </p>
          )}

          {/* Footer: timestamp + status */}
          <div className={cn(
            'flex items-center gap-1 mt-1 justify-end',
            message.isMe ? 'text-white/60' : 'text-text-secondary'
          )}>
            <span className="text-[10px]">{message.timestamp}</span>
            {message.isMe && (
              message.deliveryStatus === 'sending'
                ? <Check size={11} className="opacity-60" />
                : <CheckCheck size={11} className="opacity-80" />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | grep -i "ChatMessageBubble"
```

Esperado: sem output.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatMessageBubble.tsx
git commit -m "feat(chat): criar ChatMessageBubble com animação, hover reaction e status"
```

---

## Task 7: ChatWelcome e ChatInputBar

**Files:**
- Create: `src/components/chat/ChatWelcome.tsx`
- Create: `src/components/chat/ChatInputBar.tsx`

- [ ] **Step 1: Criar ChatWelcome**

```tsx
// src/components/chat/ChatWelcome.tsx
import { MessageSquare } from 'lucide-react';

export function ChatWelcome() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-surface-50 dark:bg-surface-900/20 select-none">
      <div
        className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center"
        style={{ animation: 'float 3s ease-in-out infinite' }}
      >
        <MessageSquare size={28} className="text-primary-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-text-primary">Suas mensagens</p>
        <p className="text-xs text-text-secondary mt-1">
          Selecione uma conversa para começar
        </p>
      </div>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Criar ChatInputBar**

```tsx
// src/components/chat/ChatInputBar.tsx
import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Paperclip, Image, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputBarProps {
  onSend: (text: string) => void;
  onAttach?: () => void;
  onImage?: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
}

export function ChatInputBar({
  onSend, onAttach, onImage, disabled, sending, placeholder = 'Digite sua mensagem...',
}: ChatInputBarProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = text.trim().length > 0 && !disabled && !sending;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize up to 4 lines
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  };

  return (
    <div className="px-3 py-3 border-t border-surface-200 dark:border-surface-100/10 bg-card-bg flex-shrink-0">
      <motion.div
        className={cn(
          'flex items-end gap-2 rounded-2xl border bg-surface-50 dark:bg-surface-200/5 px-3 py-2 transition-colors duration-150',
          text.length > 0
            ? 'border-primary-400 dark:border-primary-600'
            : 'border-surface-200 dark:border-surface-100/10'
        )}
      >
        {/* Left actions */}
        <div className="flex items-center gap-1 pb-0.5 flex-shrink-0">
          {onAttach && (
            <button
              onClick={onAttach}
              className="p-1.5 rounded-lg text-text-secondary hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              title="Anexar"
            >
              <Paperclip size={16} />
            </button>
          )}
          {onImage && (
            <button
              onClick={onImage}
              className="p-1.5 rounded-lg text-text-secondary hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              title="Imagem"
            >
              <Image size={16} />
            </button>
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-secondary resize-none focus:outline-none leading-5 py-0.5 transition-all duration-150 disabled:opacity-50"
          style={{ minHeight: '20px', maxHeight: '96px' }}
        />

        {/* Send button */}
        <motion.button
          whileTap={canSend ? { scale: 0.88 } : {}}
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            'p-2 rounded-xl transition-all duration-150 flex-shrink-0',
            canSend
              ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm shadow-primary-200'
              : 'bg-surface-200 dark:bg-surface-200/20 text-text-secondary/40 cursor-not-allowed'
          )}
        >
          {sending
            ? <Loader2 size={16} className="animate-spin" />
            : <Send size={16} />
          }
        </motion.button>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | grep -iE "ChatWelcome|ChatInputBar"
```

Esperado: sem output.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/ChatWelcome.tsx src/components/chat/ChatInputBar.tsx
git commit -m "feat(chat): criar ChatWelcome e ChatInputBar com auto-resize e botão animado"
```

---

## Task 8: ChatDetailPanel

**Files:**
- Create: `src/components/chat/ChatDetailPanel.tsx`

Este componente é o painel direito do split-view. Reutiliza a lógica de fetch de mensagens do `ChatDetail.tsx` mas recebe `otherId` como prop (não via URL params). Renderiza `ChatDetailHeader` + lista de mensagens com `ChatMessageBubble` + `ChatInputBar`.

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/chat/ChatDetailPanel.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { useChatUnread } from '@/context/ChatUnreadContext';
import { sendMessageToKai } from '@/services/kaiAgent';
import { ChatDetailHeader } from './ChatDetailHeader';
import { ChatMessageBubble, BubbleMessage } from './ChatMessageBubble';
import { ChatInputBar } from './ChatInputBar';
import { ChatWelcome } from './ChatWelcome';

interface ChatDetailPanelProps {
  otherId: string | null;
  otherName: string;
  otherRole?: string;
  otherAvatar?: string | null;
  isKAI?: boolean;
  isOnline?: boolean;
  onClose?: () => void;
}

const PAGE_SIZE = 50;

export function ChatDetailPanel({
  otherId, otherName, otherRole, otherAvatar, isKAI, isOnline, onClose,
}: ChatDetailPanelProps) {
  const { user } = useApp();
  const { markConversationRead } = useChatUnread();
  const myId = user?.id;

  const [messages, setMessages] = useState<BubbleMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversationId = isKAI
    ? `kai-${myId}`
    : otherId && myId
      ? [myId, otherId].sort().join('-')
      : null;

  const mapMsg = useCallback((m: any): BubbleMessage => ({
    id: m.id,
    senderId: m.sender_id,
    text: m.content,
    type: m.type as BubbleMessage['type'],
    mediaUrl: m.media_url,
    timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isMe: m.sender_id === myId,
    isKAI: isKAI && m.sender_id !== myId,
    deliveryStatus: 'sent' as const,
    is_deleted: m.is_deleted ?? false,
  }), [myId, isKAI]);

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
    setMessages((data ?? []).map(mapMsg).reverse());
    setLoading(false);
  }, [conversationId, isKAI, myId, mapMsg]);

  // Mark conversation read when panel opens
  useEffect(() => {
    if (conversationId) markConversationRead(conversationId);
  }, [conversationId, markConversationRead]);

  // Load messages + realtime subscription
  useEffect(() => {
    if (!conversationId || !myId || isKAI) {
      setMessages([]);
      return;
    }
    loadMessages();
    const channel = supabase
      .channel(`panel:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (p) => {
        const m = p.new as any;
        if (m.sender_id === myId || m.receiver_id === myId) {
          setMessages(prev => [...prev, mapMsg(m)]);
          markConversationRead(conversationId);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, myId, isKAI, loadMessages, mapMsg, markConversationRead]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Reset messages when conversation changes
  useEffect(() => {
    setMessages([]);
    if (!isKAI) loadMessages();
  }, [otherId]);

  const handleSend = async (text: string) => {
    if (!myId || !otherId) return;
    setSending(true);

    if (isKAI) {
      const tempId = `temp-${Date.now()}`;
      const userMsg: BubbleMessage = {
        id: tempId, text, type: 'text', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isMe: true, deliveryStatus: 'sent',
      };
      setMessages(prev => [...prev, userMsg]);
      try {
        const reply = await sendMessageToKai(text, myId);
        const kaiMsg: BubbleMessage = {
          id: `kai-${Date.now()}`, text: reply, type: 'text',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isMe: false, isKAI: true, deliveryStatus: 'sent',
        };
        setMessages(prev => [...prev, kaiMsg]);
      } catch {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } else {
      const tempId = `temp-${Date.now()}`;
      const optimistic: BubbleMessage = {
        id: tempId, text, type: 'text',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isMe: true, deliveryStatus: 'sending',
      };
      setMessages(prev => [...prev, optimistic]);
      const { error } = await supabase.from('chat_messages').insert({
        sender_id: myId,
        receiver_id: otherId,
        conversation_id: conversationId,
        content: text,
        type: 'text',
      });
      if (error) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, deliveryStatus: 'sent' as const } : m));
      }
    }
    setSending(false);
  };

  if (!otherId) return <ChatWelcome />;

  return (
    <motion.div
      key={otherId}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex flex-col h-full bg-surface-50 dark:bg-surface-900/20"
    >
      <ChatDetailHeader
        name={otherName}
        role={otherRole}
        avatarUrl={otherAvatar}
        otherId={otherId}
        isKAI={isKAI}
        isOnline={isOnline}
        onBack={onClose}
        onMore={undefined}
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="animate-spin text-text-secondary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-secondary">Nenhuma mensagem ainda. Diga olá!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <ChatMessageBubble key={msg.id} message={msg} index={i} />
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInputBar
        onSend={handleSend}
        sending={sending}
        disabled={!myId}
      />
    </motion.div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | grep -i "ChatDetailPanel"
```

Esperado: sem output.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatDetailPanel.tsx
git commit -m "feat(chat): criar ChatDetailPanel com fetch realtime e animação de entrada"
```

---

## Task 9: Refatorar Chat.tsx — Split-view Desktop

**Files:**
- Modify: `src/pages/Chat.tsx`

Manter toda a lógica de fetch de conversas existente. Adicionar `selectedId` e `selectedConvo`. No desktop: renderizar `ChatSidebar` + `ChatDetailPanel` lado a lado. No mobile: `ChatSidebar` navega para `/chat/:id` como hoje.

- [ ] **Step 1: Ler o arquivo atual para garantir contexto**

```bash
wc -l kaizen-axis1/src/pages/Chat.tsx
```

- [ ] **Step 2: Substituir o bloco de return do componente Chat**

Localizar o `return (` de `export default function Chat()` (por volta da linha 269) e substituir tudo a partir daí até o fechamento do componente pelo seguinte:

```tsx
// Adicionar imports no topo (após os existentes):
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatDetailPanel } from '@/components/chat/ChatDetailPanel';
import { ConversationItemData } from '@/components/chat/ChatConversationItem';
import { formatTime, formatPreview } from '@/lib/chat-utils';

// Adicionar dentro do componente Chat(), antes do return:
const [selectedId, setSelectedId] = useState<string | null>(null);

const selectedConvo = enrichedConvos.find(c => c.otherId === selectedId) ?? null;

const sidebarConvos: ConversationItemData[] = enriched.map(c => ({
  conversationId: c.conversationId,
  otherId: c.otherId,
  isKAI: c.isKAI,
  name: c.name,
  role: c.role,
  avatarUrl: c.avatarUrl,
  preview: formatPreview(c.lastType, c.lastContent, c.senderIsMe),
  timestamp: formatTime(c.lastAt),
  unreadCount: c.unreadCount,
  isOnline: false,
}));

const handleSelect = (otherId: string) => {
  const convo = enrichedConvos.find(c => c.otherId === otherId);
  if (convo) markConversationRead(convo.conversationId);
  // Desktop: update selectedId; Mobile: navigate
  if (window.innerWidth >= 1024) {
    setSelectedId(otherId);
  } else {
    navigate(otherId === 'kai-agent' ? '/chat/kai-agent' : `/chat/${otherId}`);
  }
};

const handleKaiClick = () => handleSelect('kai-agent');

// Substituir o bloco return completo por:
return (
  <>
    {/* Desktop: split-view */}
    <div className="hidden lg:flex h-screen overflow-hidden">
      <div className="w-80 flex-shrink-0">
        <ChatSidebar
          conversations={sidebarConvos}
          selectedId={selectedId}
          totalUnread={totalUnread}
          onSelect={handleSelect}
          onKaiClick={handleKaiClick}
          onContextMenu={(e, convo) => {
            e.preventDefault();
            const enriched = enrichedConvos.find(c => c.otherId === convo.otherId);
            if (enriched) setCtxConvo({ convo: enriched, x: e.clientX, y: e.clientY });
          }}
          loading={loading}
        />
      </div>
      <div className="flex-1 min-w-0">
        <ChatDetailPanel
          key={selectedId}
          otherId={selectedId}
          otherName={selectedConvo?.name ?? ''}
          otherRole={selectedConvo?.role}
          otherAvatar={selectedConvo?.avatarUrl}
          isKAI={selectedConvo?.isKAI}
          isOnline={false}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </div>

    {/* Mobile: lista de conversas (navega para /chat/:id) */}
    <div className="lg:hidden flex flex-col h-screen bg-surface-50 pb-20">
      <ChatSidebar
        conversations={sidebarConvos}
        selectedId={null}
        totalUnread={totalUnread}
        onSelect={handleSelect}
        onKaiClick={handleKaiClick}
        onTouchStart={(e, convo) => {
          const enrichedC = enrichedConvos.find(c => c.otherId === convo.otherId);
          if (enrichedC) {
            const touch = e.touches[0];
            pressTimer.current = setTimeout(() => {
              setCtxConvo({ convo: enrichedC, x: touch.clientX, y: touch.clientY });
            }, 500);
          }
        }}
        onTouchEnd={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}
        loading={loading}
      />
    </div>

    {/* Context menu (delete conversation) — mantido do original */}
    <AnimatePresence>
      {ctxConvo && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxConvo(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            style={{ top: ctxConvo.y, left: ctxConvo.x }}
            className="fixed z-50 bg-card-bg rounded-xl shadow-xl border border-surface-200 overflow-hidden min-w-44"
          >
            <button
              onClick={() => handleDeleteConversation(ctxConvo.convo.conversationId)}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <Trash2 size={15} />
              Apagar conversa
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  </>
);
```

- [ ] **Step 3: Verificar TypeScript**

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Esperado: sem erros de tipo. Se houver erros de imports não encontrados, garantir que todos os novos arquivos das tasks anteriores foram criados.

- [ ] **Step 4: Rodar o dev server e verificar visualmente**

```bash
cd kaizen-axis1 && npm run dev
```

Verificar:
- Desktop (>= 1024px): painel esquerdo + painel direito exibem corretamente
- KAI card aparece no topo da lista com gradiente e animação pulse
- Clicar em conversa abre o detalhe no painel direito sem navegar
- Mobile: clicar numa conversa navega para `/chat/:id` como antes
- Usuário não-admin continua sem acesso (rota protegida)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat(chat): refatorar para split-view desktop com ChatSidebar e ChatDetailPanel"
```

---

## Task 10: Atualizar ChatDetail.tsx (mobile) com novos componentes visuais

**Files:**
- Modify: `src/pages/ChatDetail.tsx`

Substituir o header mobile e o input bar pelo `ChatDetailHeader` e `ChatInputBar` novos para garantir consistência visual. A lógica de mensagens permanece intocada — apenas a camada de renderização do header e do input muda.

- [ ] **Step 1: Adicionar imports dos novos componentes**

No topo de `src/pages/ChatDetail.tsx`, adicionar após os imports existentes:

```tsx
import { ChatDetailHeader } from '@/components/chat/ChatDetailHeader';
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';
import { ChatInputBar } from '@/components/chat/ChatInputBar';
```

- [ ] **Step 2: Substituir o header do render**

Localizar o bloco que renderiza o header (contém `ChevronLeft`, nome do contato, `Phone`, `Video`, `MoreVertical`) e substituir por:

```tsx
<ChatDetailHeader
  name={chatUser?.name ?? ''}
  role={chatUser?.role}
  avatarUrl={chatUser?.avatar}
  otherId={id ?? ''}
  isKAI={isKAI}
  isOnline={false}
  onBack={() => navigate(-1)}
  onMore={() => setShowMenu(true)}
/>
```

> **Nota:** Preservar o `showMenu` / dropdown existente de opções — apenas o header visual muda.

- [ ] **Step 3: Verificar que o mobile continua funcionando**

```bash
npm run dev
```

Acessar `/chat` no mobile (< 1024px), abrir uma conversa. Verificar:
- Header novo renderiza com avatar, nome e botão de voltar
- Funcionalidades existentes (anexos, áudio, view-once) continuam operando
- Sem regressão no envio de mensagens

- [ ] **Step 4: Verificar TypeScript**

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Esperado: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ChatDetail.tsx
git commit -m "feat(chat): atualizar ChatDetail mobile com ChatDetailHeader moderno"
```

---

## Task 11: Liberar acesso ao Chat para todos os roles

> **Executar apenas quando o redesign estiver completo e aprovado.**

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/DesktopLayout.tsx`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Reverter proteção de rota em App.tsx**

```tsx
// Substituir:
<Route path="/chat" element={<RoleRoute allowed={['ADMIN']}><Chat /></RoleRoute>} />
<Route path="/chat/:id" element={<RoleRoute allowed={['ADMIN']}><ChatDetail /></RoleRoute>} />

// Por:
<Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
<Route path="/chat/:id" element={<ProtectedRoute><ChatDetail /></ProtectedRoute>} />
```

- [ ] **Step 2: Remover lock da sidebar em DesktopLayout.tsx**

```tsx
// Remover o bloco:
const coreItems = NAV_CORE.map(item =>
  item.path === '/chat' && !isAdmin ? { ...item, locked: true } : item
);

// E restaurar NAV_CORE direto no allGroups:
{ label: 'Principal', items: NAV_CORE },
```

- [ ] **Step 3: Remover lock do BottomNav em Layout.tsx**

Remover a constante `isChatLocked` e o bloco `if (isChatLocked) { return (...) }`, voltando ao `NavLink` normal para o Chat. Remover import de `Lock` se não usado em outro lugar.

- [ ] **Step 4: Verificar TypeScript e testar**

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | head -20
npm run dev
```

Verificar: não-admins conseguem acessar o chat normalmente.

- [ ] **Step 5: Commit e push**

```bash
git add src/App.tsx src/components/layout/DesktopLayout.tsx src/components/Layout.tsx
git commit -m "feat(chat): liberar acesso ao Chat para todos os roles após redesign"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Split-view desktop — Task 9
- ✅ Mobile preserva navegação lista→detalhe — Task 9
- ✅ KAI card fixo no topo com gradiente e pulse — Task 2 + Task 4
- ✅ Animações: stagger lista, troca de conversa, mensagens, badges — Tasks 3/4/6/8
- ✅ Hover: translate no item, reaction button na bolha, scale no enviar — Tasks 3/6/7
- ✅ Search com ring gold animado — Task 4
- ✅ Indicador selecionado com layoutId — Task 3
- ✅ Header com status online, botões Phone/Video — Task 5
- ✅ Bolhas enviada/recebida com timestamp e status — Task 6
- ✅ Input auto-resize, botão desabilitado quando vazio — Task 7
- ✅ ChatWelcome com animação float — Task 7
- ✅ Liberar acesso após redesign — Task 11

**Placeholder scan:** nenhum TBD ou TODO encontrado.

**Type consistency:** `BubbleMessage` definido em Task 6 e usado em Tasks 8/9. `ConversationItemData` definido em Task 3 e usado em Tasks 4/9. `formatTime`/`formatPreview` definidos em Task 1 e usados em Task 9.
