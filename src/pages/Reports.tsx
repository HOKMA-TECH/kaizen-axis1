import { useState, useMemo, useEffect } from 'react';
import { SectionHeader, PremiumCard, RoundedButton } from '@/components/ui/PremiumComponents';
import { MetricCard } from '@/components/reports/MetricCard';
import { CircularScore } from '@/components/reports/CircularScore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, FileSpreadsheet, FileText, Loader2, Building2, Users, TrendingUp, Target, ArrowLeft, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiretoriaResumo {
  total_clientes: number;
  total_vendas: number;
  taxa_conversao: number;
  receita_total: number;
}

interface DiretoriaEquipe {
  equipe_id: string;
  equipe_nome: string;
  total_clientes: number;
  total_vendas: number;
}

interface DiretoriaCorretor {
  corretor_id: string;
  corretor_nome: string;
  equipe: string;
  total_clientes: number;
  total_vendas: number;
}

interface DiretoriaReport {
  diretoria_nome: string;
  resumo: DiretoriaResumo;
  equipes: DiretoriaEquipe[];
  corretores: DiretoriaCorretor[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

// ─── Sub-view: Diretoria Report ────────────────────────────────────────────────

function DiretoriaReportView({ dirId, dirName }: { dirId: string; dirName: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<DiretoriaReport | null>(null);
  const [loadingDir, setLoadingDir] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingDir(true);
    setError(null);
    supabase
      .rpc('get_relatorio_diretoria', { diretoria_uuid: dirId })
      .then(({ data: result, error: rpcError }) => {
        if (rpcError) { setError(rpcError.message); }
        else if ((result as any)?.error) { setError((result as any).error); }
        else { setData(result as DiretoriaReport); }
        setLoadingDir(false);
      });
  }, [dirId]);

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
          <RoundedButton onClick={() => navigate('/reports')}>
            ← Ver Relatório Global
          </RoundedButton>
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
    <div className="p-6 pb-24 min-h-screen bg-surface-50">
      {/* ── Header ── */}
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
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Taxa de Conversão</p>
          <div className="flex items-end gap-2 mt-1">
            <Target size={18} className="text-blue-500 mb-0.5" />
            <h3 className={`text-2xl font-bold ${convColor}`}>{resumo.taxa_conversao ?? 0}%</h3>
          </div>
        </PremiumCard>

        <PremiumCard highlight className="flex flex-col gap-1">
          <p className="text-[10px] text-gold-700 dark:text-gold-400 uppercase tracking-wide">Receita Total</p>
          <h3 className="text-xl font-bold text-text-primary mt-1 leading-tight">
            {brl(resumo.receita_total ?? 0)}
          </h3>
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
                    <tr key={eq.equipe_id ?? i} className="border-b border-surface-100 last:border-0 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors">
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
  const { clients, leads, loading } = useApp();
  const [period, setPeriod] = useState('30 dias');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // ── Route-level scope reading
  const scope = searchParams.get('scope') ?? 'global';
  const dirId = searchParams.get('id');
  const dirName = decodeURIComponent(searchParams.get('name') ?? 'Diretoria');

  // ─── All hooks must run unconditionally (Rules of Hooks) ──────────────────
  const metrics = useMemo(() => {
    const totalClients = clients.length;
    const closedSales = clients.filter(c => c.stage === 'Concluído' || c.stage === 'Vendas Concluidas').length;
    const conversionRate = totalClients > 0 ? (closedSales / totalClients) * 100 : 0;
    return [
      { id: '1', label: 'Vendas Totais', value: closedSales.toString(), change: '+12%', trend: 'up' as const, period: 'vs. mês anterior' },
      { id: '2', label: 'Novos Leads', value: leads.length.toString(), change: '+8%', trend: 'up' as const, period: 'vs. mês anterior' },
      { id: '3', label: 'Taxa de Conversão', value: `${conversionRate.toFixed(1)}%`, change: '+2.4%', trend: 'up' as const, period: 'vs. mês anterior' },
      { id: '4', label: 'Ciclo de Vendas', value: '18 dias', change: '-2 dias', trend: 'down' as const, period: 'vs. mês anterior' },
    ];
  }, [clients, leads]);

  const forecastTotal = useMemo(() => {
    const approved = clients.filter(c => c.stage === 'Aprovado');
    return approved.reduce((acc, c) => {
      const val = parseFloat(c.intendedValue.replace(/[^\d]/g, '')) || 0;
      return acc + val;
    }, 0);
  }, [clients]);

  const chartData = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const currentMonth = new Date().getMonth();
    return months.map((m, i) => {
      const monthClients = clients.filter(c => new Date(c.createdAt).getMonth() === i);
      const predicted = monthClients.reduce((acc, c) => acc + (parseFloat(c.intendedValue.replace(/[^\d]/g, '')) || 0), 0) || (i <= currentMonth ? 100000 + (i * 20000) : 0);
      return { month: m, predicted: predicted / 1000, confirmed: (i <= currentMonth ? predicted * 0.7 : 0) / 1000 };
    });
  }, [clients]);

  const clientHealth = useMemo(() => {
    return clients.slice(0, 5).map(c => {
      let score = 50;
      if (c.stage === 'Aprovado') score = 85;
      if (c.stage === 'Em Tratativa') score = 70;
      if (c.stage === 'Reprovado') score = 20;
      return { id: c.id, name: c.name, stage: c.stage, score, potentialValue: c.intendedValue, conversionProbability: score };
    });
  }, [clients]);

  // ── Delegate to diretoria sub-view (after all hooks — safe to do early return here)
  if (scope === 'diretoria' && dirId) {
    return <DiretoriaReportView dirId={dirId} dirName={dirName} />;
  }


  const handlePeriodChange = (p: string) => {
    if (p === 'Personalizado') setIsDateModalOpen(true);
    else setPeriod(p);
  };

  const applyCustomDate = () => {
    if (startDate && endDate) {
      setPeriod(`${startDate.split('-').reverse().join('/')} - ${endDate.split('-').reverse().join('/')}`);
      setIsDateModalOpen(false);
    } else alert('Por favor, selecione as datas de início e fim.');
  };

  const handleExport = (format: 'pdf' | 'excel') => {
    const fileName = `relatorio_estrategico_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'csv' : 'pdf'}`;
    if (format === 'excel') {
      const headers = ['Cliente', 'Estágio', 'Valor Potencial', 'Health Score'];
      const rows = clientHealth.map(c => [c.name, c.stage, c.potentialValue, c.score]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.click();
    } else window.print();
    setIsExportModalOpen(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 text-gold-500 animate-spin" />
    </div>
  );

  return (
    <div className="p-6 pb-24 min-h-screen bg-surface-50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Relatórios</h1>
          <p className="text-text-secondary text-sm">Inteligência Estratégica — Visão Global</p>
        </div>
        <button onClick={() => setIsExportModalOpen(true)} className="p-2 bg-white dark:bg-surface-100 border border-surface-200 rounded-lg text-text-secondary hover:text-gold-600 shadow-sm">
          <Download size={20} />
        </button>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-2">
        {['30 dias', '60 dias', '90 dias', 'Personalizado'].map((p) => (
          <button key={p} onClick={() => handlePeriodChange(p)}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${period === p || (p === 'Personalizado' && period.includes('/')) ? 'bg-gold-500 text-white shadow-md' : 'bg-white dark:bg-surface-100 text-text-secondary border border-surface-200'}`}>
            {p}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-2 gap-3 mb-8">
        {metrics.map((metric) => (
          <MetricCard key={metric.id} {...metric} inverse={metric.label === 'Ciclo de Vendas'} />
        ))}
      </section>

      <section className="mb-8">
        <SectionHeader title="Forecast Comercial" subtitle="Previsão de Faturamento" />
        <PremiumCard className="p-4 h-80">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-xs text-text-secondary uppercase">Receita Projetada (Aprovados)</p>
              <h3 className="text-xl font-bold text-text-primary">R$ {(forecastTotal / 1000000).toFixed(2)}M</h3>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6B7280' }} dy={10} />
                <YAxis hide />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="predicted" stroke="#D4AF37" strokeWidth={3} fillOpacity={1} fill="url(#colorPredicted)" />
                <Area type="monotone" dataKey="confirmed" stroke="#10B981" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gold-500" /><span className="text-[10px] text-text-secondary">Previsto</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-[10px] text-text-secondary">Confirmado</span></div>
          </div>
        </PremiumCard>
      </section>

      <section>
        <SectionHeader title="Health Score Comercial" subtitle="Risco e Probabilidade" />
        <div className="space-y-3">
          {clientHealth.length === 0 ? <p className="text-sm text-text-secondary text-center py-8">Dados insuficientes para análise.</p> :
            clientHealth.map((client) => (
              <PremiumCard key={client.id} className="flex items-center justify-between p-4" onClick={() => navigate(`/clients/${client.id}`)}>
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

      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title="Exportar Relatório">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary text-center">Selecione o formato para os dados de ({period}).</p>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => handleExport('pdf')} className="flex flex-col items-center justify-center p-6 bg-surface-50 hover:bg-surface-100 rounded-xl transition-all">
              <FileText size={24} className="text-red-600 mb-2" />
              <span className="text-sm font-medium">PDF</span>
            </button>
            <button onClick={() => handleExport('excel')} className="flex flex-col items-center justify-center p-6 bg-surface-50 hover:bg-surface-100 rounded-xl transition-all">
              <FileSpreadsheet size={24} className="text-green-600 mb-2" />
              <span className="text-sm font-medium">Excel</span>
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isDateModalOpen} onClose={() => setIsDateModalOpen(false)} title="Período Personalizado">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-text-secondary mb-1">Início</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" /></div>
          <div><label className="block text-sm font-medium text-text-secondary mb-1">Fim</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" /></div>
          <RoundedButton fullWidth onClick={applyCustomDate}>Aplicar Filtro</RoundedButton>
        </div>
      </Modal>
    </div>
  );
}
