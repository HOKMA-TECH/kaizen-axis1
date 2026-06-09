# Dashboard v2 (Minimal + GSAP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refazer o Dashboard com a linguagem visual v2 (minimal "Vercel/Apple", paleta azul da marca) e animações GSAP isoladas em primitivos reutilizáveis, tudo em preview-only na branch `feature/sidebar-v2`.

**Architecture:** Criar `src/lib/motion/` com 4 primitivos GSAP (count-up, reveal/stagger, press, fill) que respeitam `prefers-reduced-motion`. Refatorar os componentes v2 do Dashboard (`MetricCard`, `StatRow`/`Segmented`, `SalesProgressCard`) e o `Dashboard.tsx` para usar esses primitivos + geometria mais reta (cards 8px / botões 6px / hairlines). Mudanças em componentes compartilhados (`PremiumCard`) são **aditivas** (nova prop), sem alterar o default.

**Tech Stack:** React 19, TypeScript, Tailwind v4, GSAP 3.12 (novo), Vite. Sem test runner de frontend no repo → verificação por `npm run lint` (`tsc --noEmit`) + `npm run build` + checagem manual no preview.

**Convenções do repo:**
- Imports com alias `@/` (ex.: `@/lib/utils`, `@/hooks/...`).
- `cn()` de `@/lib/utils` para classes.
- Tema claro apenas; classes `dark:` são no-op (não remover, mas não dependa delas).
- Commits frequentes, um por task. Use `--no-verify` só se um hook não relacionado falhar.

---

## Estrutura de arquivos

**Criar:**
- `src/lib/motion/prefersReducedMotion.ts` — helper de acessibilidade
- `src/lib/motion/useGsapCountUp.ts` — contagem 0→alvo
- `src/lib/motion/useGsapReveal.ts` — entrada em stagger
- `src/lib/motion/useGsapPress.ts` — micro-interação hover/press
- `src/lib/motion/Pressable.tsx` — wrapper que aplica `useGsapPress`
- `src/lib/motion/useGsapFill.ts` — preenchimento de barra
- `src/lib/motion/index.ts` — barrel export
- `src/components/dashboard/ProgressBar.tsx` — barra de progresso com fill GSAP (DRY p/ metas)

**Modificar:**
- `src/components/dashboard/MetricCard.tsx` — v2 (8px, GSAP, sem Framer Motion)
- `src/components/dashboard/StatRow.tsx` — raios 8px/6px + press no Segmented
- `src/components/dashboard/SalesProgressCard.tsx` — raios 8px + números com count-up
- `src/components/ui/PremiumComponents.tsx` — `PremiumCard` ganha prop aditiva `square`
- `src/pages/Dashboard.tsx` — wrapper reveal, header com divisória, chips 6px, barras via `ProgressBar`, botões via `Pressable`
- `package.json` / `package-lock.json` — dependência `gsap`

---

## Task 1: Adicionar GSAP + helper de reduced-motion

**Files:**
- Modify: `package.json` (via npm)
- Create: `src/lib/motion/prefersReducedMotion.ts`

- [ ] **Step 1: Instalar gsap**

Run: `npm install gsap@^3.12`
Expected: adiciona `"gsap": "^3.12.x"` em `dependencies` e atualiza o lockfile, sem erros.

- [ ] **Step 2: Criar o helper de reduced-motion**

Create `src/lib/motion/prefersReducedMotion.ts`:

```ts
/**
 * True quando o usuário pediu menos movimento no SO/navegador.
 * SSR-safe: retorna false se `window`/`matchMedia` não existirem.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: PASS (sem erros novos de TypeScript).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/motion/prefersReducedMotion.ts
git commit -m "feat(motion): adiciona gsap e helper prefers-reduced-motion"
```

---

## Task 2: Hook `useGsapCountUp`

**Files:**
- Create: `src/lib/motion/useGsapCountUp.ts`

- [ ] **Step 1: Criar o hook**

