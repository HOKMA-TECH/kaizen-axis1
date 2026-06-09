> **⚠️ PIVOT (2026-06-09, mais tarde):** a direção visual mudou de "Minimal
> Vercel/Apple (quadrado)" para a **pegada HOKMA** (referência:
> `PROJETOS/HOKMA-DESKTOP`): paleta **slate** + brand azul `#2563eb`, cards
> **`rounded-2xl`** + **sombra suave**/glass, sidebar retrátil estilizada
> (gradiente/seções/perfil), e **transição de página GSAP** em todo o app.
> As seções abaixo descrevem o piloto quadrado original; a geometria foi
> revertida para arredondada. O restante (preview-only, primitivos GSAP,
> reduced-motion, sem regressão de lógica) continua valendo.

# SPEC — Dashboard v2 (Minimal "Vercel/Apple" + GSAP)

> **Data:** 2026-06-09 · **Status:** Aprovado (design) — não implementado
> **Branch:** `feature/sidebar-v2` (preview-only, **nunca** para produção)
> **Piloto:** `src/pages/Dashboard.tsx` + componentes em `src/components/dashboard/`
> **Companion visual:** `.superpowers/brainstorm/2562-1781034091/`

## 1. Objetivo

Criar uma **versão v2** do app, mais minimalista e moderna, começando pelo
**Dashboard** como piloto para travar a "linguagem visual v2". Os componentes-base
e primitivos de animação definidos aqui são reaproveitados depois nas demais telas,
uma a uma. A v2 vive só em **preview** (Vercel), sem tocar na versão em produção
que já tem usuários ativos.

Decisões travadas no brainstorming:

- **Estética:** Minimal "Vercel/Apple" — cantos retos, hairlines, muito respiro,
  número como herói, zero/quase-zero sombra. **Paleta original** (azul da marca).
- **Animação:** **GSAP é o padrão para toda animação nova da v2.** Framer Motion
  (`motion`) permanece nas telas ainda não migradas — não reescrevemos tudo de uma vez.
- **Escopo deste spec:** só o Dashboard + os primitivos compartilhados. Outras telas
  são milestones futuros (cada uma com seu próprio ciclo spec → plan → implementação).

## 2. Princípios inegociáveis

1. **Preview-only.** Todo o trabalho fica em `feature/sidebar-v2`. **Nunca** fazer
   merge para `main`. Validação só via preview deploy (Vercel). A produção não muda.
2. **Sem regressão de dados/lógica.** A v2 é uma camada de **apresentação**. Toda a
   lógica de período, RLS, papéis (Admin/Diretor/Gerente/Corretor), cálculo de
   vendas/metas em `Dashboard.tsx` é **preservada**. Só mudam markup, estilo e animação.
3. **GSAP isolado em primitivos.** Nada de `gsap.to()` espalhado em cada componente.
   Toda animação passa por um conjunto pequeno de hooks/wrappers reutilizáveis
   (ver §5). Trocar a "sensação" depois = mudar 1 arquivo.
4. **Acessibilidade.** Respeitar `prefers-reduced-motion`: quando ativo, sem
   contagem/stagger/scale — estado final aparece direto.
5. **Tema claro apenas.** O app desativa dark mode por design
   (`@custom-variant dark (&:where(.dark-mode-removed))` em `index.css`). Não reintroduzir.

## 3. Linguagem visual v2 (tokens)

Reusa a paleta atual de `src/index.css` — **nenhuma cor nova**:

| Papel | Token / valor |
|-------|---------------|
| Fundo app | `--bg-app` `#FAFAFA` |
| Card | `--bg-card` `#FFFFFF` |
| Sutil (track, hover) | `--bg-subtle` `#F3F4F6` |
| Hairline | `--border-subtle` `#E5E7EB` |
| Borda forte | `--border-strong` `#D1D5DB` |
| Texto | `--text-primary` `#1F2937` / `--text-secondary` `#6B7280` |
| Destaque (ação/ativo) | azul `#1F6FE5` (`primary-600`), escuro `#0F4FBF` |
| Status | verde `#16A34A` · âmbar `#F59E0B` · vermelho `#DC2626` |

**Mudança v2 vs. atual** (geometria mais reta, estilo Vercel):

| Elemento | Atual | v2 |
|----------|-------|-----|
| Raio tiles/cards | `rounded-xl` (12px) | **8px** (`rounded-lg`) |
| Raio botões/chips | `rounded-full` / `rounded-xl` | **6px** (`rounded-md`) |
| Sombra | `hover:shadow-lg` | **nenhuma** (ou hairline `border-strong` no hover) |
| Header | sem divisória | **linha divisória** inferior `border-subtle` |
| Barra de progresso | 8px | **6px** |
| Hierarquia | número `2rem` semibold | número `2rem` **bold (800)**, label menor/uppercase suave |

Esses valores viram utilitários/constantes compartilhadas (ex.: `rounded-lg`/`rounded-md`
padronizados nos componentes v2; nenhuma config de Tailwind nova necessária).

## 4. Inventário do piloto (Dashboard)

Componentes que recebem a linguagem v2 (já existem na branch, serão **refatorados**,
não recriados):

- `components/dashboard/MetricCard.tsx` + `MetricGrid` — tiles de métrica
- `components/dashboard/StatCard.tsx`, `StatRow.tsx` (`Segmented`), `StatStrip.tsx`
- `components/dashboard/SalesProgressCard.tsx` — barra de meta
- `components/dashboard/AuroraBackground.tsx` — avaliar: manter sutil ou remover
  (o minimal "Vercel" pede fundo liso; provavelmente **remover/desativar** no piloto)
