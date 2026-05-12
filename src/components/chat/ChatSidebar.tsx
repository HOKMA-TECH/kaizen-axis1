import { useState } from 'react';
import { Search, PenSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatKaiCard } from './ChatKaiCard';
import { ChatConversationItem, ConversationItemData } from './ChatConversationItem';

interface ChatSidebarProps {
  conversations: ConversationItemData[];
  selectedId: string | null;
  totalUnread: number;
  onSelect: (id: string) => void;
  onKaiClick: () => void;
  onNewConversation?: () => void;
  onContextMenu?: (e: React.MouseEvent, convo: ConversationItemData) => void;
  onTouchStart?: (e: React.TouchEvent, convo: ConversationItemData) => void;
  onTouchEnd?: () => void;
  loading?: boolean;
}

export function ChatSidebar({
  conversations, selectedId, totalUnread, onSelect, onKaiClick,
  onNewConversation, onContextMenu, onTouchStart, onTouchEnd, loading,
}: ChatSidebarProps) {
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);

  const filtered = search.trim()
    ? conversations.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  return (
    <div className="flex flex-col h-full bg-card-bg border-r border-surface-200 dark:border-surface-100/10">
      <div className="px-4 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-text-primary">Mensagens</h2>
          {totalUnread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="min-w-5 h-5 px-1.5 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </motion.span>
          )}
        </div>
        {onNewConversation && (
          <button
            onClick={onNewConversation}
            className="p-2 rounded-xl text-text-secondary hover:text-gold-600 hover:bg-gold-50 dark:hover:bg-gold-900/20 transition-colors"
            title="Nova conversa"
          >
            <PenSquare size={17} />
          </button>
        )}
      </div>

      <div className="px-3 flex-shrink-0">
        <ChatKaiCard onClick={onKaiClick} isSelected={selectedId === 'kai-agent'} />
      </div>

      <div className="px-3 pb-2 flex-shrink-0">
        <motion.div
          animate={{ boxShadow: focused ? '0 0 0 2px rgba(212,175,55,0.35)' : '0 0 0 0px transparent' }}
          transition={{ duration: 0.12 }}
          className="relative rounded-xl overflow-hidden"
        >
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
          <input
            type="text"
            placeholder="Pesquisar conversas..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="w-full pl-8 pr-3 py-2 bg-surface-100 dark:bg-surface-200/10 rounded-xl text-sm text-text-primary focus:outline-none placeholder:text-text-secondary"
          />
        </motion.div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-1">
        <AnimatePresence mode="popLayout">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 rounded-full border-2 border-surface-200 border-t-primary-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-sm text-text-secondary py-10"
            >
              {search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
            </motion.p>
          ) : (
            filtered.map((convo, i) => (
              <motion.div
                key={convo.conversationId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.2 }}
              >
                <ChatConversationItem
                  convo={convo}
                  isSelected={selectedId === convo.otherId}
                  onClick={() => onSelect(convo.otherId)}
                  onContextMenu={onContextMenu ? e => onContextMenu(e, convo) : undefined}
                  onTouchStart={onTouchStart ? e => onTouchStart(e, convo) : undefined}
                  onTouchEnd={onTouchEnd}
                />
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
