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