Create `src/lib/motion/useGsapCountUp.ts`:

```ts
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { prefersReducedMotion } from './prefersReducedMotion';

export interface CountUpOptions {
  /** Duração em segundos. */
  duration?: number;
  /** Formata o número antes de escrever no DOM. */
  format?: (value: number) => string;
}

/**
 * Anima o textContent de um elemento de 0 → target com GSAP (power2.out).
 * Não causa re-render por frame (escreve direto no nó). Retorna o ref a
 * anexar no elemento de texto. Use SOMENTE com valores numéricos.
 *
 * Reduced-motion: escreve o valor final imediatamente, sem animar.
 */
export function useGsapCountUp<T extends HTMLElement = HTMLElement>(
  target: number,
  options: CountUpOptions = {},
) {
  const ref = useRef<T>(null);
  const { duration = 1.1 } = options;
  // format guardado em ref para não re-disparar o efeito a cada render.
  const formatRef = useRef<(v: number) => string>(
    options.format ?? ((v) => String(Math.round(v))),
  );
  formatRef.current = options.format ?? ((v) => String(Math.round(v)));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = formatRef.current;
    if (!Number.isFinite(target)) {
      el.textContent = fmt(0);
      return;
    }
    if (prefersReducedMotion()) {
      el.textContent = fmt(target);
      return;
    }
    const counter = { v: 0 };
    const tween = gsap.to(counter, {
      v: target,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = fmt(counter.v);
      },
    });
    return () => {
      tween.kill();
    };
  }, [target, duration]);

  return ref;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/motion/useGsapCountUp.ts
git commit -m "feat(motion): hook useGsapCountUp"
```

---

## Task 3: Hook `useGsapReveal`

**Files:**
- Create: `src/lib/motion/useGsapReveal.ts`

- [ ] **Step 1: Criar o hook**

Create `src/lib/motion/useGsapReveal.ts`:

```ts
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { prefersReducedMotion } from './prefersReducedMotion';

/**
 * Anexa no container. No mount, anima os filhos marcados com `[data-reveal]`
 * subindo 14px + fade, em stagger (cascata). Usa gsap.context para cleanup.
 *
 * `deps` permite re-rodar a entrada quando o conteúdo muda (ex.: após carregar
 * dados). Padrão: roda uma vez no mount.
 *
 * Reduced-motion: deixa os elementos no estado final, sem animar.
 */
export function useGsapReveal<T extends HTMLElement = HTMLElement>(
  deps: unknown[] = [],
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>('[data-reveal]');
    if (items.length === 0) return;

    if (prefersReducedMotion()) {
      gsap.set(items, { opacity: 1, y: 0, clearProps: 'transform' });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        items,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.06 },
      );
    }, el);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/motion/useGsapReveal.ts
git commit -m "feat(motion): hook useGsapReveal (stagger entrance)"
```

---

## Task 4: `useGsapPress` + `Pressable`

**Files:**
- Create: `src/lib/motion/useGsapPress.ts`
- Create: `src/lib/motion/Pressable.tsx`

- [ ] **Step 1: Criar o hook de press**

Create `src/lib/motion/useGsapPress.ts`:

```ts
import { useEffect } from 'react';
import type { RefObject } from 'react';
import gsap from 'gsap';
import { prefersReducedMotion } from './prefersReducedMotion';

/**
 * Liga micro-interações de hover/press a um elemento clicável:
 * - enter  → scale 1.03
 * - leave  → scale 1
 * - down   → scale 0.96 (squash tátil)
 * - up     → scale 1.03 (retorno elástico back.out)
 *
 * Reduced-motion: não faz nada (mantém só estados de cor/borda via CSS).
 */
export function useGsapPress(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const enter = () => gsap.to(el, { scale: 1.03, duration: 0.18, ease: 'power2.out' });
    const leave = () => gsap.to(el, { scale: 1, duration: 0.25, ease: 'power2.out' });
    const down = () => gsap.to(el, { scale: 0.96, duration: 0.1, ease: 'power2.out' });
    const up = () => gsap.to(el, { scale: 1.03, duration: 0.18, ease: 'back.out(2)' });

    el.addEventListener('mouseenter', enter);
    el.addEventListener('mouseleave', leave);
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchend', leave);

    return () => {
      el.removeEventListener('mouseenter', enter);
      el.removeEventListener('mouseleave', leave);
      el.removeEventListener('mousedown', down);
      el.removeEventListener('mouseup', up);
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchend', leave);
    };
  }, [ref]);
}
```

