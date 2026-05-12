import { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCheck, Check, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

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
}

interface ChatMessageBubbleProps {
  message: BubbleMessage;
  index: number;
}

export function ChatMessageBubble({ message, index }: ChatMessageBubbleProps) {
  const [showReaction, setShowReaction] = useState(false);

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
      onMouseEnter={() => setShowReaction(true)}
      onMouseLeave={() => setShowReaction(false)}
    >
      <div className="relative max-w-[75%]">
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: showReaction ? 1 : 0, scale: showReaction ? 1 : 0.8 }}
          transition={{ duration: 0.15 }}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 p-1 rounded-full bg-card-bg border border-surface-200 shadow-sm z-10',
            message.isMe ? '-left-7' : '-right-7'
          )}
        >
          <Smile size={12} className="text-text-secondary" />
        </motion.button>

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
      </div>
    </motion.div>
  );
}
