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
