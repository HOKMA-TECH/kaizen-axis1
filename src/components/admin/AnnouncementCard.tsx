import { Announcement as AppAnnouncement } from '@/context/AppContext';
import { PremiumCard } from '@/components/ui/PremiumComponents';
import { Megaphone, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnnouncementCardProps {
  announcement: AppAnnouncement;
  onDelete?: (id: string) => void;
}

export function AnnouncementCard({ announcement, onDelete }: AnnouncementCardProps) {
  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'Urgente': return 'text-red-600 bg-red-50 border-red-200';
      case 'Importante': return 'text-amber-600 bg-amber-50 border-amber-200';
      default: return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const dateStr = announcement.start_date
    ? new Date(announcement.start_date).toLocaleDateString('pt-BR')
    : announcement.created_at
      ? new Date(announcement.created_at).toLocaleDateString('pt-BR')
      : null;

  return (
    <PremiumCard className="p-4 border-l-4 border-l-gold-500">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-gold-500" />
          {announcement.priority && (
            <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded border", getPriorityColor(announcement.priority))}>
              {announcement.priority}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dateStr && (
            <span className="text-[10px] text-text-secondary flex items-center gap-1">
              <Clock size={10} /> {dateStr}
            </span>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(announcement.id)}
              className="text-[10px] text-red-500 hover:underline"
            >
              Excluir
            </button>
          )}
        </div>
      </div>

      <h4 className="font-bold text-text-primary text-sm mb-1">{announcement.title}</h4>
      {announcement.content && <p className="text-xs text-text-secondary leading-relaxed">{announcement.content}</p>}
    </PremiumCard>
  );
}
