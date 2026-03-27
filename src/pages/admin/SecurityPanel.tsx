import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ShieldCheck, AlertTriangle, DownloadCloud, RefreshCcw, ChevronLeft, LogIn } from 'lucide-react';
import { PremiumCard, SectionHeader } from '@/components/ui/PremiumComponents';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entity_id?: string | null;
  metadata?: Record<string, any> | null;
  user_id?: string | null;
  created_at: string;
  ip_address?: string | null;
  device_info?: string | null;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  description?: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any> | null;
  created_at: string;
}

const ACTION_FILTERS = [
  { value: 'all', label: 'Todas as atividades' },
  { value: 'login_success', label: 'Logins bem-sucedidos' },
  { value: 'login_failed', label: 'Falhas de login' },
  { value: 'client_created', label: 'Criação de clientes' },
  { value: 'client_updated', label: 'Atualizações de clientes' },
  { value: 'document_uploaded', label: 'Uploads de documentos' },
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

  const fetchData = async () => {
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
      console.error('Erro ao carregar painel de segurança:', err);
      alert('Não foi possível carregar os dados de segurança.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredActivity = useMemo(() => {
    if (filter === 'all') return auditLogs.slice(0, 30);
    return auditLogs.filter(log => log.action === filter).slice(0, 30);
  }, [auditLogs, filter]);

  const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR');

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
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-gold-500 text-white text-xs font-semibold shadow"
          disabled={loading}
        >
          <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      <div className="p-6 space-y-8">
        <SectionHeader title="Status em Tempo Real" subtitle="Visão consolidada das últimas 24 horas" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PremiumCard className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <ShieldCheck size={22} />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Logins aprovados</p>
              <p className="text-2xl font-bold">{recentLogins.length}</p>
            </div>
          </PremiumCard>
          <PremiumCard className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
              <AlertTriangle size={22} />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Alertas ativos</p>
              <p className="text-2xl font-bold">{securityEvents.filter(e => e.severity !== 'low').length}</p>
            </div>
          </PremiumCard>
          <PremiumCard className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <DownloadCloud size={22} />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Downloads monitorados</p>
              <p className="text-2xl font-bold">{documentDownloads.length}</p>
            </div>
          </PremiumCard>
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
                <div key={log.id} className="p-3 rounded-xl border border-surface-100 hover:border-gold-200 transition-colors">
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
                  <p className="text-sm font-semibold text-red-700">{log.metadata?.email || log.user_id || 'Usuário'
