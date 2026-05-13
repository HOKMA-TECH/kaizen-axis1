import { motion } from 'motion/react';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getColor, getInitials } from '@/lib/chat-utils';

export interface ConversationItemData {
  conversationId: string;
  otherId: string;
  isKAI: boolean;
  isGroup?: boolean;
  name: string;
  role: string;
  avatarUrl?: string | null;
  preview: string;
  timestamp: string;
  unreadCount: number;
  isOnline?: boolean;
}

interface ChatConversationItemProps {
  convo: ConversationItemData;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: () => void;
}

export function ChatConversationItem({
  convo, isSelected, onClick, onContextMenu, onTouchStart, onTouchEnd,
}: ChatConversationItemProps) {
  return (
    <motion.button
      layout
      onClick={onClick}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      whileHover={{ x: 2 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors duration-150 text-left relative overflow-hidden',
        isSelected
          ? 'bg-primary-50 dark:bg-primary-900/20'
          : 'hover:bg-surface-100 dark:hover:bg-surface-200/10'
      )}
    >
      {isSelected && (
        <motion.div
          layoutId="chat-selected-bar"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-primary-500 rounded-r-full"
        />
      )}

      <div className="relative flex-shrink-0">
        {convo.isKAI ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-indigo-500 flex items-center justify-center">
            <Bot size={18} className="text-white" />
          </div>
        ) : convo.avatarUrl ? (
          <img
            src={convo.avatarUrl}
            alt={convo.name}
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className={cn(
            'w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-semibold text-[11px]',
            getColor(convo.otherId)
          )}>
            {getInitials(convo.name)}
          </div>
        )}
        {convo.isOnline && !convo.isKAI && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-card-bg" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className={cn(
            'text-sm truncate',
            convo.unreadCount > 0 ? 'font-bold text-text-primary' : 'font-semibold text-text-primary'
          )}>
            {convo.name}
          </p>
          <span className="text-[10px] text-text-secondary flex-shrink-0 ml-2">
            {convo.timestamp}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1">
          <p className={cn(
            'text-xs truncate',
            convo.unreadCount > 0 ? 'text-text-primary font-medium' : 'text-text-secondary'
          )}>
            {convo.preview}
          </p>
          {convo.unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="flex-shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {convo.unreadCount > 99 ? '99+' : convo.unreadCount}
            </motion.span>
          )}
        </div>
      </div>
    </motion.button>
  );
}
