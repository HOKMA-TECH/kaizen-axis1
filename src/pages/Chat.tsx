import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bot, Sparkles, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

// ─── Helpers ────────────────────────────────────────────────────────────────

const GRADIENT_COLORS = [
  'from-blue-400 to-blue-600',
  'from-violet-400 to-violet-600',
  'from-emerald-400 to-emerald-600',
  'from-rose-400 to-rose-600',
  'from-cyan-400 to-cyan-600',
  'from-pink-400 to-pink-600',
  'from-indigo-400 to-indigo-600',
  'from-teal-400 to-teal-600',
];

function getGradient(id: string) {
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENT_COLORS[hash % GRADIENT_COLORS.length];
}

function getInitials(name: string) {
  return (name || '?')
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({
  name,
  avatarUrl,
  id,
  size = 'md',
  isKai = false,
  ring = false,
}: {
  name: string;
  avatarUrl?: string | null;
  id: string;
  size?: 'sm' | 'md';
  isKai?: boolean;
  ring?: boolean;
}) {
  const dim = size === 'sm' ? 'w-11 h-11' : 'w-12 h-12';
  const txt = size === 'sm' ? 'text-xs' : 'text-sm';

  if (isKai) {
    return (
      <div className={cn(
        dim,
        'rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-lg shadow-gold-400/30',
        ring && 'ring-2 ring-gold-300/60 ring-offset-1 ring-offset-card-bg',
      )}>
        <Bot className="text-white" size={size === 'sm' ? 18 : 22} />
      </div>
    );
  }

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={cn(
          dim,
          'rounded-full object-cover',
          ring && 'ring-2 ring-surface-200 ring-offset-1 ring-offset-card-bg',
        )}
      />
    );
  }

  return (
    <div className={cn(
      dim,
      `rounded-full bg-gradient-to-br ${getGradient(id)} flex items-center justify-center text-white font-bold`,
      txt,
      ring && 'ring-2 ring-surface-200 ring-offset-1 ring-offset-card-bg',
    )}>
      {getInitials(name)}
    </div>
  );
}

// ─── OnlineDot ───────────────────────────────────────────────────────────────

