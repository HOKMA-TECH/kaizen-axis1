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
