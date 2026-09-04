import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, X } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import type { DocumentPreviewKind } from '@/lib/document-preview-kind';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export type { DocumentPreviewKind };

function PdfPages({ blobUrl, fileName }: { blobUrl: string; fileName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(820);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      setWidth(Math.max(280, Math.min(el.clientWidth - 24, 920)));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-y-auto bg-surface-100 px-3 py-4"
      onClick={e => e.stopPropagation()}
    >
      <Document
        file={blobUrl}
        onLoadSuccess={({ numPages: next }) => setNumPages(next)}
        loading={<div className="py-12 text-center text-sm text-text-secondary">Carregando PDF...</div>}
        error={
          <div className="mx-auto mt-8 max-w-md rounded-xl bg-card-bg border border-surface-200 p-6 text-center shadow-sm">
            <FileText size={42} className="mx-auto mb-3 text-primary-500" />
            <p className="text-sm font-semibold text-text-primary truncate">{fileName}</p>
            <p className="mt-1 text-xs text-text-secondary">Não foi possível visualizar este PDF aqui.</p>
          </div>
        }
      >
        <div className="mx-auto flex w-fit flex-col gap-4">
          {Array.from({ length: numPages }, (_, i) => (
            <Page
              key={i + 1}
              pageNumber={i + 1}
              width={width}
              renderAnnotationLayer
              renderTextLayer
              className="overflow-hidden bg-card-bg shadow-sm"
            />
          ))}
        </div>
      </Document>
    </div>
  );
}

export function DocumentPreviewOverlay({
  url,
  fileName,
  kind,
  onClose,
}: {
  url: string;
  fileName: string;
  kind: DocumentPreviewKind;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setBlobUrl(null);
    setLoadError(null);

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Não foi possível abrir o documento.');
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  const download = () => {
    if (!blobUrl) return;
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName || 'documento';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return createPortal(
    <div className="fixed inset-0 z-[500] bg-card-bg dark:bg-[#0b141a] flex flex-col">
      <div className="h-16 px-4 flex items-center gap-3 border-b border-surface-200 bg-card-bg text-text-primary shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-surface-100 transition-colors min-h-11 min-w-11 flex items-center justify-center"
          aria-label="Fechar"
        >
          <X size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{fileName}</p>
          <p className="text-xs text-text-secondary">Visualização no app</p>
        </div>
        <button
          onClick={download}
          disabled={!blobUrl}
          className="p-2 rounded-full hover:bg-surface-100 transition-colors disabled:opacity-40 min-h-11 min-w-11 flex items-center justify-center"
          aria-label="Baixar arquivo"
          title="Baixar"
        >
          <Download size={22} />
        </button>
      </div>

      <div className={`flex-1 min-h-0 flex bg-surface-50 dark:bg-black/40 ${kind === 'pdf' && blobUrl && !loadError ? '' : 'items-center justify-center'}`}>
        {loadError && (
          <div className="max-w-md mx-4 rounded-xl bg-card-bg border border-surface-200 p-6 text-center shadow-sm">
            <FileText size={42} className="mx-auto mb-3 text-primary-500" />
            <p className="text-sm font-semibold text-text-primary">{loadError}</p>
          </div>
        )}

        {!loadError && !blobUrl && (
          <p className="text-sm text-text-secondary animate-pulse">Carregando documento...</p>
        )}

        {!loadError && blobUrl && kind === 'pdf' && (
          <div className="w-full h-full min-h-0">
            <PdfPages blobUrl={blobUrl} fileName={fileName} />
          </div>
        )}

        {!loadError && blobUrl && kind === 'image' && (
          <img
            src={blobUrl}
            alt={fileName}
            className="max-w-full max-h-full object-contain p-4"
            onClick={e => e.stopPropagation()}
          />
        )}

        {!loadError && blobUrl && kind === 'other' && (
          <div
            className="max-w-md mx-4 rounded-xl bg-card-bg border border-surface-200 p-6 text-center shadow-sm"
            onClick={e => e.stopPropagation()}
          >
            <FileText size={42} className="mx-auto mb-3 text-primary-500" />
            <p className="text-sm font-semibold text-text-primary truncate">{fileName}</p>
            <p className="mt-1 text-xs text-text-secondary">
              Este tipo de arquivo não tem visualização no app. Use Baixar para abrir no dispositivo.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
