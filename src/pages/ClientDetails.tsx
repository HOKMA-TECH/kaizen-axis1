import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PremiumCard, StatusBadge, SectionHeader, RoundedButton } from '@/components/ui/PremiumComponents';
import { ChevronLeft, Phone, Mail, Calendar, Edit2, Check, Building2, Wallet, History, Trash2, FileText, Save, X, UploadCloud } from 'lucide-react';
import { Client, CLIENT_STAGES, ClientStage } from '@/data/clients';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '@/components/ui/Modal';
import { useApp } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/useAuthorization';
import { supabase } from '@/lib/supabase';
import { logAuditEvent } from '@/services/auditLogger';
import { ClientHierarchyTags } from '@/components/ui/ClientHierarchyTags';

export default function ClientDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getClient, updateClient, deleteClient, userName, getDownloadUrl, uploadFile, addDocumentToClient, deleteDocumentFromClient, clients, allProfiles, teams } = useApp();
  const { role, canViewAllClients } = useAuthorization();

  // Etapas avançadas: apenas COORDENADOR, GERENTE, DIRETOR e ADMIN podem mover o cliente para cá
  const ADVANCED_STAGES: ClientStage[] = ['Contrato', 'Formulários', 'Conformidade', 'Abertura de Conta', 'Repasse', 'Concluído'];
  const canAdvanceStage = ['ADMIN', 'DIRETOR', 'GERENTE', 'COORDENADOR'].includes(role ?? '');

  const [client, setClient] = useState<Client | null>(null);
  const [isEditingStage, setIsEditingStage] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isDeleteClientModalOpen, setIsDeleteClientModalOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Client>>({});
  const [isUploading, setIsUploading] = useState(false);

  // Load from context
  useEffect(() => {
    if (!id) return;
    const found = getClient(id);
    if (found) {
      setClient(found);
      setEditForm(found);
    }
  }, [id, getClient, clients]);

  useEffect(() => {
    if (id && client) {
      logAuditEvent({ action: 'client_view', entity: 'client', entityId: id });
    }
  }, [id, client?.id]);

  const handleStageChange = async (newStage: ClientStage) => {
    if (!client || !id) return;

    // Bloqueia CORRETOR de avançar para etapas avançadas
    if (ADVANCED_STAGES.includes(newStage) && !canAdvanceStage) {
      alert(`⛔ Apenas Coordenador, Gerente, Diretor ou ADMIN podem mover o cliente para "${newStage}".`);
      setIsEditingStage(false);
      return;
    }

    const hasDevelopment = !!String(client.development ?? '').trim();
    const hasValue = !!String(client.intendedValue ?? '').trim() && String(client.intendedValue) !== '0';
    if (newStage === 'Concluído' && (!hasDevelopment || !hasValue)) {
      alert('⚠️ Para mover o cliente para a etapa "Concluído", é obrigatório preencher os campos "Empreendimento" e "Valor".');
      setIsEditingStage(false);
      setIsEditingInfo(true);
      return;
    }

    try {
      await updateClient(id, { stage: newStage });
      setIsEditingStage(false);
    } catch (e: any) {
      const msg = e?.message || 'Erro desconhecido';
      alert(`Erro ao atualizar estágio:\n${msg}`);
    }
  };

  const handleSaveInfo = async () => {
    if (!client || !id) return;

    try {
      await updateClient(id, editForm);
      setIsEditingInfo(false);
    } catch (e) {
      alert('Erro ao salvar informações.');
    }
  };

  const confirmDeleteClient = async () => {
    if (!id) return;
    try {
      await deleteClient(id);
      setIsDeleteClientModalOpen(false);
      navigate('/clients');
    } catch (e) {
      alert('Erro ao excluir cliente.');
    }
  };

  const handleOpenDocument = async (rawPath: string, documentId?: string) => {
    if (!rawPath) return;
    if (!documentId) {
      alert('Documento legado sem identificador. Reenvie o documento para habilitar abertura segura.');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { alert('Sessão expirada. Faça login novamente.'); return; }
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      const { data: v2Data, error: v2Error } = await supabase.functions.invoke('get-doc-url-v2', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: { documentId, expiresIn: 300 },
      });

      const signedUrl = v2Data?.signedUrl ?? null;
      if (v2Error || !signedUrl) {
        alert('Erro ao abrir documento.');
        return;
      }

      logAuditEvent({
        action: 'document_downloaded',
        entity: 'client_document',
        entityId: documentId,
        metadata: { client_id: id }
      });
      logAuditEvent({
        action: 'document_downloaded',
        entity: 'client_document',
        entityId: documentId,
        userId: session?.user?.id ?? null,
        metadata: { clientId: id, rawPath },
      });

      window.open(signedUrl, '_blank');
    } catch {
      alert('Erro ao abrir documento.');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !id) return;

    setIsUploading(true);
    try {
      const filePath = `${id}/${Date.now()}-${file.name}`;
      const uploadedPath = await uploadFile(file, filePath, 'client-documents');

      if (uploadedPath) {
        const dbResult = await addDocumentToClient(id, file.name, uploadedPath);
        if (dbResult.success) {
          alert('Documento anexado com sucesso!');
        } else {
          alert(`Erro do Banco de Dados: ${dbResult.error}`);
        }
      } else {
        alert('Erro ao fazer upload do documento.');
      }
    } catch (e) {
      alert('Erro inesperado durante o upload.');
    } finally {
      setIsUploading(false);
      event.target.value = ''; // reset input
    }
  };

  const handleDeleteDocument = (docId: string) => {
    setDocumentToDelete(docId);
  };

  const confirmDeleteDocument = async () => {
    if (!client || !documentToDelete || !id) return;

    const docTarget = client.documents.find(d => d.id === documentToDelete);
    if (!docTarget) {
      setDocumentToDelete(null);
      return;
    }

    const { success, error } = await deleteDocumentFromClient(docTarget.id, docTarget.file_path);

    if (success) {
      const newHistory = [
        {
          id: Date.now().toString(),
          date: new Date().toLocaleDateString('pt-BR'),
          action: 'Documento excluído',
          user: userName,
        },
        ...client.history,
      ];

      const updatedDocs = client.documents.filter(d => d.id !== documentToDelete);
      const updated: Client = { ...client, documents: updatedDocs, history: newHistory };

      setClient(updated);
      updateClient(id, { history: newHistory }); // The rest of the `documents` sync happens via context refresh
      alert('Documento excluído com sucesso!');
    } else {
      alert(`Erro ao excluir documento: ${error}`);
    }

    setDocumentToDelete(null);
  };

  if (!client) return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] text-text-secondary">
      <p>Cliente não encontrado.</p>
      <button onClick={() => navigate('/clients')} className="mt-4 text-gold-600 font-medium hover:underline">
        Voltar para clientes
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-50 pb-24">
      {/* Header / Nav */}
      <div className="bg-card-bg shadow-sm px-4 py-4 sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-surface-100 text-text-secondary">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-bold text-text-primary">Ficha do Cliente</h1>
        </div>
        <button
          onClick={() => setIsDeleteClientModalOpen(true)}
          className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
          title="Excluir Cliente"
        >
          <Trash2 size={20} />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Main Info Card */}
        <PremiumCard highlight className="space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">{client.name}</h2>
              <p className="text-text-secondary flex items-center gap-1 mt-1">
                <Building2 size={14} /> {client.development || 'Sem empreendimento'}
              </p>
            </div>
            <StatusBadge status={client.stage} className="text-sm px-3 py-1.5" />
          </div>

          {/* Tags hierárquicas — visíveis para liderança */}
          {canViewAllClients && (
            <ClientHierarchyTags
              ownerId={(client as any).owner_id}
              allProfiles={allProfiles}
              teams={teams}
            />
          )}

          <div className="flex items-center gap-2 text-gold-600 dark:text-gold-400 font-medium bg-gold-50 dark:bg-gold-900/20 p-3 rounded-xl">
            <Wallet size={18} />
            <span>{client.intendedValue || 'Valor não informado'}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <RoundedButton
              variant="secondary"
              size="sm"
              className="w-full"
              href={`tel:+55${client.phone?.replace(/\D/g, '')}`}
            >
              <Phone size={16} /> Ligar
            </RoundedButton>
            <RoundedButton
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => navigate(`/clients/${id}/email`)}
            >
              <Mail size={16} /> Email
            </RoundedButton>
          </div>
        </PremiumCard>

        {/* Stage Management */}
        <section>
          <SectionHeader
            title="Estágio Atual"
            action={
              <button
                onClick={() => setIsEditingStage(!isEditingStage)}
                className="text-gold-600 dark:text-gold-400 text-sm font-medium flex items-center gap-1"
              >
                {isEditingStage ? 'Cancelar' : <><Edit2 size={14} /> Alterar</>}
              </button>
            }
          />

          <AnimatePresence>
            {isEditingStage ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="grid grid-cols-2 gap-2 overflow-hidden"
              >
                {CLIENT_STAGES.map((stage) => {
                  const isRestricted = ADVANCED_STAGES.includes(stage) && !canAdvanceStage;
                  return (
                    <button
                      key={stage}
                      onClick={() => !isRestricted && handleStageChange(stage)}
                      disabled={isRestricted}
                      title={isRestricted ? 'Apenas Coordenador, Gerente, Diretor ou ADMIN podem usar esta etapa' : undefined}
                      className={`p-3 rounded-xl text-sm font-medium border transition-all text-left flex items-center justify-between ${client.stage === stage
                        ? 'bg-gold-50 dark:bg-gold-900/20 border-gold-400 text-gold-700 dark:text-gold-400'
                        : isRestricted
                          ? 'bg-surface-50 border-surface-200 text-text-secondary opacity-50 cursor-not-allowed'
                          : 'bg-card-bg border-surface-200 text-text-secondary hover:border-gold-300'
                        }`}
                    >
                      {stage}
                      {client.stage === stage ? <Check size={16} /> : isRestricted ? <span className="text-[10px]">🔒</span> : null}
                    </button>
                  );
                })}
              </motion.div>
            ) : (
              <PremiumCard className="flex items-center justify-between py-4 cursor-pointer" onClick={() => setIsEditingStage(true)}>
                <span className="font-medium text-text-primary">{client.stage}</span>
                <ChevronLeft size={20} className="rotate-180 text-text-secondary" />
              </PremiumCard>
            )}
          </AnimatePresence>
        </section>

        {/* Details */}
        <section className="space-y-4">
          <SectionHeader
            title="Dados Pessoais"
            action={
              isEditingInfo ? (
                <div className="flex gap-2">
                  <button onClick={() => setIsEditingInfo(false)} className="text-text-secondary p-1"><X size={18} /></button>
                  <button onClick={handleSaveInfo} className="text-green-600 p-1"><Save size={18} /></button>
                </div>
              ) : (
                <button onClick={() => setIsEditingInfo(true)} className="text-gold-600 dark:text-gold-400 text-sm font-medium flex items-center gap-1">
                  <Edit2 size={14} /> Editar
                </button>
              )
            }
          />
          <PremiumCard className="space-y-4">
            {isEditingInfo ? (
              <div className="grid grid-cols-1 gap-4">
                {[
                  { label: 'Nome', key: 'name' },
                  { label: 'CPF', key: 'cpf' },
                  { label: 'Email', key: 'email' },
                  { label: 'Telefone', key: 'phone' },
                  { label: 'Endereço', key: 'address' },
                  { label: 'Profissão', key: 'profession' },
                  { label: 'Renda Bruta', key: 'grossIncome' },
                  { label: 'Empreendimento', key: 'development' },
                  { label: 'Valor', key: 'intendedValue' },
                  { label: 'Região de Interesse', key: 'regionOfInterest' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="text-xs text-text-secondary uppercase tracking-wider mb-1 block">{label}</label>
                    <input
                      value={(editForm as Record<string, string>)[key] || ''}
                      onChange={e => {
                        let val = e.target.value;
                        if (key === 'intendedValue') {
                          let v = val.replace(/\D/g, '');
                          if (v) {
                            v = (parseInt(v, 10) / 100).toFixed(2);
                            val = v.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                          } else {
                            val = '';
                          }
                        }
                        setEditForm({ ...editForm, [key]: val });
                      }}
                      className="w-full p-2 bg-surface-50 rounded-lg border-none focus:ring-2 focus:ring-gold-400 text-sm text-text-primary"
                    />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-secondary uppercase tracking-wider mb-1 block">Tipo de Renda</label>
                    <select
                      value={editForm.incomeType || ''}
                      onChange={e => setEditForm({ ...editForm, incomeType: e.target.value as 'Formal' | 'Informal' })}
                      className="w-full p-2 bg-surface-50 rounded-lg border-none focus:ring-2 focus:ring-gold-400 text-sm text-text-primary"
                    >
                      <option value="">Selecione</option>
                      <option value="Formal">Formal</option>
                      <option value="Informal">Informal</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary uppercase tracking-wider mb-1 block">Cotista</label>
                    <select
                      value={editForm.cotista || ''}
                      onChange={e => setEditForm({ ...editForm, cotista: e.target.value })}
                      className="w-full p-2 bg-surface-50 rounded-lg border-none focus:ring-2 focus:ring-gold-400 text-sm text-text-primary"
                    >
                      <option value="">Selecione</option>
                      <option value="Sim">Sim</option>
                      <option value="Não">Não</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-secondary uppercase tracking-wider mb-1 block">Observações</label>
                  <textarea
                    value={editForm.observations || ''}
                    onChange={e => setEditForm({ ...editForm, observations: e.target.value })}
                    className="w-full p-2 bg-surface-50 rounded-lg border-none focus:ring-2 focus:ring-gold-400 text-sm text-text-primary min-h-[80px]"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {[
                  { label: 'Nome', value: client.name },
                  { label: 'CPF', value: client.cpf },
                  { label: 'Email', value: client.email },
                  { label: 'Telefone', value: client.phone },
                  { label: 'Endereço', value: client.address },
                  { label: 'Profissão', value: client.profession },
                  { label: 'Renda Bruta', value: client.grossIncome },
                  { label: 'Tipo de Renda', value: client.incomeType },
                  { label: 'Cotista', value: client.cotista },
                  { label: 'Fator Social', value: client.socialFactor },
                  { label: 'Região de Interesse', value: client.regionOfInterest },
                  { label: 'Empreendimento', value: client.development },
                  { label: 'Valor', value: client.intendedValue },
                  { label: 'Observações', value: client.observations },
                ].filter(item => item.value).map(({ label, value }) => (
                  <div key={label}>
                    <label className="text-xs text-text-secondary uppercase tracking-wider">{label}</label>
                    <p className="text-text-primary font-medium">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </PremiumCard>
        </section>

        {/* Documents */}
        <section>


          <SectionHeader
            title="Documentos Anexados"
            action={
              <div>
                <input
                  type="file"
                  id="document-upload"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
                <label
                  htmlFor="document-upload"
                  className={`text-gold-600 dark:text-gold-400 text-sm font-medium flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <UploadCloud size={16} /> {isUploading ? 'Enviando...' : 'Anexar Documento'}
                </label>
              </div>
            }
          />
          <div className="space-y-3">
            {client.documents && client.documents.length > 0 ? (
              client.documents.map(doc => (
                <PremiumCard
                  key={doc.id}
                  className="flex items-center justify-between p-3 cursor-pointer hover:border-gold-300 transition-all"
                  onClick={() => handleOpenDocument((doc as any).file_path, (doc as any).id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-lg">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{doc.name}</p>
                      <p className="text-xs text-text-secondary">{doc.uploadDate}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDocument(doc.id);
                    }}
                    className="p-2 text-text-secondary hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </PremiumCard>
              ))
            ) : (
              <p className="text-sm text-text-secondary text-center py-4">Nenhum documento anexado.</p>
            )}
          </div>
        </section>

        {/* History */}
        <section>
          <SectionHeader title="Histórico de Movimentações" />
          <div className="space-y-4 pl-2 border-l-2 border-surface-200 ml-2">
            {client.history.map((item) => (
              <div key={item.id} className="relative pl-6 pb-2">
                <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-gold-400 border-2 border-surface-50"></div>
                <p className="text-xs text-text-secondary mb-0.5">{item.date} • {item.user}</p>
                <p className="text-sm text-text-primary font-medium">{item.action}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Modals */}
      <Modal
        isOpen={isDeleteClientModalOpen}
        onClose={() => setIsDeleteClientModalOpen(false)}
        title="Excluir Cliente"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3 pt-2">
            <RoundedButton variant="secondary" fullWidth onClick={() => setIsDeleteClientModalOpen(false)}>
              Cancelar
            </RoundedButton>
            <RoundedButton fullWidth onClick={confirmDeleteClient} className="!bg-red-500 hover:!bg-red-600 text-white border-none">
              Excluir
            </RoundedButton>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!documentToDelete}
        onClose={() => setDocumentToDelete(null)}
        title="Excluir Documento"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Tem certeza que deseja excluir este documento?
          </p>
          <div className="flex gap-3 pt-2">
            <RoundedButton variant="secondary" fullWidth onClick={() => setDocumentToDelete(null)}>
              Cancelar
            </RoundedButton>
            <RoundedButton fullWidth onClick={confirmDeleteDocument} className="!bg-red-500 hover:!bg-red-600 text-white border-none">
              Excluir
            </RoundedButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
