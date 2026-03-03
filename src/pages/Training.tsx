import { useState, useEffect } from 'react';
import { PremiumCard, SectionHeader, RoundedButton } from '@/components/ui/PremiumComponents';
import { PlayCircle, FileText, Image as ImageIcon, Plus, Edit2, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useApp, TrainingItem } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';


// --- Componente auxiliar de visualização do PDF ---
function PDFViewer({ url }: { url: string }) {
  const [loadError, setLoadError] = useState(false);

  return (
    <div className="flex flex-col w-full" style={{ height: '78vh', background: '#f3f4f6' }}>
      {loadError ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
          <p className="text-red-500 text-sm text-center">
            Não foi possível exibir o PDF no navegador.<br />
            Clique abaixo para abrir em nova aba.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 transition-colors"
          >
            Abrir PDF
          </a>
        </div>
      ) : (
        <iframe
          src={url}
          title="Visualizador de PDF"
          className="w-full flex-1"
          style={{ height: '100%', border: 'none' }}
          onError={() => setLoadError(true)}
        />
      )}
    </div>
  );
}
// ----------------------------------------------------

export default function Training() {
  const { isBroker, canCreateStrategicResources } = useAuthorization();
  const { trainings, addTraining, updateTraining, deleteTraining, getDownloadUrl } = useApp();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<TrainingItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<TrainingItem>>({
    title: '',
    type: 'Vídeo',
    url: '',
    duration: '',
    description: ''
  });

  const handleOpenModal = (item?: TrainingItem) => {
    if (item) {
      setEditingItemId(item.id);
      setFormData({
        title: item.title,
        type: item.type,
        url: item.url,
        duration: item.duration,
        description: item.description,
      });
    } else {
      setEditingItemId(null);
      setFormData({ title: '', type: 'Vídeo', url: '', duration: '', description: '' });
    }
    setSelectedFile(null);
    setIsAddModalOpen(true);
  };

  useEffect(() => {
    if (!viewingItem) {
      setViewingUrl(null);
      return;
    }
    if (viewingItem.url.startsWith('http')) {
      setViewingUrl(viewingItem.url);
    } else if (viewingItem.url) {
      getDownloadUrl(viewingItem.url).then(url => setViewingUrl(url));
    }
    // getDownloadUrl is not memoised in AppContext — omitting it from deps
    // is intentional to prevent infinite re-fetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingItem]);

  const handleSave = async () => {
    if (!formData.title || (!formData.url && !selectedFile)) return;
    setIsSaving(true);
    setUploadError(null);
    try {
      let finalUrl = formData.url || '';

      if (selectedFile) {
        const sanitizedName = selectedFile.name
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const path = `${Date.now()}_${sanitizedName}`;

        const { data, error } = await supabase.storage
          .from('trainings')
          .upload(path, selectedFile, {
            upsert: true,
            contentType: selectedFile.type || 'application/octet-stream',
          });

        if (error) {
          setUploadError(`Erro no upload: ${error.message}`);
          return;
        }

        const { data: urlData } = supabase.storage.from('trainings').getPublicUrl(data.path);
        finalUrl = urlData.publicUrl;
      }

      if (!finalUrl) {
        setUploadError('Adicione um arquivo ou link antes de salvar.');
        return;
      }

      const payload = {
        title: formData.title,
        type: formData.type as 'Vídeo' | 'PDF' | 'Imagem',
        url: finalUrl,
        duration: formData.duration || 'N/A',
        description: formData.description || '',
      };

      if (editingItemId) {
        await updateTraining(editingItemId, payload);
      } else {
        await addTraining({
          ...payload,
          thumbnail: `https://picsum.photos/seed/${Date.now()}/400/300`
        });
      }

      setIsAddModalOpen(false);
      setFormData({ title: '', type: 'Vídeo', url: '', duration: '', description: '' });
      setSelectedFile(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Tem certeza que deseja excluir este treinamento?')) {
      await deleteTraining(id);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'Vídeo': return <PlayCircle className="text-white" size={24} />;
      case 'PDF': return <FileText className="text-white" size={24} />;
      case 'Imagem': return <ImageIcon className="text-white" size={24} />;
      default: return <FileText className="text-white" size={24} />;
    }
  };

  return (
    <div className="p-6 pb-24 min-h-screen bg-surface-50">
      <div className="flex justify-between items-start mb-4">
        <SectionHeader title="Treinamentos" subtitle="Universidade Corporativa" />
        {canCreateStrategicResources && (
          <RoundedButton size="sm" onClick={() => handleOpenModal()} className="flex items-center gap-1 mt-2">
            <Plus size={16} /> Novo
          </RoundedButton>
        )}
      </div>

      <div className="space-y-4">
        {trainings.map((item) => (
          <PremiumCard
            key={item.id}
            className="p-4 flex gap-4 cursor-pointer hover:bg-surface-100 transition-colors relative group"
            onClick={() => setViewingItem(item)}
          >
            {canCreateStrategicResources && (
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); handleOpenModal(item); }}
                  className="p-2 bg-white/90 dark:bg-black/80 text-text-secondary hover:text-gold-600 rounded-lg backdrop-blur-sm shadow-sm transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={(e) => handleDelete(item.id, e)}
                  className="p-2 bg-white/90 dark:bg-black/80 text-text-secondary hover:text-red-500 rounded-lg backdrop-blur-sm shadow-sm transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}

            <div className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-black">
              <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 flex items-center justify-center">
                {getIcon(item.type)}
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-between py-1">
              <div>
                <h4 className="font-semibold text-text-primary line-clamp-2 leading-tight">{item.title}</h4>
                <p className="text-xs text-text-secondary mt-1">{item.type} • {item.duration}</p>
              </div>

              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className={item.progress === 100 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-text-secondary'}>
                    {item.progress === 100 ? 'Concluído' : `${item.progress}%`}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.progress === 100 ? 'bg-green-500' : 'bg-gold-400'}`}
                    style={{ width: `${item.progress}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </PremiumCard>
        ))}
      </div>

      {/* Add Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingItemId ? "Editar Treinamento" : "Adicionar Treinamento"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Título</label>
            <input
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
              placeholder="Ex: Técnicas de Vendas"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Tipo</label>
            <div className="flex gap-2">
              {['Vídeo', 'PDF', 'Imagem'].map(type => (
                <button
                  key={type}
                  onClick={() => setFormData(prev => ({ ...prev, type: type as any }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${formData.type === type
                    ? 'bg-gold-50 border-gold-400 text-gold-700 dark:bg-gold-900/20 dark:text-gold-400'
                    : 'bg-surface-50 border-surface-200 text-text-secondary'
                    }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Mídia (Upload ou Link)</label>
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept={formData.type === 'Vídeo' ? 'video/*' : formData.type === 'PDF' ? 'application/pdf' : 'image/*'}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                    setFormData(prev => ({ ...prev, url: '' }));
                  }
                }}
                className="w-full p-2 bg-surface-50 rounded-xl border border-surface-200 text-sm focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800"
              />
              <span className="text-xs text-center text-text-secondary">OU INSIRA UM LINK EXTERNO (Ex: YouTube)</span>
              <input
                value={formData.url || ''}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, url: e.target.value }));
                  setSelectedFile(null);
                }}
                className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
                placeholder="https://..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Duração / Páginas</label>
            <input
              value={formData.duration}
              onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary"
              placeholder="Ex: 30 min, 10 pág"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Descrição</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary min-h-[80px]"
              placeholder="Sobre o que é este treinamento..."
            />
          </div>

          {uploadError && (
            <div className="text-red-600 text-sm p-3 bg-red-50 rounded-xl border border-red-200">
              {uploadError}
            </div>
          )}
          <RoundedButton fullWidth onClick={handleSave} className="mt-4" disabled={isSaving}>
            {isSaving ? 'Enviando arquivo...' : editingItemId ? 'Atualizar' : 'Adicionar'}
          </RoundedButton>
        </div>
      </Modal>

      {/* View Modal */}
      {viewingItem && (
        <Modal
          isOpen={!!viewingItem}
          onClose={() => setViewingItem(null)}
          title={viewingItem.type}
        >
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-text-primary">{viewingItem.title}</h3>
            <p className="text-sm text-text-secondary">{viewingItem.description}</p>

            <div className="mt-4 bg-black rounded-xl overflow-hidden min-h-[50vh] flex items-center justify-center relative">
              {!viewingUrl ? (
                <div className="p-8 text-center text-white"><p>Carregando mídia...</p></div>
              ) : (
                <>
                  {viewingItem.type === 'Vídeo' && (
                    (viewingUrl.includes('youtube.com') || viewingUrl.includes('youtu.be')) ? (
                      <iframe
                        src={viewingUrl}
                        className="w-full aspect-video"
                        title={viewingItem.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video
                        src={viewingUrl}
                        controls
                        className="w-full aspect-video outline-none"
                        title={viewingItem.title}
                      />
                    )
                  )}

                  {viewingItem.type === 'Imagem' && (
                    <img
                      src={viewingUrl}
                      alt={viewingItem.title}
                      className="w-full h-auto max-h-[70vh] object-contain"
                      referrerPolicy="no-referrer"
                    />
                  )}

                  {viewingItem.type === 'PDF' && (
                    <div className="w-full h-[80vh] flex flex-col items-center justify-center bg-surface-50 overflow-hidden relative">
                      <PDFViewer url={viewingUrl} />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setViewingItem(null)}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
