export type ClientStage =
  | "Documentação"
  | "Em Análise"
  | "Aprovado"
  | "Condicionado"
  | "Reprovado"
  | "Agendamento"
  | "Em Tratativa"
  | "Contrato"
  | "Desistência"
  | "Formulários"
  | "Conformidade"
  | "Abertura de Conta"
  | "Repasse"
  | "Concluído"
  | "Novo Lead";

export const CLIENT_STAGES: ClientStage[] = [
  "Documentação",
  "Em Análise",
  "Aprovado",
  "Condicionado",
  "Reprovado",
  "Agendamento",
  "Em Tratativa",
  "Contrato",
  "Desistência",
  "Formulários",
  "Conformidade",
  "Abertura de Conta",
  "Repasse",
  "Concluído"
];

/**
 * Etapas avançadas do pipeline (pós-contrato) que só a liderança pode definir.
 * Regra de negócio única — usada tanto ao MOVER um cliente existente quanto ao
 * CRIAR um cliente já em uma dessas etapas. Mantenha um único ponto de verdade.
 */
export const ADVANCED_STAGES: ClientStage[] = [
  "Contrato",
  "Formulários",
  "Conformidade",
  "Abertura de Conta",
  "Repasse",
  "Concluído",
];

/** Papéis autorizados a definir/avançar para as etapas avançadas. */
export function canAdvanceToStage(role?: string | null): boolean {
  return ["ADMIN", "DIRETOR", "GERENTE", "COORDENADOR"].includes((role ?? "").toUpperCase());
}

/** True se o papel NÃO pode definir a etapa informada (etapa avançada + sem permissão). */
export function isStageRestrictedForRole(stage: ClientStage, role?: string | null): boolean {
  return ADVANCED_STAGES.includes(stage) && !canAdvanceToStage(role);
}

// ─── Regra: campos obrigatórios para concluir uma venda ──────────────────────
// Para mover/criar um cliente em "Concluído" é preciso ter estes campos preenchidos
// (alimentam os gráficos de relatórios: VGV, regiões, bairros, construtoras).
type ConcluidoFields = {
  intendedValue?: string;
  regionOfInterest?: string;
  neighborhood?: string;
  development?: string;
  builder?: string;
};

/** Retorna a lista (em português) dos campos obrigatórios faltando para concluir. */
export function missingFieldsForConcluido(c: ConcluidoFields): string[] {
  const filled = (v?: string) => !!String(v ?? '').trim();
  const missing: string[] = [];
  if (!filled(c.intendedValue) || String(c.intendedValue ?? '').trim() === '0') missing.push('Valor');
  if (!filled(c.regionOfInterest)) missing.push('Cidade de Interesse');
  if (!filled(c.neighborhood)) missing.push('Bairro');
  if (!filled(c.development)) missing.push('Empreendimento');
  if (!filled(c.builder)) missing.push('Construtora');
  return missing;
}

export interface ClientHistory {
  id: string;
  date: string;
  action: string;
  user: string;
}

export interface ClientDocument {
  id: string;
  name: string;
  type: string;
  url?: string;
  file_path?: string;
  uploadDate: string;
}

export interface ClientProponent {
  id: string;
  clientId: string;
  name: string;
  cpf?: string;
  email?: string;
  phone?: string;
  address?: string;
  profession?: string;
  grossIncome?: string;
  incomeType?: 'Formal' | 'Informal';
  cotista?: string;
  socialFactor?: string;
  isPrimary?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Client {
  id: string;
  name: string;
  cpf?: string;
  email: string;
  phone: string;
  address?: string;
  profession?: string;
  grossIncome: string;
  incomeType?: 'Formal' | 'Informal' | 'Mista';
  cotista?: string;
  socialFactor?: string;
  regionOfInterest?: string; // cidade de interesse (lista de municípios do RJ)
  neighborhood?: string;     // bairro de interesse (dentro da cidade)
  builder?: string; // construtora de interesse (alimenta gráfico no painel admin)
  development: string;
  intendedValue: string;
  observations?: string;
  stage: ClientStage;
  history: ClientHistory[];
  documents: ClientDocument[];
  proponents?: ClientProponent[];
  createdAt: string;
  closed_at?: string;  // set by DB trigger when stage → 'Concluído'
  updated_at?: string;
}

export const MOCK_CLIENTS: Client[] = [
  {
    id: '1',
    name: 'Carlos Eduardo',
    cpf: '111.222.333-44',
    email: 'carlos.edu@email.com',
    phone: '(81) 99999-0001',
    address: 'Rua das Flores, 123, Recife - PE',
    profession: 'Engenheiro',
    grossIncome: 'R$ 15.000',
    incomeType: 'Formal',
    cotista: 'Sim',
    socialFactor: 'Não',
    regionOfInterest: 'Zona Sul',
    development: 'Reserva Imperial',
    intendedValue: 'R$ 450.000',
    observations: 'Cliente tem pressa para fechar negócio.',
    stage: 'Em Análise',
    history: [
      { id: 'h1', date: '20/02/2026', action: 'Cliente criado', user: 'João Silva' },
      { id: 'h2', date: '21/02/2026', action: 'Estágio alterado de Novo Lead para Em Análise', user: 'João Silva' }
    ],
    documents: [
      { id: 'd1', name: 'RG.pdf', type: 'application/pdf', uploadDate: '20/02/2026' },
      { id: 'd2', name: 'Comprovante_Renda.pdf', type: 'application/pdf', uploadDate: '20/02/2026' }
    ],
    createdAt: '2026-02-20T10:00:00Z'
  },
  {
    id: '2',
    name: 'Fernanda Lima',
    cpf: '555.666.777-88',
    email: 'fernanda.lima@email.com',
    phone: '(81) 99999-0002',
    address: 'Av. Boa Viagem, 1000, Recife - PE',
    profession: 'Médica',
    grossIncome: 'R$ 28.000',
    incomeType: 'Formal',
    cotista: 'Não',
    socialFactor: 'Não',
    regionOfInterest: 'Zona Sul',
    development: 'Grand Tower',
    intendedValue: 'R$ 890.000',
    observations: 'Buscando investimento para aluguel.',
    stage: 'Novo Lead',
    history: [
      { id: 'h3', date: '19/02/2026', action: 'Cliente criado', user: 'João Silva' }
    ],
    documents: [],
    createdAt: '2026-02-19T14:30:00Z'
  },
  {
    id: '3',
    name: 'João Pedro',
    cpf: '999.888.777-66',
    email: 'jp.silva@email.com',
    phone: '(81) 99999-0003',
    address: 'Rua do Sol, 45, Olinda - PE',
    profession: 'Autônomo',
    grossIncome: 'R$ 8.500',
    incomeType: 'Informal',
    cotista: 'Sim',
    socialFactor: 'Sim',
    regionOfInterest: 'Zona Norte',
    development: 'Vila Verde',
    intendedValue: 'R$ 320.000',
    observations: 'Precisa de ajuda com a comprovação de renda.',
    stage: 'Aprovado',
    history: [
      { id: 'h4', date: '15/02/2026', action: 'Cliente criado', user: 'João Silva' },
      { id: 'h5', date: '16/02/2026', action: 'Estágio alterado para Em Análise', user: 'João Silva' },
      { id: 'h6', date: '18/02/2026', action: 'Estágio alterado para Aprovado', user: 'João Silva' }
    ],
    documents: [],
    createdAt: '2026-02-15T09:00:00Z'
  }
];
