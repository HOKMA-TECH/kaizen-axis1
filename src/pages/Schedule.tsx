import { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar as CalendarIcon, MapPin, Plus, Loader2, ChevronLeft, ChevronRight, ChevronDown, Filter } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import {
  format, addDays, startOfWeek, isSameDay, parseISO,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp, Appointment } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/useAuthorization';
import { ClientHierarchyTags } from '@/components/ui/ClientHierarchyTags';

// ─── Constants ────────────────────────────────────────────────────────────────

type TypeFilter = 'Todos' | 'Visita' | 'Reunião' | 'Assinatura' | 'Outro';

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7:00 → 19:00
const DAY_ABBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const TYPE_PILL: Record<string, string> = {
  Visita:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Reunião:    'bg-blue-50    text-blue-700    border border-blue-200',
  Assinatura: 'bg-violet-50  text-violet-700  border border-violet-200',
  Outro:      'bg-amber-50   text-amber-700   border border-amber-200',
};

const TYPE_BLOCK: Record<string, string> = {
  Visita:     'bg-emerald-100 text-emerald-800 border-l-2 border-emerald-400',
  Reunião:    'bg-blue-100    text-blue-800    border-l-2 border-blue-400',
  Assinatura: 'bg-violet-100  text-violet-800  border-l-2 border-violet-400',
  Outro:      'bg-amber-100   text-amber-800   border-l-2 border-amber-400',
};

// ─── Schedule Page ────────────────────────────────────────────────────────────

