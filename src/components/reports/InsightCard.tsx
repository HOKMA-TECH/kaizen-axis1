import { PremiumCard } from '@/components/ui/PremiumComponents';
import { Lightbulb, AlertTriangle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsightCardProps {
  title: string;
  description: string;
  impact: string;
  action: string;
  type: 'warning' | 'opportunity' | 'info';
  onActionClick?: () => void;
}

export function InsightCard({ title, description, impact, action, type, onActionClick }: InsightCardProps) {
  const getIcon = () => {
    switch (type) {
      case 'warning': return <AlertTriangle size={20} className="text-amber-500" />;
      case 'opportunity': return <TrendingUp size={20} className="text-green-500" />;
      default: return <Lightbulb size={20} className="text-gold-500" />;
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case 'warning': return 'border-l-amber-500';
      case 'opportunity': return 'border-l-green-500';
      default: return 'border-l-gold-500';
    }
  };

  return (
    <PremiumCard className={cn("border-l-4 p-4", getBorderColor())}>
      <div className="flex items-start gap-3">
        <div className="mt-1 flex-shrink-0 bg-surface-100 p-2 rounded-full">
          {getIcon()}
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-text-primary text-sm mb-1">{title}</h4>
          <p className="text-xs text-text-secondary mb-3 leading-relaxed">{description}</p>
          
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-surface-100">
            <span className="text-xs font-semibold text-text-primary">
              Impacto: <span className="text-gold-600 dark:text-gold-400">{impact}</span>
            </span>
            <button 
              onClick={onActionClick}
              className="text-xs font-bold text-gold-600 dark:text-gold-400 hover:underline cursor-pointer"
            >
              {action}
            </button>
          </div>
        </div>
      </div>
    </PremiumCard>
  );
}
