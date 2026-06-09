import React from 'react';
import { cn } from '@/lib/utils';
import { useGsapCountUp } from '@/lib/motion';

export interface StatCell {
  label: string;
  value: number | string;
  sub?: React.ReactNode;
  onClick?: () => void;
  /** Tailwind bg-* class for the small status dot next to the label. */
  dot?: string;
}

function CellValue({ value }: { value: number | string }) {
  const numeric = typeof value === 'number';
  const countRef = useGsapCountUp<HTMLSpanElement>(numeric ? (value as number) : 0, { duration: 0.65 });
  if (!numeric) {
    return (
      <span className="text-[2rem] font-bold leading-none tracking-tight tabular-nums text-text-primary">
        {value}
      </span>
    );
  }
  return (
    <span ref={countRef} className="text-[2rem] font-bold leading-none tracking-tight tabular-nums text-text-primary">
      0
    </span>
  );
}

const COLS: Record<number, string> = {
  2: '@2xl:grid-cols-2',
  3: '@2xl:grid-cols-3',
  4: '@2xl:grid-cols-4',
};

/**
 * Vercel/Geist-style metric row: one bordered, rounded container split into
 * equal cells by shared hairline dividers. Stacks vertically (divide-y) on
 * narrow widths, becomes a single bordered row (divide-x) when wide.
 */
export function StatRow({ items, className }: { items: StatCell[]; className?: string }) {
  const cols = COLS[items.length] ?? '@2xl:grid-cols-3';
  return (
    <div
      className={cn(
        'grid grid-cols-1 overflow-hidden rounded-2xl border border-surface-200/60 bg-card-bg premium-shadow',
        'divide-y divide-surface-200 @2xl:divide-y-0 @2xl:divide-x',
        cols,
        className,
      )}
    >
      {items.map((s, i) => {
        const inner = (
          <div className="flex h-full flex-col gap-3 p-5">
            <span className="flex items-center gap-2 text-sm font-medium text-text-secondary">
              {s.dot && <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />}
              {s.label}
            </span>
            <CellValue value={s.value} />
            {s.sub && <span className="text-xs text-text-secondary">{s.sub}</span>}
          </div>
        );
        return s.onClick ? (
          <button key={i} onClick={s.onClick} className="group text-left transition-colors hover:bg-surface-50">
            {inner}
          </button>
        ) : (
          <div key={i}>{inner}</div>
        );
      })}
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Vercel-style segmented control (track + sliding active pill). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-0.5 rounded-xl border border-surface-200 bg-surface-100/70 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value
              ? 'bg-card-bg text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
