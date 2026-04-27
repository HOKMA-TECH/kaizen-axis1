import { User, Role } from '@/data/admin';
import { PremiumCard, RoundedButton } from '@/components/ui/PremiumComponents';
import { Check, X, Edit2, UserCheck, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserCardProps {
  user: User;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onRoleChange?: (id: string, role: Role) => void;
}

export function UserCard({ user, onApprove, onReject, onRoleChange }: UserCardProps) {
  const isPending = user.status === 'Pendente';

  return (
    <PremiumCard className="p-4 flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-surface-100 flex items-center justify-center overflow-hidden">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <UserCheck size={20} className="text-text-secondary" />
            )}
          </div>
          <div>
            <h4 className="font-bold text-text-primary text-sm">{user.name}</h4>
            <p className="text-xs text-text-secondary">{user.email}</p>
            <p className="text-xs text-text-secondary">{user.phone}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
            user.role === 'Diretor' ? "bg-purple-100 text-purple-700" :
            user.role === 'Gerente' ? "bg-blue-100 text-blue-700" :
            "bg-surface-100 text-text-secondary"
          )}>
            {user.role}
          </span>
          {isPending && (
            <span className="text-[10px] text-amber-600 font-medium">Solicitado em: {user.requestedAt}</span>
          )}
        </div>
      </div>

      {isPending ? (
        <div className="flex gap-2 mt-2">
          <RoundedButton 
            size="sm" 
            className="flex-1 bg-green-500 hover:bg-green-600 border-none text-white h-8 text-xs"
            onClick={() => onApprove?.(user.id)}
          >
            <Check size={14} className="mr-1" /> Aprovar
          </RoundedButton>
          <RoundedButton 
            size="sm" 
            variant="outline"
            className="flex-1 h-8 text-xs text-red-500 border-red-200 hover:bg-red-50"
            onClick={() => onReject?.(user.id)}
          >
            <X size={14} className="mr-1" /> Recusar
          </RoundedButton>
        </div>
      ) : (
        <div className="flex justify-end mt-1 pt-2 border-t border-surface-100">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">Alterar Cargo:</label>
            <select 
              value={user.role}
              onChange={(e) => onRoleChange?.(user.id, e.target.value as Role)}
              className="text-xs bg-surface-50 border border-surface-200 rounded px-2 py-1 focus:outline-none focus:border-gold-400"
            >
              <option value="Corretor">Corretor</option>
              <option value="Coordenador">Coordenador</option>
              <option value="Gerente">Gerente</option>
              <option value="Diretor">Diretor</option>
            </select>
          </div>
        </div>
      )}
    </PremiumCard>
  );
}
