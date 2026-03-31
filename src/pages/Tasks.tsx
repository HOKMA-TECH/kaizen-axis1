import { useState } from 'react';
import { PremiumCard, StatusBadge, SectionHeader, RoundedButton } from '@/components/ui/PremiumComponents';
import { CheckCircle2, Calendar, User, Plus, Edit2, Trash2, X, Clock, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useApp, Task } from '@/context/AppContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Tasks() {
  const { tasks, addTask, updateTask, deleteTask, loading } = useApp();
  const [filter, setFilter] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Task>>({
    title: '', responsible: 'Eu', deadline: '', status: 'Pendente', description: '', subtasks: []
  });
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const handleOpenModal = (task?: Task) => {
    if (task) { setEditingTask(task); setFormData(JSON.parse(JSON.stringify(task))); }
    else { setEditingTask(null); setFormData({ title: '', responsible: 'Eu', deadline: '', status: 'Pendente', description: '', subtasks: [] }); }
    setNewSubtaskTitle('');
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title) return;
    setIsSaving(true);
    try {
      if (editingTask) {
        await updateTask(editingTask.id, formData);
      } else {
        await addTask({ ...formData, subtasks: formData.subtasks || [] } as Omit<Task, 'id' | 'created_at'>);
      }
      setIsModalOpen(false);
    } catch (e: any) {
      alert(e?.message || 'Nao foi possivel salvar a tarefa. Tente novamente.');
    } finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta tarefa?')) return;
    try {
      await deleteTask(id);
    } catch (e: any) {
      alert(e?.message || 'Nao foi possivel excluir a tarefa. Tente novamente.');
    }
  };

  const toggleComplete = async (task: Task) => {
    try {
      await updateTask(task.id, { status: task.status === 'Concluída' ? 'Pendente' : 'Concluída' });
    } catch (e: any) {
      alert(e?.message || 'Nao foi possivel atualizar a tarefa. Tente novamente.');
    }
  };

  const toggleSubtaskCompletion = async (task: Task, subtaskId: string) => {
    const newSubtasks = task.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
    try {
      await updateTask(task.id, { subtasks: newSubtasks });
    } catch (e: any) {
      alert(e?.message || 'Nao foi possivel atualizar subtarefa. Tente novamente.');
    }
  };

  const addSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const newSubtask = { id: Date.now().toString(), title: newSubtaskTitle, completed: false };
    setFormData(p => ({ ...p, subtasks: [...(p.subtasks || []), newSubtask] }));
    setNewSubtaskTitle('');
  };

  const removeSubtask = (subtaskId: string) => {
    setFormData(p => ({ ...p, subtasks: (p.subtasks || []).filter(s => s.id !== subtaskId) }));
  };

  const filteredTasks = tasks.filter(t => filter === 'Todos' || t.status === filter);

  const formatDeadline = (deadline?: string) => {
    if (!deadline) return '';
    try {
      return format(new Date(deadline + 'T00:00:00'), "d 'de' MMM", { locale: ptBR });
    } catch { return deadline; }
  };

  return (
    <div className="p-6 pb-24 min-h-screen bg-surface-50">
      <div className="flex justify-between items-start mb-4">
        <SectionHeader title="Tarefas" subtitle="Gestão de atividades" />
        <RoundedButton size="sm" onClick={() => handleOpenModal()} className="flex items-center gap-1 mt-2">
          <Plus size={16} /> Nova
        </RoundedButton>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-2">
        {['Todos', 'Pendente', 'Em Andamento', 'Concluída'].map((status) => (
          <button key={status} onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filter === status ? 'bg-gray-900 dark:bg-white text-white dark:text-black shadow-md' : 'bg-card-bg text-text-secondary border border-surface-200'}`}>
            {status}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-gold-400" /></div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-10 text-text-secondary">
            <p>Nenhuma tarefa encontrada.</p>
            <RoundedButton variant="outline" size="sm" className="mt-4 mx-auto" onClick={() => handleOpenModal()}>Criar Tarefa</RoundedButton>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <PremiumCard key={task.id} className={`flex flex-col gap-3 p-4 transition-all ${task.status === 'Concluída' ? 'opacity-70 bg-surface-50' : ''}`}>
              <div className="flex items-start gap-3">
                <button onClick={() => toggleComplete(task)}
                  className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${task.status === 'Concluída' ? 'bg-green-500 border-green-500 text-white' : 'border-surface-300 text-transparent hover:border-gold-400'}`}>
                  <CheckCircle2 size={12} strokeWidth={3} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className={`font-medium text-text-primary truncate ${task.status === 'Concluída' ? 'line-through text-text-secondary' : ''}`}>{task.title}</h4>
                    <StatusBadge status={task.status} className="text-[10px] px-2 py-0.5 flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    {task.responsible && (
                      <div className="flex items-center gap-1 text-xs text-text-secondary"><User size={12} /> {task.responsible}</div>
                    )}
                    {task.deadline && (
                      <div className="flex items-center gap-1 text-xs font-medium text-text-secondary"><Calendar size={12} /> {formatDeadline(task.deadline)}</div>
                    )}
                  </div>
                  {task.subtasks && task.subtasks.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-1.5 bg-surface-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gold-500 rounded-full transition-all duration-500"
                            style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-text-secondary font-medium whitespace-nowrap">
                          {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
                        </span>
                      </div>
                      <div className="space-y-1 pl-1">
                        {task.subtasks.map(subtask => (
                          <button key={subtask.id} onClick={() => toggleSubtaskCompletion(task, subtask.id)}
                            className="flex items-center gap-2 w-full text-left group">
                            <div className={`w-2 h-2 rounded-full border flex-shrink-0 transition-colors ${subtask.completed ? 'bg-gold-500 border-gold-500' : 'border-surface-300 group-hover:border-gold-400'}`} />
                            <span className={`text-xs truncate transition-colors ${subtask.completed ? 'text-text-secondary line-through' : 'text-text-primary group-hover:text-gold-600'}`}>{subtask.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-surface-100">
                <button onClick={() => handleOpenModal(task)} className="text-xs font-medium text-text-secondary hover:text-gold-600 flex items-center gap-1"><Edit2 size={12} /> Editar</button>
                <button onClick={() => handleDelete(task.id)} className="text-xs font-medium text-text-secondary hover:text-red-500 flex items-center gap-1"><Trash2 size={12} /> Excluir</button>
              </div>
            </PremiumCard>
          ))
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Título</label>
            <input value={formData.title || ''} onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" placeholder="Ex: Enviar contrato" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Responsável</label>
            <input value={formData.responsible || ''} onChange={(e) => setFormData(p => ({ ...p, responsible: e.target.value }))}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" placeholder="Nome do responsável" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Prazo</label>
            <input type="date" value={formData.deadline || ''} onChange={(e) => setFormData(p => ({ ...p, deadline: e.target.value }))}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
            <div className="flex gap-2">
              {(['Pendente', 'Em Andamento', 'Concluída'] as const).map(status => (
                <button key={status} type="button" onClick={() => setFormData(p => ({ ...p, status }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${formData.status === status ? 'bg-gold-50 border-gold-400 text-gold-700 dark:bg-gold-900/20 dark:text-gold-400' : 'bg-surface-50 border-surface-200 text-text-secondary'}`}>
                  {status}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Subtarefas</label>
            <div className="space-y-2 mb-2">
              {formData.subtasks?.map(subtask => (
                <div key={subtask.id} className="flex items-center gap-2 bg-surface-50 p-2 rounded-lg">
                  <span className={`flex-1 text-sm ${subtask.completed ? 'line-through text-text-secondary' : 'text-text-primary'}`}>{subtask.title}</span>
                  <button type="button" onClick={() => removeSubtask(subtask.id)} className="text-text-secondary hover:text-red-500"><X size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}
                className="flex-1 p-2 bg-surface-50 rounded-lg border-none text-sm text-text-primary focus:ring-2 focus:ring-gold-200"
                placeholder="Nova subtarefa..." />
              <button type="button" onClick={addSubtask} className="p-2 bg-gold-500 text-white rounded-lg hover:bg-gold-600"><Plus size={18} /></button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Descrição (Opcional)</label>
            <textarea value={formData.description || ''} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary min-h-[80px]" placeholder="Detalhes da tarefa..." />
          </div>
          <RoundedButton fullWidth onClick={handleSave} disabled={isSaving} className="mt-4">
            {isSaving ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : editingTask ? 'Salvar Alterações' : 'Criar Tarefa'}
          </RoundedButton>
        </div>
      </Modal>
    </div>
  );
}