function OnlineDot({ pulse = false }: { pulse?: boolean }) {
  return (
    <span className="absolute bottom-0 right-0 flex h-3 w-3">
      {pulse && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      )}
      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border-2 border-card-bg" />
    </span>
  );
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export default function Chat() {
  const navigate = useNavigate();
  const { allProfiles, user } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [focused, setFocused] = useState(false);

  const myId = user?.id;

  const teamMembers = useMemo(
    () => (allProfiles || []).filter(p => p.id !== myId),
    [allProfiles, myId],
  );

  const filtered = useMemo(
    () =>
      searchTerm.trim()
        ? teamMembers.filter(u =>
            u.name?.toLowerCase().includes(searchTerm.toLowerCase()),
          )
        : teamMembers,
    [teamMembers, searchTerm],
  );

  return (
    <div className="flex flex-col h-screen bg-surface-50 pb-20">

      {/* ── Header + Search ─────────────────────────────────────────────── */}
      <div className="bg-card-bg shadow-sm z-10">
        <div className="px-5 pt-10 pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Mensagens</h1>
            <p className="text-xs text-text-secondary mt-0.5">
              {teamMembers.length > 0
                ? `${teamMembers.length} pessoas na equipe`
                : 'Carregando...'}
            </p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gold-400/10 flex items-center justify-center">
            <Users size={17} className="text-gold-500" />
          </div>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <motion.div
            animate={{
              boxShadow: focused
                ? '0 0 0 2px rgba(212,175,55,0.35)'
                : '0 0 0 0px transparent',
            }}
            transition={{ duration: 0.15 }}
            className="relative rounded-xl"
          >
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none z-10"
            />
            <input
              type="text"
              placeholder="Pesquisar conversas..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="w-full pl-9 pr-4 py-2.5 bg-surface-50 rounded-xl text-sm text-text-primary focus:outline-none placeholder:text-text-secondary"
            />
          </motion.div>
        </div>

        {/* ── Online Users Strip ─────────────────────────────────────────── */}
        <div className="border-t border-surface-100 px-5 pt-3 pb-4">
          <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2.5">
            Online agora
          </p>
          <div className="flex gap-3.5 overflow-x-auto no-scrollbar">

            {/* KAI — always online */}
            <motion.button
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              whileTap={{ scale: 0.93 }}
              onClick={() => navigate('/chat/kai-agent')}
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
            >
              <div className="relative">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-md shadow-gold-400/30 ring-2 ring-gold-300/50 ring-offset-1 ring-offset-card-bg">
                  <Bot className="text-white" size={18} />
                </div>
                <OnlineDot pulse />
              </div>
              <span className="text-[10px] text-text-secondary font-medium w-11 text-center truncate">
                KAI
              </span>
            </motion.button>

            {/* Team members */}
            {teamMembers.map((member, i) => (
              <motion.button
                key={member.id}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 22,
                  delay: (i + 1) * 0.04,
                }}
                whileTap={{ scale: 0.93 }}
                onClick={() => navigate(`/chat/${member.id}`)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0"
              >
                <div className="relative">
                  <Avatar
                    name={member.name}
                    avatarUrl={member.avatar_url}
                    id={member.id}
                    size="sm"
                    ring
                  />
                  <OnlineDot />
                </div>
                <span className="text-[10px] text-text-secondary w-11 text-center truncate">
                  {member.name?.split(' ')[0] || '—'}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Chat List ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* KAI Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.25 }}
          onClick={() => navigate('/chat/kai-agent')}
          className="relative mx-4 mt-4 mb-1 overflow-hidden rounded-2xl cursor-pointer group active:scale-[0.98] transition-transform"
        >
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-gold-500 via-gold-400 to-amber-400" />
          {/* Shimmer on hover — Magic UI style */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          {/* Subtle noise texture */}
          <div className="absolute inset-0 opacity-[0.03] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iLjY1IiBudW1PY3RhdmVzPSIzIiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />

          <div className="relative flex items-center gap-3.5 p-4">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <Bot className="text-white" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-bold text-white text-base leading-tight">KAI</h3>
                <span className="px-1.5 py-0.5 bg-white/20 rounded-md text-[10px] text-white/90 font-semibold flex items-center gap-0.5">
                  <Sparkles size={9} />
                  IA
                </span>
              </div>
              <p className="text-white/70 text-xs truncate">
                Especialista em financiamento imobiliário
              </p>
            </div>
            {/* Animated online indicator */}
            <div className="flex-shrink-0 relative flex h-3 w-3 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-80" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400" />
            </div>
          </div>
        </motion.div>

        {/* Team section label */}
        <AnimatePresence mode="wait">
          {filtered.length > 0 && (
            <motion.div
              key="label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-5 pt-4 pb-1.5"
            >
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                Equipe · {filtered.length}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        <AnimatePresence>
          {filtered.length === 0 && searchTerm !== '' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-16 text-text-secondary"
            >
              <Search size={36} className="mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhum resultado</p>
              <p className="text-xs mt-1 opacity-60">para "{searchTerm}"</p>
            </motion.div>
          )}
          {filtered.length === 0 && searchTerm === '' && teamMembers.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center py-16 text-text-secondary text-sm"
            >
              <p>Nenhum colega encontrado.</p>
              <p className="text-xs mt-1 opacity-60">Os membros da equipe aparecerão aqui.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Team member rows */}
        <div className="pb-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((member, i) => (
              <motion.div
                key={member.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ delay: i * 0.035, duration: 0.2 }}
                onClick={() => navigate(`/chat/${member.id}`)}
                className={cn(
                  'flex items-center gap-3.5 px-5 py-3 cursor-pointer',
                  'hover:bg-card-bg active:bg-card-bg transition-colors',
                )}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <Avatar
                    name={member.name}
                    avatarUrl={member.avatar_url}
                    id={member.id}
                  />
                  <OnlineDot />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text-primary text-sm truncate leading-snug">
                    {member.name}
                  </h3>
                  <p className="text-xs text-text-secondary truncate capitalize mt-0.5">
                    {member.role || 'Membro da equipe'}
                  </p>
                </div>

                {/* Divider accent */}
                <div className="w-1 h-7 rounded-full bg-surface-100 flex-shrink-0" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
