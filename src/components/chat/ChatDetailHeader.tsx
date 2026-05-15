import { MoreVertical, Bot, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getColor, getInitials } from '@/lib/chat-utils';
import { useEffect, useState } from 'react';

interface ChatDetailHeaderProps {
  name: string;
  role?: string;
  avatarUrl?: string | null;
  otherId: string;
  isKAI?: boolean;
  isOnline?: boolean;
  onBack?: () => void;
  onMore?: () => void;
  onProfileClick?: () => void;
}

export function ChatDetailHeader({
  name, role, avatarUrl, otherId, isKAI, isOnline, onBack, onMore, onProfileClick,
}: ChatDetailHeaderProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showAvatar = Boolean(avatarUrl && !avatarFailed);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl, otherId]);

  const identity = (
    <>
      <div className="relative flex-shrink-0">
        {isKAI ? (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-indigo-500 flex items-center justify-center">
            <Bot size={16} className="text-white" />
          </div>
        ) : showAvatar ? (
          <img
            src={avatarUrl}
            alt={name}
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <div className={cn(
            'w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-semibold text-[11px]',
            getColor(otherId)
          )}>
            {getInitials(name)}
          </div>
        )}
        {isOnline && !isKAI && (
          <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-card-bg" />
        )}
      </div>

      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-text-primary truncate">{name}</p>
        <p className="text-[11px] text-text-secondary truncate">
          {isKAI ? 'Assistente Inteligente' : isOnline ? (
            <span className="text-emerald-500 font-medium">● Online</span>
          ) : role || 'Offline'}
        </p>
      </div>
    </>
  );

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-100/10 bg-card-bg flex-shrink-0">
      {onBack && (
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-100 transition-colors lg:hidden"
        >
          <ArrowLeft size={18} />
        </button>
      )}

      {onProfileClick && !isKAI ? (
        <button
          type="button"
          onClick={onProfileClick}
          className="flex flex-1 min-w-0 items-center gap-3 rounded-xl -my-1 py-1 pr-2 hover:bg-surface-100 dark:hover:bg-surface-200/10 transition-colors"
        >
          {identity}
        </button>
      ) : (
        <div className="flex flex-1 min-w-0 items-center gap-3">
          {identity}
        </div>
      )}

      <div className="flex items-center gap-1 flex-shrink-0">
        {onMore && (
          <button
            onClick={onMore}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-100 dark:hover:bg-surface-200/10 transition-colors"
            title="Mais opcoes"
          >
            <MoreVertical size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
