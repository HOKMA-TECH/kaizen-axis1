export interface Metric {
  id: string;
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  period: string;
}

export interface ForecastData {
  month: string;
  predicted: number;
  confirmed: number;
}

export interface ClientHealth {
  id: string;
  name: string;
  stage: string;
  potentialValue: string;
  score: number; // 0-100
  risk: 'low' | 'medium' | 'high';
  conversionProbability: number;
  daysInStage: number;
  lastInteraction: string;
}

export interface PredictiveInsight {
  id: string;
  title: string;
  description: string;
  impact: string;
  action: string;
  type: 'warning' | 'opportunity' | 'info';
}

export const MOCK_METRICS: Metric[] = [
  { id: '1', label: 'Taxa de Conversão', value: '18.5%', change: '+2.4%', trend: 'up', period: 'vs mês anterior' },
  { id: '2', label: 'Ticket Médio', value: 'R$ 450k', change: '+5.1%', trend: 'up', period: 'vs mês anterior' },
  { id: '3', label: 'Ciclo de Vendas', value: '42 dias', change: '-3 dias', trend: 'down', period: 'vs mês anterior' }, // down is good for cycle time, but usually green means good. I'll handle color logic in component.
  { id: '4', label: 'Pipeline Ativo', value: 'R$ 12.4M', change: '+15%', trend: 'up', period: 'vs mês anterior' },
];

export const MOCK_FORECAST: ForecastData[] = [
  { month: 'Jan', predicted: 800000, confirmed: 750000 },
  { month: 'Fev', predicted: 950000, confirmed: 920000 },
  { month: 'Mar', predicted: 1100000, confirmed: 1050000 },
  { month: 'Abr', predicted: 1000000, confirmed: 980000 },
  { month: 'Mai', predicted: 1200000, confirmed: 1150000 },
  { month: 'Jun', predicted: 1350000, confirmed: 1250000 },
];

export const MOCK_CLIENT_HEALTH: ClientHealth[] = [
  { id: '1', name: 'Roberto Silva', stage: 'Negociação', potentialValue: 'R$ 850k', score: 92, risk: 'low', conversionProbability: 85, daysInStage: 5, lastInteraction: '2 dias atrás' },
  { id: '2', name: 'Ana Paula', stage: 'Proposta', potentialValue: 'R$ 420k', score: 78, risk: 'medium', conversionProbability: 60, daysInStage: 12, lastInteraction: '5 dias atrás' },
  { id: '3', name: 'Carlos Mendes', stage: 'Visita', potentialValue: 'R$ 1.2M', score: 45, risk: 'high', conversionProbability: 30, daysInStage: 25, lastInteraction: '15 dias atrás' },
  { id: '4', name: 'Fernanda Lima', stage: 'Qualificação', potentialValue: 'R$ 600k', score: 88, risk: 'low', conversionProbability: 75, daysInStage: 3, lastInteraction: '1 dia atrás' },
  { id: '5', name: 'João Souza', stage: 'Negociação', potentialValue: 'R$ 900k', score: 65, risk: 'medium', conversionProbability: 50, daysInStage: 18, lastInteraction: '8 dias atrás' },
];

export const MOCK_INSIGHTS: PredictiveInsight[] = [
  { 
    id: '1', 
    title: 'Gargalo na Etapa de Visita', 
    description: 'Clientes que permanecem mais de 10 dias na etapa de Visita reduzem a probabilidade de conversão em 40%.', 
    impact: '-R$ 350k em potencial perdido',
    action: 'Reagendar visitas pendentes',
    type: 'warning'
  },
  { 
    id: '2', 
    title: 'Oportunidade de Upsell', 
    description: '3 clientes na base possuem perfil compatível com o lançamento "Reserva Imperial".', 
    impact: '+R$ 2.5M em potencial',
    action: 'Clientes em potencial',
    type: 'opportunity'
  },
];
