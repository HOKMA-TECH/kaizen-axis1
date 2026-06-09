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
