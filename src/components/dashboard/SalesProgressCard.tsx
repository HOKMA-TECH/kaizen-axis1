import { useApp } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/useAuthorization';
import { AlertTriangle, TrendingUp, DollarSign } from 'lucide-react';

// ─── Commission rates by role ─────────────────────────────────────────────────
const COMMISSION_RATE: Record<string, number> = {
  CORRETOR:    0.018,
  GERENTE:     0.024,
  COORDENADOR: 0.020,
};
const TAX_DEDUCTION = 0.86; // -14%

function parseCurrency(value: any): number {
  if (value == null) return 0;
  // If already a number (DB numeric column), return directly
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  // String like "R$ 450.000" or "R$ 450.000,00" → 450000
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
  const { clients, user } = useApp();
  const { role } = useAuthorization();

  const commissionRate = COMMISSION_RATE[role] ?? COMMISSION_RATE.CORRETOR;

  // Filter: only current user's own sales, stage Concluído, updated this month
  const monthlySales = clients
    .filter(c => {
      if (c.stage !== 'Concluído') return false;
      // Own sales only — owner_id comes from the DB spread
      const ownerId = (c as any).owner_id;
      if (ownerId && user?.id && ownerId !== user.id) return false;
      return isCurrentMonth((c as any).updated_at || c.createdAt);
    })
    .slice(0, 50);

  const totalVGV = monthlySales.reduce((sum, c) => sum + parseCurrency(c.intendedValue), 0);
  const totalComissao = totalVGV * commissionRate * TAX_DEDUCTION;
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
      <div className="flex items-stretch mb-4 rounded-xl overflow-hidden border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5">
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
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Comissão</p>
          <p className="text-sm font-bold text-green-600 dark:text-green-400">{formatBRL(totalComissao)}</p>
        </div>
      </div>

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
            const vgv = parseCurrency(c.intendedValue);
            const comissao = vgv * commissionRate * TAX_DEDUCTION;
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
                className="bg-white dark:bg-surface-900 rounded-xl px-3 py-2.5 shadow-xs border border-green-100 dark:border-green-900/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-primary text-sm truncate">{c.name}</p>
                    <p className="text-[11px] text-text-secondary truncate">{c.development || '—'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-text-primary">{formatBRL(vgv)}</p>
                    <p className="text-[11px] text-green-600 dark:text-green-400 font-semibold">{formatBRL(comissao)}</p>
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
