import { useState, useEffect, useMemo } from 'react';
import { PremiumCard, SectionHeader, RoundedButton } from '@/components/ui/PremiumComponents';
import { Calendar as CalendarIcon, MapPin, Clock, CheckCircle2, Trash2, Edit2, Plus, ArrowLeft, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { FAB } from '@/components/Layout';
import { Modal } from '@/components/ui/Modal';
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp, Appointment } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/useAuthorization';
import { ClientHierarchyTags } from '@/components/ui/ClientHierarchyTags';

export default function Schedule() {
  const location = useLocation();
  const navigate = useNavigate();
  const { appointments, addAppointment, updateAppointment, deleteAppointment, loading, allProfiles, teams, directorates } = useApp();
  const { isManager, canViewAllClients } = useAuthorization();

  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [monthCursor, setMonthCursor] = useState<Date>(startOfMonth(today));
  const [isMonthExpanded, setIsMonthExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'day' | 'all' | 'single'>('day');
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Appointment>>({
    title: '', client_name: '', time: '09:00', location: '', type: 'Visita',
    date: format(today, 'yyyy-MM-dd'), completed: false
  });

  useEffect(() => {
    if (location.state) {
      if (location.state.showAll) setViewMode('all');
      else if (location.state.highlightId) {
        setViewMode('single');
        setHighlightId(String(location.state.highlightId));
      }
      else if (location.state.date) {
        setSelectedDate(parseISO(String(location.state.date)));
        setViewMode('day');
        setHighlightId(null);
      }
    }
  }, [location.state]);

  useEffect(() => {
    setMonthCursor(startOfMonth(selectedDate));
  }, [selectedDate]);

  const startDate = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const calendarDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));
  const monthGridDays = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [monthCursor]);

  const appointmentsByDate = useMemo(() => {
    return appointments.reduce<Record<string, number>>((acc, apt) => {
      const date = apt.date;
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});
  }, [appointments]);

  const filteredAppointments = appointments.filter(apt => {
    if (viewMode === 'all') return true;
    if (viewMode === 'single') return apt.id === highlightId;
    return apt.date === format(selectedDate, 'yyyy-MM-dd');
  });

  const handleOpenModal = (appointment?: Appointment) => {
    if (appointment) {
      setEditingAppointment(appointment);
      setFormData({ ...appointment });
    } else {
      setEditingAppointment(null);
      setFormData({ title: '', client_name: '', time: '09:00', location: '', type: 'Visita', date: format(selectedDate, 'yyyy-MM-dd'), completed: false });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.date || !formData.time) return;
    setIsSaving(true);
    try {
      if (editingAppointment) {
        await updateAppointment(editingAppointment.id, formData);
      } else {
        await addAppointment(formData as Omit<Appointment, 'id' | 'created_at'>);
      }
      setIsModalOpen(false);
      setSelectedDate(parseISO(formData.date));
      // Pequeno timeout para garantir que o usuário veja a mudança de aba antes do alert
      setTimeout(() => alert(editingAppointment ? 'Agendamento atualizado!' : 'Agendamento criado com sucesso!'), 100);
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message || 'Erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este agendamento?')) {
      try {
        await deleteAppointment(id);
        if (viewMode === 'single') { setViewMode('day'); setHighlightId(null); }
      } catch (e: any) {
        alert(`Erro ao excluir agendamento:\n${e?.message || 'Tente novamente.'}`);
      }
    }
  };

  const toggleComplete = async (apt: Appointment) => {
    await updateAppointment(apt.id, { completed: !apt.completed });
  };

  const resetView = () => {
    setViewMode('day'); setHighlightId(null);
    navigate(location.pathname, { replace: true, state: {} });
  };

  return (
    <div className="p-6 pb-24 min-h-screen bg-surface-50">
      <div className="flex items-center gap-2 mb-4">
        {viewMode !== 'day' && (
          <button onClick={resetView} className="p-2 rounded-full hover:bg-surface-100">
            <ArrowLeft size={20} className="text-text-secondary" />
          </button>
        )}
        <div className="flex-1">
          <SectionHeader
            title={viewMode === 'all' ? 'Todos os Agendamentos' : viewMode === 'single' ? 'Detalhes do Agendamento' : 'Agenda'}
            subtitle={viewMode === 'day' ? 'Seus compromissos' : ''}
          />
        </div>
        {viewMode === 'day' && (
          <RoundedButton size="sm" onClick={() => handleOpenModal()} className="flex items-center gap-1">
            <Plus size={16} /> Novo
          </RoundedButton>
        )}
      </div>

      {viewMode === 'day' && (
        <div className="mb-8 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Semana</p>
            <button
              type="button"
              onClick={() => setIsMonthExpanded(prev => !prev)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              {isMonthExpanded ? 'Ver menos' : 'Ver mais'}
            </button>
          </div>

          <div className="flex justify-between overflow-x-auto no-scrollbar pb-2 gap-2">
            {calendarDays.map((date) => {
              const isSelected = isSameDay(date, selectedDate);
              const isToday = isSameDay(date, today);
              const dateStr = format(date, 'yyyy-MM-dd');
              const hasAppt = Boolean(appointmentsByDate[dateStr]);

              return (
                <button
                  key={date.toString()}
                  onClick={() => setSelectedDate(date)}
                  className={`flex flex-col items-center justify-center min-w-[3rem] h-16 rounded-2xl transition-all ${isSelected ? 'bg-gold-400 text-white shadow-lg shadow-gold-400/30 scale-105'
                    : 'bg-card-bg text-text-secondary border border-surface-200'
                    }`}
                >
                  <span className="text-[10px] font-medium uppercase">{format(date, 'EEE', { locale: ptBR })}</span>
                  <span className="text-lg font-bold">{format(date, 'd')}</span>
                  <div className="flex gap-1 mt-1 h-1 items-center justify-center">
                    {isToday && !isSelected && <div className="w-1 h-1 bg-gold-400 rounded-full" />}
                    {hasAppt && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />}
                  </div>
                </button>
              );
            })}
          </div>

          {isMonthExpanded && (
            <PremiumCard className="p-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => setMonthCursor(prev => addDays(startOfMonth(prev), -1))}
                  className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-100 transition-colors"
                  title="Mês anterior"
                >
                  <ChevronLeft size={16} />
                </button>
                <h4 className="text-sm font-bold text-text-primary capitalize">
                  {format(monthCursor, 'MMMM yyyy', { locale: ptBR })}
                </h4>
                <button
                  type="button"
                  onClick={() => setMonthCursor(prev => addDays(endOfMonth(prev), 1))}
                  className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-100 transition-colors"
                  title="Próximo mês"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(day => (
                  <div key={day} className="text-[10px] font-semibold text-text-secondary text-center uppercase">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {monthGridDays.map((date) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const isSelected = isSameDay(date, selectedDate);
                  const isToday = isSameDay(date, today);
                  const inCurrentMonth = isSameMonth(date, monthCursor);
                  const apptCount = appointmentsByDate[dateStr] || 0;

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={`h-10 rounded-lg text-xs font-semibold transition-all relative ${isSelected
                        ? 'bg-gold-400 text-white shadow-gold-400/20 shadow-sm'
                        : inCurrentMonth
                        ? 'bg-surface-50 text-text-primary hover:bg-surface-100'
                        : 'bg-surface-50/40 text-text-secondary/50 hover:bg-surface-100/80'
                        } ${isToday && !isSelected ? 'ring-1 ring-gold-300' : ''}`}
                    >
                      {format(date, 'd')}
                      {apptCount > 0 && (
                        <span className={`absolute bottom-0.5 right-0.5 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] leading-[14px] font-bold ${isSelected ? 'bg-white/90 text-gold-700' : 'bg-blue-100 text-blue-700'}`}>
                          {apptCount > 9 ? '9+' : apptCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </PremiumCard>
          )}
        </div>
      )}

      <div className="space-y-6">
        <div>
          {viewMode === 'day' && (
            <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider flex justify-between items-center">
              {isSameDay(selectedDate, today) ? 'Hoje' : format(selectedDate, "EEEE", { locale: ptBR })}
              <span className="text-text-secondary/70 font-normal">{format(selectedDate, "d 'de' MMMM", { locale: ptBR })}</span>
            </h3>
          )}

          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-gold-400" /></div>
            ) : filteredAppointments.length === 0 ? (
              <div className="text-center py-10 text-text-secondary">
                <p>Nenhum agendamento encontrado.</p>
                {viewMode === 'day' && (
                  <RoundedButton variant="outline" size="sm" className="mt-4 mx-auto" onClick={() => handleOpenModal()}>
                    Agendar Compromisso
                  </RoundedButton>
                )}
              </div>
            ) : (
              filteredAppointments.map((event) => (
                <PremiumCard key={event.id} className={`flex gap-4 p-4 transition-all ${event.completed ? 'opacity-60 bg-surface-50' : ''}`}>
                  <div className="flex flex-col items-center pt-1">
                    <span className={`text-sm font-bold ${event.completed ? 'text-text-secondary' : 'text-text-primary'}`}>{event.time}</span>
                    <div className={`h-full w-0.5 mt-2 rounded-full ${event.completed ? 'bg-surface-200' : 'bg-gold-200'}`}></div>
                  </div>
                  <div className="flex-1 pb-2 min-w-0">
                    {/* Tags hierárquicas — visíveis para liderança */}
                    {canViewAllClients && (
                      <ClientHierarchyTags
                        ownerId={event.user_id}
                        allProfiles={allProfiles}
                        teams={teams}
                        directorates={directorates}
                        className="mb-1"
                      />
                    )}
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className={`font-bold truncate ${event.completed ? 'text-text-secondary line-through' : 'text-text-primary'}`}>{event.title}</h4>
                        <p className="text-sm text-gold-600 dark:text-gold-400 font-medium mb-1 truncate">{event.client_name}</p>
                      </div>
                      <button
                        onClick={() => toggleComplete(event)}
                        className={`p-1 rounded-full transition-colors ${event.completed ? 'text-green-500 bg-green-50 dark:bg-green-900/20' : 'text-surface-300 hover:text-gold-500'}`}
                      >
                        <CheckCircle2 size={20} fill={event.completed ? "currentColor" : "none"} />
                      </button>
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-1 text-xs text-text-secondary mt-2">
                        <MapPin size={12} /> {event.location}
                      </div>
                    )}
                    {viewMode === 'all' && (
                      <div className="flex items-center gap-1 text-xs text-text-secondary mt-1">
                        <CalendarIcon size={12} /> {format(parseISO(event.date), "d 'de' MMMM", { locale: ptBR })}
                      </div>
                    )}
                    <div className="flex gap-3 mt-3 pt-3 border-t border-surface-100">
                      <button onClick={() => handleOpenModal(event)} className="text-xs font-medium text-text-secondary hover:text-gold-600 flex items-center gap-1">
                        <Edit2 size={12} /> Editar
                      </button>
                      <button onClick={() => handleDelete(event.id)} className="text-xs font-medium text-text-secondary hover:text-red-500 flex items-center gap-1">
                        <Trash2 size={12} /> Excluir
                      </button>
                    </div>
                  </div>
                </PremiumCard>
              ))
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingAppointment ? 'Editar Agendamento' : 'Novo Agendamento'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Título</label>
            <input value={formData.title || ''} onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" placeholder="Ex: Visita ao Decorado" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Cliente</label>
            <input value={formData.client_name || ''} onChange={(e) => setFormData(p => ({ ...p, client_name: e.target.value }))}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" placeholder="Nome do cliente" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Data</label>
              <input type="date" value={formData.date || ''} onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Hora</label>
              <input type="time" value={formData.time || ''} onChange={(e) => setFormData(p => ({ ...p, time: e.target.value }))}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Local</label>
            <input value={formData.location || ''} onChange={(e) => setFormData(p => ({ ...p, location: e.target.value }))}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" placeholder="Endereço ou local" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Tipo</label>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {(['Visita', 'Reunião', 'Assinatura', 'Outro'] as const).map(type => (
                <button key={type} onClick={() => setFormData(p => ({ ...p, type }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${formData.type === type ? 'bg-gold-50 border-gold-400 text-gold-700 dark:bg-gold-900/20 dark:text-gold-400' : 'bg-surface-50 border-surface-200 text-text-secondary'}`}>
                  {type}
                </button>
              ))}
            </div>
          </div>
          <RoundedButton fullWidth onClick={handleSave} disabled={isSaving} className="mt-4">
            {isSaving ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : editingAppointment ? 'Salvar Alterações' : 'Criar Agendamento'}
          </RoundedButton>
        </div>
      </Modal>
    </div>
  );
}
