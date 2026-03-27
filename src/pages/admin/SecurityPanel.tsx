import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ShieldCheck, AlertTriangle, DownloadCloud, RefreshCcw, ChevronLeft, LogIn } from 'lucide-react';
import { PremiumCard, SectionHeader } from '@/components/ui/PremiumComponents';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  metadata?: Record<string, any> | null;
  user_id?: string | null;
  created_at: string;
  ip_address?: string | null;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  description?: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any> | null;
  created_at: string;
}

const TIMELINE_FILTERS = [
  { value: 'all', label: 'Todas as atividades' },
  { value: 'login_success', label: 'Logins bem-sucedidos' },
  { value: 'login_failed', label: 'Falhas de login' },
  { value: 'client_created', label: 'Criação de clientes' },
  { value: 'client_updated', label: 'Atualizações de clientes' },
  { value: 'document_downloaded', label: 'Downloads de documentos' },
  { value: 'permissions_updated', label: 'Alteração de permissões' },
];

const severityBadge: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default function SecurityPanel() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [recentLogins, setRecentLogins] = useState<AuditLog[]>([]);
  const [failedLogins, setFailedLogins] = useState<AuditLog[]>([]);
  const [documentDownloads, setDocumentDownloads] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState('all');

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [auditRes, eventsRes, recentRes, failedRes, downloadRes] = await Promise.all([
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(120),
        supabase.from('security_events').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('audit_logs').select('*').eq('action', 'login_success').order('created_at', { ascending: false }).limit(20),
        supabase.from('audit_logs').select('*').eq('action', 'login_failed').order('created_at', { ascending: false }).limit(20),
        supabase.from('audit_logs').select('*').eq('action', 'document_downloaded').order('created_at', { ascending: false }).limit(20),
      ]);

      if (auditRes.error) throw auditRes.error;
      if (eventsRes.error) throw eventsRes.error;

      setAuditLogs(auditRes.data || []);
      setSecurityEvents(eventsRes.data || []);
      setRecentLogins(recentRes.data || []);
      setFailedLogins(failedRes.data || []);
      setDocumentDownloads(downloadRes.data || []);
    } catch (err) {
      console.error('Erro ao carregar painel de segurança', err);
      alert('Falha ao carregar dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const filteredActivity = useMemo(() => {
    if (filter === 'all') return auditLogs.slice(0, 30);
    return auditLogs.filter(log => log.action === filter).slice(0, 30);
  }, [auditLogs, filter]);

  const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR');

  const summaryCards = [
    { icon: <ShieldCheck size={22} />, label: 'Logins aprovados', value: recentLogins.length },
    { icon: <AlertTriangle size={22} />, label: 'Falhas de login', value: failedLogins.length },
    { icon: <DownloadCloud size={22} />, label: 'Downloads monitorados', value: documentDownloads.length },
  ];

  return (
    <div className="min-h-screen bg-surface-50 pb-24">
      <div className="bg-card-bg px-4 py-4 shadow-sm sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-surface-100 text-text-secondary">
            <ChevronLeft size={22} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-text-primary">Painel de Segurança</h1>
            <p className="text-xs text-text-secondary">Monitoramento de acessos, documentos e eventos suspeitos</p>
          </div>
        </div>
        <button
          onClick={loadDashboard}
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-gold-500 text-white text-xs font-semibold shadow"
          disabled={loading}
        >
          <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      <div className="p-6 space-y-8">
        <SectionHeader title="Status em tempo real" subtitle="Últimas leituras" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {summaryCards.map(card => (
            <PremiumCard key={card.label} className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center text-gold-500">
                {card.icon}
              </div>
              <div>
                <p className="text-xs text-text-secondary">{card.label}</p>
                <p className="text-2xl font-bold">{card.value}</p>
              </div>
            </PremiumCard>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PremiumCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
                <LogIn size={18} /> Logins recentes
              </h3>
              <span className="text-xs text-text-secondary">Últimos 20</span>
            </div>
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
              {recentLogins.map(log => (
                <div key={log.id} className="p-3 rounded-xl border border-surface-100">
                  <p className="text-sm font-semibold text-text-primary">{log.metadata?.email || log.user_id || 'Usuário'}</p>
                  <p className="text-xs text-text-secondary">{formatDate(log.created_at)} · {log.ip_address || 'IP desconhecido'}</p>
                </div>
              ))}
              {recentLogins.length === 0 && <p className="text-sm text-text-secondary">Nenhum login registrado.</p>}
            </div>
          </PremiumCard>

          <PremiumCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
                <AlertTriangle size={18} /> Tentativas falhadas
              </h3>
              <span className="text-xs text-text-secondary">Últimos 20</span>
            </div>
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
              {failedLogins.map(log => (
                <div key={log.id} className="p-3 rounded-xl border border-red-100 bg-red-50/40">
                  <p className="text-sm font-semibold text-red-700">{log.metadata?.email || log.user_id || 'Usuário'}</p>
                  <p className="text-xs text-red-600">{formatDate(log.created_at)} · {log.ip_address || 'IP desconhecido'}</p>
                  {log.metadata?.reason && (
                    <p className="text-xs text-text-secondary mt-1">Erro: {log.metadata.reason}</p>
                  )}
                </div>
              ))}
              {failedLogins.length === 0 && <p className="text-sm text-text-secondary">Sem falhas de login.</p>}
            </div>
          </PremiumCard>
        </div>

        <PremiumCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
              <DownloadCloud size={18} /> Downloads monitorados
            </h3>
            <span className="text-xs text-text-secondary">Monitoramento automático</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {documentDownloads.map(log => (
              <div key={log.id} className="p-3 rounded-xl border border-surface-100">
                <p className="text-sm font-semibold">{log.entity_id || log.metadata?.client_id || 'Documento'}</p>
                <p className="text-xs text-text-secondary">{formatDate(log.created_at)}</p>
                <p className="text-xs text-text-secondary">IP {log.ip_address || 'desconhecido'}</p>
              </div>
            ))}
            {documentDownloads.length === 0 && <p className="text-sm text-text-secondary">Nenhum download registrado.</p>}
          </div>
        </PremiumCard>

        <SectionHeader title="Eventos suspeitos" subtitle="Alertas automáticos" />
        <PremiumCard>
          <div className="space-y-3">
            {securityEvents.length === 0 && <p className="text-sm text-text-secondary">Nenhum evento registrado.</p>}
            {securityEvents.map(event => (
              <div key={event.id} className="p-4 rounded-xl border border-surface-100">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">{event.description || event.event_type}</p>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${severityBadge[event.severity] || ''}`}>
                    {event.severity.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1">{formatDate(event.created_at)}</p>
                {event.metadata && (
                  <pre className="text-[11px] bg-surface-50 rounded-lg mt-2 p-2 overflow-x-auto text-text-secondary">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </PremiumCard>

        <SectionHeader title="Linha do tempo" subtitle="Selecione uma categoria" />
        <div className="flex flex-wrap gap-2">
          {TIMELINE_FILTERS.map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-4 py-2 rounded-full text-xs font-semibold border ${filter === option.value ? 'bg-gold-500 text-white border-gold-500' : 'border-surface-200 text-text-secondary'}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <PremiumCard>
          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
            {filteredActivity.length === 0 && <p className="text-sm text-text-secondary">Sem registros para o filtro.</p>}
            {filteredActivity.map(log => (
              <div key={log.id} className="p-4 border border-surface-100 rounded-xl">
                <p className="text-sm font-semibold text-text-primary">{log.action}</p>
                <p className="text-xs text-text-secondary">{formatDate(log.created_at)} · {log.ip_address || 'IP desconhecido'}</p>
                {log.metadata && (
                  <pre className="text-[11px] bg-surface-50 rounded-lg mt-2 p-2 overflow-x-auto text-text-secondary">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </PremiumCard>
      </div>
    </div>
  );
}
