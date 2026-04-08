import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Client } from '@/data/clients';
import { AutomationLead } from '@/data/leads';
import { supabase } from '@/lib/supabase';
import { logAuditEvent } from '@/services/auditLogger';
import { rateLimiter } from '@/services/rateLimiter';
import { Session, User } from '@supabase/supabase-js';
import confetti from 'canvas-confetti';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Directorate {
  id: string;
  name: string;
  description?: string;
  manager_id?: string | null;
  created_at?: string;
}

export interface Profile {
  id: string;
  name: string;
  role: string;
  team?: string;
  team_id?: string | null;      // UUID FK to teams (normalized)
  status?: string;
  directorate_id?: string | null;
  manager_id?: string | null;
  coordinator_id?: string | null;
  avatar_url?: string | null;
}

export interface Appointment {
  id: string;
  user_id?: string;
  title: string;
  client_name?: string;
  client_id?: string;
  date: string; // YYYY-MM-DD
  time: string;
  location?: string;
  type: 'Visita' | 'Reunião' | 'Assinatura' | 'Outro';
  completed: boolean;
  created_at?: string;
}

export interface Task {
  id: string;
  user_id?: string;
  title: string;
  responsible?: string;
  deadline?: string;
  status: 'Pendente' | 'Em Andamento' | 'Concluída';
  description?: string;
  subtasks: { id: string; title: string; completed: boolean }[];
  created_at?: string;
}

export interface Development {
  id: string;
  user_id?: string;
  name: string;
  builder?: string;
  location?: string;
  address?: string;
  price?: string;
  min_income?: string;
  type?: string;
  status?: string;
  description?: string;
  differentials?: string[];
  images?: string[];
  book_pdf_url?: string;
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
    role?: string;
    avatar?: string;
  };
  created_at?: string;
}

export interface Team {
  id: string;
  name: string;
  manager_id?: string | null;
  directorate_id?: string | null;
  total_sales?: string;
  members?: string[];
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  target?: number;
  current_progress?: number;
  start_date?: string;
  deadline?: string;
  type?: string;
  assignee_type?: string;
  assignee_id?: string;
  points?: number;
  measure_type?: string;
  status?: 'active' | 'achieved' | 'failed';
  closed_at?: string;
  property_id?: string;
  objective_type?: 'sales' | 'approved_clients';
}

export interface Portal {
  id: string;
  name: string;
  url: string;
  category: 'Banco' | 'Construtora' | 'Outro';
  description?: string;
  created_by?: string;
  created_at?: string;
}

export interface TrainingItem {
  id: string;
  title: string;
  type: 'Vídeo' | 'PDF' | 'Imagem';
  url: string;
  thumbnail?: string;
  duration?: string;
  description?: string;
  xp_reward?: number;
  progress?: number;
  created_by?: string;
  created_at?: string;
}

export interface Announcement {
  id: string;
  author_id?: string;
  title: string;
  content?: string;
  priority?: 'Normal' | 'Importante' | 'Urgente';
  start_date?: string;
  end_date?: string;
  created_at?: string;
}

interface AppContextValue {
  // Auth
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  allProfiles: Profile[];
  userName: string;
  userRole: string;
  signOut: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  updateProfile: (id: string, data: Partial<Profile>) => Promise<void>;