- `components/ui/PremiumComponents.tsx` (`PremiumCard`, `SectionHeader`) — variante v2
  com hairline + raio 8px
- Botão primário "Novo cliente" e chips de período (`Segmented` + seletor mobile)

`Dashboard.tsx` em si: só ajustes de markup/classe + montagem dos primitivos de
animação. A árvore por papel permanece.

## 5. Primitivos de animação GSAP (o coração da v2)

Criar em `src/lib/motion/` (novo). Quatro peças, todas respeitando `prefers-reduced-motion`:

### 5.1. `useGsapCountUp(target, opts?)` — substitui `useCountUp`
Hook que anima `0 → target` com GSAP (`power2.out`, ~1.0–1.1s) e devolve um `ref`
para o nó de texto (anima `textContent`, não re-render por frame). Mantém a API
simples. O `useCountUp` (RAF) atual é **aposentado** nos componentes v2; pode
continuar existindo até a migração terminar.
- Reduced-motion: escreve o valor final imediatamente.
- `tabular-nums` para não "pular" largura.

### 5.2. `useGsapReveal()` — entrada em stagger
Hook de container que retorna um `ref`. No mount, seleciona filhos com
`[data-reveal]` e anima `opacity 0→1, y 14→0`, `stagger 0.06`, `power2.out`,
via `gsap.context()` (cleanup automático). Usado no wrapper do Dashboard e em cards.
- Reduced-motion: set final, sem stagger.
- Dispara só uma vez por montagem (equivalente ao `viewport once` atual).

### 5.3. `<Pressable>` / `useGsapPress(ref)` — micro-interações de botão/chip
Wrapper (ou hook) que liga hover/press a qualquer elemento clicável:
- `mouseenter` → `scale 1.03` (`power2.out`, .18s)
- `mouseleave` → `scale 1` (.25s)
- `mousedown` → `scale 0.96` (.10s)
- `mouseup` → `scale 1.03` (`back.out(2)`, .18s) — retorno "tátil"
- Suporte a teclado/touch (focus/active) e `pointer` events.
- Reduced-motion: sem scale (mantém só o estado de cor/borda via CSS).

### 5.4. `useGsapFill(ref, pct)` — barra de progresso
Anima `width 0% → pct%` (`power3.out`, ~1.1s), com leve atraso após a contagem
dos números. Usado na `SalesProgressCard` e nas barras de metas/missões.

> **Convivência com Framer Motion:** os componentes v2 (`MetricCard` etc.) trocam
> `motion.div` + `whileInView`/`whileHover` por `useGsapReveal` + `useGsapPress`.
> Nenhuma tela fora do Dashboard é tocada neste spec, então as duas libs coexistem
> sem conflito (GSAP só nos arquivos v2 migrados).

## 6. Estratégia de branch / preview (preview-only)

- Continuar em `feature/sidebar-v2`. **Proibido** merge/PR para `main` nesta fase.
- Cada push gera um **preview deploy** na Vercel (já configurado — ver commits
  `bd6b062`, `cf22539`). Validação acontece na URL de preview.
- Variáveis de ambiente de preview já ajustadas (`VITE_SUPABASE_ANON_KEY`, CORS
  allowlist para previews — ver `f9dc04d`). Não mexer na config de produção.
- Critério de "pronto para promover" fica **fora** deste spec: só quando o usuário
  decidir, num passo futuro explícito.

## 7. Dependências

- **Adicionar:** `gsap` (^3.12) como dependência de produção (`npm i gsap`).
  Sem plugins pagos (Club GreenSock) — só o core, que cobre tudo do §5.
- Manter `motion` (Framer Motion) — ainda usado fora da v2.

## 8. Plano de verificação

- **Build/preview:** `npm run build` passa; preview Vercel renderiza o Dashboard
  para os 4 papéis (Admin/Diretor/Gerente-Coordenador/Corretor) sem quebra.
- **Lógica intacta:** números do Dashboard (vendas/análise/aprovados/metas) batem
  com o comportamento atual para o mesmo conjunto de dados/período.
- **Animação:** entrada em stagger, contagem, fill e press funcionam; com
  `prefers-reduced-motion: reduce` tudo aparece em estado final sem animar.
- **Responsivo:** mobile (seletor de período compacto) e desktop (`Segmented`).
- **Regressão visual manual:** comparar preview vs. produção lado a lado — só
  estética muda, navegação/rotas idênticas.

## 9. Fora de escopo (milestones futuros)

- Migração das demais ~24 telas (cada uma reusa os primitivos do §5).
- Substituir Framer Motion globalmente.
- Promoção da v2 para produção.
- Sidebar retrátil (já em andamento em paralelo na mesma branch — não conflita).

## 10. Riscos

- **AuroraBackground vs. minimal:** decidir cedo se fica (sutil) ou sai. Default: sai.
- **Duas libs de animação no bundle:** aceitável na fase de migração; reavaliar
  quando a v2 amadurecer.
- **Componentes compartilhados:** `PremiumComponents` e afins também são usados por
  telas ainda **não migradas** que continuam renderizando no preview. Por isso a
  variante v2 deve ser **aditiva** (novas props/variantes), sem alterar o
  comportamento default — assim nada quebra nessas telas, e se um dia a branch for
  promovida, a produção também fica protegida.
