import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { prefersReducedMotion } from './prefersReducedMotion';

/**
 * Anima o conteúdo de uma página ao entrar / mudar de rota (fade + sobe 10px).
 * Passe `key` = pathname atual. Roda antes do paint (useLayoutEffect) para
 * evitar flash. Respeita prefers-reduced-motion.
 */
export function useGsapPageTransition<T extends HTMLElement = HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      gsap.set(el, { opacity: 1, y: 0 });
      return;
    }
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' },
    );
    return () => {
      tween.kill();
    };
  }, [key]);
  return ref;
}
