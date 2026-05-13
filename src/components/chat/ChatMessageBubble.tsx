import { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { CheckCheck, Check, Smile, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { AudioPlayer } from './AudioPlayer';

export interface BubbleMessage {
  id: string;
  text?: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
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

export function ChatMessageBubble({ message, index, onDeleteForMe, onDeleteForAll, onReact }: ChatMessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🙏'];

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      onMouseLeave={() => { handleTouchEnd(); }}
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
              animate={{ opacity: showMenu || showEmojiPicker ? 1 : 0, scale: showMenu || showEmojiPicker ? 1 : 0.8 }}
              className="p-1 rounded-full bg-card-bg border border-surface-200 shadow-sm"
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
            <img
              src={message.mediaUrl}
              alt="imagem"
              className="rounded-xl max-w-full max-h-48 object-cover"
            />
          ) : message.type === 'audio' && message.mediaUrl ? (
            <AudioPlayer src={message.mediaUrl} isMe={message.isMe} />
          ) : message.type === 'document' && message.mediaUrl ? (
            <a
              href={message.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2 min-w-[160px] px-1 py-0.5',
                message.isMe ? 'text-white' : 'text-text-primary'
              )}
            >
              <FileText size={20} className={message.isMe ? 'text-white/80' : 'text-primary-500'} />
              <span className="text-sm font-medium truncate max-w-[180px]">{message.text || 'Documento'}</span>
            </a>
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

        {showMenu && !message.is_deleted && (
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
    </motion.div>
  );
}
