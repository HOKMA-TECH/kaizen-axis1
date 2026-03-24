import { useState, useEffect } from 'react';
import { SectionHeader, PremiumCard, RoundedButton, StatusBadge } from '@/components/ui/PremiumComponents';
import { MetricCard } from '@/components/reports/MetricCard';
import { CircularScore } from '@/components/reports/CircularScore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, FileSpreadsheet, FileText, Loader2, Building2, Users, TrendingUp, Target, ArrowLeft, AlertCircle, Timer, Shield, ChevronRight, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp, Team } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useReportsData } from '@/hooks/useReportsData';
import { supabase } from '@/lib/supabase';
import type { DiretoriaReport, DiretoriaResumo } from '@/types/reports';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

/** Convert period label to ISO start date (end date = today) */
function periodToDates(period: string): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (period === '30 dias') start.setDate(end.getDate() - 30);
  else if (period === '60 dias') start.setDate(end.getDate() - 60);
  else if (period === '90 dias') start.setDate(end.getDate() - 90);
  else {
    // Custom: parse 'DD/MM/YYYY - DD/MM/YYYY'
    const parts = period.split(' - ');
    if (parts.length === 2) {
      const [d1, m1, y1] = parts[0].split('/');
      const [d2, m2, y2] = parts[1].split('/');
      return { start: `${y1}-${m1}-${d1}`, end: `${y2}-${m2}-${d2}` };
    }
  }
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

