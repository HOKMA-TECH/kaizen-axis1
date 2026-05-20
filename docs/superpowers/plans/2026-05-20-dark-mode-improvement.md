# Dark Mode Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o dark mode em 14 arquivos, eliminando cores hardcoded e padronizando o uso de CSS variables semânticas já definidas em `src/index.css`.

**Architecture:** Adicionar aliases semânticos no `@theme` do `index.css`, depois migrar cada componente substituindo classes `bg-white/bg-gray-*/text-gray-*/border-gray-*` pelos aliases. Nenhuma lógica de negócio é alterada — apenas classes CSS. O toggle de dark mode continua funcionando via `localStorage + classe dark no <html>`.

**Tech Stack:** React 19, Tailwind 4 (via `@tailwindcss/vite`), CSS custom properties

---

## Files Modified

| Arquivo | Ação |
|---|---|
| `src/index.css` | Adicionar 4 aliases semânticos no `@theme` |
| `src/components/gamification/LeaderboardPanel.tsx` | Substituir todas as cores hardcoded |
| `src/components/admin/AnnouncementCard.tsx` | Adicionar dark variants nas cores de status |
| `src/components/admin/UserCard.tsx` | Adicionar dark variants nas cores de cargo |
| `src/components/ui/NotificationBell.tsx` | Adicionar dark variants nas cores de tipo |
| `src/pages/Schedule.tsx` | Migração completa — página inteira sem dark mode |
| `src/pages/ClientDetails.tsx` | Corrigir bg-white em inputs (3 ocorrências) |
| `src/pages/AutomationLeads.tsx` | Corrigir cores hardcoded em lead cards |
| `src/components/chat/ChatMessageBubble.tsx` | Corrigir bg-white na bolha de mensagem |
| `src/components/chat/ChatInfoModal.tsx` | Adicionar dark variants em botões de ação |

---

## Task 1: Adicionar aliases semânticos no @theme

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Adicionar 4 aliases no bloco `@theme`**

Abra `src/index.css`. No bloco `@theme { ... }`, após a linha `--color-card-bg: var(--bg-card);`, adicione:

```css
  --color-app-bg:      var(--bg-app);
  --color-subtle-bg:   var(--bg-subtle);
  --color-line-subtle: var(--border-subtle);
  --color-line-strong: var(--border-strong);
```

O bloco `@theme` completo deve ficar:

```css
@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;

  /* Primary Blue Scale - Nova Identidade Visual */
  --color-primary-50: #EFF6FF;
  --color-primary-100: #DBEAFE;
  --color-primary-200: #BFDBFE;
  --color-primary-300: #93C5FD;
  --color-primary-400: #60A5FA;
  --color-primary-500: #3B82F6;
  --color-primary-600: #1F6FE5;
  --color-primary-700: #0F4FBF;
  --color-primary-800: #1E40AF;
  --color-primary-900: #1E3A8A;

  --color-gold-50: var(--color-primary-50);
  --color-gold-100: var(--color-primary-100);
  --color-gold-200: var(--color-primary-200);
  --color-gold-300: var(--color-primary-300);
  --color-gold-400: var(--color-primary-600);
  --color-gold-500: var(--color-primary-700);
  --color-gold-600: var(--color-primary-800);
  --color-gold-700: var(--color-primary-900);
  --color-gold-800: var(--color-primary-900);
  --color-gold-900: var(--color-primary-900);

  --color-surface-50: var(--bg-app);
  --color-surface-100: var(--bg-subtle);
  --color-surface-200: var(--border-subtle);
  --color-surface-300: var(--border-strong);
  --color-surface-400: var(--surface-400);
  --color-surface-500: var(--surface-500);
  --color-surface-600: var(--surface-600);
  --color-surface-700: var(--surface-700);
  --color-surface-800: var(--surface-800);
  --color-surface-900: var(--surface-900);

  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-card-bg: var(--bg-card);

  /* Aliases semânticos limpos */
  --color-app-bg:      var(--bg-app);
  --color-subtle-bg:   var(--bg-subtle);
  --color-line-subtle: var(--border-subtle);
  --color-line-strong: var(--border-strong);
}
```

