import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck, AlertTriangle, DownloadCloud, RefreshCcw,
  ChevronLeft, LogIn, User, FileText, Clock, Activity,
} from 'lucide-react';
import { PremiumCard, SectionHeader } from '@/components/ui/PremiumComponents';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entity_id?: string | null;
  metadata?: Record<string, any> | null;
  user_id?: string | null;
  ip_address?: string | null;
  device_info?: string | null;
  created_at: string;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  description?: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any> | null;
  ip_address?: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  name: string;
  role: string;
}

const ACTION_LABELS: Record<string, string> = {
  login_success:       'Login realizado',
  login_failed:        'Falha de login',
  logout:              'Logout',
  client_created:      'Cliente criado',
  client_updated:      'Cliente atualizado',
  client_deleted:      'Cliente excluído',
  client_view:         'Cliente visualizado',
  document_uploaded:   'Documento enviado',
  document_deleted:    'Documento excluído',
  document_downloaded: 'Documento baixado',
  permissions_updated: 'Permissão alterada',
  lead_converted:      'Lead convertido',
  sale_updated:        'Venda atualizada',
};

const ACTION_COLORS: Record<string, string> = {
  login_success:       'text-emerald-600',
  login_failed:        'text-red-600',
  logout:              'text-slate-500',
  client_created:      'text-blue-600',
  client_updated:      'text-amber-600',
  client_deleted:      'text-red-600',
  client_view:         'text-slate-500',
  document_uploaded:   'text-blue-600',
  document_deleted:    'text-red-600',
  document_downloaded: 'text-purple-600',
  permissions_updated: 'text-orange-600',
};

const SEVERITY_BADGE: Record<string, string> = {
  low:      'bg-emerald-100 text-emerald-700',
  medium:   'bg-amber-100 text-amber-700',
  high:     'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Baixo', medium: 'Médio', high: 'Alto', critical: 'Crítico',
};

