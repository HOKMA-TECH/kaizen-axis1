import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bot, MessageCircle, Trash2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useChatUnread } from '@/context/ChatUnreadContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversationPreview {
  conversationId: string;
  otherId: string;
  isKAI: boolean;
  lastContent: string;
  lastType: string;
  lastAt: string;
  senderIsMe: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COLORS = [
  'from-blue-400 to-blue-500',
  'from-violet-400 to-violet-500',
  'from-emerald-400 to-emerald-500',
  'from-rose-400 to-rose-500',
  'from-cyan-400 to-cyan-500',
  'from-pink-400 to-pink-500',
  'from-indigo-400 to-indigo-500',
  'from-teal-400 to-teal-500',
];

const getColor = (id: string) =>
  COLORS[id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

const getInitials = (name: string) =>
  (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isYesterday) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatPreview(type: string, content: string, isMe: boolean) {
  const prefix = isMe ? 'Você: ' : '';
  if (type === 'image') return `${prefix}📷 Imagem`;
  if (type === 'video') return `${prefix}🎥 Vídeo`;
  if (type === 'audio') return `${prefix}🎤 Áudio`;
  if (type === 'document') return `${prefix}📄 Documento`;
  return `${prefix}${content || ''}`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name, avatarUrl, id, isKai = false, size = 'md',
}: {
  name: string; avatarUrl?: string | null; id: string;
  isKai?: boolean; size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'w-10 h-10' : 'w-12 h-12';
  const iconSize = size === 'sm' ? 16 : 20;
  const txtSize = size === 'sm' ? 'text-[11px]' : 'text-sm';

  if (isKai) return (
    <div className={`${dim} rounded-full bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center flex-shrink-0`}>
      <Bot size={iconSize} className="text-white" />
    </div>
  );
  if (avatarUrl) return (
    <img src={avatarUrl} alt={name} referrerPolicy="no-referrer"
      className={`${dim} rounded-full object-cover flex-shrink-0`} />
  );
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br ${getColor(id)} flex items-center justify-center text-white font-semibold ${txtSize} flex-shrink-0`}>
      {getInitials(name)}
    </div>
  );
}

function GreenDot({ position = 'list' }: { position?: 'strip' | 'list' }) {
  const cls = position === 'strip'
    ? 'absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-card-bg rounded-full'
    : 'absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-surface-50 rounded-full';
  return <span className={cls} />;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

type EnrichedConvo = ConversationPreview & {
  name: string;
  role: string;
  avatarUrl: string | null | undefined;
  isUnread: boolean;
  unreadCount: number;
};

export default function Chat() {
  const navigate = useNavigate();
  const { allProfiles, user } = useApp();
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [ctxConvo, setCtxConvo] = useState<{ convo: EnrichedConvo; x: number; y: number } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myId = user?.id;
  const { unreadByConversation, markConversationRead } = useChatUnread();

  const members = useMemo(
    () => (allProfiles || []).filter(p => p.id !== myId),
    [allProfiles, myId],
  );

  // ── Fetch existing conversations ──────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!myId) return;
    const { data } = await supabase
      .from('chat_messages')
      .select('conversation_id, content, type, created_at, sender_id, receiver_id')
      .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
      .order('created_at', { ascending: false });

    const seen = new Set<string>();
    const convos: ConversationPreview[] = [];

    for (const msg of (data ?? [])) {
      if (seen.has(msg.conversation_id)) continue;
      seen.add(msg.conversation_id);
      // Skip conversations the user hid locally
      try {
        if (localStorage.getItem(`hidden-conv-${myId}-${msg.conversation_id}`)) continue;
      } catch {}
      const isKAI = msg.conversation_id.startsWith('kai-');
      const otherId = isKAI ? 'kai-agent'
        : (msg.sender_id === myId ? msg.receiver_id : msg.sender_id);

      convos.push({
        conversationId: msg.conversation_id,
        otherId,
        isKAI,
        lastContent: msg.content || '',
        lastType: msg.type || 'text',
        lastAt: msg.created_at,
        senderIsMe: msg.sender_id === myId,
      });
    }

    setConversations(convos);
    setLoading(false);
  }, [myId]);

  useEffect(() => {
    fetchConversations();
    if (!myId) return;
    const ch = supabase
      .channel('chat-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (p) => {
          const m = p.new as any;
          if (m.sender_id === myId || m.receiver_id === myId) {
            // Un-hide conversation if a new message arrives while it's hidden
            try { localStorage.removeItem(`hidden-conv-${myId}-${m.conversation_id}`); } catch {}
            fetchConversations();
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myId, fetchConversations]);

  // ── Delete conversation (apenas para mim — oculta via localStorage) ─────
  const handleDeleteConversation = (conversationId: string) => {
    if (!myId) return;
    if (!confirm('Apagar esta conversa para você? As mensagens serão removidas somente para você.')) return;
    try { localStorage.setItem(`hidden-conv-${myId}-${conversationId}`, '1'); } catch {}
    setConversations(prev => prev.filter(c => c.conversationId !== conversationId));
    setCtxConvo(null);
  };

  const handleConvoTouchStart = (e: React.TouchEvent, convo: EnrichedConvo) => {
    const touch = e.touches[0];
    pressTimer.current = setTimeout(() => {
      setCtxConvo({ convo, x: touch.clientX, y: touch.clientY });
    }, 500);
  };
  const handleConvoTouchEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };
  const handleConvoRightClick = (e: React.MouseEvent, convo: EnrichedConvo) => {
    e.preventDefault();
    setCtxConvo({ convo, x: e.clientX, y: e.clientY });
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  // Strip: KAI + max 4 members (partners from existing convos first, then others)
  const stripMembers = useMemo(() => {
    const inConvo = new Set(
      conversations.filter(c => !c.isKAI).map(c => c.otherId),
    );
    const sorted = [
      ...members.filter(m => inConvo.has(m.id)),
      ...members.filter(m => !inConvo.has(m.id)),
    ];
    return sorted.slice(0, 4);
  }, [members, conversations]);

  // Conversations enriched with profile info + unread status
  const enrichedConvos = useMemo(() =>
    conversations.map(c => {
      const unreadCount = unreadByConversation[c.conversationId] ?? 0;
      const isUnread = unreadCount > 0;
      if (c.isKAI) {
        return {
          ...c,
          name: 'KAI',
          role: 'Assistente IA',
          avatarUrl: null as string | null | undefined,
          isUnread,
          unreadCount,
        };
      }
      const p = allProfiles?.find(pr => pr.id === c.otherId);
      return {
        ...c,
        name: p?.name || 'Usuário',
        role: p?.role || '',
        avatarUrl: p?.avatar_url,
        isUnread,
        unreadCount,
      };
    }),
  [conversations, allProfiles, unreadByConversation]);

  const openConversation = (convo: EnrichedConvo) => {
    markConversationRead(convo.conversationId);
    navigate(convo.isKAI ? '/chat/kai-agent' : `/chat/${convo.otherId}`);
  };

  // Filtered conversations (by search)
  const enriched = useMemo(() => {
    if (!search.trim()) return enrichedConvos;
    const q = search.toLowerCase();
    return enrichedConvos.filter(c => c.name.toLowerCase().includes(q));
  }, [enrichedConvos, search]);

  // Members without existing conversation that match the search (to start new)
  const searchNewMembers = useMemo(() => {
    if (!search.trim()) return { showKAI: false, list: [] as typeof members };
    const q = search.toLowerCase();
    const existing = new Set(conversations.filter(c => !c.isKAI).map(c => c.otherId));
    const hasKAI = conversations.some(c => c.isKAI);
    return {
      showKAI: !hasKAI && 'kai'.includes(q),
      list: members.filter(m => !existing.has(m.id) && m.name?.toLowerCase().includes(q)),
    };
  }, [search, conversations, members]);

  return (
    <div className="flex flex-col h-screen bg-surface-50 pb-20">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-card-bg z-10 border-b border-surface-100">
        <div className="px-5 pt-10 pb-4">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Mensagens</h1>
        </div>

        {/* Search */}
        <div className="px-5 pb-4">
          <motion.div
            animate={{ boxShadow: focused ? '0 0 0 2px rgba(212,175,55,0.3)' : '0 0 0 0px transparent' }}
            transition={{ duration: 0.12 }}
            className="relative rounded-xl"
          >
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
            <input
              type="text"
              placeholder="Pesquisar conversas..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="w-full pl-9 pr-4 py-2.5 bg-surface-50 rounded-xl text-sm text-text-primary focus:outline-none placeholder:text-text-secondary"
            />
          </motion.div>
        </div>

        {/* ── Strip: KAI + alguns membros ──────────────────────────────── */}
        {!search && (
          <div className="px-5 pb-4">
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest mb-3">
              Acesso rápido
            </p>
            <div className="flex gap-4">
              {/* KAI */}
              <button
                onClick={() => navigate('/chat/kai-agent')}
                className="flex flex-col items-center gap-1.5 active:opacity-60 transition-opacity"
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center">
                    <Bot size={16} className="text-white" />
                  </div>
                  <GreenDot position="strip" />
                </div>
                <span className="text-[10px] text-text-secondary w-10 text-center truncate">KAI</span>
              </button>

              {/* Max 4 members */}
              {stripMembers.map(m => (
                <button
                  key={m.id}
                  onClick={() => navigate(`/chat/${m.id}`)}
                  className="flex flex-col items-center gap-1.5 active:opacity-60 transition-opacity"
                >
                  <div className="relative">
                    <Avatar name={m.name} avatarUrl={m.avatar_url} id={m.id} size="sm" />
                    <GreenDot position="strip" />
                  </div>
                  <span className="text-[10px] text-text-secondary w-10 text-center truncate">
                    {m.name?.split(' ')[0] || '—'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Conversation list ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col gap-3 px-5 pt-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-surface-100 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-surface-100 rounded-full w-32" />
                  <div className="h-2.5 bg-surface-100 rounded-full w-48" />
                </div>
                <div className="h-2 bg-surface-100 rounded-full w-8" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && enriched.length === 0 && search === '' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center py-20 text-text-secondary px-8 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-surface-100 flex items-center justify-center mb-4">
              <MessageCircle size={28} className="opacity-30" />
            </div>
            <p className="font-medium text-sm text-text-primary mb-1">Nenhuma conversa ainda</p>
            <p className="text-xs opacity-60">Pesquise um colega ou KAI acima para iniciar</p>
          </motion.div>
        )}

        {/* No results at all */}
        {!loading && enriched.length === 0 && !searchNewMembers.showKAI && searchNewMembers.list.length === 0 && search !== '' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center py-16 text-text-secondary"
          >
            <Search size={30} className="mb-2 opacity-20" />
            <p className="text-sm">Nenhum resultado para "{search}"</p>
          </motion.div>
        )}

        {/* Pessoas — members without conversation matching search */}
        {search.trim() && (searchNewMembers.showKAI || searchNewMembers.list.length > 0) && (
          <div>
            {enriched.length > 0 && (
              <div className="px-5 pt-4 pb-1">
                <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest">Conversas</p>
              </div>
            )}
            <AnimatePresence mode="popLayout">
              {enriched.map((c, i) => (
                <motion.div key={`sr-${c.conversationId}`} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.02, duration: 0.15 }}
                  onClick={() => openConversation(c)}
                  onTouchStart={(e) => handleConvoTouchStart(e, c)}
                  onTouchEnd={handleConvoTouchEnd}
                  onTouchMove={handleConvoTouchEnd}
                  onContextMenu={(e) => handleConvoRightClick(e, c)}
                  className="flex items-center gap-3.5 px-5 py-3.5 cursor-pointer hover:bg-card-bg active:bg-card-bg transition-colors border-b border-surface-50"
                >
                  <div className="relative flex-shrink-0">
                    <Avatar name={c.name} avatarUrl={c.avatarUrl} id={c.otherId} isKai={c.isKAI} size="md" />
                    <GreenDot />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h3 className="font-semibold text-text-primary text-sm truncate">{c.name}</h3>
                      {c.isKAI && <span className="text-[10px] font-semibold text-gold-500 bg-gold-400/10 px-1.5 py-0.5 rounded flex-shrink-0">IA</span>}
                    </div>
                    <p className="text-xs text-text-secondary truncate">{formatPreview(c.lastType, c.lastContent, c.senderIsMe)}</p>
                  </div>
                   <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                     <span className="text-[11px] text-text-secondary">{formatTime(c.lastAt)}</span>
                     {c.unreadCount > 0 && (
                       <span className="min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                         {c.unreadCount > 99 ? '99+' : c.unreadCount}
                       </span>
                     )}
                   </div>
                 </motion.div>
              ))}
            </AnimatePresence>

            <div className="px-5 pt-4 pb-1">
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest">Pessoas</p>
            </div>

            {searchNewMembers.showKAI && (
              <button onClick={() => navigate('/chat/kai-agent')}
                className="flex items-center gap-3.5 w-full px-5 py-3.5 hover:bg-card-bg transition-colors border-b border-surface-50">
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center">
                    <Bot size={20} className="text-white" />
                  </div>
                  <GreenDot />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-text-primary text-sm flex items-center gap-1.5">KAI <span className="text-[10px] font-semibold text-gold-500 bg-gold-400/10 px-1.5 py-0.5 rounded">IA</span></p>
                  <p className="text-xs text-text-secondary">Iniciar conversa</p>
                </div>
              </button>
            )}

            {searchNewMembers.list.map(m => (
              <button key={m.id} onClick={() => navigate(`/chat/${m.id}`)}
                className="flex items-center gap-3.5 w-full px-5 py-3.5 hover:bg-card-bg transition-colors border-b border-surface-50">
                <div className="relative flex-shrink-0">
                  <Avatar name={m.name} avatarUrl={m.avatar_url} id={m.id} size="md" />
                  <GreenDot />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-text-primary text-sm">{m.name}</p>
                  <p className="text-xs text-text-secondary capitalize">{m.role || 'Membro da equipe'} · Iniciar conversa</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Conversations (only when NOT in "Pessoas" search mode) */}
        {!loading && enriched.length > 0 && !search.trim() && (
          <AnimatePresence mode="popLayout">
            {enriched.map((c, i) => (
              <motion.div
                key={c.conversationId}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.025, duration: 0.15 }}
                onClick={() => openConversation(c)}
                onTouchStart={(e) => handleConvoTouchStart(e, c)}
                onTouchEnd={handleConvoTouchEnd}
                onTouchMove={handleConvoTouchEnd}
                onContextMenu={(e) => handleConvoRightClick(e, c)}
                className={cn(
                  'flex items-center gap-3.5 px-5 py-3.5 cursor-pointer',
                  'hover:bg-card-bg active:bg-card-bg transition-colors',
                  i < enriched.length - 1 && 'border-b border-surface-50',
                )}
              >
                <div className="relative flex-shrink-0">
                  <Avatar
                    name={c.name} avatarUrl={c.avatarUrl}
                    id={c.otherId} isKai={c.isKAI} size="md"
                  />
                  <GreenDot />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className={cn('text-sm truncate', c.isUnread ? 'font-bold text-text-primary' : 'font-semibold text-text-primary')}>
                        {c.name}
                      </h3>
                      {c.isKAI && (
                        <span className="text-[10px] font-semibold text-gold-500 bg-gold-400/10 px-1.5 py-0.5 rounded flex-shrink-0">IA</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <span className={cn('text-[11px]', c.isUnread ? 'text-gold-600 dark:text-gold-400 font-semibold' : 'text-text-secondary')}>
                        {formatTime(c.lastAt)}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {c.unreadCount > 99 ? '99+' : c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={cn('text-xs truncate', c.isUnread ? 'text-text-primary font-medium' : 'text-text-secondary')}>
                    {formatPreview(c.lastType, c.lastContent, c.senderIsMe)}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        <div className="h-4" />
      </div>

      {/* ── Context menu: apagar conversa ────────────────────────────── */}
      {ctxConvo && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxConvo(null)} />
          <div
            className="fixed z-50 bg-card-bg rounded-2xl shadow-2xl border border-surface-100 overflow-hidden min-w-[200px]"
            style={{
              top: Math.min(ctxConvo.y, window.innerHeight - 80),
              left: Math.min(ctxConvo.x, window.innerWidth - 220),
            }}
          >
            <div className="px-4 py-3 border-b border-surface-100">
              <p className="text-sm font-semibold text-text-primary truncate max-w-[160px]">{ctxConvo.convo.name}</p>
              <p className="text-xs text-text-secondary">Conversa</p>
            </div>
            <button
              onClick={() => handleDeleteConversation(ctxConvo.convo.conversationId)}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={16} /> Apagar conversa para mim
            </button>
          </div>
        </>
      )}
    </div>
  );
}
