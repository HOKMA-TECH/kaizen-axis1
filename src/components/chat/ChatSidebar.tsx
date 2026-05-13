import { useState, useRef } from 'react';
import { Search, PenSquare, MoreHorizontal, Users, X, Check, UserCircle, Camera, MessageSquarePlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { getColor, getInitials } from '@/lib/chat-utils';
import { ChatKaiCard } from './ChatKaiCard';
import { ChatConversationItem, ConversationItemData } from './ChatConversationItem';

type Availability = 'available' | 'busy' | 'dnd';

const AVAILABILITY_OPTIONS: { value: Availability; label: string; color: string }[] = [
  { value: 'available', label: 'Disponível',     color: 'bg-emerald-500' },
  { value: 'busy',      label: 'Ocupado',         color: 'bg-yellow-400' },
  { value: 'dnd',       label: 'Não perturbe',    color: 'bg-red-500' },
];

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
  const { user, profile, allProfiles, updateProfile } = useApp();
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Perfil modal
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [profileAvailability, setProfileAvailability] = useState<Availability>('available');
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const openProfile = () => {
    setProfileName(profile?.chat_display_name || profile?.name || '');
    setProfileStatus(profile?.chat_status_text || '');
    setProfileAvailability((profile?.chat_availability as Availability) || 'available');
    setProfileAvatar(profile?.chat_avatar_url || profile?.avatar_url || null);
    setShowMoreMenu(false);
    setShowProfile(true);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `chat-avatars/${user.id}.${ext}`;
    const { error } = await supabase.storage.from('chat-media').upload(path, file, { upsert: true, contentType: file.type });
    if (!error) {
      const url = supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
      setProfileAvatar(url);
    }
    e.target.value = '';
  };

  const saveProfile = async () => {
    if (!user?.id) return;
    setSavingProfile(true);
    await updateProfile(user.id, {
      chat_display_name: profileName.trim() || null,
      chat_status_text: profileStatus.trim() || null,
      chat_availability: profileAvailability,
      chat_avatar_url: profileAvatar || null,
    });
    setSavingProfile(false);
    setShowProfile(false);
  };

  const searchTerm = search.trim().toLowerCase();

  const filtered = searchTerm
    ? conversations.filter(c => c.name.toLowerCase().includes(searchTerm))
    : conversations;

  // Users without an existing conversation that match the search
  const existingOtherIds = new Set(conversations.map(c => c.otherId));
  const newUsers = searchTerm
    ? (allProfiles ?? []).filter(p =>
        p.id !== user?.id &&
        !existingOtherIds.has(p.id) &&
        (p.name || '').toLowerCase().includes(searchTerm)
      )
    : [];

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
                      onClick={openProfile}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-text-primary hover:bg-surface-100 transition-colors"
                    >
                      <UserCircle size={16} className="text-primary-600" />
                      Perfil
                    </button>
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
          ) : filtered.length === 0 && newUsers.length === 0 ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-sm text-text-secondary py-10"
            >
              {search ? 'Nenhum resultado encontrado' : 'Nenhuma conversa ainda'}
            </motion.p>
          ) : (
            <>
              {filtered.map((convo, i) => (
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
              ))}

              {newUsers.length > 0 && (
                <motion.div key="new-users-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {filtered.length > 0 && (
                    <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-widest">
                      Iniciar conversa
                    </p>
                  )}
                  {newUsers.map((p, i) => (
                    <motion.button
                      key={p.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.2 }}
                      onClick={() => onSelect(p.id)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-2xl hover:bg-surface-100 dark:hover:bg-surface-200/10 transition-colors text-left"
                    >
                      <div className="relative flex-shrink-0">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt={p.name} referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className={cn(
                            'w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-semibold text-xs',
                            getColor(p.id)
                          )}>
                            {getInitials(p.name || '')}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{p.name}</p>
                        {p.role && <p className="text-[11px] text-text-secondary truncate">{p.role}</p>}
                      </div>
                      <MessageSquarePlus size={15} className="text-primary-500 flex-shrink-0" />
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-black/40 backdrop-blur-sm flex items-end"
            onClick={() => setShowProfile(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full bg-card-bg rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-text-primary text-base">Meu Perfil no Chat</h3>
                <button onClick={() => setShowProfile(false)} className="p-1.5 rounded-xl text-text-secondary hover:bg-surface-100 transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* Avatar */}
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <input ref={avatarInputRef} type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                  {profileAvatar ? (
                    <img src={profileAvatar} alt="avatar" className="w-20 h-20 rounded-full object-cover ring-2 ring-surface-200" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-surface-100 flex items-center justify-center ring-2 ring-surface-200">
                      <UserCircle size={36} className="text-text-secondary" />
                    </div>
                  )}
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary-600 text-white shadow-md hover:bg-primary-700 transition-colors"
                  >
                    <Camera size={12} />
                  </button>
                </div>
              </div>

              {/* Nome no chat */}
              <div className="mb-3">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest block mb-1.5">Nome no chat</label>
                <input
                  type="text"
                  placeholder={profile?.name || 'Seu nome'}
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-100 dark:bg-surface-200/10 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                />
              </div>

              {/* Status */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest block mb-1.5">Status</label>
                <input
                  type="text"
                  placeholder="Ex: No trabalho, Disponível para conversar..."
                  value={profileStatus}
                  onChange={e => setProfileStatus(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-100 dark:bg-surface-200/10 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                />
              </div>

              {/* Disponibilidade */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest block mb-2">Disponibilidade</label>
                <div className="flex flex-col gap-2">
                  {AVAILABILITY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setProfileAvailability(opt.value)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-colors text-sm font-medium ${
                        profileAvailability === opt.value
                          ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-text-primary'
                          : 'border-surface-200 bg-surface-50 dark:bg-surface-200/10 text-text-secondary hover:bg-surface-100'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${opt.color}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={saveProfile}
                disabled={savingProfile}
                className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-700 transition-colors"
              >
                {savingProfile ? 'Salvando...' : 'Salvar perfil'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                onClick={async () => {
                  if (!groupName.trim() || !user?.id) return;
                  setCreating(true);
                  try {
                    const { data: group, error: groupError } = await supabase
                      .from('chat_groups')
                      .insert({ name: groupName.trim(), created_by: user.id })
                      .select('id')
                      .single();
                    if (groupError || !group) throw groupError;
                    const members = [
                      { group_id: group.id, user_id: user.id },
                      ...selectedMembers.map(uid => ({ group_id: group.id, user_id: uid })),
                    ];
                    await supabase.from('chat_group_members').insert(members);
                    setShowCreateGroup(false);
                    setGroupName('');
                    setSelectedMembers([]);
                  } catch {
                    alert('Erro ao criar grupo. Tente novamente.');
                  } finally {
                    setCreating(false);
                  }
                }}
                disabled={!groupName.trim() || creating}
                className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-700 transition-colors"
              >
                {creating ? 'Criando...' : 'Criar grupo'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