  // Clients
  clients: Client[];
  loading: boolean;
  addClient: (data: Omit<Client, 'id' | 'history' | 'documents' | 'createdAt'>) => Promise<Client | null>;
  updateClient: (id: string, data: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  getClient: (id: string) => Client | undefined;
  refreshClients: () => Promise<void>;

  // Leads
  leads: AutomationLead[];
  refreshLeads: () => Promise<void>;
  updateLead: (id: string, data: Partial<AutomationLead>) => Promise<void>;
  convertLeadToClient: (leadId: string, clientData: any) => Promise<{ success: boolean; clientId?: string }>;

  // Storage
  uploadFile: (file: File, path: string, bucket?: string) => Promise<string | null>;
  addDocumentToClient: (clientId: string, name: string, path: string) => Promise<{ success: boolean; error?: string }>;
  deleteDocumentFromClient: (docId: string, filePath?: string) => Promise<{ success: boolean; error?: string }>;
  getDownloadUrl: (path: string, bucket?: string) => Promise<string | null>;

  // Appointments
  appointments: Appointment[];
  refreshAppointments: () => Promise<void>;
  addAppointment: (data: Omit<Appointment, 'id' | 'created_at'>) => Promise<void>;
  updateAppointment: (id: string, data: Partial<Appointment>) => Promise<void>;
  deleteAppointment: (id: string) => Promise<void>;

  // Tasks
  tasks: Task[];
  refreshTasks: () => Promise<void>;
  addTask: (data: Omit<Task, 'id' | 'created_at'>) => Promise<void>;
  updateTask: (id: string, data: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  // Developments
  developments: Development[];
  refreshDevelopments: () => Promise<void>;
  addDevelopment: (data: Omit<Development, 'id' | 'created_at'>) => Promise<Development | null>;
  updateDevelopment: (id: string, data: Partial<Development>) => Promise<void>;
  deleteDevelopment: (id: string) => Promise<void>;

  // Admin - Teams
  teams: Team[];
  refreshTeams: () => Promise<void>;
  addTeam: (data: Omit<Team, 'id'>) => Promise<void>;
  updateTeam: (id: string, data: Partial<Team>) => Promise<void>;
  deleteTeam: (id: string) => Promise<void>;

  // Admin - Goals
  goals: Goal[];
  refreshGoals: () => Promise<void>;
  addGoal: (data: Omit<Goal, 'id'>) => Promise<void>;
  updateGoal: (id: string, data: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;

  // Admin - Announcements
  announcements: Announcement[];
  refreshAnnouncements: () => Promise<void>;
  addAnnouncement: (data: Omit<Announcement, 'id' | 'created_at'>) => Promise<void>;
  updateAnnouncement: (id: string, data: Partial<Announcement>) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;

  // Admin - Diretorias
  directorates: Directorate[];
  refreshDirectorates: () => Promise<void>;
  addDirectorate: (data: Omit<Directorate, 'id' | 'created_at'>) => Promise<void>;
  updateDirectorate: (id: string, data: Partial<Directorate>) => Promise<void>;
  deleteDirectorate: (id: string) => Promise<void>;

  // Portals
  portals: Portal[];
  refreshPortals: () => Promise<void>;
  addPortal: (data: Omit<Portal, 'id' | 'created_at'>) => Promise<void>;
  updatePortal: (id: string, data: Partial<Portal>) => Promise<void>;
  deletePortal: (id: string) => Promise<void>;

  // Trainings
  trainings: TrainingItem[];
  refreshTrainings: () => Promise<void>;
  addTraining: (data: Omit<TrainingItem, 'id' | 'created_at'>) => Promise<void>;
  updateTraining: (id: string, data: Partial<TrainingItem>) => Promise<void>;
  deleteTraining: (id: string) => Promise<void>;
  completeTraining: (id: string) => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [leads, setLeads] = useState<AutomationLead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [directorates, setDirectorates] = useState<Directorate[]>([]);
  const [portals, setPortals] = useState<Portal[]>([]);
  const [trainings, setTrainings] = useState<TrainingItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Refs para evitar loop infinito: refreshLeads/refreshClients lê esses valores sem depender deles
  const profileRef = React.useRef(profile);
  const userRef = React.useRef(user);
  const userRoleRef = React.useRef('Corretor');
  const allProfilesRef = React.useRef<Profile[]>([]);
  React.useEffect(() => { profileRef.current = profile; }, [profile]);
  React.useEffect(() => { userRef.current = user; }, [user]);
  React.useEffect(() => { userRoleRef.current = profile?.role || 'Corretor'; }, [profile]);
  React.useEffect(() => { allProfilesRef.current = allProfiles; }, [allProfiles]);

  const userName = profile?.name || user?.email || 'Usuário';
  const userRole = profile?.role || 'Corretor';

  // ─── Confetti Logic ───────────────────────────────────────────────────────
  const previousGoalsRef = React.useRef<Goal[]>([]);

  React.useEffect(() => {
    if (goals.length > 0 && previousGoalsRef.current.length > 0) {
      // Check if any previously unachieved active goal just became achieved
      const newlyAchievedGoals = goals.filter((currentGoal) => {
        const previousGoal = previousGoalsRef.current.find((g) => g.id === currentGoal.id);
        if (!previousGoal) return false;

        const wasAchieved = (previousGoal.current_progress || 0) >= (previousGoal.target || 1);
        const isNowAchieved = (currentGoal.current_progress || 0) >= (currentGoal.target || 1);

        // Only celebrate active/ongoing goals that crossed the line
        return !wasAchieved && isNowAchieved && currentGoal.status !== 'failed';
      });

      if (newlyAchievedGoals.length > 0) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#D4AF37', '#FFDF00', '#FFFFFF', '#10B981'] // Gold, Silver, Emerald
        });
      }
    }
    // Update ref for next render cycle
    previousGoalsRef.current = goals;
  }, [goals]);

  // ─── System Events (Gamification) ─────────────────────────────────────────
  React.useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('public:system_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'system_events',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const eventInfo: any = payload.new;
          if (
            eventInfo.type === 'achievement_unlocked' ||
            eventInfo.type === 'goal_achieved' ||
            eventInfo.type === 'mission_completed'
          ) {
            confetti({
              particleCount: 200,
              spread: 100,
              origin: { y: 0.6 },
              colors: ['#D4AF37', '#FFDF00', '#FFFFFF', '#10B981'] // Gold, Silver, Emerald
            });
            // Optional: Show browser alert if desired.
            if (eventInfo.payload?.title) {
              console.log(`[Gamification Event]: ${eventInfo.payload.title}`);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // ─── Auth ─────────────────────────────────────────────────────────────────

  const fetchProfile = async (userId: string) => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) {
        setProfile(data);
        return data as Profile;
      }
    } catch (e) {
      console.error('Erro ao buscar perfil:', e);
    }
    return null;
  };

  const refreshProfiles = useCallback(async () => {
    try {
      const { data } = await supabase.from('profiles').select('*').order('name');
      setAllProfiles(data || []);
    } catch (e) {
      console.error('Erro ao buscar profiles:', e);
    }
  }, []);

