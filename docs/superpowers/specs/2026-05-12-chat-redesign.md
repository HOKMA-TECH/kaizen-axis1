# Chat Redesign — Spec

**Data:** 2026-05-12  
**Status:** Aprovado  
**Direção visual:** Refined Light (Opção B)

---

## Contexto

O Chat atual (`src/pages/Chat.tsx` + `src/pages/ChatDetail.tsx`) é mobile-first com navegação lista→detalhe. A aba está temporariamente bloqueada para não-admins via `RoleRoute` enquanto a refatoração ocorre. O objetivo é tornar a interface mais moderna e inovadora, mantendo consistência com o sistema de design existente (gold/blue/surface).

---

## Objetivo

Redesenhar o Chat em split-view desktop (lista + detalhe no mesmo painel) com visual refinado: animações Framer Motion, micro-interações de hover, KAI em destaque fixo, bolhas de mensagem modernas. Mobile mantém comportamento atual (lista → detalhe separado).

---

## Arquitetura

### Estrutura de arquivos

```
src/pages/Chat.tsx          — Substituído: renderiza o split-view desktop
src/pages/ChatDetail.tsx    — Refatorado: usado como painel direito (desktop) e tela cheia (mobile)
src/components/chat/
  ChatSidebar.tsx           — Novo: painel esquerdo (lista de conversas)
  ChatKaiCard.tsx           — Novo: card KAI fixo no topo da lista
  ChatConversationItem.tsx  — Novo: item individual da lista
  ChatMessageBubble.tsx     — Novo: bolha de mensagem (enviada/recebida)
  ChatWelcome.tsx           — Novo: tela de boas-vindas (painel direito vazio)
  ChatInputBar.tsx          — Novo: barra de input com anexo + textarea + enviar
  ChatDetailHeader.tsx      — Novo: header da conversa aberta (avatar + status + ações)
```

### Roteamento

- `/chat` — split-view; conversa selecionada controlada por estado local `selectedId` no desktop
- `/chat/:id` — continua existindo para deep-link e mobile (renderiza `ChatDetail` em tela cheia)
- Breakpoint: `lg` (1024px) — abaixo disso, `/chat` mostra apenas a lista; clicar navega para `/chat/:id`

### Estado local no Chat.tsx

```ts
const [selectedId, setSelectedId] = useState<string | null>(null);
```

Sem mudança no backend, Supabase ou contexto existente.

---

## Design System

### Layout desktop

```
┌─────────────────────────────────────────────────────────┐
│ Sidebar Kaizen │   Lista (w-80)    │  Chat Detail (flex) │
│  (existente)   │ bg-card-bg        │  bg-surface-50      │
│                │ border-r          │                     │
└─────────────────────────────────────────────────────────┘
```

- Container: `flex h-[calc(100vh)] overflow-hidden`
- Painel esquerdo: `w-80 flex-shrink-0 flex flex-col border-r border-surface-200`
- Painel direito: `flex-1 min-w-0 flex flex-col`

### Painel esquerdo

**Header:**
- Título "Mensagens" `font-bold text-lg` + badge de não lidas total
- Botão nova conversa: ícone `PenSquare`, `rounded-xl p-2 hover:bg-gold-50`

**KAI Card (ChatKaiCard.tsx):**
- Background: `bg-gradient-to-r from-primary-600 to-indigo-600`
- Texto branco, `rounded-2xl shadow-md shadow-primary-200`
- Ícone `Sparkles` com `animate-pulse` (2s, opacity 0.7→1)
- Hover: `scale(1.02)` + sombra mais intensa, transição 200ms
- Entrada: `scale 0.95→1 + opacity 0→1` em 300ms (Framer Motion)

**Search bar:**
- `rounded-xl bg-surface-100` sem borda visível
- Focus: `ring-2 ring-gold-400/50` animado

