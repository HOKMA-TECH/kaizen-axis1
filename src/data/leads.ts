export interface AutomationLead {
  id: string;
  name: string;
  phone: string;
  origin: string;
  timestamp: string;
  aiSummary: string;
  interestLevel: 'Alto' | 'Médio' | 'Baixo';
  stage?: string;
  assigned_to?: string | null;
  distribution_status?: string;
  ai_metadata?: {
    income?: string;
    region?: string;
    propertyType?: string;
    priority?: 'alta' | 'media' | 'baixa';
    urgency?: string;
    notes?: string;
    [key: string]: any;
  };
  viewed_at?: string | null;
  converted_at?: string | null;
  client_id?: string | null;
  directorate_id?: string | null;
  data?: {
    income?: string;
    region?: string;
    propertyType?: string;
  };
}