- [ ] **Step 2: Criar o componente Pressable**

Create `src/lib/motion/Pressable.tsx`:

```tsx
import React, { useRef } from 'react';
import type { RefObject } from 'react';
import { useGsapPress } from './useGsapPress';

type PressableProps = {
  /** Tag a renderizar (default 'button'). */
  as?: React.ElementType;
  children?: React.ReactNode;
} & Record<string, any>;

/**
 * Renderiza um elemento clicável (button por padrão) com as micro-interações
 * de hover/press do GSAP já ligadas. Repassa todas as props (onClick, className…).
 */
export function Pressable({ as, children, ...props }: PressableProps) {
  const Comp = (as ?? 'button') as React.ElementType;
  const ref = useRef<HTMLElement | null>(null);
  useGsapPress(ref as RefObject<HTMLElement | null>);
  return (
    <Comp ref={ref} {...props}>
      {children}
    </Comp>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/motion/useGsapPress.ts src/lib/motion/Pressable.tsx
git commit -m "feat(motion): useGsapPress + Pressable"
```

---

## Task 5: Hook `useGsapFill` + barrel export

**Files:**
- Create: `src/lib/motion/useGsapFill.ts`
- Create: `src/lib/motion/index.ts`

- [ ] **Step 1: Criar o hook de fill**

Create `src/lib/motion/useGsapFill.ts`:

```ts
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { prefersReducedMotion } from './prefersReducedMotion';

export interface FillOptions {
  duration?: number;
  delay?: number;
}

/**
 * Anima a largura de um elemento de 0% → pct% (power3.out), com leve atraso
 * para entrar depois da contagem dos números. Retorna o ref para o elemento
 * "fill" (a parte colorida dentro do track).
 *
 * Reduced-motion: aplica a largura final imediatamente.
 */
export function useGsapFill<T extends HTMLElement = HTMLElement>(
  pct: number,
  options: FillOptions = {},
) {
  const ref = useRef<T>(null);
  const { duration = 1.1, delay = 0.2 } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));

    if (prefersReducedMotion()) {
      el.style.width = `${target}%`;
      return;
    }
    const tween = gsap.fromTo(
      el,
      { width: '0%' },
      { width: `${target}%`, duration, delay, ease: 'power3.out' },
    );
    return () => {
      tween.kill();
    };
  }, [pct, duration, delay]);

  return ref;
}
```

- [ ] **Step 2: Criar o barrel export**

Create `src/lib/motion/index.ts`:

```ts
export { prefersReducedMotion } from './prefersReducedMotion';
export { useGsapCountUp } from './useGsapCountUp';
export type { CountUpOptions } from './useGsapCountUp';
export { useGsapReveal } from './useGsapReveal';
export { useGsapPress } from './useGsapPress';
export { Pressable } from './Pressable';
export { useGsapFill } from './useGsapFill';
export type { FillOptions } from './useGsapFill';
```

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/motion/useGsapFill.ts src/lib/motion/index.ts
git commit -m "feat(motion): useGsapFill + barrel export"
```

---

## Task 6: Componente `ProgressBar` (DRY para metas/missões)

**Files:**
- Create: `src/components/dashboard/ProgressBar.tsx`

- [ ] **Step 1: Criar o componente**

Create `src/components/dashboard/ProgressBar.tsx`:

```tsx
import { useGsapFill } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Barra de progresso v2: track fininho (6px) com fill animado por GSAP.
 * `color` é uma classe bg-* (default azul da marca).
 */
