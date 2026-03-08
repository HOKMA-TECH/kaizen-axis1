export type Role = 'Diretor' | 'Gerente' | 'Coordenador' | 'Corretor';
export type Status = 'Ativo' | 'Pendente' | 'Inativo';
export type Priority = 'Normal' | 'Importante' | 'Urgente';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  teamId?: string;
  status: Status;
  avatar?: string;
  requestedAt?: string; // For pending users
}

export interface Team {
  id: string;
  name: string;
  managerId: string;
  members: string[]; // Array of User IDs
  totalSales: string;
  directorate?: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  target: number;
  currentProgress: number;
  startDate: string;
  deadline: string;
  type: 'Semanal' | 'Mensal' | 'Personalizada' | 'Missão';
  assigneeId: string; // Team ID or User ID
  assigneeType: 'Team' | 'User' | 'All';
  points?: number; // For gamification
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: Priority;
  startDate: string;
  endDate: string;
  authorId: string;
}

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Carlos Diretor', email: 'carlos@luxbroker.com', phone: '(11) 99999-1111', role: 'Diretor', status: 'Ativo', avatar: 'https://i.pravatar.cc/150?u=1' },
  { id: '2', name: 'Ana Gerente', email: 'ana@luxbroker.com', phone: '(11) 98888-2222', role: 'Gerente', teamId: '1', status: 'Ativo', avatar: 'https://i.pravatar.cc/150?u=2' },
  { id: '3', name: 'Pedro Corretor', email: 'pedro@luxbroker.com', phone: '(11) 97777-3333', role: 'Corretor', teamId: '1', status: 'Ativo', avatar: 'https://i.pravatar.cc/150?u=3' },
  { id: '4', name: 'Julia Pendente', email: 'julia@gmail.com', phone: '(11) 96666-4444', role: 'Corretor', status: 'Pendente', requestedAt: '2024-02-18' },
];

export const MOCK_TEAMS: Team[] = [
  { id: '1', name: 'Equipe Alpha', managerId: '2', members: ['2', '3'], totalSales: 'R$ 12.5M', directorate: 'Comercial' },
  { id: '2', name: 'Equipe Beta', managerId: '', members: [], totalSales: 'R$ 8.2M', directorate: 'Marketing' },
];

export const MOCK_GOALS: Goal[] = [
  { id: '1', title: 'Meta Q1 2024', description: 'Vendas totais do trimestre', target: 5000000, currentProgress: 3200000, startDate: '2024-01-01', deadline: '2024-03-31', type: 'Mensal', assigneeId: '1', assigneeType: 'Team', points: 0 },
  { id: '2', title: 'Venda de Lançamento', description: 'Vender 2 unidades do Reserva Imperial', target: 2, currentProgress: 1, startDate: '2024-02-01', deadline: '2024-02-28', type: 'Mensal', assigneeId: '3', assigneeType: 'User', points: 50 },
];

export const MOCK_ANNOUNCEMENTS: Announcement[] = [
  { id: '1', title: 'Reunião Geral', content: 'Reunião de alinhamento estratégico na próxima segunda-feira às 09h.', priority: 'Importante', startDate: '2024-02-20', endDate: '2024-02-26', authorId: '1' },
  { id: '2', title: 'Novo Empreendimento', content: 'Lançamento do "Horizon View" disponível para venda a partir de hoje.', priority: 'Urgente', startDate: '2024-02-19', endDate: '2024-03-01', authorId: '1' },
];
