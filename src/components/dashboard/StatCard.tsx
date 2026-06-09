import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCountUp } from '@/hooks/useCountUp';

export type StatAccent = 'blue' | 'green' | 'orange' | 'purple' | 'red';

const ACCENTS: Record<StatAccent, { chip: string; value: string; hoverRing: string }> = {
  blue:   { chip: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',     value: 'text-text-primary', hoverRing: 'hover:border-blue-400/60' },
  green:  { chip: 'bg-green-500/15 text-green-600 dark:text-green-300',   value: 'text-green-600 dark:text-green-400', hoverRing: 'hover:border-green-400/60' },
  orange: { chip: 'bg-orange-500/15 text-orange-600 dark:text-orange-300', value: 'text-text-primary', hoverRing: 'hover:border-orange-400/60' },
  purple: { chip: 'bg-purple-500/15 text-purple-600 dark:text-purple-300', value: 'text-text-primary', hoverRing: 'hover:border-purple-400/60' },
  red:    { chip: 'bg-red-500/15 text-red-600 dark:text-red-300',         value: 'text-red-600 dark:text-red-400', hoverRing: 'hover:border-red-400/60' },
};

/** Shared glass surface used by all bento tiles. */
export const GLASS =
  'bg-white/55 dark:bg-white/[0.06] backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-lg shadow-blue-900/[0.06]';

interface StatCardProps {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: StatAccent;
  /** Hero mode: bold gradient tile. */
  highlight?: boolean;
  onClick?: () => void;
  className?: string;
}

export function StatCard({ icon: Icon, label, value, sub, accent = 'blue', highlight, onClick, className }: StatCardProps) {
  const a = ACCENTS[accent];
  const interactive = Boolean(onClick);
  const numeric = typeof value === 'number';
  const counted = useCountUp(numeric ? (value as number) : 0);
  const display = numeric ? counted : value;

  if (highlight) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 } as any}
        animate={{ opacity: 1, y: 0 } as any}
        whileHover={interactive ? ({ y: -4 } as any) : undefined}
        onClick={onClick}
        className={cn(
          'group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl p-7 text-white',
          'bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 shadow-xl shadow-blue-600/25',
          interactive && 'cursor-pointer',
          className,
        )}
      >
        <div className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
        {Icon && <Icon className="pointer-events-none absolute -right-3 -bottom-4 h-32 w-32 text-white/10" strokeWidth={1.5} />}
        {/* sparkline-ish decoration */}
        <svg className="pointer-events-none absolute bottom-0 left-0 w-full opacity-20" height="48" viewBox="0 0 200 48" preserveAspectRatio="none">
          <path d="M0 40 L25 30 L50 34 L75 18 L100 24 L125 10 L150 16 L175 6 L200 12" fill="none" stroke="white" strokeWidth="2.5" />
        </svg>

        <div className="relative flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-50/90">{label}</p>
          {interactive && (
            <span className="rounded-full bg-white/20 p-1.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
              <ArrowUpRight size={16} />
            </span>
          )}
        </div>
        <div className="relative mt-4">
          <h3 className="text-5xl font-bold leading-none tracking-tight tabular-nums">{display}</h3>
          {sub && <p className="mt-2.5 text-sm font-medium text-blue-50/85">{sub}</p>}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 } as any}
      animate={{ opacity: 1, y: 0 } as any}
      whileHover={interactive ? ({ y: -4 } as any) : undefined}
      onClick={onClick}
      className={cn(
        'group relative flex h-full flex-col justify-between gap-4 rounded-3xl p-5 transition-colors duration-200',
        GLASS,
        interactive && cn('cursor-pointer hover:shadow-xl hover:shadow-blue-900/10', a.hoverRing),
        className,
      )}
    >
      <div className="flex items-center justify-between">
        {Icon ? (
          <span className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', a.chip)}>
            <Icon size={21} strokeWidth={2.2} />
          </span>
        ) : <span />}
        {interactive && (
          <ArrowUpRight size={16} className="text-surface-300 transition-all group-hover:text-text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        )}
      </div>
      <div>
        <h3 className={cn('text-4xl font-bold leading-none tracking-tight tabular-nums', a.value)}>{display}</h3>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</p>
        {sub && <p className="mt-1 text-xs text-text-secondary/80">{sub}</p>}
      </div>
    </motion.div>
  );
}

/** Auto-fit grid for StatCards — gains/loses columns with available width. */
export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-4 grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]', className)}>
      {children}
    </div>
  );
}
