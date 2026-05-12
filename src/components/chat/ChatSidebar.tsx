import { useState } from 'react';
import { Search, PenSquare, MoreHorizontal, Users, X, Check } from 'lucide-react';
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const filtered = search.trim()
    ? conversations.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  return (
    <div className="relative flex flex-col h-full bg-card-bg border-r border-surface-200 dark:border-surface-100/10">
      <div className="px-4 pt-5 pb-3 flex items-center justify-between flex-shrink-0 relative">
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
        <div className="flex items-center gap-1">
          {onNewConversation && (
            <button
              onClick={onNewConversation}
              className="p-2 rounded-xl text-text-secondary hover:text-gold-600 hover:bg-gold-50 dark:hover:bg-gold-900/20 transition-colors"
              title="Nova conversa"
            >
              <PenSquare size={17} />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-100 dark:hover:bg-surface-200/10 transition-colors"
              title="Mais opções"
            >
              <MoreHorizontal size={17} />
            </button>
            <AnimatePresence>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 bg-card-bg border border-surface-200 rounded-2xl shadow-xl overflow-hidden z-20 min-w-[180px]"
                  >
                    <button
                      onClick={() => { setShowMoreMenu(false); setShowCreateGroup(true); }}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-text-primary hover:bg-surface-100 transition-colors"
                    >
                      <Users size={16} className="text-primary-600" />
                      Criar grupo
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
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

      {/* Create Group Modal */}
      <AnimatePresence>
        {showCreateGroup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-black/40 backdrop-blur-sm flex items-end"
            onClick={() => setShowCreateGroup(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full bg-card-bg rounded-t-3xl p-5"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-text-primary text-base">Criar grupo</h3>
                <button
                  onClick={() => { setShowCreateGroup(false); setGroupName(''); setSelectedMembers([]); }}
                  className="p-1.5 rounded-xl text-text-secondary hover:bg-surface-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <input
                type="text"
                placeholder="Nome do grupo"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-surface-100 dark:bg-surface-200/10 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary-400/40 mb-4"
              />
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">Participantes</p>
              <div className="flex flex-wrap gap-2 mb-4 max-h-32 overflow-y-auto">
                {conversations.filter(c => !c.isKAI).map(c => (
                  <button
                    key={c.otherId}
                    onClick={() => setSelectedMembers(prev =>
                      prev.includes(c.otherId) ? prev.filter(id => id !== c.otherId) : [...prev, c.otherId]
                    )}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedMembers.includes(c.otherId)
                        ? 'bg-primary-600 text-white'
                        : 'bg-surface-100 text-text-secondary hover:bg-surface-200'
                    }`}
                  >
                    {selectedMembers.includes(c.otherId) && <Check size={10} />}
                    {c.name}
                  </button>
                ))}
                {conversations.filter(c => !c.isKAI).length === 0 && (
                  <p className="text-xs text-text-secondary">Inicie conversas primeiro para adicionar membros.</p>
                )}
              </div>
              <button
                onClick={() => {
                  alert('Funcionalidade de grupos em breve! 🚀');
                  setShowCreateGroup(false);
                  setGroupName('');
                  setSelectedMembers([]);
                }}
                disabled={!groupName.trim()}
                className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-700 transition-colors"
              >
                Criar grupo
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
