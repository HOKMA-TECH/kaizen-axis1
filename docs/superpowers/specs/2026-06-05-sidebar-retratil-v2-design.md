# Sidebar Retrátil V2 — Design (Preview)

**Data:** 2026-06-05
**Branch:** `feature/sidebar-v2` (preview no Vercel; `main`/produção intacta)
**Escopo:** Desktop apenas (`DesktopLayout`). O layout mobile (`Layout`) não muda.

## Objetivo

Tornar a barra lateral do desktop **retrátil** (trilho de ícones), ajustando o
conteúdo principal e os demais elementos, entregue numa **branch separada** para
preview via Vercel — sem afetar os usuários ativos em produção.

## Estratégia de isolamento

- Toda a mudança vive na branch `feature/sidebar-v2`.
- `push` da branch → Vercel cria um **deploy de preview** automático com URL própria.
- A branch `main` (produção) **não é alterada**. Merge só após aprovação do preview.
- Como é branch isolada, o `DesktopLayout` é editado diretamente — **sem flag/toggle
  in-app**.

## Comportamento — trilho de ícones

| Estado | Largura sidebar | Margem do conteúdo |
|--------|-----------------|--------------------|
| Expandida (padrão) | `w-64` (256px) | `ml-64` |
| Recolhida | `w-16` (64px) | `ml-16` |

- **Botão de alternar**: chevron no topo da sidebar (linha da marca).
  - Expandida: logo + "KAIZEN AXIS" + `ChevronLeft` (recolher).
  - Recolhida: logo centralizado, clicável, expande (tooltip "Expandir menu").
- **Persistência**: `localStorage['sidebar-collapsed']` (`'true'`/`'false'`).
  Default ausente = expandida.
- **Tooltip no hover**: recolhida, cada item mostra o nome via atributo `title`.
- **Transição**: `transition-all duration-200` na largura da sidebar e na margem do main.

## Ajuste dos demais elementos

- **Conteúdo principal** (`DesktopLayout`): margem `ml-64` fixa → dinâmica `ml-16`↔`ml-64`.
- **Cabeçalho do topo** (`h-14`, sticky): fica dentro do wrapper com margem dinâmica,
  então desloca junto automaticamente (preserva o alinhamento logo↔cabeçalho já corrigido).
- **Marca**: recolhida mostra só o logo; texto "KAIZEN AXIS" oculto.
- **Itens de navegação** (`SideNavLink`): recolhida → ícone centralizado (`justify-center`),
  label oculto, `title` = nome; ponto de "ativo" mantido; badge numérico de não-lidos do
  Chat vira um **ponto** sobre o ícone.
- **Títulos de grupo** (`NavGroup`): ocultos quando recolhida.
- **Rodapé do usuário**: recolhida → só o avatar centralizado; nome/cargo, chevron e o
  texto "Sair" ocultos (ícones permanecem, com `title`).

## Implementação

- Estado `collapsed` no `DesktopLayout` via `useState` + `localStorage` (sem context, sem libs).
- `DesktopLayout` passa `collapsed` e `onToggle` para `Sidebar`; aplica a margem dinâmica no `<main>` wrapper.
- `Sidebar` repassa `collapsed` para `NavGroup` → `SideNavLink` e ao rodapé/marca.
- Novo import: `ChevronLeft` (lucide-react).
- Arquivo único afetado: `src/components/layout/DesktopLayout.tsx`.

## Não-objetivos (YAGNI)

- Sem hover-to-expand, sem "fixar", sem animação de overlay.
- Sem toggle no Settings, sem flag por URL, sem gate por papel.
- Sem mudança no mobile, rotas, dados ou backend.

## Verificação

1. `npm run build` passa.
2. Preview no Vercel (URL da branch):
   - Recolher/expandir funciona e anima suavemente.
   - Estado persiste ao recarregar.
   - Conteúdo e cabeçalho acompanham a largura.
   - Tooltips aparecem no estado recolhido.
   - Todas as abas (Dashboard, Clientes, Agenda, Chat, etc.) renderizam corretamente nos dois estados.
3. `main`/produção permanece inalterada.

## Rollback

Branch isolada — basta não fazer merge. Para descartar: deletar a branch.
