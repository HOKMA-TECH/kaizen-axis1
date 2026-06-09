# SPEC — v3 "Dark Editorial" (shadcn + Tailwind + GSAP)

> **Data:** 2026-06-09 · **Status:** Aprovado (design visual) — em construção
> **Branch:** `preview/v3` (a partir de `main`, **preview-only**, nunca produção)
> **Piloto:** tela-vitrine pública `/v3` (sem dados reais, puro "wow")
> **Referência viva:** `.superpowers/brainstorm/3289-1781044079/` (protótipos GSAP)

## 1. Objetivo

Uma **v3 radical**, premium-corporativa, com base **shadcn/ui** (Radix + Tailwind)
e movimento **GSAP**. Direção aprovada: **"Dark Editorial"** — mistura da vibe
escura/tech (Linear/Vercel) com sofisticação editorial (serifa, linhas finas,
rótulos em maiúsculas), na **paleta KAIZEN**: base escura azulada, destaque
**azul** (`#2563eb` / `#60a5fa`) e detalhes em **branco**.

A entrega imediata é a **tela-vitrine** que trava a linguagem v3. Telas reais
viram milestones futuros (cada uma reusa os componentes/tokens daqui).

## 2. Princípios

1. **Preview-only.** Tudo em `preview/v3`. Nunca merge para `main`/produção.
2. **Tema escuro escopado.** O app de produção nesta branch continua claro. O
   tema dark v3 fica **escopado** num wrapper `.v3-root` (tokens shadcn locais),
   sem repintar o resto. Nada de tornar o app inteiro dark agora.
3. **shadcn de verdade.** Componentes no padrão shadcn (cva + Radix Slot,
   tokens semânticos `bg-background`, `bg-card`, `bg-primary`, `text-muted-foreground`…).
4. **GSAP isolado** nos primitivos já existentes (`src/lib/motion/`) + efeitos
   da vitrine (glow flutuante, magnético). Respeita `prefers-reduced-motion`.
5. **Acessível.** Radix nos interativos (command palette, dialog). Foco visível.

## 3. Linguagem visual (tokens shadcn — escopo `.v3-root`)

| Token | Valor |
|-------|-------|
| `--background` | `#06070a` (página) / card `#0a0c11` |
| `--foreground` | `#f4f6fb` (branco frio) |
| `--card` / `--card-foreground` | `#0a0c11` / `#f4f6fb` |
| `--muted-foreground` | `#8b94a3` |
| `--border` / `--input` | `#171c26` |
| `--primary` / `--primary-foreground` | `#2563eb` / `#ffffff` |
| `--accent` (azul claro) | `#60a5fa` |
| `--ring` | `#2563eb` |
| Glow | azul `#2563eb` / `#1e3a8a` (blur, flutuando) |

- **Tipografia:** manchete **serifada** (display) com palavra-chave em itálico
  azul; corpo/labels em **Inter** (sans). Rótulos micro em maiúsculas com
  `tracking` largo.
- **Geometria:** cantos médios (cards `rounded-xl`/`2xl`), **linhas finas**
  como divisores editoriais, sombra azul só no CTA.

## 4. Componentes (shadcn)

Criar em `src/components/ui/` (padrão shadcn, não colide com os existentes):
- `button.tsx` — cva (`default`/`secondary`/`outline`/`ghost`), `asChild` via
  `@radix-ui/react-slot`. Variante `default` = `bg-primary text-primary-foreground`.
- `card.tsx` — `Card`, `CardHeader`, `CardTitle`, `CardContent`.
- (futuro) `command`/`dialog` para a command palette ⌘K — Radix.

`components.json` na raiz (config shadcn p/ futuros `shadcn add`).

## 5. Vitrine `/v3` (`src/pages/V3Showcase.tsx`)

Seção única, escopada em `.v3-root` (dark), com:
- **Topbar** — marca (badge gradiente azul) + pílula ⌘K (visual).
- **Hero** — eyebrow (uppercase azul), manchete serifada (branco + itálico azul),
  subtítulo muted.
- **Faixa de métricas** — 4 stats com linhas finas + rótulos uppercase; números
  com **count-up** (VGV em R$, vendas, meta %, clientes).
- **Mini-gráfico de barras** com realce azul (fill animado) + **CTA magnético**
  (Button) e botão fantasma.
- **Glow** azul flutuando atrás (loop GSAP).

Rota **pública** `/v3` em `App.tsx` (antes das protegidas) — sem login, pra
abrir direto no preview.

## 6. Movimento (GSAP)

Reusa `src/lib/motion/` (portado do v2): `useGsapReveal`/`RevealContainer`
(stagger), `useGsapCountUp`, `useGsapFill`, `useGsapPress`. Específicos da
vitrine (inline na página): **glow flutuante** (loop `sine.inOut` yoyo) e **CTA
magnético** (segue cursor + retorno elástico). Tudo sob `prefers-reduced-motion`.

## 7. Dependências

- **Add:** `gsap`, `class-variance-authority`, `@radix-ui/react-slot`
  (e `@radix-ui/react-dialog`/`cmdk` quando a command palette for real).
- `clsx`/`tailwind-merge`/`lucide-react` já existem.

## 8. Verificação

- `npm run build` passa; `gsap`/shadcn no bundle.
- `/v3` abre no preview Vercel **sem login**, renderiza a vitrine dark.
- Animações rodam; com `prefers-reduced-motion` aparecem em estado final.
- Resto do app (claro) **inalterado** — tema dark fica escopado em `.v3-root`.

## 9. Fora de escopo (futuro)

- Migrar telas reais para a linguagem v3.
- Command palette funcional (busca real).
- Toggle claro/escuro global.
- Promoção para produção.
