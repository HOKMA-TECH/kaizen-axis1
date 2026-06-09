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