export default function Schedule() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { appointments, addAppointment, updateAppointment, deleteAppointment, loading, allProfiles, teams, directorates } = useApp();
  const { canViewAllClients } = useAuthorization();

  const today = new Date();

  const [selectedDate, setSelectedDate]   = useState<Date>(today);
  const [weekStart,    setWeekStart]      = useState<Date>(() => startOfWeek(today, { weekStartsOn: 0 }));
  const [typeFilter,   setTypeFilter]     = useState<TypeFilter>('Todos');
  const [filterOpen,   setFilterOpen]     = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const mobileFilterRef = useRef<HTMLDivElement>(null);

  const [isModalOpen,        setIsModalOpen]        = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [isSaving,           setIsSaving]           = useState(false);
  const [formData, setFormData] = useState<Partial<Appointment>>({
    title: '', client_name: '', time: '09:00', location: '', type: 'Visita',
    date: format(today, 'yyyy-MM-dd'), completed: false,
  });

  // ── Week days ──────────────────────────────────────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const prevWeek  = () => setWeekStart(d => addDays(d, -7));
  const nextWeek  = () => setWeekStart(d => addDays(d,  7));
  const goToToday = () => { setWeekStart(startOfWeek(today, { weekStartsOn: 0 })); setSelectedDate(today); };

  // ── Month label for the week ───────────────────────────────────────────────
  const monthLabel = (() => {
    const s = format(weekStart,              'MMMM yyyy', { locale: ptBR });
    const e = format(addDays(weekStart, 6),  'MMMM yyyy', { locale: ptBR });
    return s === e ? s : `${format(weekStart, 'MMM', { locale: ptBR })} / ${e}`;
  })();

  // ── Appointments indexed by date ───────────────────────────────────────────
  const byDate = useMemo(() =>
    appointments.reduce<Record<string, Appointment[]>>((acc, apt) => {
      (acc[apt.date] ??= []).push(apt); return acc;
    }, {}),
  [appointments]);

  // ── Events for selected day (type-filtered) ────────────────────────────────
  const selectedDayEvents = useMemo(() =>
    (byDate[format(selectedDate, 'yyyy-MM-dd')] ?? [])
      .filter(a => typeFilter === 'Todos' || a.type === typeFilter)
      .sort((a, b) => a.time.localeCompare(b.time)),
  [byDate, selectedDate, typeFilter]);

  // ── Upcoming events feed (sorted, not completed) ───────────────────────────
  const upcomingEvents = useMemo(() => {
    const todayStr = format(today, 'yyyy-MM-dd');
    return appointments
      .filter(a => a.date >= todayStr && !a.completed)
      .sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time))
      .slice(0, 12);
  }, [appointments]);

  // ── Events per day/hour for grid ───────────────────────────────────────────
  const getCell = (day: Date, hour: number) =>
    (byDate[format(day, 'yyyy-MM-dd')] ?? []).filter(a => {
      const [h] = a.time.split(':').map(Number);
      return h === hour;
    });

  // ── Location state navigation ──────────────────────────────────────────────
  useEffect(() => {
    if (location.state?.date) {
      const d = parseISO(String(location.state.date));
      setSelectedDate(d);
      setWeekStart(startOfWeek(d, { weekStartsOn: 0 }));
    }
    navigate(location.pathname, { replace: true, state: {} });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Close filter dropdown on outside click ────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const inDesktop = filterRef.current?.contains(e.target as Node);
      const inMobile  = mobileFilterRef.current?.contains(e.target as Node);
      if (!inDesktop && !inMobile) setFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  const handleOpenModal = (appointment?: Appointment, prefillDate?: string, prefillTime?: string) => {
    if (appointment) {
      setEditingAppointment(appointment);
      setFormData({ ...appointment });
    } else {
      setEditingAppointment(null);
      setFormData({
        title: '', client_name: '', time: prefillTime ?? '09:00', location: '', type: 'Visita',
        date: prefillDate ?? format(selectedDate, 'yyyy-MM-dd'), completed: false,
      });
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
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message ?? 'Erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) return;
    try {
      await deleteAppointment(id);
    } catch (e: any) {
      alert(`Erro ao excluir: ${e?.message ?? 'Tente novamente.'}`);
    }
  };

  const toggleComplete = (apt: Appointment) => updateAppointment(apt.id, { completed: !apt.completed });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="-mx-2 sm:-mx-4 lg:-mx-6 flex flex-col bg-white"
         style={{ height: 'calc(100vh - 3.5rem)' }}>

      {/* ══════════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on md+)
          ══════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden">

        {/* Mobile header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-900">Agenda</h1>
          <div className="flex items-center gap-2">
            {/* Type filter icon */}
            <div className="relative" ref={mobileFilterRef}>
              <button
                onClick={() => setFilterOpen(o => !o)}
                className={`p-2 rounded-xl border transition-colors ${
                  typeFilter !== 'Todos'
                    ? 'border-blue-400 bg-blue-50 text-blue-600'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Filter size={16} />
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                  {(['Todos', 'Visita', 'Reunião', 'Assinatura', 'Outro'] as TypeFilter[]).map(t => (
                    <button
                      key={t}
                      onClick={() => { setTypeFilter(t); setFilterOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                        typeFilter === t ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-gray-700'
                      }`}
                    >
                      {t === 'Todos' ? 'Todos os tipos' : t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* New event */}
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus size={14} /> Novo
            </button>
          </div>
        </div>

        {/* Week nav + selected date label */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
          <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="flex-1 text-center text-sm font-bold text-gray-800 capitalize">
            {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </span>
          <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Events for selected day */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={26} className="animate-spin text-blue-500" />
            </div>
          ) : selectedDayEvents.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center gap-3">
              <CalendarIcon size={36} className="text-gray-200" />
              <p className="text-sm text-gray-400 font-medium">Nenhum evento para este dia</p>
              <button
                onClick={() => handleOpenModal()}
                className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                <Plus size={13} /> Novo Evento
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDayEvents.map(evt => (
                <div
                  key={evt.id}
                  className={`p-3 rounded-2xl border-l-4 bg-white shadow-sm ${
                    evt.type === 'Visita'     ? 'border-l-emerald-400' :
                    evt.type === 'Reunião'    ? 'border-l-blue-400'    :
                    evt.type === 'Assinatura' ? 'border-l-violet-400'  :
                                               'border-l-amber-400'
                  } ${evt.completed ? 'opacity-50' : ''}`}
                >
                  {canViewAllClients && (
                    <ClientHierarchyTags
                      ownerId={evt.user_id}
                      allProfiles={allProfiles}
                      teams={teams}
                      directorates={directorates}
                      className="mb-1.5"
                    />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`text-sm font-bold ${evt.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {evt.title}
                      </p>
                      {evt.client_name && (
                        <p className="text-xs text-gray-500 mt-0.5">{evt.client_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-gray-400">{evt.time}</span>
                        {evt.location && (
                          <span className="text-xs text-gray-400 flex items-center gap-0.5">
                            <MapPin size={10} />{evt.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 ${TYPE_PILL[evt.type] ?? ''}`}>
                      {evt.type}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-2.5 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => handleOpenModal(evt)}
                      className="text-xs text-gray-500 hover:text-blue-600 font-semibold transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleComplete(evt)}
                      className="text-xs text-gray-500 hover:text-emerald-600 font-semibold transition-colors"
                    >
                      {evt.completed ? 'Reabrir' : 'Concluir'}
                    </button>
                    <button
                      onClick={() => handleDelete(evt.id)}
                      className="text-xs text-gray-500 hover:text-red-500 font-semibold transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 7-day strip at bottom */}
        <div className="border-t border-gray-100 bg-white px-2 py-2.5 flex-shrink-0">
          <div className="flex justify-between">
            {weekDays.map((day, i) => {
              const dateStr    = format(day, 'yyyy-MM-dd');
              const hasEvents  = (byDate[dateStr] ?? []).some(
                a => typeFilter === 'Todos' || a.type === typeFilter
              );
              const isSelected = isSameDay(day, selectedDate);
              const isNow      = isSameDay(day, today);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day)}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1"
                >
                  <span className="text-[10px] font-bold text-gray-400">{DAY_ABBR[i]}</span>
                  <span className={`text-sm font-bold w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : isNow
                      ? 'text-blue-600'
                      : 'text-gray-700'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    hasEvents
                      ? isSelected ? 'bg-white' : 'bg-blue-400'
                      : 'bg-transparent'
                  }`} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden below md)
          ══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex md:flex-col md:flex-1 md:overflow-hidden">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gerencie seus compromissos e visitas</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Type filter */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen(o => !o)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                {typeFilter === 'Todos' ? 'Todos os eventos' : typeFilter}
                <ChevronDown size={14} className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
              </button>

              {filterOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                  {(['Todos', 'Visita', 'Reunião', 'Assinatura', 'Outro'] as TypeFilter[]).map(t => (
                    <button
                      key={t}
                      onClick={() => { setTypeFilter(t); setFilterOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${typeFilter === t ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-gray-700'}`}
                    >
                      {t === 'Todos' ? 'Todos os eventos' : t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* New event */}
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus size={15} /> Novo Evento
            </button>
          </div>
        </div>

        {/* ── Main area: grid + sidebar ──────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Calendar grid ─────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-100">

            {/* Month + week nav */}
            <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 flex-shrink-0">
              <button onClick={prevWeek}  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"><ChevronLeft  size={15} /></button>
              <span className="text-sm font-bold text-gray-800 capitalize min-w-[148px] text-center">{monthLabel}</span>
              <button onClick={nextWeek}  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"><ChevronRight size={15} /></button>
              <button onClick={goToToday} className="ml-1 px-3 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Hoje</button>
            </div>

            {/* Day column headers */}
            <div className="flex border-b border-gray-100 flex-shrink-0">
              <div className="w-14 flex-shrink-0" />
              {weekDays.map((day, i) => {
                const sel   = isSameDay(day, selectedDate);
                const isNow = isSameDay(day, today);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(day)}
                    className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors ${sel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className="text-[10px] font-bold text-gray-400 tracking-wider">{DAY_ABBR[i]}</span>
                    <span className={`text-base font-bold w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                      isNow && sel  ? 'bg-blue-600 text-white' :
                      isNow         ? 'text-blue-600' :
                      sel           ? 'bg-blue-100 text-blue-700' :
                                      'text-gray-800'
                    }`}>{format(day, 'd')}</span>
                  </button>
                );
              })}
            </div>

            {/* Time grid (scrollable) */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-blue-500" /></div>
              ) : (
                HOURS.map(hour => (
                  <div key={hour} className="flex border-b border-gray-50 min-h-[52px] group">
                    {/* Hour label */}
                    <div className="w-14 flex-shrink-0 px-3 pt-2 text-right">
                      <span className="text-xs text-gray-300 font-medium">{`${String(hour).padStart(2,'0')}:00`}</span>
                    </div>

                    {/* Cells */}
                    {weekDays.map((day, di) => {
                      const sel   = isSameDay(day, selectedDate);
                      const cells = getCell(day, hour);
                      return (
                        <div
                          key={di}
                          onClick={() => {
                            setSelectedDate(day);
                            handleOpenModal(undefined, format(day, 'yyyy-MM-dd'), `${String(hour).padStart(2,'0')}:00`);
                          }}
                          className={`flex-1 border-l border-gray-50 px-0.5 py-0.5 cursor-pointer transition-colors ${
                            sel ? 'bg-blue-50/30 hover:bg-blue-50/50' : 'hover:bg-gray-50/70'
                          }`}
                        >
                          {cells.map(evt => (
                            <div
                              key={evt.id}
                              onClick={e => { e.stopPropagation(); setSelectedDate(day); }}
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md truncate mb-0.5 ${
                                TYPE_BLOCK[evt.type] ?? 'bg-gray-100 text-gray-700 border-l-2 border-gray-400'
                              } ${evt.completed ? 'opacity-40' : ''}`}
                            >
                              {evt.time} {evt.title}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── Right sidebar ──────────────────────────────────────── */}
          <aside className="w-72 flex-shrink-0 flex flex-col overflow-hidden bg-white">

            {/* Selected date header */}
            <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2 text-blue-600">
                <CalendarIcon size={15} />
                <span className="text-sm font-bold capitalize">
                  {format(selectedDate, "d 'de' MMMM", { locale: ptBR })}
                </span>
              </div>
            </div>

            {/* Events for selected day */}
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              {selectedDayEvents.length === 0 ? (
                <div className="flex flex-col items-center py-5 text-center gap-2">
                  <CalendarIcon size={30} className="text-gray-200" />
                  <p className="text-xs text-gray-400 font-medium">Nenhum evento para este dia</p>
                  <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors mt-1"
                  >
                    <Plus size={11} /> Agendar
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {selectedDayEvents.map(evt => (
                    <div
                      key={evt.id}
                      className={`p-2.5 rounded-xl border transition-all ${evt.completed ? 'opacity-50 bg-gray-50 border-gray-100' : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'}`}
                    >
                      {canViewAllClients && (
                        <ClientHierarchyTags ownerId={evt.user_id} allProfiles={allProfiles} teams={teams} directorates={directorates} className="mb-1" />
                      )}
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <p className={`text-xs font-bold truncate ${evt.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{evt.title}</p>
                          {evt.client_name && <p className="text-[10px] text-gray-500 truncate mt-0.5">{evt.client_name}</p>}
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-gray-400">{evt.time}</span>
                            {evt.location && (
                              <span className="text-[10px] text-gray-400 flex items-center gap-0.5 truncate">
                                <MapPin size={8} />{evt.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${TYPE_PILL[evt.type] ?? ''}`}>{evt.type}</span>
                      </div>
                      <div className="flex gap-2.5 mt-2 pt-1.5 border-t border-gray-50">
                        <button onClick={() => handleOpenModal(evt)} className="text-[10px] text-gray-400 hover:text-blue-600 font-semibold transition-colors">Editar</button>
                        <button onClick={() => toggleComplete(evt)} className="text-[10px] text-gray-400 hover:text-emerald-600 font-semibold transition-colors">
                          {evt.completed ? 'Reabrir' : 'Concluir'}
                        </button>
                        <button onClick={() => handleDelete(evt.id)} className="text-[10px] text-gray-400 hover:text-red-500 font-semibold transition-colors">Excluir</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming events feed */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Próximos Eventos</h3>

              {upcomingEvents.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Nenhum evento próximo</p>
              ) : (
                <div className="space-y-1">
                  {upcomingEvents.map(evt => {
                    const d = parseISO(evt.date);
                    return (
                      <button
                        key={evt.id}
                        onClick={() => { setSelectedDate(d); setWeekStart(startOfWeek(d, { weekStartsOn: 0 })); }}
                        className="w-full text-left flex items-start gap-3 px-2.5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
                      >
                        <div className="flex-shrink-0 text-center w-8">
                          <div className="text-[9px] font-bold text-gray-400 uppercase leading-none">{format(d, 'MMM', { locale: ptBR })}</div>
                          <div className="text-lg font-black text-gray-800 leading-tight">{format(d, 'd')}</div>
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{evt.title}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{evt.time}{evt.client_name ? ` · ${evt.client_name}` : ''}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ── Modal (shared between mobile and desktop) ─────────────────────── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingAppointment ? 'Editar Agendamento' : 'Novo Agendamento'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Título</label>
            <input
              value={formData.title ?? ''}
              onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-900"
              placeholder="Ex: Visita ao Decorado"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Cliente</label>
            <input
              value={formData.client_name ?? ''}
              onChange={e => setFormData(p => ({ ...p, client_name: e.target.value }))}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-900"
              placeholder="Nome do cliente"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0">
              <label className="block text-sm font-medium text-gray-600 mb-1">Data</label>
              <input
                type="date"
                value={formData.date ?? ''}
                onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-900 text-sm"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-sm font-medium text-gray-600 mb-1">Hora</label>
              <input
                type="time"
                value={formData.time ?? ''}
                onChange={e => setFormData(p => ({ ...p, time: e.target.value }))}
                className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-900 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Local</label>
            <input
              value={formData.location ?? ''}
              onChange={e => setFormData(p => ({ ...p, location: e.target.value }))}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-900"
              placeholder="Endereço ou local"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Tipo</label>
            <div className="flex gap-2 flex-wrap">
              {(['Visita', 'Reunião', 'Assinatura', 'Outro'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setFormData(p => ({ ...p, type }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    formData.type === type
                      ? 'bg-blue-50 border-blue-400 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors mt-2"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSaving ? 'Salvando...' : editingAppointment ? 'Salvar Alterações' : 'Criar Agendamento'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
