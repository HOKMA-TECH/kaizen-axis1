import { useLayoutEffect, useRef } from 'react';
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

  useLayoutEffect(() => {
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
