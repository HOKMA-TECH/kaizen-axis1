import { useApp } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/useAuthorization';
import { AlertTriangle, TrendingUp, DollarSign, Users, User } from 'lucide-react';

// ─── Commission config per role ───────────────────────────────────────────────
// ownRate:     taxa sobre venda própria (owner_id === user.id)
// teamRate:    taxa sobre venda de membro da equipe/coord/diretoria
// Todos os valores sofrem desconto de -14% (TAX_DEDUCTION)
//
// CORRETOR:    própria 1.8%  | sem comissão de equipe
// COORDENADOR: própria 2.0%  | equipe 0.1%
// GERENTE:     própria 2.4%  | equipe 0.4%
// DIRETOR:     própria 2.4%  | equipe 0.1%
const COMMISSION_CONFIG: Record<string, { ownRate: number; teamRate: number }> = {
  CORRETOR:    { ownRate: 0.018, teamRate: 0     },
  COORDENADOR: { ownRate: 0.020, teamRate: 0.001 },
  GERENTE:     { ownRate: 0.024, teamRate: 0.004 },
  DIRETOR:     { ownRate: 0.024, teamRate: 0.001 },
};

const TAX_DEDUCTION = 0.86; // -14%

function parseCurrency(value: any): number {
  if (value == null) return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const cleaned = String(value)
    .replace(/R\$\s*/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function isCurrentMonth(dateStr: string | undefined | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SalesProgressCard() {
  const { clients, user, allProfiles } = useApp();
  const { role } = useAuthorization();

  const config = COMMISSION_CONFIG[role?.toUpperCase() ?? ''] ?? COMMISSION_CONFIG.CORRETOR;
  const hasTeamCommission = config.teamRate > 0;

  // Vendas concluídas no mês corrente
  const monthlySales = clients
    .filter(c => {
      if (c.stage !== 'Concluído') return false;
      return isCurrentMonth((c as any).updated_at || (c as any).closed_at || c.createdAt);
    })
    .slice(0, 100);

  // Separa vendas próprias vs equipe
  const ownSales  = monthlySales.filter(c => (c as any).owner_id === user?.id);
  const teamSales = monthlySales.filter(c => (c as any).owner_id !== user?.id);

  // VGV por categoria
  const ownVGV  = ownSales.reduce((sum, c)  => sum + parseCurrency(c.intendedValue), 0);
  const teamVGV = teamSales.reduce((sum, c) => sum + parseCurrency(c.intendedValue), 0);
  const totalVGV = ownVGV + teamVGV;

  // Comissão por categoria — todos os valores levam -14%
  const ownCommission   = ownVGV  * config.ownRate  * TAX_DEDUCTION;
  const teamCommission  = teamVGV * config.teamRate * TAX_DEDUCTION;
  const totalCommission = ownCommission + teamCommission;

  const hasSales = monthlySales.length > 0;
  const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm transition-all duration-300 ${
        hasSales
          ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
          : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-text-primary text-base">Progresso do Mês</h3>
          <p className="text-xs text-text-secondary capitalize">{monthName}</p>
        </div>
        <div className={`p-2 rounded-xl ${hasSales ? 'bg-green-100 dark:bg-green-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
          {hasSales
            ? <TrendingUp size={20} className="text-green-600 dark:text-green-400" />
            : <AlertTriangle size={20} className="text-red-500 dark:text-red-400" />
          }
        </div>
      </div>

      {/* Summary indicators */}
      <div className="flex items-stretch mb-3 rounded-xl overflow-hidden border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5">
        <div className="flex-1 flex flex-col items-center justify-center py-3 px-2 gap-0.5">
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Vendas</p>
          <p className="text-xl font-bold text-text-primary">{monthlySales.length}</p>
        </div>
        <div className="w-px bg-black/10 dark:bg-white/10" />
        <div className="flex-1 flex flex-col items-center justify-center py-3 px-2 gap-0.5">
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">VGV Total</p>
          <p className="text-sm font-bold text-text-primary">{formatBRL(totalVGV)}</p>
        </div>
        <div className="w-px bg-black/10 dark:bg-white/10" />
        <div className="flex-1 flex flex-col items-center justify-center py-3 px-2 gap-0.5">
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Comissão Prevista</p>
          <p className="text-sm font-bold text-green-600 dark:text-green-400">{formatBRL(totalCommission)}</p>
        </div>
      </div>

      {/* Breakdown de comissão para roles com equipe */}
      {hasTeamCommission && hasSales && (ownSales.length > 0 || teamSales.length > 0) && (
        <div className="flex gap-2 mb-4">
          {ownSales.length > 0 && (
            <div className="flex-1 flex items-center gap-2 bg-white dark:bg-surface-900 rounded-xl px-3 py-2 border border-green-100 dark:border-green-900/40">
              <div className="w-6 h-6 rounded-full bg-gold-100 dark:bg-gold-900/40 flex items-center justify-center flex-shrink-0">
                <User size={11} className="text-gold-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-text-secondary font-medium">Própria ({ownSales.length})</p>
                <p className="text-xs font-bold text-green-600 dark:text-green-400 truncate">{formatBRL(ownCommission)}</p>
              </div>
            </div>
          )}
          {teamSales.length > 0 && (
            <div className="flex-1 flex items-center gap-2 bg-white dark:bg-surface-900 rounded-xl px-3 py-2 border border-blue-100 dark:border-blue-900/40">
              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                <Users size={11} className="text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-text-secondary font-medium">Equipe ({teamSales.length})</p>
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate">{formatBRL(teamCommission)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sales list or empty state */}
      {!hasSales ? (
        <div className="flex flex-col items-center justify-center py-4 gap-2">
          <AlertTriangle size={28} className="text-red-400" />
          <p className="text-sm font-semibold text-red-600 dark:text-red-400 text-center">
            Nenhuma venda realizada neste mês
          </p>
          <p className="text-xs text-text-secondary text-center">Bora fechar negócio!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {monthlySales.map(c => {
            const isOwn = (c as any).owner_id === user?.id;
            const ownerProfile = !isOwn
              ? allProfiles.find(p => p.id === (c as any).owner_id)
              : null;
            const vgv = parseCurrency(c.intendedValue);
            // Comissão por venda — -14% em todos os casos
            const comissao = isOwn
              ? vgv * config.ownRate  * TAX_DEDUCTION
              : vgv * config.teamRate * TAX_DEDUCTION;

            const rawDate = (c as any).updated_at || (c as any).closed_at || c.createdAt;
            let dateDisplay = '—';
            try {
              if (rawDate) {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) dateDisplay = d.toLocaleDateString('pt-BR');
              }
            } catch { /* keep '—' */ }

            return (
              <div
                key={c.id}
                className={`bg-white dark:bg-surface-900 rounded-xl px-3 py-2.5 shadow-xs border ${
                  isOwn
                    ? 'border-green-100 dark:border-green-900/40'
                    : 'border-blue-100 dark:border-blue-900/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-text-primary text-sm truncate">{c.name}</p>
                      {hasTeamCommission && (
                        <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-px rounded-full ${
                          isOwn
                            ? 'bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {isOwn ? 'Própria' : ownerProfile?.name ?? 'Equipe'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-secondary truncate">{c.development || '—'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-text-primary">{formatBRL(vgv)}</p>
                    <p className={`text-[11px] font-semibold ${
                      isOwn
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}>{formatBRL(comissao)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <DollarSign size={10} className="text-text-secondary" />
                  <p className="text-[10px] text-text-secondary">{dateDisplay}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
