import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCheck, Check, Smile, FileText, Download, X, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { AudioPlayer } from './AudioPlayer';

export interface BubbleMessage {
  id: string;
  text?: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  fileName?: string;
  timestamp: string;
  date?: string;
  isMe: boolean;
  deliveryStatus?: 'sending' | 'sent';
  isKAI?: boolean;
  is_deleted?: boolean;
  reactions?: { emoji: string; count: number; reacted: boolean }[];
}

interface ChatMessageBubbleProps {
  message: BubbleMessage;
  index: number;
  onDeleteForMe?: (id: string) => void;
  onDeleteForAll?: (id: string) => void;
  onReact?: (id: string, emoji: string) => void;
}

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🙏'];

export function ChatMessageBubble({ message, index, onDeleteForMe, onDeleteForAll, onReact }: ChatMessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaName = message.fileName || message.text || (
    message.type === 'image' ? 'Imagem' :
    message.type === 'video' ? 'Video' :
    message.type === 'document' ? 'Documento' :
    'Midia'
  );

  const openViewer = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (message.mediaUrl && ['image', 'video', 'document'].includes(message.type)) {
      setViewerOpen(true);
      setShowMenu(false);
      setShowEmojiPicker(false);
    }
  };

  const downloadMedia = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!message.mediaUrl) return;
    const a = document.createElement('a');
    a.href = message.mediaUrl;
    a.download = mediaName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
          'px-3.5 py-2 shadow-sm',
          message.isMe
            ? 'bg-primary-600 text-white rounded-2xl rounded-tr-sm'
            : message.isKAI
              ? 'bg-gradient-to-br from-surface-100 to-surface-50 dark:from-surface-200/20 dark:to-surface-100/10 text-text-primary rounded-2xl rounded-tl-sm border border-surface-200'
              : 'bg-card-bg text-text-primary rounded-2xl rounded-tl-sm border border-surface-200 dark:border-surface-100/10'
        )}>
          {message.type === 'text' && message.isKAI ? (
            <div className={cn(
              'text-sm leading-relaxed prose prose-sm max-w-none',
              'prose-p:my-0.5 prose-ul:my-1 prose-li:my-0',
              'prose-headings:text-text-primary prose-p:text-text-primary prose-li:text-text-primary'
            )}>
              <ReactMarkdown>{message.text || ''}</ReactMarkdown>
            </div>
          ) : message.type === 'image' && message.mediaUrl ? (
            <button onClick={openViewer} className="block rounded-xl overflow-hidden text-left">
              <img
                src={message.mediaUrl}
                alt="imagem"
                className="rounded-xl max-w-full max-h-48 object-cover hover:opacity-95 transition-opacity"
              />
            </button>
          ) : message.type === 'video' && message.mediaUrl ? (
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
          ) : message.type === 'audio' && message.mediaUrl ? (
            <AudioPlayer src={message.mediaUrl} isMe={message.isMe} />
          ) : message.type === 'document' && message.mediaUrl ? (
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
            'flex items-center gap-1 mt-1 justify-end',
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

      {viewerOpen && message.mediaUrl && (
        <div
          className="fixed inset-0 z-[500] bg-white dark:bg-[#0b141a] flex flex-col"
          onClick={() => setViewerOpen(false)}
        >
          <div
            className="h-16 px-4 flex items-center gap-3 border-b border-surface-200 bg-card-bg text-text-primary"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setViewerOpen(false)}
              className="p-2 rounded-full hover:bg-surface-100 transition-colors"
              aria-label="Fechar"
            >
              <X size={22} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{mediaName}</p>
              <p className="text-xs text-text-secondary">{message.timestamp}</p>
            </div>
            <button
              onClick={downloadMedia}
              className="p-2 rounded-full hover:bg-surface-100 transition-colors"
              aria-label="Baixar arquivo"
              title="Baixar"
            >
              <Download size={22} />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center bg-surface-50 dark:bg-black/40 p-4">
            {message.type === 'image' && (
              <img
                src={message.mediaUrl}
                alt={mediaName}
                className="max-w-full max-h-full object-contain"
                onClick={e => e.stopPropagation()}
              />
            )}
            {message.type === 'video' && (
              <video
                src={message.mediaUrl}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-full"
                onClick={e => e.stopPropagation()}
              />
            )}
            {message.type === 'document' && (
              <iframe
                src={message.mediaUrl}
                title={mediaName}
                className="w-full h-full max-w-5xl bg-white border-0 shadow-sm"
                onClick={e => e.stopPropagation()}
              />
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
