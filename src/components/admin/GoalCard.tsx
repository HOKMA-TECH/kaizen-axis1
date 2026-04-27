import { Goal } from '@/data/admin';
import { PremiumCard } from '@/components/ui/PremiumComponents';
import { Target, Calendar, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GoalCardProps {
  goal: Goal;
}

export function GoalCard({ goal }: GoalCardProps) {
  const progressPercent = Math.min(100, Math.round((goal.currentProgress / goal.target) * 100));
  
  return (
    <PremiumCard className="p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-gold-100 to-transparent dark:from-gold-900/20 rounded-bl-full -mr-4 -mt-4 opacity-50" />
      
      <div className="flex justify-between items-start mb-2 relative z-10">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-gold-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface-100 px-2 py-0.5 rounded-full">
            {goal.type}
          </span>
        </div>
        <span className="text-xs font-medium text-text-secondary flex items-center gap-1">
          <Calendar size={12} /> {new Date(goal.deadline).toLocaleDateString()}
        </span>
      </div>

      <h4 className="font-bold text-text-primary text-sm mb-1">{goal.title}</h4>
      <p className="text-xs text-text-secondary mb-4 line-clamp-2">{goal.description}</p>

      <div className="space-y-1">
        <div className="flex justify-between text-xs font-medium">
          <span className="text-text-secondary">Progresso</span>
          <span className={cn(progressPercent >= 100 ? "text-green-600" : "text-gold-600")}>
            {progressPercent}%
          </span>
        </div>
        <div className="h-2 w-full bg-surface-100 rounded-full overflow-hidden">
          <div 
            className={cn("h-full rounded-full transition-all duration-1000", progressPercent >= 100 ? "bg-green-500" : "bg-gold-500")}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-text-secondary mt-1">
          <span>{goal.currentProgress.toLocaleString('pt-BR')}</span>
          <span>Meta: {goal.target.toLocaleString('pt-BR')}</span>
        </div>
      </div>
    </PremiumCard>
  );
}
