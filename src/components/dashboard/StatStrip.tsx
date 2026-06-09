import React from 'react';
import { cn } from '@/lib/utils';
import { useCountUp } from '@/hooks/useCountUp';

export interface StatItem {
  label: string;
  value: number | string;
  onClick?: () => void;
  /** Renders the number in the accent color (use for the headline metric). */
  primary?: boolean;
}

function StatValue({ value, primary }: { value: number | string; primary?: boolean }) {
  const numeric = typeof value === 'number';
  const counted = useCountUp(numeric ? value : 0);
  return (
    <span
      className={cn(
        'block text-4xl font-semibold leading-none tracking-tight tabular-nums',
        primary ? 'text-blue-600 dark:text-blue-400' : 'text-text-primary',
      )}
    >
      {numeric ? counted : value}
    </span>
  );
}

/**
 * Minimal editorial KPI row: big numbers with small uppercase labels,
 * separated by hairline dividers. No boxes — quiet and compact, made for
 * dashboards that aren't data-heavy.
 */
export function StatStrip({ items, caption, className }: { items: StatItem[]; caption?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-y-6">
        {items.map((s, i) => {
          const body = (
            <>
              <StatValue value={s.value} primary={s.primary} />
              <span className="mt-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                {s.label}
              </span>
            </>
          );
          return (
            <div key={i} className={cn('px-7 first:pl-0', i > 0 && 'border-l border-surface-200')}>
              {s.onClick ? (
                <button onClick={s.onClick} className="text-left transition-opacity hover:opacity-60">
                  {body}
                </button>
              ) : (
                <div className="text-left">{body}</div>
              )}
            </div>
          );
        })}
      </div>
      {caption && <p className="mt-4 text-xs text-text-secondary">{caption}</p>}
    </div>
  );
}
