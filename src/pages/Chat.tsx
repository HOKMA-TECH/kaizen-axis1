import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bot } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

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

// ─── Avatar circle ────────────────────────────────────────────────────────────

function AvatarCircle({
  name,
  avatarUrl,
  id,
  isKai = false,
  size = 10,
}: {
  name: string;
  avatarUrl?: string | null;
  id: string;
  isKai?: boolean;
  size?: number;
}) {
  const dim = `w-${size} h-${size}`;

  if (isKai) {
    return (
      <div className={`${dim} rounded-full bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center`}>
        <Bot className="text-white" size={size === 10 ? 18 : 14} />
      </div>
    );
  }
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name} referrerPolicy="no-referrer"
        className={`${dim} rounded-full object-cover`} />
    );
  }
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br ${getColor(id)} flex items-center justify-center text-white font-semibold ${size <= 9 ? 'text-[10px]' : 'text-sm'}`}>
      {getInitials(name)}
    </div>
  );
}

// ─── Green dot ───────────────────────────────────────────────────────────────

function GreenDot() {
  return (
    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-card-bg rounded-full" />
  );
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export default function Chat() {
  const navigate = useNavigate();
  const { allProfiles, user } = useApp();
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);

  const myId = user?.id;

  const members = useMemo(
    () => (allProfiles || []).filter(p => p.id !== myId),
    [allProfiles, myId],
  );

  const filtered = useMemo(
    () => search.trim()
      ? members.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()))
      : members,
    [members, search],
  );

  return (
    <div className="flex flex-col h-screen bg-surface-50 pb-20">

      {/* ── Header ────────────────────────────────────────────────────── */}
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

        {/* ── Online strip ──────────────────────────────────────────────── */}
        <div className="px-5 pb-4">
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest mb-3">
            Online agora
          </p>
          {/* flex-wrap — sem scroll */}
          <div className="flex flex-wrap gap-x-4 gap-y-3">

            {/* KAI */}
            <button
              onClick={() => navigate('/chat/kai-agent')}
              className="flex flex-col items-center gap-1 active:opacity-70 transition-opacity"
            >
              <div className="relative">
                <AvatarCircle name="KAI" id="kai" isKai size={9} />
                <GreenDot />
              </div>
              <span className="text-[10px] text-text-secondary w-9 text-center truncate">KAI</span>
            </button>

            {/* Members */}
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => navigate(`/chat/${m.id}`)}
                className="flex flex-col items-center gap-1 active:opacity-70 transition-opacity"
              >
                <div className="relative">
                  <AvatarCircle name={m.name} avatarUrl={m.avatar_url} id={m.id} size={9} />
                  <GreenDot />
                </div>
                <span className="text-[10px] text-text-secondary w-9 text-center truncate">
                  {m.name?.split(' ')[0] || '—'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── List ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* KAI row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          onClick={() => navigate('/chat/kai-agent')}
          className="flex items-center gap-3.5 px-5 py-3.5 cursor-pointer hover:bg-card-bg active:bg-card-bg transition-colors border-b border-surface-50"
        >
          <div className="relative flex-shrink-0">
            <AvatarCircle name="KAI" id="kai" isKai size={12} />
            <GreenDot />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-text-primary text-sm">KAI</span>
              <span className="text-[10px] font-semibold text-gold-500 bg-gold-400/10 px-1.5 py-0.5 rounded">IA</span>
            </div>
            <p className="text-xs text-text-secondary truncate mt-0.5">
              Especialista em financiamento imobiliário
            </p>
          </div>
        </motion.div>

        {/* Section label */}
        {filtered.length > 0 && (
          <div className="px-5 pt-4 pb-1">
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest">
              Equipe · {filtered.length}
            </p>
          </div>
        )}

        {/* Empty */}
        <AnimatePresence>
          {filtered.length === 0 && search !== '' && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center py-16 text-text-secondary"
            >
              <Search size={30} className="mb-2 opacity-20" />
              <p className="text-sm">Nenhum resultado para "{search}"</p>
            </motion.div>
          )}
          {filtered.length === 0 && search === '' && members.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center py-16 text-text-secondary text-sm"
            >
              <p>Nenhum colega encontrado.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Member rows */}
        <AnimatePresence mode="popLayout">
          {filtered.map((m, i) => (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: i * 0.02, duration: 0.15 }}
              onClick={() => navigate(`/chat/${m.id}`)}
              className={cn(
                'flex items-center gap-3.5 px-5 py-3.5 cursor-pointer',
                'hover:bg-card-bg active:bg-card-bg transition-colors',
                i < filtered.length - 1 && 'border-b border-surface-50',
              )}
            >
              <div className="relative flex-shrink-0">
                <AvatarCircle name={m.name} avatarUrl={m.avatar_url} id={m.id} size={12} />
                <GreenDot />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-text-primary text-sm truncate">{m.name}</h3>
                <p className="text-xs text-text-secondary truncate capitalize mt-0.5">
                  {m.role || 'Membro da equipe'}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="h-4" />
      </div>
    </div>
  );
}
