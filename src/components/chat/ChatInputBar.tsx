import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Paperclip, Image, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputBarProps {
  onSend: (text: string) => void;
  onAttach?: () => void;
  onImage?: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
}

export function ChatInputBar({
  onSend, onAttach, onImage, disabled, sending, placeholder = 'Digite sua mensagem...',
}: ChatInputBarProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = text.trim().length > 0 && !disabled && !sending;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  };

  return (
    <div className="px-3 py-3 border-t border-surface-200 dark:border-surface-100/10 bg-card-bg flex-shrink-0">
      <motion.div
        className={cn(
          'flex items-end gap-2 rounded-2xl border bg-surface-50 dark:bg-surface-200/5 px-3 py-2 transition-colors duration-150',
          text.length > 0
            ? 'border-primary-400 dark:border-primary-600'
            : 'border-surface-200 dark:border-surface-100/10'
        )}
      >
        <div className="flex items-center gap-1 pb-0.5 flex-shrink-0">
          <button
            onClick={onAttach}
            className="p-1.5 rounded-lg text-text-secondary hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            title="Anexar"
          >
            <Paperclip size={16} />
          </button>
          <button
            onClick={onImage}
            className="p-1.5 rounded-lg text-text-secondary hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            title="Imagem"
          >
            <Image size={16} />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-secondary resize-none focus:outline-none leading-5 py-0.5 transition-all duration-150 disabled:opacity-50"
          style={{ minHeight: '20px', maxHeight: '96px' }}
        />

        <motion.button
          whileTap={canSend ? { scale: 0.9 } : {}}
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            'p-2 rounded-xl transition-all duration-150 flex-shrink-0',
            canSend
              ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm shadow-primary-200'
              : 'bg-surface-200 dark:bg-surface-200/20 text-text-secondary/40 cursor-not-allowed'
          )}
        >
          {sending
            ? <Loader2 size={16} className="animate-spin" />
            : <Send size={16} />
          }
        </motion.button>
      </motion.div>
    </div>
  );
}