  const updateProfile = useCallback(async (id: string, data: Partial<Profile>) => {
    try {
      const { error } = await supabase.from('profiles').update(data).eq('id', id);
      if (error) throw error;
      await refreshProfiles();
      logAuditEvent({
        action: data.role ? 'permissions_updated' : 'profile_updated',
        entity: 'profile',
        entityId: id,
        userId: userRef.current?.id || null,
        metadata: data
      });
    } catch (e) {
      console.error('Erro ao atualizar profile:', e);
    }
  }, [refreshProfiles]);

  const signOut = async () => {
    const uid = userRef.current?.id || null;
    await supabase.auth.signOut();
    localStorage.removeItem('isAuthenticated');
    logAuditEvent({ action: 'logout', entity: 'auth', userId: uid });
  };

  // ─── Clients ──────────────────────────────────────────────────────────────

  const refreshLeads = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      // Silently skip if DB error (e.g. column not yet migrated)
      if (error) { console.warn('refreshLeads skipped:', error.message); return; }

      const rawRole = profileRef.current?.role || userRoleRef.current || 'CORRETOR';
      const role = String(rawRole).toUpperCase();
      const uid = userRef.current?.id;

      const filtered = (data || []).filter((lead: any) => {
        // Hide converted leads (client-side, only if column exists)
        if (lead.stage && lead.stage !== 'novo_lead') return false;
        // RBAC filter client-side
        if (role === 'ADMIN') return true;
        if (role === 'CORRETOR') return !lead.assigned_to || lead.assigned_to === uid;
        if ((role === 'GERENTE' || role === 'COORDENADOR' || role === 'DIRETOR') && profileRef.current?.directorate_id) {
          return !lead.directorate_id || lead.directorate_id === profileRef.current.directorate_id;
        }
        return true;
      });

