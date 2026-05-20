# Dark Mode Improvement — Design Spec

**Date:** 2026-05-20  
**Status:** Approved  
**Scope:** Fix broken components + standardize color palette via CSS variables (Approach B — Semantic)

---

## Goal

Corrigir 14 arquivos com suporte ausente ou parcial ao dark mode, eliminando cores hardcoded (`bg-white`, `bg-gray-*`, `text-gray-*`, `border-gray-*`) e padronizando o uso das CSS variables já definidas em `src/index.css`. O resultado é um dark mode consistente em todo o app, sem nenhuma alteração em lógica de negócio ou funcionalidade.

---

## Architecture

### Approach: CSS Variables as Single Source of Truth

O `src/index.css` já define um sistema completo de variáveis para light e dark mode em `:root` e `:root.dark`. O problema atual é que o `@theme` expõe nomes estranhos (`bg-surface-50`, `text-text-primary`) que os desenvolvedores ignoram e usam classes Tailwind diretas no lugar.

**Solução:** Adicionar aliases semânticos limpos no bloco `@theme` do `index.css`, mapeando para as variáveis já existentes. Nenhuma variável nova é criada — apenas nomes mais legíveis.

```css
/* Aliases a adicionar em @theme */
--color-app-bg:      var(--bg-app);        /* → bg-app-bg      */
--color-subtle-bg:   var(--bg-subtle);     /* → bg-subtle-bg   */
--color-text-main:   var(--text-primary);  /* → text-main      */
--color-text-muted:  var(--text-secondary);/* → text-muted     */
--color-line-subtle: var(--border-subtle); /* → border-line-subtle */
--color-line-strong: var(--border-strong); /* → border-line-strong */
```

> `bg-card-bg` já existe e mapeia para `var(--bg-card)` — não precisa ser adicionado.
> Os aliases de border usam o prefixo `line-` para evitar redundância com o prefixo `border-` do Tailwind.

### Dark mode toggle (sem alteração)

Mantém o sistema atual: `localStorage` com chave `'theme'` + classe `dark` no `document.documentElement`. Nenhum ThemeContext ou hook novo é necessário. O switch automático de variáveis CSS garante o comportamento correto.

### Mapeamento de substituição

| Classe hardcoded | Alias semântico | Quando usar |
|---|---|---|
| `bg-white` | `bg-card-bg` | Fundo de cards, modais, painéis |
| `bg-gray-50`, `bg-gray-100` | `bg-subtle-bg` | Fundo de seções sutis, inputs |
| `bg-[#0f131a]`, `bg-[#151c25]` | `bg-app-bg` / `bg-card-bg` | Fundos hardcoded dark |
| `text-gray-900`, `text-gray-800` | `text-main` | Texto principal |
| `text-gray-500`, `text-gray-400` | `text-muted` | Texto secundário / placeholders |
| `border-gray-100`, `border-gray-200` | `border-line-subtle` | Bordas suaves |
| `border-gray-300`, `border-gray-400` | `border-line-strong` | Bordas fortes |

---

## Components to Fix

### Fase 1 — Fundação (1 arquivo)

| Arquivo | Ação |
|---|---|
| `src/index.css` | Adicionar aliases semânticos no bloco `@theme` |

### Fase 2 — Críticos: dark mode zero (4 arquivos)

| Arquivo | Seção | Problema |
|---|---|---|
| `src/pages/Schedule.tsx` | Agenda | 60+ classes hardcoded, página inteira sem dark mode |
| `src/components/gamification/LeaderboardPanel.tsx` | Dashboard | bg-white/80, border-gray-*, text-gray-* sem variantes |
| `src/components/admin/AnnouncementCard.tsx` | Admin | Nenhuma classe dark: |
| `src/components/admin/UserCard.tsx` | Admin | Nenhuma classe dark: |

### Fase 3 — Altos: suporte parcial (6 arquivos)

| Arquivo | Seção | Problema |
|---|---|---|
| `src/pages/ClientDetails.tsx` | Clientes | bg-white em inputs (lines 1123, 1156, 1165) |
| `src/pages/AutomationLeads.tsx` | Clientes | bg-gray-50, text-gray-700, border-gray-200 |
| `src/components/chat/ChatMessageBubble.tsx` | Chat | bg-white na bolha de mensagem (line 92) |
| `src/components/chat/ChatInfoModal.tsx` | Chat | Nenhuma classe dark: |
| `src/components/ui/FunnelChart.tsx` | Reports | Nenhuma classe dark: |
| `src/components/reports/CircularScore.tsx` | Reports | Nenhuma classe dark: |

### Fase 4 — Médios: ajustes pontuais (4 arquivos)

| Arquivo | Problema |
|---|---|
| `src/components/ui/NotificationBell.tsx` | Estado default: bg-gray-50, text-gray-500 (line 29) |
| `src/components/pdf-tools/ImageScanModal.tsx` | Múltiplos hex colors hardcoded |
| `src/components/pdf-tools/UploadArea.tsx` | bg-gray-900 hover:bg-black |
| `src/components/admin/PipelinePdfExport.tsx` | bg-white em contexto de print (line 212) |

---

## Migration Rule

> **Regra de ouro:** Nunca remover uma classe sem colocar um alias semântico equivalente. Um componente nunca deve ficar com fundo transparente ou cor errada durante a migração.

Exemplos:
- `bg-white` → `bg-card-bg`
- `bg-gray-50` → `bg-subtle-bg`
- `text-gray-900` → `text-main`
- `text-gray-500` → `text-muted`
- `border-gray-200` → `border-[--border-subtle]`

---

## Data Flow

```
usuário clica toggle
  → Settings.tsx adiciona/remove classe 'dark' em document.documentElement
    → :root.dark CSS variables ativadas
      → todos os aliases semânticos resolvem para valores dark
        → componentes mudam visualmente sem re-render React
```

Nenhuma prop, state ou context é necessário nos componentes.

---

## Out of Scope

- Nenhuma alteração em lógica de negócio, APIs, Supabase, roteamento ou estado
- Nenhum ThemeContext ou hook global
- Estilos de print (`print:bg-white`) permanecem inalterados
- Componentes fora das 14 listadas não são tocados

---

## Testing Approach

A cada fase:
1. `npm run dev` — subir o servidor local
2. Ativar dark mode nas Settings
3. Navegar pelas seções alteradas e revisar visualmente
4. Voltar para light mode e confirmar que nada quebrou
5. Testar em mobile (responsividade não é afetada, mas confirmar)

Não há testes automatizados necessários — as mudanças são puramente de classe CSS.

---

## Success Criteria

- Dark mode ativo: nenhum componente exibe fundo branco, texto ilegível ou borda inexistente
- Light mode ativo: comportamento idêntico ao atual (zero regressões)
- Todos os 14 arquivos migrados usam apenas aliases semânticos — zero `bg-white` / `bg-gray-*` sem `dark:` variant