const TIMELINE_FILTERS = [
  { value: 'all',                label: 'Todas' },
  { value: 'login_success',      label: 'Logins' },
  { value: 'login_failed',       label: 'Falhas' },
  { value: 'client_created',     label: 'Clientes criados' },
  { value: 'client_updated',     label: 'Atualizações' },
  { value: 'client_deleted',     label: 'Exclusões' },
  { value: 'document_downloaded',label: 'Downloads' },
  { value: 'document_uploaded',  label: 'Uploads' },
];

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export default function SecurityPanel() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filter, setFilter] = useState('all');
  const [diagError, setDiagError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setDiagError(null);
    try {
      const [auditRes, eventsRes, profilesRes] = await Promise.all([
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('security_events').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('profiles').select('id, name, role'),
      ]);

      if (auditRes.error) {
        setDiagError(`Erro ao ler audit_logs: ${auditRes.error.message} (código: ${auditRes.error.code})`);
        return;
      }

      setAuditLogs(auditRes.data || []);
      setSecurityEvents(eventsRes.data || []);

      const profileMap: Record<string, Profile> = {};
      for (const p of (profilesRes.data || [])) profileMap[p.id] = p;
      setProfiles(profileMap);
    } catch (err: any) {
      setDiagError(`Exceção: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    setTestResult('Testando...');
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;

    const { error } = await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'test_event',
      entity: 'security_panel',
      entity_id: null,
      metadata: { source: 'diagnostic_button' },
    });

    if (error) {
      setTestResult(`❌ Erro: ${error.message} (código: ${error.code})`);
    } else {
      setTestResult('✅ Log gravado com sucesso! Clique em Atualizar.');
      loadDashboard();
    }
  };

  useEffect(() => { loadDashboard(); }, []);

  const recentLogins     = useMemo(() => auditLogs.filter(l => l.action === 'login_success').slice(0, 20), [auditLogs]);
  const failedLogins     = useMemo(() => auditLogs.filter(l => l.action === 'login_failed').slice(0, 20), [auditLogs]);
  const documentDownloads= useMemo(() => auditLogs.filter(l => l.action === 'document_downloaded').slice(0, 20), [auditLogs]);

  const filteredActivity = useMemo(() => {
    const base = filter === 'all' ? auditLogs : auditLogs.filter(l => l.action === filter);
    return base.slice(0, 50);
  }, [auditLogs, filter]);

  const userName = (log: AuditLog) =>
    profiles[log.user_id ?? '']?.name
    || log.metadata?.name as string
    || log.metadata?.email as string
    || (log.user_id ? `ID: ${log.user_id.slice(0, 8)}…` : 'Sistema');

  const summaryCards = [
    { icon: <ShieldCheck size={20} />, label: 'Logins aprovados', value: recentLogins.length,      color: 'text-emerald-500' },
    { icon: <AlertTriangle size={20} />, label: 'Falhas de login',  value: failedLogins.length,      color: 'text-red-500' },
    { icon: <DownloadCloud size={20} />, label: 'Downloads',         value: documentDownloads.length, color: 'text-purple-500' },
    { icon: <Activity size={20} />,      label: 'Total de eventos',  value: auditLogs.length,         color: 'text-blue-500' },
  ];

  return (
    <div className="min-h-screen bg-surface-50 pb-24">
      {/* Header */}
      <div className="bg-card-bg px-4 py-4 shadow-sm sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-surface-100 text-text-secondary">
            <ChevronLeft size={22} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <ShieldCheck size={20} className="text-gold-500" /> Painel de Segurança
            </h1>
            <p className="text-xs text-text-secondary">Monitoramento de acessos, documentos e eventos suspeitos</p>
          </div>
        </div>
        <button
          onClick={loadDashboard}
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-gold-500 text-white text-xs font-semibold shadow"
          disabled={loading}
        >
          <RefreshCcw size={15} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      <div className="p-4 space-y-6">

        {/* Diagnóstico */}
        {diagError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 space-y-2">
            <p className="font-bold">⚠️ Erro ao carregar dados:</p>
            <p className="font-mono text-xs break-all">{diagError}</p>
            <p className="text-xs text-red-500">Verifique se a migration <code>20260327000000_security_layers.sql</code> e a policy de INSERT foram aplicadas no Supabase.</p>
          </div>
        )}

        {testResult && (
          <div className={`p-3 rounded-xl border text-sm font-medium ${testResult.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : testResult === 'Testando...' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {testResult}
          </div>
        )}

        {/* Botão de diagnóstico — visível quando não há dados */}
        {!loading && auditLogs.length === 0 && !diagError && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
            <p className="text-sm text-amber-800 font-medium">Nenhum log encontrado. Teste se a gravação está funcionando:</p>
            <button
              onClick={runTest}
              className="px-4 py-2 rounded-full bg-amber-500 text-white text-xs font-semibold shadow hover:bg-amber-600"
            >
              Testar gravação de log agora
            </button>
            <p className="text-xs text-amber-600">
              Se retornar erro de RLS ou "relation does not exist", a migration SQL não foi aplicada no Supabase.
            </p>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {summaryCards.map(card => (
            <PremiumCard key={card.label} className="flex items-center gap-3 p-4">
              <div className={`${card.color} shrink-0`}>{card.icon}</div>
              <div>
                <p className="text-[11px] text-text-secondary leading-tight">{card.label}</p>
                <p className="text-2xl font-bold text-text-primary">{loading ? '…' : card.value}</p>
              </div>
            </PremiumCard>
          ))}
        </div>

        {/* Logins + Falhas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PremiumCard>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
              <LogIn size={16} className="text-emerald-500" /> Logins recentes
              <span className="ml-auto text-xs text-text-secondary font-normal">Últimos 20</span>
            </h3>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {recentLogins.length === 0
                ? <p className="text-sm text-text-secondary">Nenhum login registrado ainda.</p>
                : recentLogins.map(log => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl border border-surface-100 hover:bg-surface-50">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <User size={14} className="text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{userName(log)}</p>
                      <p className="text-xs text-text-secondary">{timeAgo(log.created_at)} · {log.ip_address || 'IP não registrado'}</p>
                      {profiles[log.user_id ?? '']?.role && (
                        <span className="text-[10px] text-emerald-600 font-medium uppercase">{profiles[log.user_id!].role}</span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary shrink-0 hidden sm:block">{formatDate(log.created_at)}</p>
                  </div>
                ))
              }
            </div>
          </PremiumCard>

          <PremiumCard>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-red-500" /> Tentativas falhadas
              <span className="ml-auto text-xs text-text-secondary font-normal">Últimos 20</span>
            </h3>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {failedLogins.length === 0
                ? <p className="text-sm text-text-secondary">Sem falhas de login registradas.</p>
                : failedLogins.map(log => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl border border-red-100 bg-red-50/30 hover:bg-red-50/60">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <AlertTriangle size={14} className="text-red-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-red-700 truncate">{userName(log)}</p>
                      <p className="text-xs text-red-500">{timeAgo(log.created_at)} · {log.ip_address || 'IP não registrado'}</p>
                      {log.metadata?.reason && (
                        <p className="text-xs text-text-secondary mt-0.5">Motivo: {log.metadata.reason}</p>
                      )}
                    </div>
                    <p className="text-xs text-red-400 shrink-0 hidden sm:block">{formatDate(log.created_at)}</p>
                  </div>
                ))
              }
            </div>
          </PremiumCard>
        </div>

        {/* Downloads */}
        <PremiumCard>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
            <DownloadCloud size={16} className="text-purple-500" /> Downloads de documentos
            <span className="ml-auto text-xs text-text-secondary font-normal">Monitoramento automático</span>
          </h3>
          {documentDownloads.length === 0
            ? <p className="text-sm text-text-secondary">Nenhum download registrado ainda.</p>
            : (
              <div className="grid md:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
                {documentDownloads.map(log => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl border border-surface-100 hover:bg-surface-50">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                      <FileText size={14} className="text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{userName(log)}</p>
                      <p className="text-xs text-text-secondary truncate">
                        {log.metadata?.fileName as string || log.entity_id || 'Documento'}
                      </p>
                      <p className="text-xs text-text-secondary">{timeAgo(log.created_at)} · {log.ip_address || '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </PremiumCard>

        {/* Eventos suspeitos */}
        <div>
          <SectionHeader title="Eventos suspeitos" subtitle="Alertas automáticos do sistema" />
          <PremiumCard className="mt-3">
            {securityEvents.length === 0
              ? <p className="text-sm text-text-secondary">Nenhum evento suspeito detectado.</p>
              : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {securityEvents.map(event => (
                    <div key={event.id} className="p-4 rounded-xl border border-surface-100 hover:bg-surface-50">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-text-primary">{event.description || event.event_type}</p>
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${SEVERITY_BADGE[event.severity] || ''}`}>
                          {SEVERITY_LABELS[event.severity] || event.severity}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary mt-1">
                        {formatDate(event.created_at)}
                        {event.ip_address ? ` · IP: ${event.ip_address}` : ''}
                      </p>
                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                        <pre className="text-[10px] bg-surface-50 rounded-lg mt-2 p-2 overflow-x-auto text-text-secondary">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )
            }
          </PremiumCard>
        </div>

        {/* Linha do tempo */}
        <div>
          <SectionHeader title="Linha do tempo" subtitle="Histórico completo de atividades" />
          <div className="flex flex-wrap gap-2 mt-3 mb-3">
            {TIMELINE_FILTERS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  filter === opt.value
                    ? 'bg-gold-500 text-white border-gold-500'
                    : 'border-surface-200 text-text-secondary hover:border-gold-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <PremiumCard>
            {filteredActivity.length === 0
              ? <p className="text-sm text-text-secondary">Sem registros para este filtro.</p>
              : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {filteredActivity.map(log => (
                    <div key={log.id} className="flex items-start gap-3 p-3 border border-surface-100 rounded-xl hover:bg-surface-50">
                      <div className="w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Clock size={13} className="text-text-secondary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-semibold ${ACTION_COLORS[log.action] || 'text-text-primary'}`}>
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                          <span className="text-xs text-text-secondary">·</span>
                          <span className="text-xs text-text-secondary">{userName(log)}</span>
                          {profiles[log.user_id ?? '']?.role && (
                            <span className="text-[10px] text-gold-500 font-semibold uppercase bg-gold-50 px-1.5 py-0.5 rounded">
                              {profiles[log.user_id!].role}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {formatDate(log.created_at)}
                          {log.ip_address ? ` · ${log.ip_address}` : ''}
                          {log.entity_id ? ` · ${log.entity}: ${log.entity_id.slice(0, 8)}…` : ''}
                        </p>
                        {log.metadata && Object.keys(log.metadata).filter(k => k !== 'userAgent').length > 0 && (
                          <details className="mt-1">
                            <summary className="text-[10px] text-text-secondary cursor-pointer select-none">Ver detalhes</summary>
                            <pre className="text-[10px] bg-surface-50 rounded mt-1 p-2 overflow-x-auto text-text-secondary">
                              {JSON.stringify(
                                Object.fromEntries(Object.entries(log.metadata).filter(([k]) => k !== 'userAgent')),
                                null, 2
                              )}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </PremiumCard>
        </div>
      </div>
    </div>
  );
}