      const transformed: AutomationLead[] = filtered.map((lead: any) => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        origin: lead.origin,
        timestamp: lead.created_at,
        aiSummary: lead.ai_summary,
        interestLevel: lead.interest_level,
        stage: lead.stage,
        assigned_to: lead.assigned_to,
        distribution_status: lead.distribution_status,
        ai_metadata: lead.ai_metadata,
        viewed_at: lead.viewed_at,
        converted_at: lead.converted_at,
        client_id: lead.client_id,
        directorate_id: lead.directorate_id,
        data: lead.ai_metadata || lead.data,
      }));
      setLeads(transformed);
    } catch (e) { console.error('Erro ao carregar leads:', e); }
  }, []);

  const updateLead = useCallback(async (id: string, data: Partial<AutomationLead>) => {
    try {
      const dbData: any = {};
      if (data.stage !== undefined) dbData.stage = data.stage;
      if (data.assigned_to !== undefined) dbData.assigned_to = data.assigned_to;
      if (data.distribution_status !== undefined) dbData.distribution_status = data.distribution_status;
      if (data.viewed_at !== undefined) dbData.viewed_at = data.viewed_at;
      if (data.converted_at !== undefined) dbData.converted_at = data.converted_at;
      if (data.client_id !== undefined) dbData.client_id = data.client_id;
      if (data.name !== undefined) dbData.name = data.name;
      const { error } = await supabase.from('leads').update(dbData).eq('id', id);
      if (error) throw error;
      await refreshLeads();
    } catch (e) { console.error('Erro ao atualizar lead:', e); }
  }, [refreshLeads]);



  const refreshClients = useCallback(async () => {
    try {
      const rawRole = profileRef.current?.role || userRoleRef.current || 'CORRETOR';
      const role = String(rawRole).toUpperCase();
      const uid = userRef.current?.id;

      try {
        await rateLimiter.enforce('clients_query', { userId: uid || null });
      } catch (err: any) {
        alert(err?.message || 'Limite de consultas atingido. Aguarde um minuto.');
        return;
      }

      let query = supabase
        .from('clients')
        .select('*, history:client_history(*), documents:client_documents(*)')
        .order('created_at', { ascending: false });

      if (uid && role === 'CORRETOR') {
        query = query.eq('owner_id', uid);
      } else if (uid && role === 'COORDENADOR') {
        const { data: directMembers } = await supabase
          .from('profiles').select('id').eq('coordinator_id', uid);
        const memberIds = (directMembers || []).map((p: any) => p.id);
        const ownerIds = [...new Set([...memberIds, uid])];
        query = query.in('owner_id', ownerIds);
      }
      // GERENTE / ADMIN / DIRETOR: sem filtro JS — o RLS (manager_view_team_clients) garante visibilidade correta

      const { data, error } = await query;
      if (error) throw error;
      const transformed = (data || []).map(client => ({
        ...client,
        grossIncome: client.gross_income, incomeType: client.income_type,
        socialFactor: client.social_factor, regionOfInterest: client.region_of_interest,
        intendedValue: client.intended_value, createdAt: client.created_at,
        closed_at: client.closed_at,
        updated_at: client.updated_at,
        history: (client.history || []).map((h: any) => ({ ...h, user: h.user_name }))
          .map((h: any) => ({
            ...h,
            date: h.date || (h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : ''),
          }))
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        documents: (client.documents || []).map((d: any) => ({ ...d, file_path: d.url || d.file_path, uploadDate: d.upload_date }))
      }));
      setClients(transformed);
    } catch (e) { console.error('Erro ao carregar clientes:', e); }
  }, []);

  const convertLeadToClient = useCallback(async (leadId: string, clientData: any): Promise<{ success: boolean; clientId?: string }> => {
    try {
      const { data: newClient, error: clientError } = await supabase.from('clients').insert([{
        name: clientData.name,
        phone: clientData.phone,
        cpf: clientData.cpf || null,
        email: clientData.email || null,
        profession: clientData.profession || null,
        gross_income: clientData.grossIncome || null,
        income_type: clientData.incomeType || null,
        region_of_interest: clientData.regionOfInterest || null,
        intended_value: clientData.intendedValue || null,
        observations: clientData.observations || null,
        stage: clientData.stage || 'Em Análise',
        owner_id: user?.id,
        directorate_id: profile?.directorate_id || null,
      }]).select().single();
      if (clientError) throw clientError;

      const now = new Date().toISOString();
      const { error: leadError } = await supabase.from('leads').update({
        stage: 'convertido',
        client_id: newClient.id,
        converted_at: now,
      }).eq('id', leadId);
      if (leadError) throw leadError;

      await Promise.all([refreshLeads(), refreshClients()]);
      const actingUser = userRef.current?.id || null;
      logAuditEvent({
        action: 'client_created',
        entity: 'client',
        entityId: newClient.id,
        userId: actingUser,
        metadata: { source: 'lead_conversion' }
      });
      logAuditEvent({
        action: 'lead_converted',
        entity: 'lead',
        entityId: leadId,
        userId: actingUser,
        metadata: { client_id: newClient.id }
      });
      return { success: true, clientId: newClient.id };
    } catch (e: any) {
      console.error('Erro ao converter lead:', e);
      return { success: false };
    }
  }, [user, profile, refreshLeads, refreshClients]);

  const addClient = useCallback(async (data: Omit<Client, 'id' | 'history' | 'documents' | 'createdAt'>): Promise<Client | null> => {
    try {
      const { data: newClient, error } = await supabase.from('clients').insert([{
        name: data.name, cpf: data.cpf, email: data.email, phone: data.phone,
        address: data.address, profession: data.profession, gross_income: data.grossIncome,
        income_type: data.incomeType, cotista: data.cotista, social_factor: data.socialFactor,
        region_of_interest: data.regionOfInterest, development: data.development,
        intended_value: data.intendedValue, observations: data.observations, stage: data.stage,
        owner_id: user?.id, directorate_id: profile?.directorate_id || null
      }]).select().single();
      if (error) throw error;
      await supabase.from('client_history').insert([{ client_id: newClient.id, action: 'Cliente criado', user_name: userName }]);
      await refreshClients();
      logAuditEvent({
        action: 'client_created',
        entity: 'client',
        entityId: newClient.id,
        userId: user?.id || null,
        metadata: { stage: data.stage }
      });
      return newClient;
    } catch (e: any) { console.error('Erro ao adicionar cliente:', e); throw e; }
  }, [userName, refreshClients, user, profile]);

  const updateClient = useCallback(async (id: string, data: Partial<Client>) => {
    try {
      const allowedFields = [
        'name', 'cpf', 'email', 'phone', 'address', 'profession',
        'gross_income', 'income_type', 'cotista', 'social_factor', 'region_of_interest',
        'development', 'intended_value', 'observations', 'stage'
      ];

      const updatePayload: any = {};
      Object.keys(data).forEach(key => {
        if (allowedFields.includes(key)) {
          updatePayload[key] = data[key as keyof Client];
        }
      });

      if (data.grossIncome !== undefined) updatePayload.gross_income = data.grossIncome;
      if (data.incomeType !== undefined) updatePayload.income_type = data.incomeType;
      if (data.socialFactor !== undefined) updatePayload.social_factor = data.socialFactor;
      if (data.regionOfInterest !== undefined) updatePayload.region_of_interest = data.regionOfInterest;
      if (data.intendedValue !== undefined) updatePayload.intended_value = data.intendedValue;

      const { data: updated, error } = await supabase
        .from('clients')
        .update(updatePayload)
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!updated || updated.length === 0) {
        throw new Error('Sem permissão para alterar este cliente. Verifique suas permissões de acesso.');
      }
      if (data.stage) {
        const { error: historyError } = await supabase
          .from('client_history')
          .insert([{ client_id: id, action: `Estágio alterado para ${data.stage}`, user_name: userName }]);

        if (historyError) {
          console.error('Erro ao registrar histórico do cliente:', historyError);
        }
      }
      await refreshClients();
      logAuditEvent({
        action: 'client_updated',
        entity: 'client',
        entityId: id,
        userId: userRef.current?.id || null,
        metadata: { fields: Object.keys(updatePayload) }
      });
    } catch (e) {
      console.error('Erro ao atualizar cliente:', e);
      throw e; // re-throw so callers can handle/show error
    }
  }, [userName, refreshClients]);

  const deleteClient = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      await refreshClients();
      logAuditEvent({ action: 'client_deleted', entity: 'client', entityId: id, userId: userRef.current?.id || null });
    } catch (e) { console.error('Erro ao deletar cliente:', e); }
  }, [refreshClients]);

  const getClient = useCallback((id: string) => clients.find(c => c.id === id), [clients]);

  // ─── Storage ──────────────────────────────────────────────────────────────

  const uploadFile = async (file: File, path: string, bucket = 'documents'): Promise<string | null> => {
    const targetBucket = bucket || 'documents';
    try {
      if (targetBucket === 'client-documents') {
        try {
          await rateLimiter.enforce('document_upload', { userId: userRef.current?.id || null });
        } catch (err: any) {
          alert(err?.message || 'Limite de upload atingido. Aguarde instantes e tente novamente.');
          return null;
        }
      }

      // Remove accents and special characters to prevent Supabase Storage "Invalid key" errors
      const sanitizedPath = path.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.\-_/]/g, '_');
      const { data, error } = await supabase.storage.from(targetBucket).upload(sanitizedPath, file, {
        upsert: targetBucket === 'client-documents' ? false : true,
        contentType: file.type
      });
      if (error) throw error;
      return data.path;
    } catch (e: any) {
      console.error('Erro no upload Storage:', e.message || e);
      return null;
    }
  };

  const addDocumentToClient = async (clientId: string, name: string, path: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.from('client_documents').insert([{ client_id: clientId, name, url: path }]);
      if (error) return { success: false, error: error.message };
      await refreshClients();
      logAuditEvent({
        action: 'document_uploaded',
        entity: 'client_document',
        entityId: clientId,
        userId: userRef.current?.id || null,
        metadata: { name, path }
      });
      return { success: true };
    } catch (e: any) {
      console.error('Erro ao adicionar documento:', e);
      return { success: false, error: e.message || 'Erro desconhecido' };
    }
  };

  const deleteDocumentFromClient = async (docId: string, filePath?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // First delete from storage if a file path is provided
      if (filePath) {
        // Strip out the leading folder name if the storage API expects only the file name or bucket logic varies,
        // but typically path includes folder/filename.
        await supabase.storage.from('client-documents').remove([filePath]);
      }

      // Then delete from database
      const { error } = await supabase.from('client_documents').delete().eq('id', docId);
      if (error) return { success: false, error: error.message };

      await refreshClients();
      logAuditEvent({
        action: 'document_deleted',
        entity: 'client_document',
        entityId: docId,
        userId: userRef.current?.id || null,
        metadata: { path: filePath }
      });
      return { success: true };
    } catch (e: any) {
      console.error('Erro ao deletar documento:', e);
      return { success: false, error: e.message || 'Erro desconhecido' };
    }
  };

  const getDownloadUrl = async (path: string, bucket = 'documents'): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error) { console.error('Erro ao gerar link:', error); return null; }
    if (bucket === 'client-documents' && data?.signedUrl) {
      logAuditEvent({
        action: 'document_downloaded',
        entity: 'client_document',
        entityId: path,
        userId: userRef.current?.id || null
      });
    }
    return data.signedUrl;
  };

  // ─── Appointments ─────────────────────────────────────────────────────────

  const refreshAppointments = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('appointments').select('*').order('date').order('time');
      if (error) throw error;
      setAppointments(data || []);
    } catch (e) { console.error('Erro ao buscar agendamentos:', e); }
  }, []);

  const addAppointment = useCallback(async (data: Omit<Appointment, 'id' | 'created_at'>) => {
    try {
      const { data: newRow, error } = await supabase.from('appointments').insert([{
        ...data,
        owner_id: user?.id,
        directorate_id: profile?.directorate_id || null
      }]).select().single();
      if (error) throw error;
      await refreshAppointments();
    } catch (e: any) {
      console.error('Erro ao adicionar agendamento:', e);
      throw e;
    }
  }, [refreshAppointments, user, profile]);

  const updateAppointment = useCallback(async (id: string, data: Partial<Appointment>) => {
    try {
      const { error } = await supabase.from('appointments').update(data).eq('id', id);
      if (error) throw error;
      await refreshAppointments();
    } catch (e) { console.error('Erro ao atualizar agendamento:', e); }
  }, [refreshAppointments]);

  const deleteAppointment = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('appointments').delete().eq('id', id);
      if (error) throw error;
      await refreshAppointments();
    } catch (e: any) {
      console.error('Erro ao deletar agendamento:', e);
      throw e;
    }
  }, [refreshAppointments]);

  // ─── Tasks ────────────────────────────────────────────────────────────────

  const refreshTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setTasks(data || []);
    } catch (e) { console.error('Erro ao buscar tarefas:', e); }
  }, []);

  const addTask = useCallback(async (data: Omit<Task, 'id' | 'created_at'>) => {
    try {
      const basePayload = {
        ...data,
        directorate_id: profile?.directorate_id || null
      };

      let { error } = await supabase.from('tasks').insert([{
        ...basePayload,
        owner_id: user?.id
      }]);

      if (error?.message?.toLowerCase().includes('owner_id')) {
        const retry = await supabase.from('tasks').insert([{
          ...basePayload,
          user_id: user?.id
        }]);
        error = retry.error;
      }

      if (error) throw error;
      await refreshTasks();
    } catch (e: any) {
      console.error('Erro ao adicionar tarefa:', e);
      throw e;
    }
  }, [refreshTasks, user, profile]);

  const updateTask = useCallback(async (id: string, data: Partial<Task>) => {
    try {
      const { error } = await supabase.from('tasks').update(data).eq('id', id);
      if (error) throw error;
      await refreshTasks();
    } catch (e: any) {
      console.error('Erro ao atualizar tarefa:', e);
      throw e;
    }
  }, [refreshTasks]);

  const deleteTask = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      await refreshTasks();
    } catch (e: any) {
      console.error('Erro ao deletar tarefa:', e);
      throw e;
    }
  }, [refreshTasks]);

  // ─── Developments ─────────────────────────────────────────────────────────

  const refreshDevelopments = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('developments').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setDevelopments(data || []);
    } catch (e) { console.error('Erro ao buscar empreendimentos:', e); }
  }, []);

  const addDevelopment = useCallback(async (data: Omit<Development, 'id' | 'created_at'>): Promise<Development | null> => {
    try {
      const { data: newDev, error } = await supabase.from('developments').insert([{
        ...data,
        user_id: user?.id,
        directorate_id: profile?.directorate_id || null
      }]).select().single();
      if (error) throw error;
      await refreshDevelopments();
      return newDev;
    } catch (e) { console.error('Erro ao adicionar empreendimento:', e); return null; }
  }, [refreshDevelopments, user, profile]);

  const updateDevelopment = useCallback(async (id: string, data: Partial<Development>) => {
    try {
      const { error } = await supabase.from('developments').update(data).eq('id', id);
      if (error) throw error;
      await refreshDevelopments();
    } catch (e) { console.error('Erro ao atualizar empreendimento:', e); }
  }, [refreshDevelopments]);

  const deleteDevelopment = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('developments').delete().eq('id', id);
      if (error) throw error;
      await refreshDevelopments();
    } catch (e) { console.error('Erro ao deletar empreendimento:', e); }
  }, [refreshDevelopments]);

  // ─── Teams ────────────────────────────────────────────────────────────────

  const refreshTeams = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('teams').select('*').order('name');
      if (error) throw error;
      setTeams(data || []);
    } catch (e) { console.error('Erro ao buscar equipes:', e); }
  }, []);

  const addTeam = useCallback(async (data: Omit<Team, 'id'>) => {
    try {
      const { error } = await supabase.from('teams').insert([{
        name: data.name,
        manager_id: data.manager_id || null,
        directorate_id: data.directorate_id || null,
        members: data.members || []
      }]);
      if (error) throw error;
      await refreshTeams();
    } catch (e) {
      console.error('Erro ao adicionar equipe:', e);
      throw e; // propagate up to UI
    }
  }, [refreshTeams]);

  const updateTeam = useCallback(async (id: string, data: Partial<Team>) => {
    try {
      const updateData: any = { ...data };
      if ('directorate_id' in data) updateData.directorate_id = data.directorate_id ? data.directorate_id : null;
      if ('manager_id' in data) updateData.manager_id = data.manager_id ? data.manager_id : null;

      const { error } = await supabase.from('teams').update(updateData).eq('id', id);
      if (error) throw error;
      await refreshTeams();
    } catch (e) { console.error('Erro ao atualizar equipe:', e); }
  }, [refreshTeams]);

  const deleteTeam = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
      await refreshTeams();
    } catch (e) { console.error('Erro ao deletar equipe:', e); }
  }, [refreshTeams]);

  // ─── Goals ────────────────────────────────────────────────────────────────

  const refreshGoals = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('goals').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setGoals(data || []);
    } catch (e) { console.error('Erro ao buscar metas:', e); }
  }, []);

  // ─── Goals Realtime (auto-refresh when trigger updates progress) ──────────
  React.useEffect(() => {
    if (!user) return;
    const goalsChannel = supabase.channel('public:goals:realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, () => {
        refreshGoals();
      })
      .subscribe();
    return () => { supabase.removeChannel(goalsChannel); };
  }, [user, refreshGoals]);


  const addGoal = useCallback(async (data: Omit<Goal, 'id'>) => {
    try {
      const basePayload = {
        ...data,
        directorate_id: profile?.directorate_id || null
      };

      let { error } = await supabase.from('goals').insert([{
        ...basePayload,
        owner_id: user?.id
      }]);

      if (error?.message?.toLowerCase().includes('owner_id')) {
        const retryCreatedBy = await supabase.from('goals').insert([{
          ...basePayload,
          created_by: user?.id
        }]);
        error = retryCreatedBy.error;
      }

      if (error?.message?.toLowerCase().includes('created_by')) {
        const retryUser = await supabase.from('goals').insert([{
          ...basePayload,
          user_id: user?.id
        }]);
        error = retryUser.error;
      }

      if (error) throw error;
      await refreshGoals();
    } catch (e: any) {
      console.error('Erro ao adicionar meta:', e);
      throw e;
    }
  }, [refreshGoals, user, profile]);

  const updateGoal = useCallback(async (id: string, data: Partial<Goal>) => {
    try {
      const { error } = await supabase.from('goals').update(data).eq('id', id);
      if (error) throw error;
      await refreshGoals();
    } catch (e: any) {
      console.error('Erro ao atualizar meta:', e);
      throw e;
    }
  }, [refreshGoals]);

  const deleteGoal = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
      await refreshGoals();
    } catch (e: any) {
      console.error('Erro ao deletar meta:', e);
      throw e;
    }
  }, [refreshGoals]);

  // ─── Announcements ────────────────────────────────────────────────────────

  const refreshAnnouncements = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setAnnouncements(data || []);
    } catch (e) { console.error('Erro ao buscar anúncios:', e); }
  }, []);

  const addAnnouncement = useCallback(async (data: Omit<Announcement, 'id' | 'created_at'>) => {
    try {
      const basePayload = {
        ...data,
        author_id: user?.id,
        directorate_id: profile?.directorate_id || null
      };

      let { error } = await supabase.from('announcements').insert([{
        ...basePayload,
        owner_id: user?.id
      }]);

      if (error?.message?.toLowerCase().includes('owner_id')) {
        const retryNoOwner = await supabase.from('announcements').insert([basePayload]);
        error = retryNoOwner.error;
      }

      if (error) throw error;
      await refreshAnnouncements();
    } catch (e: any) {
      console.error('Erro ao adicionar anúncio:', e);
      throw e;
    }
  }, [refreshAnnouncements, user, profile]);

  const updateAnnouncement = useCallback(async (id: string, data: Partial<Announcement>) => {
    try {
      const { error } = await supabase.from('announcements').update(data).eq('id', id);
      if (error) throw error;
      await refreshAnnouncements();
    } catch (e: any) {
      console.error('Erro ao atualizar anúncio:', e);
      throw e;
    }
  }, [refreshAnnouncements]);

  const deleteAnnouncement = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
      await refreshAnnouncements();
    } catch (e: any) {
      console.error('Erro ao deletar anúncio:', e);
      throw e;
    }
  }, [refreshAnnouncements]);

  // ─── Directorates ─────────────────────────────────────────────

  const refreshDirectorates = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('directorates').select('*').order('name');
      if (error) throw error;
      setDirectorates(data || []);
    } catch (e) { console.error('Erro ao carregar diretorias:', e); }
  }, []);

  const addDirectorate = useCallback(async (data: Omit<Directorate, 'id'>) => {
    try {
      const { error } = await supabase.from('directorates').insert([{
        name: data.name,
        description: data.description,
        manager_id: data.manager_id || null
      }]);
      if (error) throw error;
      await refreshDirectorates();
    } catch (e) {
      console.error('Erro ao adicionar diretoria:', e);
      throw e;
    }
  }, [refreshDirectorates]);

  const updateDirectorate = useCallback(async (id: string, data: Partial<Directorate>) => {
    try {
      const updateData: any = { ...data };
      if ('manager_id' in data) updateData.manager_id = data.manager_id ? data.manager_id : null;

      const { error } = await supabase.from('directorates').update(updateData).eq('id', id);
      if (error) throw error;
      await refreshDirectorates();
    } catch (e) {
      console.error('Erro ao atualizar diretoria:', e);
      throw e;
    }
  }, [refreshDirectorates]);

  const deleteDirectorate = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('directorates').delete().eq('id', id);
      if (error) throw error;
      await refreshDirectorates();
    } catch (e) { console.error('Erro ao deletar diretoria:', e); }
  }, [refreshDirectorates]);

  // ─── Portals ──────────────────────────────────────────────────────────────

  const refreshPortals = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('portals').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setPortals(data || []);
    } catch (e) { console.error('Erro ao buscar portais:', e); }
  }, []);

  const addPortal = useCallback(async (data: Omit<Portal, 'id' | 'created_at'>) => {
    try {
      const { error } = await supabase.from('portals').insert([{ ...data, created_by: user?.id }]);
      if (error) throw error;
      await refreshPortals();
    } catch (e) { console.error('Erro ao criar portal:', e); }
  }, [refreshPortals, user]);

  const updatePortal = useCallback(async (id: string, data: Partial<Portal>) => {
    try {
      const { error } = await supabase.from('portals').update(data).eq('id', id);
      if (error) throw error;
      await refreshPortals();
    } catch (e) { console.error('Erro ao atualizar portal:', e); }
  }, [refreshPortals]);

  const deletePortal = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('portals').delete().eq('id', id);
      if (error) throw error;
      await refreshPortals();
    } catch (e) { console.error('Erro ao deletar portal:', e); }
  }, [refreshPortals]);

  // ─── Trainings ────────────────────────────────────────────────────────────

  const refreshTrainings = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('trainings').select('*').order('created_at', { ascending: false });
      if (error) throw error;

      let completionsMap: Record<string, boolean> = {};
      if (user) {
        const { data: compData, error: compError } = await supabase
          .from('training_completions')
          .select('training_id')
          .eq('user_id', user.id);

        if (!compError && compData) {
          compData.forEach(c => {
            completionsMap[c.training_id] = true;
          });
        }
      }

      const transformed = (data || []).map(t => ({
        ...t,
        progress: completionsMap[t.id] ? 100 : 0
      }));
      setTrainings(transformed);
    } catch (e) { console.error('Erro ao buscar treinamentos:', e); }
  }, [user]);

  const addTraining = useCallback(async (data: Omit<TrainingItem, 'id' | 'created_at'>) => {
    try {
      let { error } = await supabase.from('trainings').insert([{ ...data, created_by: user?.id }]);

      if (error?.message?.toLowerCase().includes('created_by')) {
        const retryUser = await supabase.from('trainings').insert([{ ...data, user_id: user?.id }]);
        error = retryUser.error;
      }

      if (error?.message?.toLowerCase().includes('user_id')) {
        const retryOwner = await supabase.from('trainings').insert([{ ...data, owner_id: user?.id }]);
        error = retryOwner.error;
      }

      if (error) throw error;
      await refreshTrainings();
    } catch (e: any) {
      console.error('Erro ao criar treinamento:', e);
      throw e;
    }
  }, [refreshTrainings, user]);

  const updateTraining = useCallback(async (id: string, data: Partial<TrainingItem>) => {
    try {
      const { error } = await supabase.from('trainings').update(data).eq('id', id);
      if (error) throw error;
      await refreshTrainings();
    } catch (e: any) {
      console.error('Erro ao atualizar treinamento:', e);
      throw e;
    }
  }, [refreshTrainings]);

  const deleteTraining = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('trainings').delete().eq('id', id);
      if (error) throw error;
      await refreshTrainings();
    } catch (e: any) {
      console.error('Erro ao deletar treinamento:', e);
      throw e;
    }
  }, [refreshTrainings]);

  const completeTraining = useCallback(async (id: string) => {
    try {
      if (!user) return;
      // We do a direct insert. If it fails due to UNIQUE constraint, it just means they already completed it.
      const { error } = await supabase.from('training_completions').insert({
        user_id: user.id,
        training_id: id
      });
      // We don't throw error if it's a conflict (23505) because the user already completed it
      if (error && error.code !== '23505') {
        console.error('Erro ao concluir treinamento:', error);
      } else {
        // Refresh to reflect the 100% completion status
        await refreshTrainings();
      }
    } catch (e) {
      console.error('Erro ao registrar conclusão do treinamento:', e);
    }
  }, [user, refreshTrainings]);

  // ─── Init ─────────────────────────────────────────────────────────────────

  const loadAllData = useCallback(async (forcedProfile?: Profile) => {
    if (forcedProfile) {
      profileRef.current = forcedProfile;
      userRoleRef.current = forcedProfile.role || 'Corretor';
    }
    try {
      await Promise.all([
        refreshClients(),
        refreshLeads(),
        refreshPortals(),
        refreshTrainings(),
        refreshAppointments(),
        refreshTasks(),
        refreshDevelopments(),
        refreshTeams(),
        refreshGoals(),
        refreshAnnouncements(),
        refreshProfiles(),
        refreshDirectorates(),
      ]);
    } finally {
      // loading controla somente a inicialização de sessão/tela protegida.
      // Atualizações em background não devem desmontar a UI inteira.
      setLoading(false);
    }
  }, [refreshClients, refreshLeads, refreshAppointments, refreshTasks, refreshDevelopments, refreshTeams, refreshGoals, refreshAnnouncements, refreshProfiles, refreshDirectorates]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).then(profileData => {
          loadAllData(profileData || undefined);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      // TOKEN_REFRESHED: apenas atualiza tokens, não recarrega dados
      // (evita setLoading(true) que desmontaria componentes em uso)
      if (event === 'TOKEN_REFRESHED') return;

      if (session?.user) {
        fetchProfile(session.user.id).then(profileData => {
          loadAllData(profileData || undefined);
        });
      } else {
        setProfile(null); setClients([]); setLeads([]);
        setAppointments([]); setTasks([]); setDevelopments([]);
        setTeams([]); setGoals([]); setAnnouncements([]);
        setLoading(false);
      }
    });

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => refreshClients())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => refreshLeads())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => refreshAppointments())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => refreshTasks())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'developments' }, () => refreshDevelopments())
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []); // ← dependências vazias: roda só na montagem, sem loop

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppContext.Provider value={{
      session, user, profile, allProfiles, userName, userRole,
      signOut, refreshProfiles, updateProfile,
      clients, loading, addClient, updateClient, deleteClient, getClient, refreshClients,
      leads, refreshLeads, updateLead, convertLeadToClient,
      uploadFile,
      addDocumentToClient,
      deleteDocumentFromClient,
      getDownloadUrl,
      appointments, refreshAppointments, addAppointment, updateAppointment, deleteAppointment,
      tasks, refreshTasks, addTask, updateTask, deleteTask,
      developments, refreshDevelopments, addDevelopment, updateDevelopment, deleteDevelopment,
      teams, refreshTeams, addTeam, updateTeam, deleteTeam,
      goals, refreshGoals, addGoal, updateGoal, deleteGoal,
      announcements, refreshAnnouncements, addAnnouncement, updateAnnouncement, deleteAnnouncement,
      directorates, refreshDirectorates,
      addDirectorate,
      updateDirectorate,
      deleteDirectorate,
      portals,
      refreshPortals,
      addPortal,
      updatePortal,
      deletePortal,
      trainings,
      refreshTrainings,
      addTraining,
      updateTraining,
      deleteTraining,
      completeTraining,
    }}>
      {children}
    </AppContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