export function ProgressBar({
  pct,
  color = 'bg-primary-600',
  className,
}: {
  pct: number;
  color?: string;
  className?: string;
}) {
  const fillRef = useGsapFill<HTMLDivElement>(pct);
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-200', className)}>
      <div ref={fillRef} className={cn('h-full rounded-full', color)} style={{ width: 0 }} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ProgressBar.tsx
git commit -m "feat(dashboard): ProgressBar com fill GSAP"
```

---

## Task 7: Refatorar `MetricCard` para v2 (GSAP, 8px, sem Framer Motion)

**Files:**
- Modify: `src/components/dashboard/MetricCard.tsx` (substituição completa)

- [ ] **Step 1: Substituir o arquivo inteiro**

Replace the full contents of `src/components/dashboard/MetricCard.tsx` with:

```tsx
import React, { useRef } from 'react';
import gsap from 'gsap';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGsapCountUp, prefersReducedMotion } from '@/lib/motion';

export type MetricAccent = 'blue' | 'amber' | 'green' | 'red';

// Paleta da marca: azul (#1F6FE5 = primary-600) + cores de status.
const ACCENT: Record<MetricAccent, { dot: string; bar: string; border: string }> = {
  blue:  { dot: 'bg-primary-600', bar: 'bg-primary-600', border: 'hover:border-primary-300' },
  amber: { dot: 'bg-amber-500',   bar: 'bg-amber-500',   border: 'hover:border-amber-300' },
  green: { dot: 'bg-green-600',   bar: 'bg-green-600',   border: 'hover:border-green-300' },
  red:   { dot: 'bg-red-600',     bar: 'bg-red-600',     border: 'hover:border-red-300' },
};

export interface Metric {
  label: string;
  value: number | string;
  sub?: React.ReactNode;
  onClick?: () => void;
  accent?: MetricAccent;
}

function MetricCard({ label, value, sub, onClick, accent = 'blue' }: Metric) {
  const a = ACCENT[accent];
  const numeric = typeof value === 'number';
  const countRef = useGsapCountUp<HTMLSpanElement>(numeric ? (value as number) : 0, { duration: 0.65 });
  const cardRef = useRef<HTMLDivElement>(null);

  const lift = (y: number, duration: number) => {
    if (!onClick || prefersReducedMotion() || !cardRef.current) return;
    gsap.to(cardRef.current, { y, duration, ease: 'power2.out' });
  };

  return (
    <div
      ref={cardRef}
      data-reveal
      onClick={onClick}
      onMouseEnter={() => lift(-3, 0.25)}
      onMouseLeave={() => lift(0, 0.3)}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-surface-200 bg-card-bg p-5 transition-colors duration-200',
        onClick && cn('cursor-pointer', a.border),
      )}
    >
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-text-secondary">
          <span className={cn('h-1.5 w-1.5 rounded-full transition-transform duration-300 group-hover:scale-[1.6]', a.dot)} />
          {label}
        </span>
        {onClick && (
          <ArrowUpRight
            size={16}
            className="-translate-x-1 text-surface-300 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-text-primary group-hover:opacity-100"
          />
        )}
      </div>

      <div className="relative mt-4">
        {numeric ? (
          <span ref={countRef} className="text-[2rem] font-bold leading-none tracking-tight tabular-nums text-text-primary">
            0
          </span>
        ) : (
          <span className="text-[2rem] font-bold leading-none tracking-tight tabular-nums text-text-primary">
            {value}
          </span>
        )}
        {sub && <p className="mt-2 text-xs text-text-secondary">{sub}</p>}
      </div>

      {/* linha de destaque que cresce da esquerda no hover */}
      <span
        aria-hidden
        className={cn('absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100', a.bar)}
      />
    </div>
  );
}

const COLS: Record<number, string> = {
  2: '@md:grid-cols-2',
  3: '@md:grid-cols-3',
  4: '@md:grid-cols-2 @4xl:grid-cols-4',
};

