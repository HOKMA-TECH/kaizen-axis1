import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PremiumCard, RoundedButton, SectionHeader } from '@/components/ui/PremiumComponents';
import { ChevronLeft, Save, UploadCloud, FileText, X } from 'lucide-react';
import { CLIENT_STAGES, ClientStage } from '@/data/clients';
import { useApp } from '@/context/AppContext';

const DRAFT_KEY = 'new-client-draft';

const defaultFormData = {
  name: '',
  cpf: '',
  email: '',
  phone: '',
  address: '',
  profession: '',
  grossIncome: '',
  incomeType: 'Formal' as 'Formal' | 'Informal' | 'Mista',
  cotista: 'Não',
  socialFactor: 'Não',
  regionOfInterest: '',
  development: '',
  intendedValue: '',
  stage: 'Documentação' as ClientStage,
  observations: '',
};

export default function NewClient() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addClient, uploadFile, addDocumentToClient } = useApp();

  const [formData, setFormData] = useState(() => {
    // Se vier prefill da navegação, ignora rascunho salvo
    if (location.state?.prefill) return defaultFormData;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      return saved ? { ...defaultFormData, ...JSON.parse(saved) } : defaultFormData;
    } catch {
      return defaultFormData;
    }
  });

  // Salva rascunho automaticamente a cada mudança
  useEffect(() => {
    if (!location.state?.prefill) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
    }
  }, [formData, location.state]);

  useEffect(() => {
    if (location.state?.prefill) {
      const { name, phone, origin, notes, stage } = location.state.prefill;
      setFormData(prev => ({
        ...prev,
        name: name || '',
        phone: phone || '',
        observations: notes ? `Origem: ${origin}\n\n${notes}` : '',
        stage: stage || 'Novo Lead',
      }));
    }
  }, [location.state]);

  const [documents, setDocuments] = useState<File[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    let { name, value } = e.target;
    if (name === 'intendedValue') {
      let v = value.replace(/\D/g, '');
      if (v) {
        v = (parseInt(v, 10) / 100).toFixed(2);
        value = v.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      } else {
        value = '';
      }
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(file => file.type === 'application/pdf');
      setDocuments(prev => [...prev, ...newFiles]);
    }
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Por favor, informe o nome do cliente.');
      return;
    }

    const newClient = await addClient({
      name: formData.name,
      cpf: formData.cpf,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      profession: formData.profession,
      grossIncome: formData.grossIncome,
      incomeType: formData.incomeType as 'Formal' | 'Informal',
      cotista: formData.cotista,
      socialFactor: formData.socialFactor,
      regionOfInterest: formData.regionOfInterest,
      development: formData.development,
      intendedValue: formData.intendedValue,
      observations: formData.observations,
      stage: formData.stage,
    });

    if (newClient) {
      localStorage.removeItem(DRAFT_KEY);
      // Upload documents if any
      if (documents.length > 0) {
        let hasError = false;
        for (const file of documents) {
          const filePath = `${newClient.id}/${Date.now()}-${file.name}`;
          const uploadedPath = await uploadFile(file, filePath);
          if (uploadedPath) {
            const dbResult = await addDocumentToClient(newClient.id, file.name, uploadedPath);
            if (!dbResult.success) {
              hasError = true;
              console.error(dbResult.error);
            }
          } else {
            hasError = true;
          }
        }
        if (hasError) {
          alert('Cliente salvo, mas houve erros ao vincular alguns documentos no banco de dados.');
        } else {
          alert('Cliente e documentos cadastrados com sucesso!');
        }
      } else {
        alert('Cliente cadastrado com sucesso!');
      }
      navigate('/clients');
    } else {
      alert('Erro ao salvar cliente. Tente novamente.');
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 pb-24">
      {/* Header */}
      <div className="bg-card-bg shadow-sm px-4 py-4 sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-surface-100 text-text-secondary">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-bold text-text-primary">Novo Cliente</h1>
        </div>
        <button onClick={handleSubmit} className="text-gold-600 font-medium text-sm">
          Salvar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <section>
          <SectionHeader title="Dados Principais" />
          <PremiumCard className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Nome Completo *</label>
              <input
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
                placeholder="Ex: Maria Silva"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">CPF</label>
              <input
                name="cpf"
                value={formData.cpf}
                onChange={handleChange}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Email</label>
              <input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Telefone</label>
              <input
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Endereço</label>
              <input
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
                placeholder="Rua, Número, Bairro"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Profissão</label>
              <input
                name="profession"
                value={formData.profession}
                onChange={handleChange}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
                placeholder="Ex: Engenheiro"
              />
            </div>
          </PremiumCard>
        </section>

        <section>
          <SectionHeader title="Perfil Financeiro" />
          <PremiumCard className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Renda Bruta</label>
                <input
                  name="grossIncome"
                  value={formData.grossIncome}
                  onChange={handleChange}
                  className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
                  placeholder="R$ 0,00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Tipo de Renda</label>
                <select
                  name="incomeType"
                  value={formData.incomeType}
                  onChange={handleChange}
                  className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary appearance-none"
                >
                  <option value="Formal">Formal</option>
                  <option value="Informal">Informal</option>
                  <option value="Mista">Mista</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Cotista (3 anos FGTS)</label>
                <select
                  name="cotista"
                  value={formData.cotista}
                  onChange={handleChange}
                  className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary appearance-none"
                >
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Fator Social (Dependente)</label>
                <select
                  name="socialFactor"
                  value={formData.socialFactor}
                  onChange={handleChange}
                  className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary appearance-none"
                >
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </select>
              </div>
            </div>
          </PremiumCard>
        </section>

        <section>
          <SectionHeader title="Interesse" />
          <PremiumCard className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Região de Interesse</label>
              <input
                name="regionOfInterest"
                value={formData.regionOfInterest}
                onChange={handleChange}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
                placeholder="Ex: Zona Sul, Centro"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Empreendimento (Opcional)</label>
              <input
                name="development"
                value={formData.development}
                onChange={handleChange}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
                placeholder="Selecione ou digite"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Valor</label>
              <input
                name="intendedValue"
                value={formData.intendedValue}
                onChange={handleChange}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
                placeholder="R$ 0,00"
              />
            </div>
          </PremiumCard>
        </section>

        <section>
          <SectionHeader title="Documentos" />
          <PremiumCard className="space-y-4">
            <div className="border-2 border-dashed border-surface-200 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-surface-50 transition-colors cursor-pointer relative">
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="w-12 h-12 bg-gold-50 dark:bg-gold-900/20 rounded-full flex items-center justify-center text-gold-600 dark:text-gold-400 mb-2">
                <UploadCloud size={24} />
              </div>
              <p className="text-sm font-medium text-text-primary">Toque para adicionar PDFs</p>
              <p className="text-xs text-text-secondary mt-1">RG, CPF, Comprovante de Renda</p>
            </div>

            {documents.length > 0 && (
              <div className="space-y-2">
                {documents.map((doc, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-surface-50 rounded-lg">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 bg-red-50 text-red-500 rounded flex items-center justify-center flex-shrink-0">
                        <FileText size={16} />
                      </div>
                      <span className="text-sm text-text-primary truncate">{doc.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDocument(index)}
                      className="p-1 text-text-secondary hover:text-red-500"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </PremiumCard>
        </section>

        <section>
          <SectionHeader title="Observações" />
          <PremiumCard>
            <textarea
              name="observations"
              value={formData.observations}
              onChange={handleChange}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary min-h-[120px]"
              placeholder="Observações estratégicas sobre o cliente..."
            />
          </PremiumCard>
        </section>

        <section>
          <SectionHeader title="Estágio Inicial" />
          <PremiumCard>
            <label className="block text-sm font-medium text-text-secondary mb-2">Selecione o estágio atual</label>
            <select
              name="stage"
              value={formData.stage}
              onChange={handleChange}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary appearance-none"
            >
              {CLIENT_STAGES.map(stage => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          </PremiumCard>
        </section>

        <RoundedButton type="submit" fullWidth className="mt-4">
          <Save size={20} /> Salvar Cliente
        </RoundedButton>
      </form>
    </div>
  );
}
