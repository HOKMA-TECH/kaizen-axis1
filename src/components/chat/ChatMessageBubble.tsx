import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCheck, Check, Smile, FileText, Download, X, Play, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { AudioPlayer } from './AudioPlayer';
import { isTrustedMediaUrl } from '@/lib/chat-media-url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface BubbleMessage {
  id: string;
  text?: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  /** Raw storage path — used to regenerate short-lived signed URLs on load (C-01) */
  mediaPath?: string;
  fileName?: string;
  timestamp: string;
  date?: string;
  isMe: boolean;
  deliveryStatus?: 'sending' | 'sent';
  isKAI?: boolean;
  is_deleted?: boolean;
  reactions?: { emoji: string; count: number; reacted: boolean }[];
  viewOnce?: boolean;
  viewOnceOpened?: boolean;
}

interface ChatMessageBubbleProps {
  message: BubbleMessage;
  index: number;
  onDeleteForMe?: (id: string) => void;
  onDeleteForAll?: (id: string) => void;
  onReact?: (id: string, emoji: string) => void;
  onMarkViewOnceOpened?: (id: string) => void;
  onOpenViewOnceMedia?: (id: string) => Promise<string | null>;
}

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🙏'];

function PdfDocumentViewer({ url, fileName }: { url: string; fileName: string }) {
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
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<div className="py-12 text-center text-sm text-text-secondary">Carregando PDF...</div>}
        error={
          <div className="mx-auto mt-8 max-w-md rounded-xl bg-card-bg border border-surface-200 p-6 text-center shadow-sm">
            <FileText size={42} className="mx-auto mb-3 text-primary-500" />
            <p className="text-sm font-semibold text-text-primary truncate">{fileName}</p>
            <p className="mt-1 text-xs text-text-secondary">Nao foi possivel visualizar este PDF aqui.</p>
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

export function ChatMessageBubble({ message, index, onDeleteForMe, onDeleteForAll, onReact, onMarkViewOnceOpened, onOpenViewOnceMedia }: ChatMessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  // Snapshot the mediaUrl when opening the viewer so view-once wipe doesn't break playback
  const [viewerMediaUrl, setViewerMediaUrl] = useState<string | undefined>(undefined);
  const [openingViewOnce, setOpeningViewOnce] = useState(false);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaName = message.fileName || message.text || (
    message.type === 'image' ? 'Imagem' :
    message.type === 'video' ? 'Video' :
    message.type === 'document' ? 'Documento' :
    'Midia'
  );

  const openViewer = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const isMedia = ['image', 'video', 'document', 'audio'].includes(message.type);
    const hasMedia = message.mediaUrl && isMedia;
    const isViewOnceText = message.viewOnce && message.type === 'text';
    const needsViewOnceMediaUrl = message.viewOnce && !message.isMe && !message.viewOnceOpened && isMedia;
    if (needsViewOnceMediaUrl) {
      setOpeningViewOnce(true);
      const signedUrl = await onOpenViewOnceMedia?.(message.id);
      setOpeningViewOnce(false);
      if (!signedUrl) return;
      setViewerMediaUrl(signedUrl);
      setViewerOpen(true);
      setShowMenu(false);
      setShowEmojiPicker(false);
      return;
    }
    if (hasMedia || isViewOnceText) {
      setViewerMediaUrl(message.mediaUrl); // snapshot before potential view-once wipe
      setViewerOpen(true);
      setShowMenu(false);
      setShowEmojiPicker(false);
    }
  };

  const closeViewer = () => {
    setViewerOpen(false);
    if (!message.isMe && message.viewOnce && !message.viewOnceOpened) {
      onMarkViewOnceOpened?.(message.id);
    }
  };

  const isPdf = message.type === 'document' && (
    mediaName.toLowerCase().endsWith('.pdf') ||
    message.mediaUrl?.toLowerCase().includes('.pdf')
  );

  const downloadMedia = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!message.mediaUrl) return;
    try {
      const response = await fetch(message.mediaUrl);
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = mediaName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      const a = document.createElement('a');
      a.href = message.mediaUrl;
      a.download = mediaName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleTouchStart = () => {
    pressTimer.current = setTimeout(() => setShowMenu(true), 500);
  };
  const handleTouchEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(true);
  };

  useEffect(() => {
    return () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    };
  }, []);

  if (message.is_deleted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.02, 0.3), duration: 0.2 }}
        className={cn('flex mb-1', message.isMe ? 'justify-end' : 'justify-start')}
      >
        <div className="px-3 py-1.5 rounded-2xl bg-surface-100 dark:bg-surface-200/10">
          <p className="text-xs text-text-secondary italic">Mensagem apagada</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, x: message.isMe ? 6 : -6 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.3), duration: 0.22, ease: 'easeOut' }}
      className={cn('flex mb-1 group', message.isMe ? 'justify-end' : 'justify-start')}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); handleTouchEnd(); }}
    >
      <div className="relative max-w-[75%]">
        {/* Emoji picker trigger */}
        {!message.isKAI && !message.is_deleted && (
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 z-20',
              message.isMe ? '-left-8' : '-right-8'
            )}
          >
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: hovered || showMenu || showEmojiPicker ? 1 : 0, scale: hovered || showMenu || showEmojiPicker ? 1 : 0.8 }}
              transition={{ duration: 0.15 }}
              className="p-1 rounded-full bg-card-bg border border-surface-200 shadow-sm"
              aria-label="Reagir à mensagem"
              onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(v => !v); setShowMenu(false); }}
            >
              <Smile size={12} className="text-text-secondary" />
            </motion.button>

            {showEmojiPicker && (
              <div
                className={cn(
                  'absolute top-8 z-30 flex gap-1 p-1.5 bg-card-bg border border-surface-200 rounded-2xl shadow-lg',
                  message.isMe ? 'right-0' : 'left-0'
                )}
              >
                {QUICK_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    className="text-base hover:scale-125 transition-transform"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReact?.(message.id, emoji);
                      setShowEmojiPicker(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={cn(
          'shadow-sm',
          message.type === 'text' || message.type === 'audio' ? 'px-3.5 py-2' : 'p-1',
          message.isMe
            ? 'bg-primary-600 text-white rounded-2xl rounded-tr-sm'
            : message.isKAI
              ? 'bg-gradient-to-br from-surface-100 to-surface-50 dark:from-surface-200/20 dark:to-surface-100/10 text-text-primary rounded-2xl rounded-tl-sm border border-surface-200'
              : 'bg-card-bg text-text-primary rounded-2xl rounded-tl-sm border border-surface-200 dark:border-surface-100/10'
        )}>
          {/* View-once: receiver taps to open */}
          {message.viewOnce && !message.isMe && !message.viewOnceOpened ? (
            <button
              onClick={openViewer}
              className={cn(
                'flex items-center gap-2.5 min-w-[180px] px-1 py-0.5 text-left group'
              )}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 group-hover:bg-white/30 transition-colors flex-shrink-0">
                <Eye size={18} />
              </span>
              <div>
                <p className="text-sm font-medium leading-tight">
                  {openingViewOnce ? 'Abrindo...' : message.type === 'audio' ? 'Toque para ouvir' : message.type === 'video' ? 'Toque para assistir' : message.type === 'image' ? 'Toque para ver foto' : message.type === 'document' ? 'Toque para ver arquivo' : 'Toque para ler'}
                </p>
                <p className="text-[10px] opacity-60 mt-0.5">Visualização única</p>
              </div>
            </button>
          ) : message.viewOnce && !message.isMe && message.viewOnceOpened ? (
            /* View-once: receiver already opened */
            <div className="flex items-center gap-2.5 min-w-[160px] px-1 py-0.5 opacity-50">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-current/10 flex-shrink-0">
                <EyeOff size={18} />
              </span>
              <div>
                <p className="text-sm font-medium leading-tight">Já visualizada</p>
                <p className="text-[10px] opacity-60 mt-0.5">Visualização única</p>
              </div>
            </div>
          ) : message.viewOnce && message.isMe ? (
            /* View-once: sender side */
            <div className={cn('flex items-center gap-2.5 min-w-[180px] px-1 py-0.5', message.viewOnceOpened && 'opacity-60')}>
              <span className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0',
                message.isMe ? 'bg-white/20' : 'bg-current/10'
              )}>
                {message.viewOnceOpened ? <EyeOff size={18} /> : <Eye size={18} />}
              </span>
              <div>
                <p className="text-sm font-medium leading-tight">
                  {message.type === 'audio' ? 'Áudio' : message.type === 'video' ? 'Vídeo' : message.type === 'image' ? 'Foto' : message.type === 'document' ? 'Arquivo' : 'Mensagem'} · Visualização única
                </p>
                <p className="text-[10px] opacity-60 mt-0.5">
                  {message.viewOnceOpened ? 'Aberta' : 'Aguardando abertura'}
                </p>
              </div>
            </div>
          ) : message.type === 'text' && message.isKAI ? (
            <div className={cn(
              'text-sm leading-relaxed prose prose-sm max-w-none',
              'prose-p:my-0.5 prose-ul:my-1 prose-li:my-0',
              'prose-headings:text-text-primary prose-p:text-text-primary prose-li:text-text-primary'
            )}>
              {/* C-07: rehype-sanitize blocks javascript: links and dangerous HTML */}
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{message.text || ''}</ReactMarkdown>
            </div>
          ) : message.type === 'image' && isTrustedMediaUrl(message.mediaUrl) ? (
            <button onClick={openViewer} className="block rounded-xl overflow-hidden text-left">
              <img
                src={message.mediaUrl}
                alt="imagem"
                className="rounded-xl max-w-full max-h-48 object-cover hover:opacity-95 transition-opacity"
              />
            </button>
          ) : message.type === 'video' && isTrustedMediaUrl(message.mediaUrl) ? (
            <button onClick={openViewer} className="relative block rounded-xl overflow-hidden text-left group">
              <video
                src={message.mediaUrl}
                className="rounded-xl max-w-full max-h-48 object-cover hover:opacity-95 transition-opacity"
                muted
                playsInline
              />
              <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                Vídeo
              </span>
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm">
                  <Play size={22} className="ml-0.5 fill-current" />
                </span>
              </span>
            </button>
          ) : message.type === 'audio' && isTrustedMediaUrl(message.mediaUrl) ? (
            <AudioPlayer src={message.mediaUrl!} isMe={message.isMe} />
          ) : message.type === 'document' && isTrustedMediaUrl(message.mediaUrl) ? (
            <button
              onClick={openViewer}
              className={cn(
                'flex items-center gap-2 min-w-[160px] px-1 py-0.5 text-left',
                message.isMe ? 'text-white' : 'text-text-primary'
              )}
            >
              <FileText size={20} className={message.isMe ? 'text-white/80' : 'text-primary-500'} />
              <span className="text-sm font-medium truncate max-w-[180px]">{mediaName}</span>
            </button>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message.text || ''}
            </p>
          )}

          <div className={cn(
            'flex items-center gap-1 mt-0.5 justify-end',
            message.type !== 'text' && message.type !== 'audio' && 'px-1.5 pb-0.5',
            message.isMe ? 'text-white/60' : 'text-text-secondary'
          )}>
            <span className="text-[10px]">{message.timestamp}</span>
            {message.isMe && (
              message.deliveryStatus === 'sending'
                ? <Check size={11} className="opacity-60" />
                : <CheckCheck size={11} className="opacity-80" />
            )}
          </div>
        </div>

        {message.reactions && message.reactions.length > 0 && (
          <div className={cn('flex gap-1 mt-0.5', message.isMe ? 'justify-end' : 'justify-start')}>
            {message.reactions.map(r => (
              <button
                key={r.emoji}
                onClick={() => onReact?.(message.id, r.emoji)}
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors',
                  r.reacted
                    ? 'bg-primary-100 border-primary-300 text-primary-700'
                    : 'bg-card-bg border-surface-200 text-text-secondary hover:bg-surface-100'
                )}
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span>{r.count}</span>}
              </button>
            ))}
          </div>
        )}

        {showMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
            <div
              className={cn(
                'absolute z-30 top-full mt-1 bg-card-bg border border-surface-200 rounded-2xl shadow-xl overflow-hidden min-w-[180px]',
                message.isMe ? 'right-0' : 'left-0'
              )}
            >
              <button
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-text-primary hover:bg-surface-100 transition-colors"
                onClick={() => { onDeleteForMe?.(message.id); setShowMenu(false); }}
              >
                Apagar para mim
              </button>
              {message.isMe && (
                <button
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  onClick={() => { onDeleteForAll?.(message.id); setShowMenu(false); }}
                >
                  Apagar para todos
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {viewerOpen && (viewerMediaUrl || message.mediaUrl || (message.viewOnce && message.type === 'text')) && (
        <div
          className="fixed inset-0 z-[500] bg-card-bg dark:bg-[#0b141a] flex flex-col"
          onClick={closeViewer}
        >
          <div
            className="h-16 px-4 flex items-center gap-3 border-b border-surface-200 bg-card-bg text-text-primary"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={closeViewer}
              className="p-2 rounded-full hover:bg-surface-100 transition-colors"
              aria-label="Fechar"
            >
              <X size={22} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{mediaName}</p>
              {message.viewOnce ? (
                <p className="text-xs text-primary-500 font-medium flex items-center gap-1">
                  <Eye size={10} /> Visualização única
                </p>
              ) : (
                <p className="text-xs text-text-secondary">{message.timestamp}</p>
              )}
            </div>
            {!message.viewOnce && (
              <button
                onClick={downloadMedia}
                className="p-2 rounded-full hover:bg-surface-100 transition-colors"
                aria-label="Baixar arquivo"
                title="Baixar"
              >
                <Download size={22} />
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center bg-surface-50 dark:bg-black/40 p-4">
            {message.viewOnce && message.type === 'text' && (
              <div
                className="max-w-md w-full bg-card-bg border border-surface-200 rounded-2xl p-6 shadow-sm"
                onClick={e => e.stopPropagation()}
              >
                <p className="text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words">
                  {message.text}
                </p>
              </div>
            )}
            {message.type === 'audio' && isTrustedMediaUrl(viewerMediaUrl) && (
              <div
                className="w-full max-w-sm bg-card-bg border border-surface-200 rounded-2xl p-4 shadow-sm"
                onClick={e => e.stopPropagation()}
              >
                <AudioPlayer src={viewerMediaUrl!} isMe={false} />
              </div>
            )}
            {message.type === 'image' && isTrustedMediaUrl(viewerMediaUrl) && (
              <img
                src={viewerMediaUrl}
                alt={mediaName}
                className="max-w-full max-h-full object-contain"
                onClick={e => e.stopPropagation()}
              />
            )}
            {message.type === 'video' && isTrustedMediaUrl(viewerMediaUrl) && (
              <video
                src={viewerMediaUrl}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-full"
                onClick={e => e.stopPropagation()}
              />
            )}
            {message.type === 'document' && isPdf && isTrustedMediaUrl(viewerMediaUrl) && (
              <PdfDocumentViewer url={viewerMediaUrl!} fileName={mediaName} />
            )}
            {message.type === 'document' && !isPdf && (
              <div
                className="max-w-md w-full bg-card-bg border border-surface-200 rounded-xl p-6 text-center shadow-sm"
                onClick={e => e.stopPropagation()}
              >
                <FileText size={42} className="mx-auto mb-3 text-primary-500" />
                <p className="text-sm font-semibold text-text-primary truncate">{mediaName}</p>
                <p className="text-xs text-text-secondary mt-1 mb-4">Este arquivo nao pode ser visualizado aqui.</p>
                <button
                  onClick={downloadMedia}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
                >
                  <Download size={16} /> Baixar arquivo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