- [ ] **Step 2: Verificar build**

```bash
npm run dev
```

Esperado: servidor sobe sem erros de compilação. Os novos aliases (`bg-app-bg`, `bg-subtle-bg`, `border-line-subtle`, `border-line-strong`) estão disponíveis como classes Tailwind.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(theme): add semantic color aliases to @theme"
```

---

## Task 2: Corrigir LeaderboardPanel.tsx

**Files:**
- Modify: `src/components/gamification/LeaderboardPanel.tsx`

- [ ] **Step 1: Substituir container de loading (linha 15)**

De:
```tsx
<div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 p-6 flex items-center justify-center min-h-[400px]">
```

Para:
```tsx
<div className="bg-card-bg/80 backdrop-blur-md rounded-2xl shadow-xl border border-line-subtle p-6 flex items-center justify-center min-h-[400px]">
```

- [ ] **Step 2: Substituir container principal (linha 22)**

De:
```tsx
<div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col h-full">
```

Para:
```tsx
<div className="bg-card-bg/80 backdrop-blur-md rounded-2xl shadow-xl border border-line-subtle overflow-hidden flex flex-col h-full">
```

- [ ] **Step 3: Substituir header do ranking (linha 23)**

De:
```tsx
<div className="p-6 border-b border-gray-100 bg-gradient-to-br from-indigo-50 to-white">
```

Para:
```tsx
<div className="p-6 border-b border-line-subtle bg-gradient-to-br from-indigo-50/40 dark:from-indigo-900/20 to-transparent">
```

- [ ] **Step 4: Substituir título e subtítulo (linhas 28 e 30)**

De:
```tsx
<h2 className="text-xl font-bold text-gray-800">Ranking Global</h2>
```
Para:
```tsx
<h2 className="text-xl font-bold text-text-primary">Ranking Global</h2>
```

De:
```tsx
<p className="text-sm text-gray-500">
```
Para:
```tsx
<p className="text-sm text-text-secondary">
```

- [ ] **Step 5: Substituir estado vazio (linha 37-38)**

De:
```tsx
<div className="text-center py-10 text-gray-500 flex flex-col items-center">
    <Trophy className="w-12 h-12 text-gray-300 mb-3" />
```
Para:
```tsx
<div className="text-center py-10 text-text-secondary flex flex-col items-center">
    <Trophy className="w-12 h-12 text-text-secondary/40 mb-3" />
```

- [ ] **Step 6: Substituir cores nos cards de posição 4+ (linha 54)**

De:
```tsx
'bg-white border-gray-100 hover:border-indigo-100'
```
Para:
```tsx
'bg-card-bg border-line-subtle hover:border-indigo-300 dark:hover:border-indigo-800'
```

- [ ] **Step 7: Substituir borda do avatar (linha 68)**

De:
```tsx
className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover"
```
Para:
```tsx
className="w-10 h-10 rounded-full border-2 border-card-bg shadow-sm object-cover"
```

- [ ] **Step 8: Substituir avatar placeholder cor default (linha 70-71)**

De:
```tsx
index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-orange-400' : 'bg-gray-300'
```
Para:
```tsx
index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-orange-400' : 'bg-surface-400'
```

- [ ] **Step 9: Substituir nome e posição de texto (linhas 62, 76, 97)**

De:
```tsx
<span className="text-lg font-bold text-gray-400">#{index + 1}</span>
```
Para:
```tsx
<span className="text-lg font-bold text-text-secondary">#{index + 1}</span>
```

De:
```tsx
<p className={`font-semibold ${isTop3 ? 'text-gray-900' : 'text-gray-700'}`}>
```
Para:
```tsx
<p className="font-semibold text-text-primary">
```

De:
```tsx
<p className="text-xs text-gray-500 mt-1 flex items-center justify-end">
```
Para:
```tsx
<p className="text-xs text-text-secondary mt-1 flex items-center justify-end">
```

- [ ] **Step 10: Verificar visualmente**

```bash
npm run dev
```

Navegar para Dashboard → verificar LeaderboardPanel em dark mode e light mode.

- [ ] **Step 11: Commit**

```bash
git add src/components/gamification/LeaderboardPanel.tsx
git commit -m "fix(ui): add dark mode support to LeaderboardPanel"
```

---

## Task 3: Corrigir AnnouncementCard.tsx

**Files:**
- Modify: `src/components/admin/AnnouncementCard.tsx`

- [ ] **Step 1: Atualizar `getPriorityColor` com dark variants**

Substituir a função completa:

De:
```tsx
const getPriorityColor = (priority?: string) => {
  switch (priority) {
    case 'Urgente': return 'text-red-600 bg-red-50 border-red-200';
    case 'Importante': return 'text-amber-600 bg-amber-50 border-amber-200';
    default: return 'text-blue-600 bg-blue-50 border-blue-200';
  }
};
```

Para:
```tsx
const getPriorityColor = (priority?: string) => {
  switch (priority) {
    case 'Urgente':    return 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400';
    case 'Importante': return 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400';
    default:           return 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400';
  }
};
```

- [ ] **Step 2: Verificar em dark mode**

```bash
npm run dev
```

Navegar para Admin → verificar badges Urgente/Importante/Normal em dark mode.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AnnouncementCard.tsx
git commit -m "fix(ui): add dark mode variants to AnnouncementCard status badges"
```