/** Parse "R$ 200.000,00" → 200000 */
function parseValue(v: string): number {
  if (!v) return 0;
  const clean = v.replace(/[R$\s.]/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

// ─── Sub-view: Equipe Report ────────────────────────────────────────────────────

function TeamReportView({
  team, startDate, endDate,
}: { team: Team; startDate: string; endDate: string }) {
  const navigate = useNavigate();
  const { allProfiles, clients } = useApp();
  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);

  // Members of this team:
  // - team.members[] is the authoritative list (set by the approval flow)
  // - fallback: profile.team stores the team UUID (AdminPanel sets team = team_id)
  // - always include the team manager themselves
  const memberIds = Array.from(new Set([
    ...(team.members ?? []),
    ...allProfiles.filter(p => p.team === team.id || p.team_id === team.id).map(p => p.id),
    ...(team.manager_id ? [team.manager_id] : []),
  ]));

  // Clients belonging to team members, optionally filtered by date range
  const start = startDate ? new Date(startDate).getTime() : null;
  const end = endDate ? new Date(endDate + 'T23:59:59').getTime() : null;

  const teamClients = clients.filter(c => {
    const ownerId = (c as any).owner_id;
    if (!memberIds.includes(ownerId)) return false;
    if (start && end) {
      const created = c.createdAt ? new Date(c.createdAt).getTime() : 0;
      return created >= start && created <= end;
    }
    return true;
  });

  const totalClientes = teamClients.length;
  const vendas = teamClients.filter(c => c.stage === 'Concluído').length;
  const aprovados = teamClients.filter(c => c.stage === 'Aprovado').length;
  const taxaConversao = totalClientes > 0 ? Math.round((vendas / totalClientes) * 100) : 0;
  const vgv = teamClients
    .filter(c => c.stage === 'Concluído')
    .reduce((acc, c) => acc + parseValue(c.intendedValue), 0);

  // Stage breakdown
  const byStage: Record<string, number> = {};
  teamClients.forEach(c => {
    byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
  });

  // Broker ranking
  const brokerRanking = allProfiles
    .filter(p => memberIds.includes(p.id))
    .map(p => {
      const brokerClients = teamClients.filter(c => (c as any).owner_id === p.id);
      return {
        id: p.id,
        name: p.name,
        total: brokerClients.length,
        vendas: brokerClients.filter(c => c.stage === 'Concluído').length,
      };
    })
    .sort((a, b) => b.vendas - a.vendas || b.total - a.total);

  const convColor = taxaConversao >= 60
    ? 'text-green-600' : taxaConversao >= 30
      ? 'text-gold-600' : 'text-red-500';

  return (
    <div className="p-6 pb-24 min-h-screen bg-surface-50">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <button
            onClick={() => navigate('/reports')}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-gold-600 font-medium mb-2 transition-colors"
          >
            <ArrowLeft size={13} /> Ver Relatório Global
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center">
              <Shield size={18} className="text-gold-600 dark:text-gold-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">{team.name}</h1>
              <p className="text-xs text-text-secondary">Relatório por Equipe</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <section className="grid grid-cols-2 gap-3 mb-6">
        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Total Clientes</p>
          <div className="flex items-end gap-2 mt-1">
            <Users size={18} className="text-gold-500 mb-0.5" />
            <h3 className="text-2xl font-bold text-text-primary">{totalClientes}</h3>
          </div>
        </PremiumCard>

        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Vendas Concluídas</p>
          <div className="flex items-end gap-2 mt-1">
            <TrendingUp size={18} className="text-green-500 mb-0.5" />
            <h3 className="text-2xl font-bold text-text-primary">{vendas}</h3>
          </div>
        </PremiumCard>

        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Aprovados</p>
          <div className="flex items-end gap-2 mt-1">
            <TrendingUp size={18} className="text-blue-500 mb-0.5" />
            <h3 className="text-2xl font-bold text-green-600">{aprovados}</h3>
          </div>
        </PremiumCard>

        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Taxa de Conversão</p>
          <div className="flex items-end gap-2 mt-1">
            <Target size={18} className="text-blue-500 mb-0.5" />
            <h3 className={`text-2xl font-bold ${convColor}`}>{taxaConversao}%</h3>
          </div>
        </PremiumCard>

        <PremiumCard highlight className="col-span-2 flex flex-col gap-1">
          <p className="text-[10px] text-gold-700 dark:text-gold-400 uppercase tracking-wide">VGV Concluído</p>
          <h3 className="text-2xl font-bold text-text-primary mt-1">{brl(vgv)}</h3>
        </PremiumCard>
      </section>

      {/* Pipeline by stage */}
      <section className="mb-6">
        <SectionHeader title="Pipeline por Etapa" subtitle="Distribuição atual dos clientes" />
        <PremiumCard className="overflow-hidden p-0">
          {Object.entries(byStage).length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-8">Nenhum cliente no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50 dark:bg-surface-100">
                  <th className="text-left p-3 text-xs font-medium text-text-secondary uppercase tracking-wide">Etapa</th>
                  <th className="text-center p-3 text-xs font-medium text-text-secondary uppercase tracking-wide">Clientes</th>
                  <th className="text-center p-3 text-xs font-medium text-text-secondary uppercase tracking-wide">%</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byStage)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, count]) => (
                    <tr key={stage} className="border-b border-surface-100 last:border-0 hover:bg-surface-50 transition-colors">
                      <td className="p-3 font-medium text-text-primary">{stage}</td>
                      <td className="p-3 text-center text-text-secondary">{count}</td>
                      <td className="p-3 text-center">
                        <span className="text-xs font-bold text-text-secondary">
                          {totalClientes > 0 ? Math.round((count / totalClientes) * 100) : 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </PremiumCard>
      </section>

      {/* Broker ranking */}
      <section>
        <SectionHeader title="Ranking de Corretores" subtitle="Clique em um corretor para ver seus clientes" />
        {brokerRanking.length === 0 ? (
          <PremiumCard className="text-center py-8">
            <p className="text-text-secondary text-sm">Nenhum corretor vinculado a esta equipe.</p>
          </PremiumCard>
        ) : (
          <div className="space-y-2">
            {brokerRanking.map((broker, i) => {
              const score = broker.total > 0 ? Math.min(100, Math.round((broker.vendas / broker.total) * 100)) : 0;
              const isSelected = selectedBrokerId === broker.id;
              const brokerClients = teamClients.filter(c => (c as any).owner_id === broker.id);
              return (
                <div key={broker.id}>
                  <PremiumCard
                    className={`flex items-center justify-between p-4 cursor-pointer transition-all ${isSelected ? 'border-gold-400 dark:border-gold-500 shadow-md' : 'hover:border-gold-300'}`}
                    onClick={() => setSelectedBrokerId(isSelected ? null : broker.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-gold-100 dark:bg-gold-900/40 flex items-center justify-center text-xs font-bold text-gold-700">
                        {i + 1}
                      </div>
                      <CircularScore score={score} />
                      <div>
                        <h4 className="font-bold text-text-primary text-sm">{broker.name}</h4>
                        <p className="text-xs text-text-secondary">{broker.total} cliente{broker.total !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">{broker.vendas} vendas</p>
                        <p className="text-xs text-text-secondary">{score}% conv.</p>
                      </div>
                      <ChevronRight
                        size={16}
                        className={`text-text-secondary transition-transform ${isSelected ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </PremiumCard>

                  {/* Client list for selected broker */}
                  {isSelected && (
                    <div className="mt-1 mb-2 ml-4 border-l-2 border-gold-200 dark:border-gold-800 pl-3 space-y-2">
                      {brokerClients.length === 0 ? (
                        <p className="text-xs text-text-secondary py-2 pl-1">Nenhum cliente no período selecionado.</p>
                      ) : (
                        brokerClients.map(client => (
                          <div
                            key={client.id}
                            onClick={() => navigate(`/clients/${client.id}`)}
                            className="flex items-center justify-between bg-card-bg rounded-xl px-3 py-2.5 cursor-pointer hover:bg-gold-50 dark:hover:bg-gold-900/10 hover:border-gold-200 border border-surface-100 transition-all"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-text-primary truncate">{client.name}</p>
                              <p className="text-xs text-text-secondary truncate">{client.development || 'Sem empreendimento'}</p>
                            </div>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              <StatusBadge status={client.stage} />
                              <ChevronRight size={14} className="text-text-secondary" />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Sub-view: Coordenação Report ─────────────────────────────────────────────

function CoordReportView({
  coordId, coordName, startDate, endDate,
}: { coordId: string; coordName: string; startDate: string; endDate: string }) {
  const navigate = useNavigate();
  const { allProfiles, clients } = useApp();
  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);

  // Corretores vinculados a este coordenador
  const brokerProfiles = allProfiles.filter(p => p.coordinator_id === coordId);
  const memberIds = Array.from(new Set([coordId, ...brokerProfiles.map(p => p.id)]));

  const start = startDate ? new Date(startDate).getTime() : null;
  const end = endDate ? new Date(endDate + 'T23:59:59').getTime() : null;

  const coordClients = clients.filter(c => {
    const ownerId = (c as any).owner_id;
    if (!memberIds.includes(ownerId)) return false;
    if (start && end) {
      const created = c.createdAt ? new Date(c.createdAt).getTime() : 0;
      return created >= start && created <= end;
    }
    return true;
  });

  const totalClientes = coordClients.length;
  const vendas = coordClients.filter(c => c.stage === 'Concluído').length;
  const aprovados = coordClients.filter(c => c.stage === 'Aprovado').length;
  const taxaConversao = totalClientes > 0 ? Math.round((vendas / totalClientes) * 100) : 0;
  const vgv = coordClients
    .filter(c => c.stage === 'Concluído')
    .reduce((acc, c) => acc + parseValue(c.intendedValue), 0);

  const byStage: Record<string, number> = {};
  coordClients.forEach(c => { byStage[c.stage] = (byStage[c.stage] ?? 0) + 1; });

  const brokerRanking = allProfiles
    .filter(p => memberIds.includes(p.id))
    .map(p => {
      const bc = coordClients.filter(c => (c as any).owner_id === p.id);
      return {
        id: p.id,
        name: p.name,
        total: bc.length,
        vendas: bc.filter(c => c.stage === 'Concluído').length,
      };
    })
    .sort((a, b) => b.vendas - a.vendas || b.total - a.total);

  const convColor = taxaConversao >= 60
    ? 'text-green-600' : taxaConversao >= 30
      ? 'text-gold-600' : 'text-red-500';

  return (
    <div className="p-6 pb-24 min-h-screen bg-surface-50">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <button
            onClick={() => navigate('/reports')}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-gold-600 font-medium mb-2 transition-colors"
          >
            <ArrowLeft size={13} /> Ver Relatório Global
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Users size={18} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">{coordName}</h1>
              <p className="text-xs text-text-secondary">Relatório por Coordenação</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <section className="grid grid-cols-2 gap-3 mb-6">
        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Total Clientes</p>
          <div className="flex items-end gap-2 mt-1">
            <Users size={18} className="text-gold-500 mb-0.5" />
            <h3 className="text-2xl font-bold text-text-primary">{totalClientes}</h3>
          </div>
        </PremiumCard>

        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Vendas Concluídas</p>
          <div className="flex items-end gap-2 mt-1">
            <TrendingUp size={18} className="text-green-500 mb-0.5" />
            <h3 className="text-2xl font-bold text-text-primary">{vendas}</h3>
          </div>
        </PremiumCard>

        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Aprovados</p>
          <div className="flex items-end gap-2 mt-1">
            <TrendingUp size={18} className="text-blue-500 mb-0.5" />
            <h3 className="text-2xl font-bold text-green-600">{aprovados}</h3>
          </div>
        </PremiumCard>

        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Taxa de Conversão</p>
          <div className="flex items-end gap-2 mt-1">
            <Target size={18} className="text-blue-500 mb-0.5" />
            <h3 className={`text-2xl font-bold ${convColor}`}>{taxaConversao}%</h3>
          </div>
        </PremiumCard>

        <PremiumCard highlight className="col-span-2 flex flex-col gap-1">
          <p className="text-[10px] text-gold-700 dark:text-gold-400 uppercase tracking-wide">VGV Concluído</p>
          <h3 className="text-2xl font-bold text-text-primary mt-1">{brl(vgv)}</h3>
        </PremiumCard>
      </section>

      {/* Pipeline by stage */}
      <section className="mb-6">
        <SectionHeader title="Pipeline por Etapa" subtitle="Distribuição atual dos clientes" />
        <PremiumCard className="overflow-hidden p-0">
          {Object.entries(byStage).length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-8">Nenhum cliente no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50 dark:bg-surface-100">
                  <th className="text-left p-3 text-xs font-medium text-text-secondary uppercase tracking-wide">Etapa</th>
                  <th className="text-center p-3 text-xs font-medium text-text-secondary uppercase tracking-wide">Clientes</th>
                  <th className="text-center p-3 text-xs font-medium text-text-secondary uppercase tracking-wide">%</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byStage)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, count]) => (
                    <tr key={stage} className="border-b border-surface-100 last:border-0 hover:bg-surface-50 transition-colors">
                      <td className="p-3 font-medium text-text-primary">{stage}</td>
                      <td className="p-3 text-center text-text-secondary">{count}</td>
                      <td className="p-3 text-center">
                        <span className="text-xs font-bold text-text-secondary">
                          {totalClientes > 0 ? Math.round((count / totalClientes) * 100) : 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </PremiumCard>
      </section>

      {/* Broker ranking — clicável com lista de clientes */}
      <section>
        <SectionHeader title="Ranking de Corretores" subtitle="Clique em um corretor para ver seus clientes" />
        {brokerRanking.length === 0 ? (
          <PremiumCard className="text-center py-8">
            <p className="text-text-secondary text-sm">Nenhum corretor vinculado a esta coordenação.</p>
          </PremiumCard>
        ) : (
          <div className="space-y-2">
            {brokerRanking.map((broker, i) => {
              const score = broker.total > 0 ? Math.min(100, Math.round((broker.vendas / broker.total) * 100)) : 0;
              const isSelected = selectedBrokerId === broker.id;
              const brokerClients = coordClients.filter(c => (c as any).owner_id === broker.id);
              return (
                <div key={broker.id}>
                  <PremiumCard
                    className={`flex items-center justify-between p-4 cursor-pointer transition-all ${isSelected ? 'border-gold-400 dark:border-gold-500 shadow-md' : 'hover:border-gold-300'}`}
                    onClick={() => setSelectedBrokerId(isSelected ? null : broker.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-gold-100 dark:bg-gold-900/40 flex items-center justify-center text-xs font-bold text-gold-700">
                        {i + 1}
                      </div>
                      <CircularScore score={score} />
                      <div>
                        <h4 className="font-bold text-text-primary text-sm">{broker.name}</h4>
                        <p className="text-xs text-text-secondary">{broker.total} cliente{broker.total !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">{broker.vendas} vendas</p>
                        <p className="text-xs text-text-secondary">{score}% conv.</p>
                      </div>
                      <ChevronRight
                        size={16}
                        className={`text-text-secondary transition-transform ${isSelected ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </PremiumCard>

                  {isSelected && (
                    <div className="mt-1 mb-2 ml-4 border-l-2 border-gold-200 dark:border-gold-800 pl-3 space-y-2">
                      {brokerClients.length === 0 ? (
                        <p className="text-xs text-text-secondary py-2 pl-1">Nenhum cliente no período selecionado.</p>
                      ) : (
                        brokerClients.map(client => (
                          <div
                            key={client.id}
                            onClick={() => navigate(`/clients/${client.id}`)}
                            className="flex items-center justify-between bg-card-bg rounded-xl px-3 py-2.5 cursor-pointer hover:bg-gold-50 dark:hover:bg-gold-900/10 border border-surface-100 hover:border-gold-200 transition-all"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-text-primary truncate">{client.name}</p>
                              <p className="text-xs text-text-secondary truncate">{client.development || 'Sem empreendimento'}</p>
                            </div>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              <StatusBadge status={client.stage} />
                              <ChevronRight size={14} className="text-text-secondary" />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Sub-view: Diretoria Report ────────────────────────────────────────────────

function DiretoriaReportView({
  dirId, dirName, startDate, endDate,
}: { dirId: string; dirName: string; startDate: string; endDate: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<DiretoriaReport | null>(null);
  const [loadingDir, setLoadingDir] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingDir(true);
    setError(null);
    supabase
      .rpc('get_relatorio_diretoria', {
        diretoria_uuid: dirId,
        p_start_date: startDate ? new Date(startDate).toISOString() : null,
        p_end_date: endDate ? new Date(endDate + 'T23:59:59').toISOString() : null,
      })
      .then(({ data: result, error: rpcError }) => {
        if (rpcError) { setError(rpcError.message); }
        else if ((result as any)?.error) { setError((result as any).error); }
        else { setData(result as DiretoriaReport); }
        setLoadingDir(false);
      });
  }, [dirId, startDate, endDate]);

  if (loadingDir) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 text-gold-500 animate-spin" />
        <p className="text-text-secondary text-sm">Carregando relatório da diretoria…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 pb-24">
        <PremiumCard className="flex flex-col items-center gap-4 py-12 text-center">
          <AlertCircle size={40} className="text-red-400" />
          <div>
            <h3 className="font-bold text-text-primary mb-1">Diretoria não encontrada</h3>
            <p className="text-sm text-text-secondary">{error ?? 'Não foi possível carregar os dados.'}</p>
          </div>
          <RoundedButton onClick={() => navigate('/reports')}>← Ver Relatório Global</RoundedButton>
        </PremiumCard>
      </div>
    );
  }

  const { resumo, equipes, corretores } = data;
  const displayName = data.diretoria_nome || dirName;

  const convColor = resumo.taxa_conversao >= 60
    ? 'text-green-600' : resumo.taxa_conversao >= 30
      ? 'text-gold-600' : 'text-red-500';

  return (
    <div className="p-6 pb-24 min-h-screen bg-surface-50 print:bg-white print:p-0 print:min-h-0 print:h-auto print:block">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 gap-3 print:mb-2">
        <div>
          <button
            onClick={() => navigate('/reports')}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-gold-600 font-medium mb-2 transition-colors"
          >
            <ArrowLeft size={13} /> Ver Relatório Global
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center">
              <Building2 size={18} className="text-gold-600 dark:text-gold-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">{displayName}</h1>
              <p className="text-xs text-text-secondary">Relatório por Diretoria</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Resumo Cards ── */}
      <section className="grid grid-cols-2 gap-3 mb-6">
        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Total Clientes</p>
          <div className="flex items-end gap-2 mt-1">
            <Users size={18} className="text-gold-500 mb-0.5" />
            <h3 className="text-2xl font-bold text-text-primary">{resumo.total_clientes}</h3>
          </div>
        </PremiumCard>

        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Vendas Concluídas</p>
          <div className="flex items-end gap-2 mt-1">
            <TrendingUp size={18} className="text-green-500 mb-0.5" />
            <h3 className="text-2xl font-bold text-text-primary">{resumo.total_vendas}</h3>
          </div>
        </PremiumCard>

        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Aprovados</p>
          <div className="flex items-end gap-2 mt-1">
            <TrendingUp size={18} className="text-blue-500 mb-0.5" />
            <h3 className="text-2xl font-bold text-green-600">{resumo.total_aprovados ?? 0}</h3>
          </div>
        </PremiumCard>

        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Taxa de Conversão</p>
          <div className="flex items-end gap-2 mt-1">
            <Target size={18} className="text-blue-500 mb-0.5" />
            <h3 className={`text-2xl font-bold ${convColor}`}>{resumo.taxa_conversao ?? 0}%</h3>
          </div>
        </PremiumCard>

        <PremiumCard className="flex flex-col gap-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Ciclo Médio de Venda</p>
          <div className="flex items-end gap-2 mt-1">
            <Timer size={18} className="text-purple-500 mb-0.5" />
            <h3 className="text-2xl font-bold text-text-primary">
              {resumo.ciclo_medio_dias ?? 0}
              <span className="text-sm font-normal text-text-secondary ml-1">dias</span>
            </h3>
          </div>
        </PremiumCard>

        <PremiumCard highlight className="col-span-2 flex flex-col gap-1">
          <p className="text-[10px] text-gold-700 dark:text-gold-400 uppercase tracking-wide">Receita Total</p>
          <h3 className="text-2xl font-bold text-text-primary mt-1">{brl(resumo.receita_total ?? 0)}</h3>
        </PremiumCard>
      </section>

      {/* ── Equipes ── */}
      <section className="mb-6">
        <SectionHeader title="Por Equipe" subtitle="Desempenho das equipes da diretoria" />
        {equipes.length === 0 ? (
          <PremiumCard className="text-center py-8">
            <p className="text-text-secondary text-sm">Nenhuma equipe cadastrada nesta diretoria.</p>
          </PremiumCard>
        ) : (
          <PremiumCard className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50 dark:bg-surface-100">
                  <th className="text-left p-3 text-xs font-medium text-text-secondary uppercase tracking-wide">Equipe</th>
                  <th className="text-center p-3 text-xs font-medium text-text-secondary uppercase tracking-wide">Clientes</th>
                  <th className="text-center p-3 text-xs font-medium text-text-secondary uppercase tracking-wide">Vendas</th>
                  <th className="text-center p-3 text-xs font-medium text-text-secondary uppercase tracking-wide">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {equipes.map((eq, i) => {
                  const conv = eq.total_clientes > 0
                    ? Math.round((eq.total_vendas / eq.total_clientes) * 100) : 0;
                  return (
                    <tr key={eq.equipe_id ?? i} className="border-b border-surface-100 last:border-0 hover:bg-surface-50 transition-colors">
                      <td className="p-3 font-medium text-text-primary">{eq.equipe_nome}</td>
                      <td className="p-3 text-center text-text-secondary">{eq.total_clientes}</td>
                      <td className="p-3 text-center font-bold text-green-600">{eq.total_vendas}</td>
                      <td className="p-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${conv >= 60 ? 'bg-green-100 text-green-700'
                          : conv >= 30 ? 'bg-gold-100 text-gold-700'
                            : 'bg-surface-100 text-text-secondary'
                          }`}>{conv}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PremiumCard>
        )}
      </section>

      {/* ── Corretores ── */}
      <section>
        <SectionHeader title="Ranking de Corretores" subtitle="Desempenho individual dos corretores" />
        {corretores.length === 0 ? (
          <PremiumCard className="text-center py-8">
            <p className="text-text-secondary text-sm">Nenhum corretor vinculado a esta diretoria.</p>
          </PremiumCard>
        ) : (
          <div className="space-y-2">
            {corretores.map((cor, i) => {
              const score = cor.total_clientes > 0
                ? Math.min(100, Math.round((cor.total_vendas / cor.total_clientes) * 100)) : 0;
              return (
                <PremiumCard key={cor.corretor_id ?? i} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gold-100 dark:bg-gold-900/40 flex items-center justify-center text-xs font-bold text-gold-700">
                      {i + 1}
                    </div>
                    <CircularScore score={score} />
                    <div>
                      <h4 className="font-bold text-text-primary text-sm">{cor.corretor_nome}</h4>
                      <p className="text-xs text-text-secondary">{cor.equipe}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-text-secondary">{cor.total_clientes} clientes</p>
                    <p className="text-sm font-bold text-green-600">{cor.total_vendas} vendas</p>
                  </div>
                </PremiumCard>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Main: Global Reports View ─────────────────────────────────────────────────

export default function Reports() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loading, teams, allProfiles, profile } = useApp();
  const { isAdmin, isManager, canViewAllClients } = useAuthorization();

  // ── Period state
  const [period, setPeriod] = useState('30 dias');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');

  // ── Route-level scope reading
  const scope = searchParams.get('scope') ?? 'global';
  const scopeId = searchParams.get('id') ?? '';
  const scopeName = decodeURIComponent(searchParams.get('name') ?? '');

  // ── Derive ISO dates from selected period
  const { start: startDate, end: endDate } = periodToDates(period);

  // ── Business Intelligence hook — reactive to date range
  const { globalMetrics, weightedPipeline, forecastTotal, healthScores } = useReportsData({
    startDate,
    endDate,
  });

  // ── Metric cards for display
  const metrics = [
    {
      id: '1',
      label: 'Vendas Totais',
      value: globalMetrics.totalVendas.toString(),
      change: '',
      trend: 'up' as const,
      period: `no período de ${period}`,
    },
    {
      id: '2',
      label: 'Novos Leads',
      value: globalMetrics.novosLeads.toString(),
      change: '',
      trend: 'up' as const,
      period: 'total no sistema',
    },
    {
      id: '3',
      label: 'Taxa de Conversão',
      value: `${globalMetrics.taxaConversao.toFixed(1)}%`,
      change: '',
      trend: 'up' as const,
      period: `no período de ${period}`,
    },
    {
      id: '4',
      label: 'Ciclo de Vendas',
      value: globalMetrics.cicloMedioDias > 0 ? `${globalMetrics.cicloMedioDias} dias` : '— dias',
      change: '',
      trend: 'down' as const,
      period: 'média real',
    },
  ];

  // ── Delegate to diretoria sub-view (ADMIN only)
  if (scope === 'diretoria' && scopeId && isAdmin) {
    return <DiretoriaReportView dirId={scopeId} dirName={scopeName || 'Diretoria'} startDate={startDate} endDate={endDate} />;
  }

  // ── Delegate to equipe sub-view
  if (scope === 'equipe' && scopeId && canViewAllClients) {
    const teamObj = teams.find(t => t.id === scopeId);
    if (teamObj) {
      return <TeamReportView team={teamObj} startDate={startDate} endDate={endDate} />;
    }
  }

  // ── Delegate to coordenação sub-view (GERENTE + ADMIN)
  if (scope === 'coordenacao' && scopeId && (isManager || isAdmin)) {
    return <CoordReportView coordId={scopeId} coordName={scopeName || 'Coordenação'} startDate={startDate} endDate={endDate} />;
  }

  const handlePeriodChange = (p: string) => {
    if (p === 'Personalizado') setIsDateModalOpen(true);
    else setPeriod(p);
  };

  const applyCustomDate = () => {
    if (startDateInput && endDateInput) {
      const fmt = (d: string) => d.split('-').reverse().join('/');
      setPeriod(`${fmt(startDateInput)} - ${fmt(endDateInput)}`);
      setIsDateModalOpen(false);
    } else alert('Por favor, selecione as datas de início e fim.');
  };

  const handleExport = (format: 'pdf' | 'excel') => {
    const fileName = `relatorio_estrategico_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'csv' : 'pdf'}`;
    if (format === 'excel') {
      const headers = ['Cliente', 'Estágio', 'Valor Potencial', 'Health Score'];
      const rows = healthScores.map(c => [c.name, c.stage, c.potentialValue, c.score]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.click();
    } else {
      setIsExportModalOpen(false);
      setTimeout(() => { window.print(); }, 150);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 text-gold-500 animate-spin" />
    </div>
  );

  return (
    <div className="p-6 pb-24 min-h-screen bg-surface-50 print:bg-white print:p-0 print:min-h-0 print:h-auto print:block">
      <div className="flex justify-between items-center mb-6 print:mb-2">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Relatórios</h1>
          <p className="text-text-secondary text-sm">Inteligência Estratégica — Visão Global</p>
        </div>
        <button
          onClick={() => setIsExportModalOpen(true)}
          className="p-2 bg-white dark:bg-surface-100 border border-surface-200 rounded-lg text-text-secondary hover:text-gold-600 shadow-sm print:hidden"
        >
          <Download size={20} />
        </button>
      </div>

      {/* ── Period Filters ── */}
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-2 print:hidden">
        {['30 dias', '60 dias', '90 dias', 'Personalizado'].map((p) => (
          <button
            key={p}
            onClick={() => handlePeriodChange(p)}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${period === p || (p === 'Personalizado' && period.includes('/'))
              ? 'bg-gold-500 text-white shadow-md'
              : 'bg-white dark:bg-surface-100 text-text-secondary border border-surface-200'
              }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* ── Metric Cards ── */}
      <section className="grid grid-cols-2 gap-3 mb-8">
        {metrics.map((metric) => (
          <MetricCard key={metric.id} {...metric} inverse={metric.label === 'Ciclo de Vendas'} />
        ))}
      </section>

      {/* ── Weighted Pipeline Chart ── */}
      <section className="mb-8 print:break-inside-avoid">
        <SectionHeader title="Forecast Comercial" subtitle="Pipeline Ponderado por Probabilidade de Estágio" />
        <PremiumCard className="p-4 h-80">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-xs text-text-secondary uppercase">Receita Ponderada (Pipeline)</p>
              <h3 className="text-xl font-bold text-text-primary">
                R$ {(forecastTotal / 1000000).toFixed(2)}M
              </h3>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-text-secondary uppercase">Período</p>
              <p className="text-xs font-medium text-text-primary">{period}</p>
            </div>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weightedPipeline}>
                <defs>
                  <linearGradient id="colorWeighted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1F6FE5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1F6FE5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6B7280' }} dy={10} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  formatter={(val: number, name: string) => [
                    `R$ ${val.toFixed(0)}k`,
                    name === 'weighted' ? 'Pipeline Ponderado' : 'Confirmado',
                  ]}
                />
                <Area type="monotone" dataKey="weighted" stroke="#1F6FE5" strokeWidth={3} fillOpacity={1} fill="url(#colorWeighted)" />
                <Area type="monotone" dataKey="confirmed" stroke="#10B981" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gold-500" /><span className="text-[10px] text-text-secondary">Pipeline Ponderado</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-[10px] text-text-secondary">Confirmado</span></div>
          </div>
        </PremiumCard>
      </section>

      {/* ── Health Score ── */}
      <section>
        <SectionHeader title="Health Score Comercial" subtitle="Risco e Probabilidade — Ponderado" />
        <div className="space-y-3">
          {healthScores.length === 0
            ? <p className="text-sm text-text-secondary text-center py-8">Dados insuficientes para análise.</p>
            : healthScores.map((client) => (
              <PremiumCard key={client.id} className="flex items-center justify-between p-4 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all" onClick={() => navigate(`/clients/${client.id}`)}>
                <div className="flex items-center gap-3">
                  <CircularScore score={client.score} />
                  <div>
                    <h4 className="font-bold text-text-primary text-sm">{client.name}</h4>
                    <p className="text-xs text-text-secondary">{client.stage} • {client.potentialValue}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-text-secondary uppercase mb-0.5">Probabilidade</p>
                  <p className={`text-sm font-bold ${client.conversionProbability > 70 ? 'text-green-600' : client.conversionProbability > 40 ? 'text-gold-600' : 'text-red-500'}`}>
                    {client.conversionProbability}%
                  </p>
                </div>
              </PremiumCard>
            ))}
        </div>
      </section>

      {/* ── Por Coordenação (GERENTE) ── */}
      {isManager && (() => {
        const myCoords = allProfiles.filter(
          p => p.manager_id === profile?.id && p.role?.toUpperCase() === 'COORDENADOR'
        );
        if (myCoords.length === 0) return null;
        return (
          <section className="mt-8 print:hidden">
            <SectionHeader title="Relatório por Coordenação" subtitle="Análise segmentada por coordenador" />
            <div className="grid grid-cols-1 gap-3">
              {myCoords.map(coord => {
                const brokerCount = allProfiles.filter(p => p.coordinator_id === coord.id).length;
                return (
                  <PremiumCard
                    key={coord.id}
                    className="flex items-center justify-between p-4 cursor-pointer hover:border-purple-300 transition-colors"
                    onClick={() => navigate(`/reports?scope=coordenacao&id=${coord.id}&name=${encodeURIComponent(coord.name)}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                        <Users size={20} className="text-purple-500" />
                      </div>
                      <div>
                        <h4 className="font-bold text-text-primary">{coord.name}</h4>
                        <p className="text-xs text-text-secondary">{brokerCount} corretor{brokerCount !== 1 ? 'es' : ''}</p>
                      </div>
                    </div>
                    <span className="text-gold-600 font-medium text-sm">Ver Relatório →</span>
                  </PremiumCard>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* ── Por Equipe ── */}
      {canViewAllClients && teams.length > 0 && (
        <section className="mt-8 print:hidden">
          <SectionHeader title="Relatório por Equipe" subtitle="Análise segmentada por equipe comercial" />
          <div className="grid grid-cols-1 gap-3">
            {teams.map(team => {
              const memberCount = new Set([
                ...(team.members ?? []),
                ...allProfiles.filter(p => p.team === team.id || p.team_id === team.id).map(p => p.id),
                ...(team.manager_id ? [team.manager_id] : []),
              ]).size;
              return (
                <PremiumCard
                  key={team.id}
                  className="flex items-center justify-between p-4 cursor-pointer hover:border-gold-300 transition-colors"
                  onClick={() => navigate(`/reports?scope=equipe&id=${team.id}&name=${encodeURIComponent(team.name)}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gold-50 dark:bg-gold-900/20 flex items-center justify-center">
                      <Shield size={20} className="text-gold-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-text-primary">{team.name}</h4>
                      <p className="text-xs text-text-secondary">{memberCount} membro{memberCount !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-gold-600 font-medium text-sm">
                    Ver Relatório →
                  </div>
                </PremiumCard>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Export Modal ── */}
      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title="Exportar Relatório">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary text-center">Exportar relatório em PDF ({period}).</p>
          <div className="flex justify-center">
            <button onClick={() => handleExport('pdf')} className="flex flex-col items-center justify-center p-6 w-full max-w-xs bg-surface-50 hover:bg-surface-100 rounded-xl transition-all">
              <FileText size={24} className="text-red-600 mb-2" />
              <span className="text-sm font-medium">Baixar PDF</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Custom Date Modal ── */}
      <Modal isOpen={isDateModalOpen} onClose={() => setIsDateModalOpen(false)} title="Período Personalizado">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Início</label>
            <input type="date" value={startDateInput} onChange={e => setStartDateInput(e.target.value)} className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Fim</label>
            <input type="date" value={endDateInput} onChange={e => setEndDateInput(e.target.value)} className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" />
          </div>
          <RoundedButton fullWidth onClick={applyCustomDate}>Aplicar Filtro</RoundedButton>
        </div>
      </Modal>
    </div>
  );
}
