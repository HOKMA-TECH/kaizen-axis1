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