---

## Task 4: Corrigir UserCard.tsx

**Files:**
- Modify: `src/components/admin/UserCard.tsx`

- [ ] **Step 1: Adicionar dark variants nos badges de cargo (linhas 36-39)**

De:
```tsx
user.role === 'Diretor' ? "bg-purple-100 text-purple-700" :
user.role === 'Gerente' ? "bg-blue-100 text-blue-700" :
"bg-surface-100 text-text-secondary"
```

Para:
```tsx
user.role === 'Diretor' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" :
user.role === 'Gerente' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
"bg-surface-100 text-text-secondary"
```

- [ ] **Step 2: Adicionar dark variant no hover do botão Recusar (linha 62)**

De:
```tsx
className="flex-1 h-8 text-xs text-red-500 border-red-200 hover:bg-red-50"
```

Para:
```tsx
className="flex-1 h-8 text-xs text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
```

- [ ] **Step 3: Verificar em dark mode**

```bash
npm run dev
```

Navegar para Admin → verificar UserCards em dark mode.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/UserCard.tsx
git commit -m "fix(ui): add dark mode variants to UserCard role badges and buttons"
```

---

## Task 5: Corrigir NotificationBell.tsx

**Files:**
- Modify: `src/components/ui/NotificationBell.tsx`

- [ ] **Step 1: Atualizar `getTypeConfig` com dark variants em todos os tipos**

Substituir a função completa:

De:
```tsx
const getTypeConfig = (type: string) => {
    switch (type) {
        case 'lead':    return { icon: <UserPlus size={16} />,     color: 'text-blue-500',   bg: 'bg-blue-50' };
        case 'chat':    return { icon: <MessageCircle size={16} />, color: 'text-green-500',  bg: 'bg-green-50' };
        case 'aviso':   return { icon: <AlertTriangle size={16} />, color: 'text-red-500',    bg: 'bg-red-50' };
        case 'meta':    return { icon: <Target size={16} />,        color: 'text-purple-500', bg: 'bg-purple-50' };
        case 'missao':  return { icon: <Briefcase size={16} />,     color: 'text-indigo-500', bg: 'bg-indigo-50' };
        case 'anuncio': return { icon: <Megaphone size={16} />,     color: 'text-orange-500', bg: 'bg-orange-50' };
        default:        return { icon: <Info size={16} />,          color: 'text-gray-500',   bg: 'bg-gray-50' };
    }
};
```

Para:
```tsx
const getTypeConfig = (type: string) => {
    switch (type) {
        case 'lead':    return { icon: <UserPlus size={16} />,     color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/30' };
        case 'chat':    return { icon: <MessageCircle size={16} />, color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-900/30' };
        case 'aviso':   return { icon: <AlertTriangle size={16} />, color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-900/30' };
        case 'meta':    return { icon: <Target size={16} />,        color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/30' };
        case 'missao':  return { icon: <Briefcase size={16} />,     color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/30' };
        case 'anuncio': return { icon: <Megaphone size={16} />,     color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/30' };
        default:        return { icon: <Info size={16} />,          color: 'text-text-secondary', bg: 'bg-subtle-bg' };
    }
};
```

- [ ] **Step 2: Verificar em dark mode**

```bash
npm run dev
```

Abrir o sino de notificações em dark mode — verificar ícones de cada tipo.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/NotificationBell.tsx
git commit -m "fix(ui): add dark mode variants to NotificationBell type icons"
```

---

## Task 6: Corrigir ChatInfoModal.tsx

**Files:**
- Modify: `src/components/chat/ChatInfoModal.tsx`

- [ ] **Step 1: Corrigir botão "Remover do grupo" (linha 231)**

De:
```tsx
className="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
```

Para:
```tsx
className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
```

- [ ] **Step 2: Corrigir botão "Sair do grupo" (linha 252)**

De:
```tsx
className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
```

Para:
```tsx
className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
```

- [ ] **Step 3: Corrigir badge Admin (linha 222)**

De:
```tsx
<span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-1 text-[10px] font-semibold text-primary-700">
```

Para:
```tsx
<span className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-900/30 px-2 py-1 text-[10px] font-semibold text-primary-700 dark:text-primary-300">
```

- [ ] **Step 4: Verificar em dark mode**

```bash
npm run dev
```

Abrir um chat de grupo → clicar em info → verificar botões e badges em dark mode.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatInfoModal.tsx
git commit -m "fix(ui): add dark mode variants to ChatInfoModal action buttons"
```

---

## Task 7: Corrigir Schedule.tsx (Agenda)

**Files:**
- Modify: `src/pages/Schedule.tsx`

- [ ] **Step 1: Corrigir constantes TYPE_PILL e TYPE_BLOCK (linhas 21-32)**

De:
```tsx
const TYPE_PILL: Record<string, string> = {
  Visita:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Reunião:    'bg-blue-50    text-blue-700    border border-blue-200',
  Assinatura: 'bg-violet-50  text-violet-700  border border-violet-200',
  Outro:      'bg-amber-50   text-amber-700   border border-amber-200',
};

const TYPE_BLOCK: Record<string, string> = {
  Visita:     'bg-emerald-100 text-emerald-800 border-l-2 border-emerald-400',
  Reunião:    'bg-blue-100    text-blue-800    border-l-2 border-blue-400',
  Assinatura: 'bg-violet-100  text-violet-800  border-l-2 border-violet-400',
  Outro:      'bg-amber-100   text-amber-800   border-l-2 border-amber-400',
};
```

Para:
```tsx
const TYPE_PILL: Record<string, string> = {
  Visita:     'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
  Reunião:    'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
  Assinatura: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800',
  Outro:      'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
};

const TYPE_BLOCK: Record<string, string> = {
  Visita:     'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 border-l-2 border-emerald-400',
  Reunião:    'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-l-2 border-blue-400',
  Assinatura: 'bg-violet-100 dark:bg-violet-900/20 text-violet-800 dark:text-violet-200 border-l-2 border-violet-400',
  Outro:      'bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border-l-2 border-amber-400',
};
```

- [ ] **Step 2: Corrigir FIELD_CLASS (linha 34)**

De:
```tsx
const FIELD_CLASS = 'w-full h-12 px-3 py-0 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-900 text-sm';
```

Para:
```tsx
const FIELD_CLASS = 'w-full h-12 px-3 py-0 bg-subtle-bg rounded-xl border border-line-subtle focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-text-primary text-sm';
```

- [ ] **Step 3: Corrigir container raiz (linha 172)**

De:
```tsx
<div className="-mx-2 sm:-mx-4 lg:-mx-6 flex flex-col bg-white"
```

Para:
```tsx
<div className="-mx-2 sm:-mx-4 lg:-mx-6 flex flex-col bg-app-bg"
```

- [ ] **Step 4: Corrigir header mobile (linha 181)**

De:
```tsx
<div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
  <h1 className="text-lg font-bold text-gray-900">Agenda</h1>
```

Para:
```tsx
<div className="flex items-center justify-between px-4 py-3 border-b border-line-subtle flex-shrink-0">
  <h1 className="text-lg font-bold text-text-primary">Agenda</h1>
```

- [ ] **Step 5: Corrigir botão de filtro mobile (linhas 188-193)**

De:
```tsx
className={`p-2 rounded-xl border transition-colors ${
  typeFilter !== 'Todos'
    ? 'border-blue-400 bg-blue-50 text-blue-600'
    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
}`}
```

Para:
```tsx
className={`p-2 rounded-xl border transition-colors ${
  typeFilter !== 'Todos'
    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-600'
    : 'border-line-subtle text-text-secondary hover:bg-subtle-bg'
}`}
```

- [ ] **Step 6: Corrigir dropdown de filtro (linhas 197)**

De:
```tsx
<div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
```

Para:
```tsx
<div className="absolute right-0 top-full mt-1 w-44 bg-card-bg border border-line-subtle rounded-xl shadow-lg z-50 py-1 overflow-hidden">
```

- [ ] **Step 7: Corrigir itens do dropdown de filtro (linha 202-204)**

De:
```tsx
className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
  typeFilter === t ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-gray-700'
}`}
```

Para:
```tsx
className={`w-full text-left px-4 py-2.5 text-sm hover:bg-subtle-bg transition-colors ${
  typeFilter === t ? 'text-blue-600 font-semibold bg-blue-50/50 dark:bg-blue-900/20' : 'text-text-primary'
}`}
```

- [ ] **Step 8: Corrigir navegação de semana (linhas 224-230)**

De:
```tsx
<div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
  <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
    ...
  </button>
  <span className="flex-1 text-center text-sm font-bold text-gray-800 capitalize">
    ...
  </span>
  <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
```

Para:
```tsx
<div className="flex items-center gap-2 px-4 py-2.5 border-b border-line-subtle flex-shrink-0">
  <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-subtle-bg text-text-secondary transition-colors">
    ...
  </button>
  <span className="flex-1 text-center text-sm font-bold text-text-primary capitalize">
    ...
  </span>
  <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-subtle-bg text-text-secondary transition-colors">
```

- [ ] **Step 9: Corrigir estado vazio mobile (linhas 243-244)**

De:
```tsx
<CalendarIcon size={36} className="text-gray-200" />
<p className="text-sm text-gray-400 font-medium">Nenhum evento para este dia</p>
```

Para:
```tsx
<CalendarIcon size={36} className="text-text-secondary/30" />
<p className="text-sm text-text-secondary font-medium">Nenhum evento para este dia</p>
```

- [ ] **Step 10: Corrigir card de evento mobile (linha 257)**

De:
```tsx
className={`p-3 rounded-2xl border-l-4 bg-white shadow-sm ${
```

Para:
```tsx
className={`p-3 rounded-2xl border-l-4 bg-card-bg shadow-sm ${
```

- [ ] **Step 11: Corrigir texto no card de evento mobile (linha 275)**

De:
```tsx
<p className={`text-sm font-bold ${evt.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
```

Para:
```tsx
<p className={`text-sm font-bold ${evt.completed ? 'line-through text-text-secondary' : 'text-text-primary'}`}>
```

- [ ] **Step 12: Fazer busca por `bg-white`, `bg-gray-`, `text-gray-`, `border-gray-` restantes no arquivo e substituir**

Use busca no editor (`Ctrl+H`) para encontrar e substituir os padrões restantes no arquivo `src/pages/Schedule.tsx`:

| Buscar | Substituir por |
|---|---|
| `bg-white` | `bg-card-bg` |
| `bg-gray-50` | `bg-subtle-bg` |
| `bg-gray-100` | `bg-subtle-bg` |
| `hover:bg-gray-50` | `hover:bg-subtle-bg` |
| `hover:bg-gray-100` | `hover:bg-subtle-bg` |
| `text-gray-900` | `text-text-primary` |
| `text-gray-800` | `text-text-primary` |
| `text-gray-700` | `text-text-primary` |
| `text-gray-600` | `text-text-secondary` |
| `text-gray-500` | `text-text-secondary` |
| `text-gray-400` | `text-text-secondary` |
| `text-gray-300` | `text-text-secondary/60` |
| `text-gray-200` | `text-text-secondary/40` |
| `border-gray-100` | `border-line-subtle` |
| `border-gray-200` | `border-line-subtle` |
| `border-gray-50` | `border-line-subtle` |

> Atenção: `border-gray-400` é usado dentro de `TYPE_BLOCK` e já foi atualizado no Step 1. Não substituir novamente.

- [ ] **Step 13: Verificar em dark mode e light mode**

```bash
npm run dev
```

Navegar para Agenda → verificar visualmente toda a página em dark mode e light mode. Criar um evento e verificar o modal de criação.

- [ ] **Step 14: Commit**

```bash
git add src/pages/Schedule.tsx
git commit -m "fix(ui): add complete dark mode support to Schedule page"
```

---

## Task 8: Corrigir ClientDetails.tsx

**Files:**
- Modify: `src/pages/ClientDetails.tsx`

- [ ] **Step 1: Substituir as 3 ocorrências de `bg-white` (linhas 1123, 1156, 1165)**

Faça busca por `bg-white` no arquivo `src/pages/ClientDetails.tsx` e substitua por `bg-card-bg`. Verifique que apenas os 3 locais identificados são alterados (não há outros `bg-white` no arquivo que sirvam a propósito diferente).

- [ ] **Step 2: Verificar em dark mode**

```bash
npm run dev
```

Navegar para um cliente → verificar inputs de formulário em dark mode.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ClientDetails.tsx
git commit -m "fix(ui): replace hardcoded bg-white with bg-card-bg in ClientDetails"
```

---

## Task 9: Corrigir AutomationLeads.tsx

**Files:**
- Modify: `src/pages/AutomationLeads.tsx`

- [ ] **Step 1: Substituir cores hardcoded na linha 130**

Encontre a linha com `bg-gray-50`, `text-gray-700`, `border-gray-200` em `src/pages/AutomationLeads.tsx` (por volta da linha 130) e substitua:

- `bg-gray-50` → `bg-subtle-bg`
- `text-gray-700` → `text-text-primary`
- `border-gray-200` → `border-line-subtle`

- [ ] **Step 2: Verificar em dark mode**

```bash
npm run dev
```

Navegar para a seção de Clientes/Leads → verificar lead cards em dark mode.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AutomationLeads.tsx
git commit -m "fix(ui): add dark mode support to AutomationLeads lead cards"
```

---

## Task 10: Corrigir ChatMessageBubble.tsx

**Files:**
- Modify: `src/components/chat/ChatMessageBubble.tsx`

- [ ] **Step 1: Substituir `bg-white` na bolha de mensagem (linha 92)**

Encontre a linha 92 em `src/components/chat/ChatMessageBubble.tsx` que contém `bg-white` e substitua por `bg-card-bg`.

- [ ] **Step 2: Verificar em dark mode**

```bash
npm run dev
```

Navegar para Chat → verificar bolhas de mensagem recebida em dark mode.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatMessageBubble.tsx
git commit -m "fix(ui): replace bg-white with bg-card-bg in ChatMessageBubble"
```

---

## Task 11: Verificação final e revisão visual completa

- [ ] **Step 1: Subir o servidor**

```bash
npm run dev
```

- [ ] **Step 2: Verificar todas as seções em dark mode**

Ativar dark mode em Settings e navegar por cada seção:
- [ ] Dashboard — LeaderboardPanel sem fundo branco
- [ ] Admin — AnnouncementCards com badges corretos, UserCards com cargos legíveis
- [ ] Agenda (Schedule) — toda a página com cores corretas
- [ ] Clientes — ClientDetails com inputs legíveis, AutomationLeads com cards corretos
- [ ] Chat — ChatMessageBubble, ChatInfoModal botões visíveis
- [ ] Notificações — sino com ícones de tipo corretos

- [ ] **Step 3: Verificar light mode (zero regressões)**

Desativar dark mode em Settings e repetir a navegação acima confirmando que light mode está idêntico ao estado anterior.

- [ ] **Step 4: Commit de encerramento**

```bash
git add -A
git commit -m "fix(ui): complete dark mode improvement across 10 components"
```