**Lista de conversas (ChatConversationItem.tsx):**
- Avatar `w-10 h-10 rounded-full` + ring de presença: `ring-2 ring-emerald-400` quando online
- Nome `font-semibold`, preview `text-sm text-text-secondary truncate`
- Timestamp `text-xs` canto superior direito
- Badge não lidas: `rounded-full bg-emerald-500 text-white text-[10px]`
- Hover: `bg-surface-100` + `translate-x-0.5` (150ms)
- Selecionado: `bg-primary-50 border-l-2 border-primary-500` com `layoutId` Framer
- Entrada na lista: `staggerChildren 0.04s` na carga inicial

### Painel direito

**ChatDetailHeader.tsx:**
- Avatar + nome `font-semibold` + status `● Online/Offline`
- Botões: `Phone`, `Video`, `MoreVertical` — `rounded-xl p-2 hover:bg-surface-100`
- `border-b border-surface-200`

**Área de mensagens:**
- Background `bg-surface-50`, scroll vertical
- Separador de data: `— Hoje —` centralizado, `text-xs text-text-secondary`
- Bolha recebida: `bg-card-bg rounded-2xl rounded-tl-sm shadow-sm` — esquerda
- Bolha enviada: `bg-primary-600 text-white rounded-2xl rounded-tr-sm` — direita
- Timestamp dentro da bolha: `text-[10px] opacity-60`
- Status de leitura: ✓✓ nas enviadas
- Nova mensagem recebida: `y: 12→0, opacity: 0→1` em 250ms
- Nova mensagem enviada: `x: 8→0, opacity: 0→1` em 250ms
- Hover na bolha: botão de reação `😊` com `opacity-0→opacity-100`

**ChatWelcome.tsx (estado vazio):**
- Ícone `MessageSquare` centralizado, animação float suave (CSS keyframe)
- Texto: "Selecione uma conversa para começar"

**ChatInputBar.tsx:**
- `rounded-2xl bg-card-bg border border-surface-200`
- Ícones: `Paperclip`, `Image` à esquerda
- Textarea auto-resize (1→4 linhas), `transition-all duration-150`
- Botão enviar: `rounded-xl bg-primary-600 hover:bg-primary-700`
  - `whileTap={{ scale: 0.9 }}` Framer
  - Desabilitado (vazio): `opacity-40 cursor-not-allowed`
- Focus: `border-primary-400` com transição suave

---

## Animações

| Elemento | Animação | Duração |
|---|---|---|
| KAI Card entrada | scale 0.95→1 + opacity 0→1 | 300ms |
| KAI ícone faísca | animate-pulse CSS | 2s loop |
| Lista items (carga) | stagger fade+slide-up | 40ms/item |
| Indicador selecionado | layoutId Framer | auto |
| Troca de conversa (painel direito) | x: 8→0 + opacity 0→1 | 200ms |
| Mensagem nova | y: 12→0 + opacity 0→1 | 250ms |
| Badge não lidas | scale 0→1 spring | auto |
| Botões hover | scale 1.05 | 150ms |
| Botão enviar tap | scale 0.9 | 100ms |

**Princípio:** nenhuma animação ultrapassa 300ms.

---

## Mobile

- Breakpoint `< lg`: `/chat` mostra apenas `ChatSidebar` em tela cheia
- Clicar numa conversa navega para `/chat/:id` (comportamento atual preservado)
- `ChatDetail.tsx` refatorado usa os mesmos componentes (`ChatMessageBubble`, `ChatInputBar`, `ChatDetailHeader`) para consistência visual

---

## O que NÃO muda

- Backend Supabase (`chat_messages`, realtime subscription)
- `useChatUnread` context
- Lógica de fetch e real-time em `Chat.tsx` / `ChatDetail.tsx`
- Bloqueio de rota para não-admins (removido após refatoração concluída)
- Estrutura de dados das mensagens

---

## Critérios de sucesso

1. Desktop abre split-view corretamente em `≥ 1024px`
2. Mobile preserva navegação lista→detalhe
3. KAI card aparece fixo no topo com gradiente e animação pulse
4. Todas as animações listadas funcionam sem jank
5. Não-admins continuam bloqueados até remoção manual do lock
6. Nenhuma regressão nas features existentes (busca, unread badge, delete conversa)
