import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { PremiumCard, StatusBadge, RoundedButton } from '@/components/ui/PremiumComponents';
import {
  Search, Filter, Phone, Mail, MessageCircle, UserPlus,
  Clock, Plus, Loader2, Zap, Brain, AlertTriangle, CheckCircle2,
  Sparkles, X, BadgeCheck
} from 'lucide-react';
import { CLIENT_STAGES, ClientStage, Client } from '@/data/clients';
import { AutomationLead } from '@/data/leads';
import { useApp } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/useAuthorization';
import { ClientHierarchyTags } from '@/components/ui/ClientHierarchyTags';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'clientes' | 'documentacao';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(isoDate: string) {
  const diff = (Date.now() - new Date(isoDate).getTime()) / 1000;
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return new Date(isoDate).toLocaleDateString('pt-BR');
}

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

// ─── Urgency indicator ────────────────────────────────────────────────────────

function getClientUrgency(client: Client): { days: number; level: 'critical' | 'urgent' | 'warning' | null } {
  const stageEntries = (client.history || []).filter(
    h => h.action === `Estágio alterado para ${client.stage}`
  );
  let refDate: Date;
  if (stageEntries.length > 0) {
    const sorted = [...stageEntries].sort((a, b) =>
      new Date((b as any).created_at).getTime() - new Date((a as any).created_at).getTime()
    );
    refDate = new Date((sorted[0] as any).created_at);
  } else {
    refDate = new Date((client as any).createdAt || (client as any).created_at);
  }
  const days = Math.floor((Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24));
  // Conformidade: urgente a partir de 7 dias
  if (client.stage === 'Conformidade' && days >= 7) return { days, level: 'urgent' };
  if (days >= 3) return { days, level: 'critical' };
  if (days >= 2) return { days, level: 'urgent' };
  if (days >= 1) return { days, level: 'warning' };
  return { days, level: null };
}

// ─── Priority indicator ───────────────────────────────────────────────────────

