import { PremiumCard, SectionHeader } from '@/components/ui/PremiumComponents';
import { Loader2, Users, TrendingUp, Target, Calendar, Building2 } from 'lucide-react';
import { FunnelChart } from '@/components/ui/FunnelChart';
import { useNavigate } from 'react-router-dom';

import { AnnouncementCard } from '@/components/admin/AnnouncementCard';
import { useApp, Goal } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/useAuthorization';
import { NotificationBell } from '@/components/ui/NotificationBell';

export default function Dashboard() {
  const navigate = useNavigate();
  const { clients, appointments, goals, announcements, userName, loading, directorates, allProfiles, profile, user } = useApp();
  const { isAdmin, isDirector, isManager, isCoordinator, isBroker, directorateId, role } = useAuthorization();

  // Active announcements from the real database
  const today = new Date().toISOString().slice(0, 10);
  const activeAnnouncements = announcements.filter(a => {
    if (!a.start_date || !a.end_date) return true;
    return a.start_date <= today && a.end_date >= today;
  });

  // ── Data is already scoped by RLS on the backend ──────────────────────────
  const scopedClients = clients;

  const totalSales = scopedClients.filter(c => c.stage === 'Concluído').length;
  const emAnalise = scopedClients.filter(c => c.stage === 'Em Análise').length;
  const aprovados = scopedClients.filter(c => c.stage === 'Aprovado').length;
  const totalClients = scopedClients.length;

  // Upcoming appointments for this user's scope
  const upcomingAppointments = appointments.slice(0, 3);

  // Role label for header
  const roleLabel: Record<string, string> = {
    ADMIN: '🔑 Administrador',
    DIRETOR: '🏢 Diretor',
    GERENTE: '👥 Gerente',
    COORDENADOR: '📋 Coordenador',
    CORRETOR: '🏠 Corretor',
  };

  // Ranking Mock for Corretor (In a real scenario, fetch total_sales from backend)
  const topCorretores = [...allProfiles]
    .filter(p => p.role === 'CORRETOR' || p.role === 'Corretor' || p.role === 'corretor')
    .slice(0, 3);

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center pt-2">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            Olá, {userName.split(' ')[0]}
            {loading && <Loader2 className="animate-spin text-gold-500" size={18} />}
          </h1>
          <p className="text-text-secondary text-sm">{roleLabel[role] ?? 'Visão geral'}</p>
        </div>
        <div className="z-50 relative">
          <NotificationBell />
        </div>
      </div>

      {/* Announcements */}
      {activeAnnouncements.length > 0 && (
        <section className="space-y-3">
          {activeAnnouncements.map(a => <AnnouncementCard key={a.id} announcement={a} />)}
        </section>
      )}

      {/* ── ADMIN: Global Metrics ──────────────────────────────────────────── */}
      {isAdmin && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <PremiumCard highlight className="col-span-2 flex justify-between items-center cursor-pointer"
              onClick={() => navigate('/reports')}>
              <div>
                <p className="text-sm text-gold-700 dark:text-gold-400 font-medium uppercase tracking-wider">Vendas Globais Concluídas</p>
                <h3 className="text-3xl font-bold text-text-primary mt-1">{totalSales}</h3>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">{totalClients} clientes totais</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-gold-100 dark:bg-gold-900/40 flex items-center justify-center text-gold-600 font-bold text-xl">{totalSales}</div>
            </PremiumCard>
            <PremiumCard className="cursor-pointer" onClick={() => navigate('/clients', { state: { initialStage: 'Em Análise' } })}>
              <p className="text-xs text-text-secondary uppercase">Em Análise</p>
              <h3 className="text-2xl font-bold text-text-primary mt-2">{String(emAnalise).padStart(2, '0')}</h3>
            </PremiumCard>
            <PremiumCard className="cursor-pointer" onClick={() => navigate('/clients', { state: { initialStage: 'Aprovado' } })}>
              <p className="text-xs text-text-secondary uppercase">Aprovados</p>
              <h3 className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">{String(aprovados).padStart(2, '0')}</h3>
            </PremiumCard>
          </div>
          {/* Directorates overview */}
          {directorates.length > 0 && (
            <section>
              <SectionHeader title="Visão por Diretoria" />
              <div className="space-y-2">
                {directorates.map(d => {
                  const dClients = clients.filter(c => (c as any).directorate_id === d.id);
                  const dSales = dClients.filter(c => c.stage === 'Concluído').length;
                  return (
                    <PremiumCard
                      key={d.id}
                      className="flex items-center justify-between cursor-pointer hover:border-gold-400 hover:shadow-md transition-all"
                      onClick={() => navigate(`/reports?scope=diretoria&id=${d.id}&name=${encodeURIComponent(d.name)}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center">
                          <Building2 size={16} className="text-gold-600 dark:text-gold-400" />
                        </div>
                        <div>
                          <span className="font-medium text-text-primary text-sm">{d.name}</span>
                          <p className="text-[10px] text-text-secondary">Ver relatório →</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-text-secondary">{dClients.length} clientes</p>
                        <p className="text-xs text-green-600 font-medium">{dSales} vendas</p>
                      </div>
                    </PremiumCard>
                  );
                })}
              </div>
            </section>
          )}
          <section><FunnelChart /></section>
        </>
      )}

      {/* ── DIRETOR: Diretoria Metrics ─────────────────────────────────────── */}
      {isDirector && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <PremiumCard highlight className="col-span-2 flex justify-between items-center cursor-pointer"
              onClick={() => navigate('/reports')}>
              <div>
                <p className="text-sm text-gold-700 dark:text-gold-400 font-medium uppercase tracking-wider">Vendas da Diretoria</p>
                <h3 className="text-3xl font-bold text-text-primary mt-1">{totalSales}</h3>
                <p className="text-xs text-green-600 mt-1 font-medium">{totalClients} clientes</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-gold-100 dark:bg-gold-900/40 flex items-center justify-center text-gold-600 font-bold text-xl">{totalSales}</div>
            </PremiumCard>
            <PremiumCard>
              <p className="text-xs text-text-secondary uppercase">Em Análise</p>
              <h3 className="text-2xl font-bold text-text-primary mt-2">{String(emAnalise).padStart(2, '0')}</h3>
            </PremiumCard>
            <PremiumCard>
              <p className="text-xs text-text-secondary uppercase">Aprovados</p>
              <h3 className="text-2xl font-bold text-green-600 mt-2">{String(aprovados).padStart(2, '0')}</h3>
            </PremiumCard>
          </div>
          <section><FunnelChart /></section>
        </>
      )}

      {/* ── CORRETOR: Personal Metrics ─────────────────────────────────────── */}
      {isBroker && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <PremiumCard highlight className="col-span-2 flex justify-between items-center cursor-pointer"
              onClick={() => navigate('/clients', { state: { initialStage: 'Concluído' } })}>
              <div>
                <p className="text-sm text-gold-700 dark:text-gold-400 font-medium uppercase tracking-wider">Vendas Concluídas</p>
                <h3 className="text-3xl font-bold text-text-primary mt-1">{totalSales}</h3>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">{totalClients} clientes totais</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-gold-100 dark:bg-gold-900/40 flex items-center justify-center text-gold-600 font-bold text-xl">{totalSales}</div>
            </PremiumCard>
            <PremiumCard className="cursor-pointer" onClick={() => navigate('/clients', { state: { initialStage: 'Em Análise' } })}>
              <p className="text-xs text-text-secondary uppercase">Em Análise</p>
              <h3 className="text-2xl font-bold text-text-primary mt-2">{String(emAnalise).padStart(2, '0')}</h3>
            </PremiumCard>
            <PremiumCard className="cursor-pointer" onClick={() => navigate('/clients', { state: { initialStage: 'Aprovado' } })}>
              <p className="text-xs text-text-secondary uppercase">Aprovados</p>
              <h3 className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">{String(aprovados).padStart(2, '0')}</h3>
            </PremiumCard>
          </div>

          <section className="mt-8"><FunnelChart /></section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            {/* Weekly Appointments */}
            <section>
              <SectionHeader
                title="Agendamentos da Semana"
                subtitle="Todos os seus compromissos"
                action={
                  <button onClick={() => navigate('/schedule')} className="text-xs text-gold-600 dark:text-gold-400 font-medium hover:underline">
                    Ver todos
                  </button>
                }
              />
              <div className="space-y-3">
                {appointments.length === 0 ? (
                  <PremiumCard className="text-center py-6">
                    <Calendar className="mx-auto mb-2 text-surface-300 dark:text-surface-700" size={32} />
                    <p className="text-text-secondary text-sm">Sua agenda está livre na semana.</p>
                  </PremiumCard>
                ) : (
                  appointments.slice(0, 5).map((app) => (
                    <PremiumCard key={app.id} className="cursor-pointer hover:bg-surface-50 transition-colors"
                      onClick={() => navigate('/schedule')}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className="flex-col flex items-center justify-center w-12 h-12 bg-surface-100 dark:bg-surface-800 rounded-xl text-center">
                            <span className="text-xs font-bold text-text-primary">{app.time}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-text-primary">{app.title}</p>
                            <p className="text-xs text-text-secondary mt-1">{app.date} • {app.type}</p>
                            {app.client_name && <p className="text-xs text-gold-600 font-medium mt-1">{app.client_name}</p>}
                          </div>
                        </div>
                      </div>
                    </PremiumCard>
                  ))
                )}
              </div>
            </section>

            {/* Metas and Missions */}
            <section className="space-y-6">
              {(() => {
                const corretorGoals = goals.filter(g => !g.assignee_id || g.assignee_id === user?.id || g.assignee_type === 'All');
                const metas = corretorGoals.filter(g => g.type !== 'Missão');
                const missoes = corretorGoals.filter(g => g.type === 'Missão');

                if (corretorGoals.length === 0) {
                  return (
                    <div>
                      <SectionHeader title="Metas e Missões" subtitle="Objetivos pessoais" />
                      <PremiumCard className="text-center py-6">
                        <Target className="mx-auto mb-2 text-surface-300 dark:text-surface-700" size={32} />
                        <p className="text-text-secondary text-sm">Nenhuma meta ativa atribuída.</p>
                      </PremiumCard>
                    </div>
                  );
                }

                return (
                  <>
                    {metas.length > 0 && (
                      <div>
                        <SectionHeader title="Metas" subtitle="Seus objetivos" />
                        <div className="space-y-3">
                          {metas.slice(0, 3).map((goal) => {
                            const pct = Math.min(100, Math.round(((goal.current_progress || 0) / (goal.target || 1)) * 100));
                            return (
                              <PremiumCard key={goal.id}>
                                <div className="flex justify-between items-center mb-2">
                                  <span className="font-semibold text-text-primary text-sm line-clamp-1">{goal.title}</span>
                                </div>
                                <div className="h-1.5 w-full bg-surface-200 rounded-full overflow-hidden mb-1">
                                  <div className={`h-full rounded-full transition-all duration-1000 ${pct >= 100 ? 'bg-green-500' : 'bg-gold-400'}`} style={{ width: `${pct}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] text-text-secondary font-medium tracking-wide">
                                  <span>PROGRESSO</span>
                                  <span>{goal.current_progress || 0} DE {goal.target}</span>
                                </div>
                              </PremiumCard>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {missoes.length > 0 && (
                      <div>
                        <SectionHeader title="Missões" subtitle="Conquiste pontos" />
                        <div className="space-y-3">
                          {missoes.slice(0, 3).map((goal) => {
                            const pct = Math.min(100, Math.round(((goal.current_progress || 0) / (goal.target || 1)) * 100));
                            return (
                              <PremiumCard key={goal.id}>
                                <div className="flex justify-between items-center mb-2">
                                  <span className="font-semibold text-text-primary text-sm line-clamp-1">{goal.title}</span>
                                  <span className="text-xs font-bold text-gold-600 ml-2 whitespace-nowrap px-2 py-0.5 bg-gold-50 rounded-full">{goal.points} pts</span>
                                </div>
                                <div className="h-1.5 w-full bg-surface-200 rounded-full overflow-hidden mb-1">
                                  <div className={`h-full rounded-full transition-all duration-1000 ${pct >= 100 ? 'bg-green-500' : 'bg-gold-400'}`} style={{ width: `${pct}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] text-text-secondary font-medium tracking-wide">
                                  <span>PROGRESSO</span>
                                  <span>{goal.current_progress || 0} DE {goal.target}</span>
                                </div>
                              </PremiumCard>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </section>
          </div>
        </>
      )}

      {/* ── GERENTE / COORDENADOR: Team Metrics ───────────────────────────── */}
      {(isManager || isCoordinator) && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <PremiumCard className="flex flex-col items-center gap-1">
              <Users size={22} className="text-gold-500" />
              <h3 className="text-2xl font-bold text-text-primary">{totalClients}</h3>
              <p className="text-xs text-text-secondary">Clientes da Equipe</p>
            </PremiumCard>
            <PremiumCard className="flex flex-col items-center gap-1">
              <TrendingUp size={22} className="text-green-500" />
              <h3 className="text-2xl font-bold text-text-primary">{totalSales}</h3>
              <p className="text-xs text-text-secondary">Vendas Concluídas</p>
            </PremiumCard>
            <PremiumCard className="flex flex-col items-center gap-1">
              <Target size={22} className="text-blue-500" />
              <h3 className="text-2xl font-bold text-text-primary">{emAnalise}</h3>
              <p className="text-xs text-text-secondary">Em Análise</p>
            </PremiumCard>
            <PremiumCard className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => navigate('/schedule')}>
              <Calendar size={22} className="text-purple-500" />
              <h3 className="text-2xl font-bold text-text-primary">{upcomingAppointments.length}</h3>
              <p className="text-xs text-text-secondary">Agendamentos</p>
            </PremiumCard>
          </div>
          <section><FunnelChart /></section>

          {/* Metas and Missions for the team */}
          {goals.length > 0 ? (
            <section className="space-y-6">
              {(() => {
                const teamMetas = goals.filter(g => g.type !== 'Missão');
                const teamMissoes = goals.filter(g => g.type === 'Missão');
                const formatGoalVal = (g: Goal, val: number) =>
                  g.measure_type === 'quantity'
                    ? val.toString()
                    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

                return (
                  <>
                    {teamMetas.length > 0 && (
                      <div>
                        <SectionHeader title="Metas da Equipe" subtitle="Acompanhe o progresso das metas" />
                        <div className="space-y-3">
                          {teamMetas.slice(0, 5).map((goal) => {
                            const pct = Math.min(100, Math.round(((goal.current_progress || 0) / (goal.target || 1)) * 100));
                            return (
                              <PremiumCard key={goal.id}>
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-semibold text-text-primary text-sm">{goal.title}</span>
                                    {goal.description && <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-1">{goal.description}</p>}
                                  </div>
                                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pct >= 100 ? 'bg-green-100 text-green-700' : pct >= 60 ? 'bg-blue-100 text-blue-700' : 'bg-surface-100 text-text-secondary'}`}>{pct}%</span>
                                  </div>
                                </div>
                                <div className="h-2 w-full bg-surface-200 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? 'bg-green-500' : 'bg-gold-400'}`} style={{ width: `${pct}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] text-text-secondary mt-1">
                                  <span>Progresso: {formatGoalVal(goal, goal.current_progress || 0)} de {formatGoalVal(goal, goal.target || 0)}</span>
                                  {goal.deadline && <span>Até {new Date(goal.deadline).toLocaleDateString('pt-BR')}</span>}
                                </div>
                              </PremiumCard>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {teamMissoes.length > 0 && (
                      <div>
                        <SectionHeader title="Missões da Equipe" subtitle="Acompanhe as missões globais" />
                        <div className="space-y-3">
                          {teamMissoes.slice(0, 5).map((goal) => {
                            const pct = Math.min(100, Math.round(((goal.current_progress || 0) / (goal.target || 1)) * 100));
                            return (
                              <PremiumCard key={goal.id}>
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-semibold text-text-primary text-sm">{goal.title}</span>
                                    {goal.description && <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-1">{goal.description}</p>}
                                  </div>
                                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                    {goal.points != null && <span className="text-xs font-bold text-gold-600 px-2 py-0.5 bg-gold-50 rounded-full">{goal.points} pts</span>}
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pct >= 100 ? 'bg-green-100 text-green-700' : pct >= 60 ? 'bg-blue-100 text-blue-700' : 'bg-surface-100 text-text-secondary'}`}>{pct}%</span>
                                  </div>
                                </div>
                                <div className="h-2 w-full bg-surface-200 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? 'bg-green-500' : 'bg-gold-400'}`} style={{ width: `${pct}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] text-text-secondary mt-1">
                                  <span>Progresso: {formatGoalVal(goal, goal.current_progress || 0)} de {formatGoalVal(goal, goal.target || 0)}</span>
                                  {goal.deadline && <span>Até {new Date(goal.deadline).toLocaleDateString('pt-BR')}</span>}
                                </div>
                              </PremiumCard>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </section>
          ) : (
            <section>
              <SectionHeader title="Metas e Missões da Equipe" />
              <PremiumCard className="text-center py-6">
                <Target className="mx-auto mb-2 text-surface-300" size={28} />
                <p className="text-text-secondary text-sm">Nenhuma meta ativa no momento.</p>
              </PremiumCard>
            </section>
          )}
        </>
      )}



      {/* Upcoming Schedule — visible to non-broker roles */}
      {!isBroker && upcomingAppointments.length > 0 && (
        <section>
          <SectionHeader
            title="Próximos Agendamentos"
            action={
              <button onClick={() => navigate('/schedule')} className="text-xs text-gold-600 dark:text-gold-400 font-medium hover:underline">
                Ver todos
              </button>
            }
          />
          <div className="space-y-3">
            {upcomingAppointments.map(item => (
              <PremiumCard key={item.id} className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => navigate('/schedule')}>
                <div className="flex-col flex items-center justify-center w-12 h-12 bg-surface-100 rounded-xl text-center">
                  <span className="text-xs font-bold text-text-secondary">{item.time}</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-text-primary">{item.title}</h4>
                  <p className="text-xs text-text-secondary">{item.type} {item.client_name ? `• ${item.client_name}` : ''}</p>
                </div>
                <div className="w-1 h-8 rounded-full bg-gold-400" />
              </PremiumCard>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
