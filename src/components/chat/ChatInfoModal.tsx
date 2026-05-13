import { X, Users, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getColor, getInitials } from '@/lib/chat-utils';

type Availability = 'available' | 'busy' | 'dnd' | string | null | undefined;

export interface ChatProfileInfo {
  id: string;
  name?: string | null;
  role?: string | null;
  avatar_url?: string | null;
  chat_display_name?: string | null;
  chat_avatar_url?: string | null;
  chat_status_text?: string | null;
  chat_availability?: Availability;
}

export interface ChatGroupInfo {
  id: string;
  name: string;
  avatar_url?: string | null;
  created_by?: string | null;
  members: ChatProfileInfo[];
}

interface ChatInfoModalProps {
  open: boolean;
  onClose: () => void;
  userInfo?: ChatProfileInfo | null;
  groupInfo?: ChatGroupInfo | null;
  loading?: boolean;
}

const availabilityMeta = (value: Availability) => {
  switch (value) {
    case 'busy':
      return { label: 'Ocupado', dot: 'bg-yellow-400' };
    case 'dnd':
      return { label: 'Não perturbe', dot: 'bg-red-500' };
    case 'available':
    default:
      return { label: 'Disponível', dot: 'bg-emerald-500' };
  }
};

const displayName = (profile?: ChatProfileInfo | null) =>
  profile?.chat_display_name?.trim() || profile?.name?.trim() || 'Usuario';

const displayAvatar = (profile?: ChatProfileInfo | null) =>
  profile?.chat_avatar_url || profile?.avatar_url || null;

const roleLabel = (role?: string | null) => {
  const normalized = String(role || '').trim().toUpperCase();
  if (normalized === 'ADMIN') return 'Administrador';
  if (normalized === 'DIRETOR') return 'Diretor';
  if (normalized === 'GERENTE') return 'Gerente';
  if (normalized === 'COORDENADOR') return 'Coordenador';
  if (normalized === 'CORRETOR') return 'Corretor';
  return role || 'Usuario';
};

function Avatar({ profile, fallbackId, size = 'lg' }: { profile?: ChatProfileInfo | null; fallbackId: string; size?: 'sm' | 'lg' }) {
  const avatar = displayAvatar(profile);
  const name = displayName(profile);
  const cls = size === 'lg' ? 'w-24 h-24 text-xl' : 'w-10 h-10 text-xs';
  if (avatar) {
    return <img src={avatar} alt={name} className={cn(cls, 'rounded-full object-cover')} referrerPolicy="no-referrer" />;
  }
  return (
    <div className={cn(cls, 'rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold', getColor(fallbackId))}>
      {getInitials(name)}
    </div>
  );
}

export function ChatInfoModal({ open, onClose, userInfo, groupInfo, loading }: ChatInfoModalProps) {
  if (!open) return null;
  const isGroup = Boolean(groupInfo);
  const title = isGroup ? groupInfo?.name || 'Grupo' : displayName(userInfo);
  const availability = availabilityMeta(userInfo?.chat_availability);

  return (
    <div className="fixed inset-0 z-[520] bg-black/45 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-card-bg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h3 className="text-sm font-bold text-text-primary truncate">{isGroup ? 'Dados do grupo' : 'Perfil no chat'}</h3>
          <button onClick={onClose} className="p-2 rounded-xl text-text-secondary hover:bg-surface-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-text-secondary">Carregando...</div>
        ) : isGroup ? (
          <div className="p-5">
            <div className="flex flex-col items-center text-center">
              {groupInfo?.avatar_url ? (
                <img src={groupInfo.avatar_url} alt={title} className="w-24 h-24 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className={cn('w-24 h-24 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-xl', getColor(groupInfo?.id))}>
                  {getInitials(title)}
                </div>
              )}
              <h4 className="mt-4 text-lg font-bold text-text-primary">{title}</h4>
              <p className="mt-1 text-sm text-text-secondary">Grupo ativo</p>
            </div>

            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-text-primary">
                <Users size={16} /> Participantes ({groupInfo?.members.length || 0})
              </div>
              <div className="space-y-2">
                {(groupInfo?.members || []).map(member => {
                  const isAdmin = member.id === groupInfo?.created_by;
                  return (
                    <div key={member.id} className="flex items-center gap-3 rounded-xl border border-surface-200 px-3 py-2">
                      <Avatar profile={member} fallbackId={member.id} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text-primary truncate">{displayName(member)}</p>
                        <p className="text-xs text-text-secondary truncate">{roleLabel(member.role)}</p>
                      </div>
                      {isAdmin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-1 text-[10px] font-semibold text-primary-700">
                          <Shield size={11} /> Admin
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5">
            <div className="flex flex-col items-center text-center">
              <Avatar profile={userInfo} fallbackId={userInfo?.id || title} />
              <h4 className="mt-4 text-lg font-bold text-text-primary">{title}</h4>
              <p className="mt-1 text-sm text-text-secondary">{roleLabel(userInfo?.role)}</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-surface-200 px-3 py-1.5 text-sm text-text-primary">
                <span className={cn('w-2.5 h-2.5 rounded-full', availability.dot)} />
                {availability.label}
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-surface-50 border border-surface-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-1">Status</p>
              <p className="text-sm text-text-primary">{userInfo?.chat_status_text?.trim() || 'Sem status definido.'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
