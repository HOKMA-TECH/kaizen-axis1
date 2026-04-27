import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PremiumCard } from '@/components/ui/PremiumComponents';

interface MetricCardProps {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  period: string;
  inverse?: boolean; // If true, 'down' is good (green) and 'up' is bad (red)
}

export function MetricCard({ label, value, change, trend, period, inverse = false }: MetricCardProps) {
  const isPositive = trend === 'up';
  const isGood = inverse ? !isPositive : isPositive;
  
  const trendColor = isGood ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
  const TrendIcon = trend === 'up' ? ArrowUpRight : (trend === 'down' ? ArrowDownRight : Minus);

  return (
    <PremiumCard className="flex flex-col justify-between h-full p-4">
      <div>
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">{label}</p>
        <h3 className="text-2xl font-bold text-text-primary mb-2">{value}</h3>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("flex items-center text-xs font-bold bg-surface-100 px-1.5 py-0.5 rounded-md", trendColor)}>
          <TrendIcon size={12} className="mr-1" />
          {change}
        </span>
        <span className="text-[10px] text-text-secondary">{period}</span>
      </div>
    </PremiumCard>
  );
}
