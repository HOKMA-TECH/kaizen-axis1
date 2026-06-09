import React from 'react';
import type { RefObject } from 'react';
import { useGsapReveal } from './useGsapReveal';

type RevealContainerProps = {
  /** Tag a renderizar (default 'div'). */
  as?: React.ElementType;
  children?: React.ReactNode;
} & Record<string, any>;

/**
 * Container que anima seus descendentes marcados com `[data-reveal]` em stagger
 * ao montar (sobe 14px + fade). Respeita prefers-reduced-motion.
 *
 * Uso: envolva a tela e marque as seções com `data-reveal`.
 *   <RevealContainer className="space-y-6">
 *     <section data-reveal>…</section>
 *     <section data-reveal>…</section>
 *   </RevealContainer>
 */
export function RevealContainer({ as, children, ...props }: RevealContainerProps) {
  const Comp = (as ?? 'div') as React.ElementType;
  const ref = useGsapReveal<HTMLElement>();
  return (
    <Comp ref={ref as RefObject<HTMLElement>} {...props}>
      {children}
    </Comp>
  );
}
