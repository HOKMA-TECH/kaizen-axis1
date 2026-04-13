export type ClientStage =
  | "Documentação"
  | "Em Análise"
  | "Aprovado"
  | "Condicionado"
  | "Reprovado"
  | "Agendamento"
  | "Em Tratativa"
  | "Contrato"
  | "Formulários"
  | "Conformidade"
  | "Abertura de Conta"
  | "Repasse"
  | "Desistência"
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
  "Formulários",
  "Conformidade",
  "Abertura de Conta",
  "Repasse",
  "Desistência",
  "Concluído"
];

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

export interface Client {
  id: string;
  name: string;
  cpf?: string;
  email: string;
  phone: string;
  address?: string;
  profession?: string;
  grossIncome: string;
  incomeType?: 'Formal' | 'Informal';
  cotista?: string;
  socialFactor?: string;
  regionOfInterest?: string;
  development: string;
  intendedValue: string;
  observations?: string;
  stage: ClientStage;
  history: ClientHistory[];
  documents: ClientDocument[];
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
