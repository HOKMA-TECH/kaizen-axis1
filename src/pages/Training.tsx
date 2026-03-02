import React, { useState, useEffect } from 'react';
import { PremiumCard, SectionHeader, RoundedButton } from '@/components/ui/PremiumComponents';
import { PlayCircle, FileText, Image as ImageIcon, Plus, X, ExternalLink, Edit2, Trash2 } from 'lucide-react';
import { FAB } from '@/components/Layout';
import { Modal } from '@/components/ui/Modal';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useApp, TrainingItem } from '@/context/AppContext';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// --- Componente auxiliar de visualização do PDF ---
function PDFViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fullscreenRef = React.useRef<HTMLDivElement>(null);

  // Measure the actual container content width so the PDF page fits exactly
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sync state when Esc key exits fullscreen
  useEffect(() => {
    const onFSChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement && fullscreenRef.current) {
      await fullscreenRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  // contentRect.width already excludes padding — use it directly as the page width
  const pageWidth = containerWidth > 0 ? containerWidth : undefined;

  return (
    <div ref={fullscreenRef} className="flex flex-col w-full" style={{ height: isFullscreen ? '100vh' : '78vh', background: '#f3f4f6' }}>
      {/* Scrollable page area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center p-2 min-h-0 w-full">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="text-gray-500 animate-pulse p-10 text-sm">A carregar PDF...</div>}
          error={<div className="text-red-500 p-10 text-sm text-center">Não foi possível carregar o PDF.<br />Tente reenviar o arquivo.</div>}
        >
          {containerWidth > 0 && (
            <Page
              pageNumber={pageNumber}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              width={pageWidth}
              className="shadow-lg"
            />
          )}
        </Document>
      </div>

      {/* Controls bar */}
      <div className="bg-white border-t border-gray-200 px-3 py-2 w-full flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber(p => p - 1)}
            className="px-3 py-1 bg-amber-500 text-white text-sm font-bold rounded-lg disabled:opacity-40 transition-opacity"
          >
            ‹
          </button>
          <span className="text-xs text-gray-700 font-medium whitespace-nowrap">
            {pageNumber} / {numPages ?? '…'}
          </span>
          <button
            disabled={pageNumber >= (numPages ?? 1)}
            onClick={() => setPageNumber(p => p + 1)}
            className="px-3 py-1 bg-amber-500 text-white text-sm font-bold rounded-lg disabled:opacity-40 transition-opacity"
          >
            ›
          </button>
        </div>

        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors border border-gray-300"
        >
          {isFullscreen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /></svg>
          )}
          {isFullscreen ? 'Reduzir' : 'Tela Cheia'}
        </button>
      </div>
    </div>
  );
}
// ----------------------------------------------------

export default function Training() {
  const { isBroker, canCreateStrategicResources } = useAuthorization();
  const { trainings, addTraining, updateTraining, deleteTraining, uploadFile, getDownloadUrl } = useApp();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<TrainingItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
    if (viewingItem) {
      if (viewingItem.url.startsWith('http')) {
        setViewingUrl(viewingItem.url);
      } else {
        getDownloadUrl(viewingItem.url).then(url => setViewingUrl(url));
      }
    } else {
      setViewingUrl(null);
    }
  }, [viewingItem, getDownloadUrl]);

  const handleSave = async () => {
    if (!formData.title || (!formData.url && !selectedFile)) return;
    setIsSaving(true);
    try {
      let finalUrl = formData.url;
      if (selectedFile) {
        const path = `trainings/${Date.now()}_${selectedFile.name}`;
        const uploadedPath = await uploadFile(selectedFile, path, 'documents');
        if (uploadedPath) finalUrl = uploadedPath;
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
          thumbnail: `https://picsum.photos/seed/${Date.now()}/400/300` // Placeholder thumbnail
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

          <RoundedButton fullWidth onClick={handleSave} className="mt-4" disabled={isSaving}>
            {isSaving ? 'Salvando...' : editingItemId ? 'Atualizar' : 'Adicionar'}
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