function PriorityBadge({ metadata }: { metadata?: AutomationLead['ai_metadata'] }) {
  const priority = metadata?.priority;
  if (!priority || priority === 'baixa') return null;
  const isHigh = priority === 'alta';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isHigh ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
      }`}>
      <AlertTriangle size={10} />
      {isHigh ? 'Prioridade Alta' : 'Prioridade Média'}
    </span>
  );
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({ lead, onConvert }: { lead: AutomationLead; onConvert: (lead: AutomationLead) => void }) {
  const isNew = !lead.viewed_at;
  const initial = lead.name?.charAt(0).toUpperCase() || '?';

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const phone = lead.phone.replace(/\D/g, '');
    window.open(`https://wa.me/55${phone}`, '_blank');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="bg-card-bg rounded-2xl border border-surface-200 shadow-sm hover:shadow-md hover:border-gold-200 transition-all overflow-hidden"
    >
      <div className="p-3.5">
        {/* Row: avatar + info + time */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-text-primary text-sm truncate leading-tight">{lead.name}</p>
              <span className="text-[10px] text-text-secondary flex items-center gap-0.5 flex-shrink-0">
                <Clock size={9} />{timeAgo(lead.timestamp)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-[#128C7E] font-mono cursor-pointer hover:underline" onClick={handleWhatsApp}>
                {formatPhone(lead.phone)}
              </span>
              {isNew && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
              {lead.ai_metadata?.priority === 'alta' && (
                <span className="text-[9px] font-bold text-red-500 bg-red-50 border border-red-100 px-1.5 py-px rounded-full flex items-center gap-0.5">
                  <AlertTriangle size={8} />Alta
                </span>
              )}
            </div>
          </div>
        </div>

        {/* AI summary */}
        {lead.aiSummary && (
          <p className="mt-2.5 text-[11px] text-text-secondary leading-relaxed line-clamp-2">
            <Brain size={9} className="inline mr-1 opacity-50" />
            {lead.aiSummary}
          </p>
        )}

        {/* Chips */}
        {lead.ai_metadata && (lead.ai_metadata.region || lead.ai_metadata.propertyType || lead.ai_metadata.income) && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {lead.ai_metadata.region && <span className="text-[9px] px-1.5 py-px rounded-full bg-surface-100 text-text-secondary border border-surface-200">📍 {lead.ai_metadata.region}</span>}
            {lead.ai_metadata.propertyType && <span className="text-[9px] px-1.5 py-px rounded-full bg-surface-100 text-text-secondary border border-surface-200">🏠 {lead.ai_metadata.propertyType}</span>}
            {lead.ai_metadata.income && <span className="text-[9px] px-1.5 py-px rounded-full bg-surface-100 text-text-secondary border border-surface-200">💰 {lead.ai_metadata.income}</span>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex border-t border-surface-100">
        <button onClick={handleWhatsApp} className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-semibold text-[#128C7E] hover:bg-[#25D366]/5 transition-colors">
          <MessageCircle size={11} /> Conversar
        </button>
        <div className="w-px bg-surface-100" />
        <button onClick={(e) => { e.stopPropagation(); onConvert(lead); }} className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-semibold text-gold-600 hover:bg-gold-50 transition-colors">
          <UserPlus size={11} /> Criar Ficha
        </button>
      </div>
    </motion.div>
  );
}

// ─── Convert Lead Modal ───────────────────────────────────────────────────────

function ConvertLeadModal({ lead, onClose, onConfirm }: {
  lead: AutomationLead;
  onClose: () => void;
  onConfirm: (lead: AutomationLead, data: any) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: lead.name || '',
    phone: lead.phone || '',
    cpf: '',
    email: '',
    profession: '',
    grossIncome: lead.ai_metadata?.income || '',
    incomeType: 'CLT' as string,
    regionOfInterest: lead.ai_metadata?.region || '',
    intendedValue: '',
    observations: lead.aiSummary ? `Resumo IA: ${lead.aiSummary}` : '',
    stage: 'Em Análise' as string,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onConfirm(lead, form);
    setLoading(false);
  };

  const inputClass = "w-full px-3 py-2 rounded-xl bg-surface-50 border border-surface-200 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-200 transition-all placeholder:text-text-secondary";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="relative bg-card-bg rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[88vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-card-bg px-5 pt-5 pb-3 border-b border-surface-100 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Sparkles size={18} className="text-gold-500" />
                Criar Ficha de Cliente
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">Dados pré-preenchidos pelo agente de IA</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-100 text-text-secondary">
              <X size={20} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* AI Summary banner */}
          {lead.aiSummary && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl p-3">
              <p className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1 mb-1">
                <Brain size={10} /> Resumo do Agente de IA
              </p>
              <p className="text-xs text-indigo-800 dark:text-indigo-200">{lead.aiSummary}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Nome *</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Nome completo" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Telefone *</label>
              <input className={inputClass} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required placeholder="(xx) xxxxx-xxxx" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">CPF</label>
                <input className={inputClass} value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">E-mail</label>
                <input className={inputClass} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">Renda Aproximada</label>
                <input className={inputClass} value={form.grossIncome} onChange={e => setForm(f => ({ ...f, grossIncome: e.target.value }))} placeholder="R$ 3.000" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">Tipo de Renda</label>
                <select className={inputClass} value={form.incomeType} onChange={e => setForm(f => ({ ...f, incomeType: e.target.value }))}>
                  <option>CLT</option>
                  <option>MEI</option>
                  <option>Autônomo</option>
                  <option>Funcionário Público</option>
                  <option>Aposentado</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">Região de Interesse</label>
                <input className={inputClass} value={form.regionOfInterest} onChange={e => setForm(f => ({ ...f, regionOfInterest: e.target.value }))} placeholder="Bairro / Cidade" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">Valor</label>
                <input className={inputClass} value={form.intendedValue} onChange={e => {
                  let val = e.target.value;
                  let v = val.replace(/\D/g, '');
                  if (v) {
                    v = (parseInt(v, 10) / 100).toFixed(2);
                    val = v.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                  } else {
                    val = '';
                  }
                  setForm(f => ({ ...f, intendedValue: val }));
                }} placeholder="R$ 200.000" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Etapa Inicial</label>
              <select className={inputClass} value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
                {CLIENT_STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Observações</label>
              <textarea className={`${inputClass} resize-none`} rows={3} value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} placeholder="Resumo da conversa inicial..." />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !form.name || !form.phone}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gold-500 hover:bg-gold-600 text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-gold"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <BadgeCheck size={18} />}
            {loading ? 'Criando Ficha...' : 'Confirmar e Criar Ficha'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Clients() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clients, leads, loading, userRole, allProfiles, teams, user } = useApp();
  const { isManager, isAdmin, isDirector, canViewAllClients } = useAuthorization();

  const [mainTab, setMainTab] = useState<MainTab>('clientes');
  const [activeStage, setActiveStage] = useState<ClientStage | 'Todos'>('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [convertSuccess, setConvertSuccess] = useState(false);

  // Filtro por coordenador via query param (vindo do Dashboard do Gerente)
  const urlParams = new URLSearchParams(location.search);
  const coordFilterId = urlParams.get('coordinator');
  const coordFilterName = urlParams.get('coordName');

  useEffect(() => {
    if (location.state?.initialStage) {
      setActiveStage(location.state.initialStage);
    }
    if (location.state?.tab === 'documentacao') {
      setMainTab('documentacao');
    }
  }, [location.state]);

  const handleSendManagerAlert = async (client: Client) => {
    const ownerId = (client as any).owner_id;
    if (!ownerId) { alert('Cliente sem responsável definido.'); return; }

    const ownerProfile = allProfiles.find(p => p.id === ownerId);

    // Busca managerId: primeiro direto no perfil, depois via equipe
    let managerId: string | null = (ownerProfile as any)?.manager_id || null;
    if (!managerId && ownerProfile?.team_id) {
      const team = teams.find(t => t.id === ownerProfile.team_id);
      managerId = team?.manager_id || null;
    }

    if (!managerId) { alert('Gerente não encontrado para este cliente.'); return; }

    const myId = user?.id;
    if (!myId) return;

    const conversationId = [myId, managerId].sort().join('_');
    const managerProfile = allProfiles.find(p => p.id === managerId);
    const senderProfile = allProfiles.find(p => p.id === myId);
    const msg = `⚠️ ALERTA URGENTE\n\nCliente: ${client.name}\nEtapa: ${client.stage}\nResponsável: ${ownerProfile?.name || '—'}\n\nEste cliente requer sua atenção imediata.\n\n— ${senderProfile?.name || 'Diretoria'}`;

    // Envia mensagem no chat
    const { error: chatError } = await supabase.from('chat_messages').insert({
      sender_id: myId,
      receiver_id: managerId,
      conversation_id: conversationId,
      content: msg,
      type: 'text',
    });

    // Envia notificação direta para o gerente
    await supabase.from('notifications').insert({
      user_id: managerId,
      type: 'aviso',
      title: `⚠️ Alerta: Cliente parado — ${client.name}`,
      message: `${client.name} está na etapa "${client.stage}" há muito tempo. Atenção necessária.`,
      link: `/clients/${client.id}`,
      read: false,
    });

    if (chatError) alert('Erro ao enviar alerta.');
    else alert(`Alerta enviado para ${managerProfile?.name || 'o gerente'}!`);
  };

  const filteredClients = clients.filter(client => {
    const matchesStage = activeStage === 'Todos' || client.stage === activeStage;
    const matchesSearch =
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.development || '').toLowerCase().includes(searchTerm.toLowerCase());
    // Filtro por coordenador (quando vindo do Dashboard)
    if (coordFilterId) {
      const ownerId = (client as any).owner_id;
      const ownerProfile = ownerId ? allProfiles.find(p => p.id === ownerId) : null;
      const belongsToCoord =
        ownerProfile?.coordinator_id === coordFilterId || ownerId === coordFilterId;
      return matchesStage && matchesSearch && belongsToCoord;
    }
    return matchesStage && matchesSearch;
  });

  const filteredLeads = leads.filter(lead =>
    lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (lead.origin || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleConvert = (lead: AutomationLead) => {
    navigate('/clients/new', {
      state: {
        prefill: {
          name: lead.name || '',
          phone: lead.phone || '',
          notes: lead.aiSummary ? `Resumo IA: ${lead.aiSummary}` : '',
          origin: lead.origin || 'Novo Lead',
        }
      }
    });
  };

  return (
    <div className="h-full flex flex-col bg-surface-50">
      {/* Header */}
      <div className="px-6 pt-8 pb-3 bg-card-bg shadow-sm z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-text-primary">Gestão de Clientes</h1>
          <RoundedButton size="sm" onClick={() => navigate('/clients/new')} className="flex items-center gap-1">
            <Plus size={16} /> Novo Cliente
          </RoundedButton>
        </div>

        {/* Main Tabs */}
        <div className="flex gap-1 bg-surface-50 rounded-xl p-1">
          <button
            onClick={() => setMainTab('clientes')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${mainTab === 'clientes'
              ? 'bg-card-bg shadow text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            Clientes
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-100 text-text-secondary">
              {clients.length}
            </span>
          </button>
          <button
            onClick={() => setMainTab('documentacao')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${mainTab === 'documentacao'
              ? 'bg-card-bg shadow text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            <span className="flex items-center gap-1.5">
              <Zap size={13} className={mainTab === 'documentacao' ? 'text-green-500' : ''} />
              Novo Lead
            </span>
            {leads.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500 text-white animate-pulse">
                {leads.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-6 pt-3 pb-2 bg-card-bg">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
            <input
              type="text"
              placeholder={mainTab === 'clientes' ? 'Buscar cliente...' : 'Buscar lead...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-surface-50 rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-200 transition-all placeholder:text-text-secondary"
            />
          </div>
        </div>
      </div>

      {/* ── CLIENTES TAB ── */}
      {mainTab === 'clientes' && (
        <>
          {/* Stage Filter Chips */}
          <div className="pt-2 pb-2 px-6 overflow-x-auto no-scrollbar flex gap-2">
            <button
              onClick={() => setActiveStage('Todos')}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium transition-all ${activeStage === 'Todos'
                ? 'bg-gray-900 dark:bg-white text-white dark:text-black shadow-md'
                : 'bg-card-bg text-text-secondary border border-surface-200'
                }`}
            >
              Todos ({clients.length})
            </button>
            {CLIENT_STAGES.map(stage => (
              <button
                key={stage}
                onClick={() => setActiveStage(stage)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium transition-all ${activeStage === stage
                  ? 'bg-gold-500 text-white shadow-md'
                  : 'bg-card-bg text-text-secondary border border-surface-200'
                  }`}
              >
                {stage}
              </button>
            ))}
          </div>

          <div className="flex-1 px-6 py-4 space-y-4 overflow-y-auto pb-24">
            {/* Banner de filtro por coordenador */}
            {coordFilterId && coordFilterName && (
              <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl px-4 py-2">
                <p className="text-xs text-purple-700 dark:text-purple-300 font-medium">
                  📋 Filtrando por coordenação: <span className="font-bold">{decodeURIComponent(coordFilterName)}</span>
                </p>
                <button onClick={() => navigate('/clients')} className="text-xs text-purple-500 hover:text-purple-700 font-medium underline ml-2">
                  Limpar
                </button>
              </div>
            )}
            {loading && (
              <div className="flex justify-center py-10">
                <Loader2 className="animate-spin text-gold-500" size={32} />
              </div>
            )}
            {filteredClients.map(client => {
              const ownerId = (client as any).owner_id;
              const urgency = getClientUrgency(client);
              return (
              <PremiumCard
                key={client.id}
                className={`relative group cursor-pointer hover:border-gold-300 transition-colors ${urgency.level === 'critical' ? 'border-red-300 dark:border-red-700' : urgency.level === 'urgent' ? 'border-orange-300 dark:border-orange-700' : ''}`}
                onClick={() => navigate(`/clients/${client.id}`)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="font-bold text-text-primary text-lg">{client.name}</h3>
                    <p className="text-sm text-text-secondary">{client.development || 'Sem empreendimento'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <StatusBadge status={client.stage} />
                    {urgency.level && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        urgency.level === 'critical' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                        urgency.level === 'urgent'   ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                                                       'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                      }`}>
                        <AlertTriangle size={9} />
                        {urgency.level === 'critical' ? 'Crítico' : urgency.level === 'urgent' ? 'Urgente' : 'Atenção'} · {urgency.days}d
                      </span>
                    )}
                  </div>
                </div>
                {/* Tags hierárquicas — visíveis para liderança */}
                {canViewAllClients && (
                  <ClientHierarchyTags
                    ownerId={ownerId}
                    allProfiles={allProfiles}
                    teams={teams}
                    className="mb-2"
                  />
                )}
                <div className="flex justify-between items-center mt-2 mb-4">
                  <span className="font-mono text-sm font-semibold text-text-primary bg-surface-100 px-2 py-1 rounded-md">
                    {client.intendedValue || '—'}
                  </span>
                </div>
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <RoundedButton variant="secondary" size="sm" className="flex-1 h-9 text-xs" href={`tel:+55${client.phone?.replace(/\D/g, '')}`}>
                    <Phone size={14} /> Ligar
                  </RoundedButton>
                  <RoundedButton
                    variant="secondary" size="sm" className="flex-1 h-9 text-xs"
                    onClick={e => { e.stopPropagation(); navigate(`/clients/${client.id}/email`); }}
                  >
                    <Mail size={14} /> Email
                  </RoundedButton>
                  {(isAdmin || isDirector) && (
                    <RoundedButton
                      variant="secondary" size="sm" className="h-9 px-3 text-xs text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={e => { e.stopPropagation(); handleSendManagerAlert(client); }}
                    >
                      <AlertTriangle size={14} />
                    </RoundedButton>
                  )}
                </div>
              </PremiumCard>
              );
            })}
            {filteredClients.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-40 text-text-secondary gap-3">
                <p>Nenhum cliente encontrado</p>
                <RoundedButton size="sm" variant="outline" onClick={() => navigate('/clients/new')}>
                  <Plus size={16} /> Adicionar cliente
                </RoundedButton>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── DOCUMENTAÇÃO TAB ── */}
      {mainTab === 'documentacao' && (
        <div className="flex-1 px-5 py-4 overflow-y-auto pb-24">
          {/* Header info bar */}
          <div className="flex items-center justify-end mb-4">
            <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Fila ativa
            </span>
          </div>

          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-gold-500" size={32} />
            </div>
          )}

          {/* Success toast */}
          <AnimatePresence>
            {convertSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm font-semibold"
              >
                <CheckCircle2 size={16} />
                Ficha criada com sucesso! O lead foi movido para Clientes.
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {filteredLeads.length === 0 && !loading ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-64 text-center"
              >
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 size={32} className="text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary">Tudo em dia!</h3>
                <p className="text-sm text-text-secondary max-w-xs mt-2">
                  Não há novos leads na fila no momento. Quando chegarem via WhatsApp, aparecerão aqui automaticamente.
                </p>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {filteredLeads.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onConvert={handleConvert}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>
      )}


    </div>
  );
}