/** Grade responsiva de cards de métrica. */
export function MetricGrid({ items, className }: { items: Metric[]; className?: string }) {
  const cols = COLS[items.length] ?? '@md:grid-cols-3';
  return (
    <div className={cn('grid grid-cols-1 gap-3', cols, className)}>
      {items.map((m, i) => (
        <MetricCard key={i} {...m} />
      ))}
    </div>
  );
}
```

Mudanças-chave: `rounded-xl`→`rounded-lg` (8px), removido Framer Motion e o spotlight/sombra, count-up via GSAP, `font-semibold`→`font-bold`, `data-reveal` para o stagger do container, hover-lift via GSAP só quando clicável.

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/MetricCard.tsx
git commit -m "refactor(dashboard): MetricCard v2 minimal + GSAP count-up"
```

---

## Task 8: Ajustar `StatRow`/`Segmented` (raios v2 + press)

**Files:**
- Modify: `src/components/dashboard/StatRow.tsx`

- [ ] **Step 1: Trocar `useCountUp` por `useGsapCountUp` no CellValue**

In `src/components/dashboard/StatRow.tsx`, replace the import line:

```tsx
import { useCountUp } from '@/hooks/useCountUp';
```

with:

```tsx
import { useGsapCountUp } from '@/lib/motion';
```

Then replace the `CellValue` function:

```tsx
function CellValue({ value }: { value: number | string }) {
  const numeric = typeof value === 'number';
  const countRef = useGsapCountUp<HTMLSpanElement>(numeric ? (value as number) : 0, { duration: 0.65 });
  if (!numeric) {
    return (
      <span className="text-[2rem] font-bold leading-none tracking-tight tabular-nums text-text-primary">
        {value}
      </span>
    );
  }
  return (
    <span ref={countRef} className="text-[2rem] font-bold leading-none tracking-tight tabular-nums text-text-primary">
      0
    </span>
  );
}
```

- [ ] **Step 2: Reduzir o raio do container StatRow (12px→8px)**

In the `StatRow` function, replace:

```tsx
        'grid grid-cols-1 overflow-hidden rounded-xl border border-surface-200 bg-card-bg',
```

with:

```tsx
        'grid grid-cols-1 overflow-hidden rounded-lg border border-surface-200 bg-card-bg',
```

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: PASS. (O `Segmented` já usa `rounded-lg`/`rounded-md` — nada a mudar nele.)

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/StatRow.tsx
git commit -m "refactor(dashboard): StatRow v2 raios + GSAP count-up"
```

---

## Task 9: Prop aditiva `square` no `PremiumCard`

**Files:**
- Modify: `src/components/ui/PremiumComponents.tsx`

- [ ] **Step 1: Adicionar a prop sem mudar o default**

In `src/components/ui/PremiumComponents.tsx`, replace the `PremiumCardProps` interface and `PremiumCard` component (lines 5-25) with:

```tsx
interface PremiumCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  highlight?: boolean;
  /** v2: cantos mais retos (8px) em vez do default arredondado (12px). */
  square?: boolean;
}

export const PremiumCard = ({ children, className, highlight, square, ...props }: PremiumCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 } as any}
      animate={{ opacity: 1, y: 0 } as any}
      className={cn(
        "bg-card-bg p-5 border border-surface-200 transition-colors duration-200",
        square ? "rounded-lg" : "rounded-xl",
        highlight && "border-primary-300/40 bg-gradient-to-br from-card-bg to-primary-50/30 dark:to-primary-900/10",
        className
      )}
      {...(props as any)}
    >
      {children}
    </motion.div>
  );
};
```

Observação: o default (`square` ausente) continua `rounded-xl` — telas de produção não mudam. Só o Dashboard passa `square`.

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/PremiumComponents.tsx
git commit -m "feat(ui): PremiumCard ganha prop aditiva square (v2)"
```

---

## Task 10: `SalesProgressCard` v2 (raios 8px)

**Files:**
- Modify: `src/components/dashboard/SalesProgressCard.tsx`

- [ ] **Step 1: Reduzir o raio do card externo**

In `src/components/dashboard/SalesProgressCard.tsx`, replace:

```tsx
      className={`rounded-xl border p-5 transition-colors duration-300 ${
```

with:

```tsx
      className={`rounded-lg border p-5 transition-colors duration-300 ${
```

- [ ] **Step 2: Reduzir o raio do bloco de indicadores e das linhas de venda**

Replace (bloco "Summary indicators"):

```tsx
      <div className="flex items-stretch mb-3 rounded-xl overflow-hidden border border-black/5 dark:border-black/20 bg-black/5 dark:bg-black/20">
```

with:

```tsx
      <div className="flex items-stretch mb-3 rounded-lg overflow-hidden border border-black/5 dark:border-black/20 bg-black/5 dark:bg-black/20">
```

Then replace the per-sale row container:

```tsx
                className={`bg-white dark:bg-green-950 rounded-xl px-3 py-2.5 shadow-xs border ${
```

with:

```tsx
                className={`bg-white dark:bg-green-950 rounded-lg px-3 py-2.5 shadow-xs border ${
```

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/SalesProgressCard.tsx
git commit -m "refactor(dashboard): SalesProgressCard v2 raios 8px"
```

---

## Task 11: `Dashboard.tsx` — reveal, header, chips, barras, botões

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Imports dos primitivos**

In `src/pages/Dashboard.tsx`, after the existing import of `ProgressBar`'s neighbors, add to the import block (logo após a linha que importa `SalesProgressCard`):

```tsx
import { useGsapReveal, Pressable } from '@/lib/motion';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
```

- [ ] **Step 2: Container com reveal**

Replace the outer wrapper opening tag:

```tsx
    <div className="@container mx-auto max-w-6xl px-2 py-8 space-y-8">
```

with:

```tsx
    <div ref={useGsapReveal<HTMLDivElement>()} className="@container mx-auto max-w-6xl px-2 py-8 space-y-8">
```

- [ ] **Step 3: Header com divisória + marcação reveal**

Replace the header block:

```tsx
      {/* Header */}
      <div className="flex justify-between items-center pt-2">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            Olá, {userName.split(' ')[0]}
            {loading && <Loader2 className="animate-spin text-gold-500" size={18} />}
          </h1>
          <p className="text-text-secondary text-sm">{roleLabel[role] ?? 'Visão geral'}</p>
        </div>
        <div className="z-50 relative lg:hidden">
          <NotificationBell />
        </div>
      </div>
```

with:

```tsx
      {/* Header */}
      <div data-reveal className="flex justify-between items-center border-b border-surface-200 pb-5 pt-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">{roleLabel[role] ?? 'Visão geral'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary flex items-center gap-2">
            Olá, {userName.split(' ')[0]}
            {loading && <Loader2 className="animate-spin text-primary-600" size={18} />}
          </h1>
        </div>
        <div className="z-50 relative lg:hidden">
          <NotificationBell />
        </div>
      </div>
```

- [ ] **Step 4: Chips de período mobile → raio 6px + azul da marca**

In the mobile period selector, replace both occurrences of the active/inactive chip classes. First, the two fixed chips (`este_mes`, `30_dias`):

```tsx
              className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                period === id
                  ? 'bg-gold-500 text-white border-gold-500 shadow-sm'
                  : 'bg-card-bg text-text-secondary border-surface-200 hover:border-gold-300'
              }`}
```

with:

```tsx
              className={`px-4 py-2 rounded-md text-xs font-semibold border transition-all ${
                period === id
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-card-bg text-text-secondary border-surface-200 hover:border-primary-300'
              }`}
```

Then the "Mais" dropdown trigger:

```tsx
              className={`flex items-center gap-1 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                ['60_dias', '90_dias', 'custom'].includes(period)
                  ? 'bg-gold-500 text-white border-gold-500 shadow-sm'
                  : 'bg-card-bg text-text-secondary border-surface-200 hover:border-gold-300'
              }`}
```

with:

```tsx
              className={`flex items-center gap-1 px-4 py-2 rounded-md text-xs font-semibold border transition-all ${
                ['60_dias', '90_dias', 'custom'].includes(period)
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-card-bg text-text-secondary border-surface-200 hover:border-primary-300'
              }`}
```

- [ ] **Step 5: Trocar as barras de meta/missão por `ProgressBar` (4 ocorrências)**

As 4 barras de progresso de metas/missões são idênticas. Use replace_all para trocar todas de uma vez. Replace:

```tsx
                                <div className="h-2 w-full bg-surface-200 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-700 ${progressColor}`} style={{ width: `${pct}%` }} />
                                </div>
```

with:

```tsx
                                <ProgressBar pct={pct} color={progressColor} />
```

(Aplique a TODAS as ocorrências — `Edit` com `replace_all: true`.)

- [ ] **Step 6: Botões primários com `Pressable`**

Replace the empty-state "Novo agendamento" button:

```tsx
                    <button
                      onClick={() => navigate('/schedule')}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                    >
                      <Plus size={15} /> Novo agendamento
                    </button>
```

with:

```tsx
                    <Pressable
                      onClick={() => navigate('/schedule')}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
                    >
                      <Plus size={15} /> Novo agendamento
                    </Pressable>
```

- [ ] **Step 7: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "refactor(dashboard): v2 reveal + header + chips + barras GSAP + Pressable"
```

---

## Task 12: Build + verificação no preview

**Files:** nenhum (verificação)

- [ ] **Step 1: Build de produção local**

Run: `npm run build`
Expected: build conclui sem erros; `gsap` entra no bundle.

- [ ] **Step 2: Rodar dev e checar manualmente**

Run: `npm run dev`
Abrir `http://localhost:3000`, logar e abrir o Dashboard. Verificar:
- Entrada em stagger (cards sobem + fade em cascata).
- Números contam de 0 ao valor.
- Barras de metas/missões preenchem animadas.
- Hover/press nos chips e no botão "Novo agendamento".
- Cantos 8px nos cards, 6px nos chips/botões; header com linha divisória.
- Nenhum número/cálculo do Dashboard mudou em relação à produção.

- [ ] **Step 3: Checar reduced-motion**

No SO/navegador, ativar "reduzir movimento" e recarregar: tudo deve aparecer no estado final, sem animação.

- [ ] **Step 4: Push para gerar o preview Vercel**

```bash
git push origin feature/sidebar-v2
```

Expected: Vercel gera um preview deploy. **Não** abrir PR para `main`. Validar na URL de preview.

---

## Self-Review (cobertura do spec)

- §3 tokens/geometria (8px/6px, hairlines, número herói) → Tasks 7–11. ✓
- §5.1 useGsapCountUp → Task 2; usado em Tasks 7, 8. ✓
- §5.2 useGsapReveal → Task 3; usado em Task 11 (container + `data-reveal`). ✓
- §5.3 Pressable/useGsapPress → Task 4; usado em Task 11 (botão) e disponível p/ chips. ✓
- §5.4 useGsapFill → Task 5; usado via `ProgressBar` (Task 6) em Task 11. ✓
- §2 reduced-motion → tratado em cada primitivo (Tasks 2–6). ✓
- §6 preview-only → Task 12 Step 4 (push sem PR). ✓
- §7 dependência gsap → Task 1. ✓
- §10 mudanças aditivas em compartilhados → Task 9 (`square` opcional). ✓
- §8 verificação build/preview/reduced-motion/responsivo → Task 12. ✓

Nenhum placeholder; tipos consistentes entre tasks (`useGsapCountUp<HTMLSpanElement>`, `ProgressBar` props `pct`/`color`, `Pressable` repassa props).
