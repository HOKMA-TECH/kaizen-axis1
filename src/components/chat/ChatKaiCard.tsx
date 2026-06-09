import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

interface ChatKaiCardProps {
  onClick: () => void;
  isSelected?: boolean;
}

export function ChatKaiCard({ onClick, isSelected }: ChatKaiCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      whileHover={{ scale: 1.02, boxShadow: '0 8px 24px rgba(31,111,229,0.3)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full text-left rounded-2xl p-3.5 mb-2 transition-shadow ${
        isSelected
          ? 'bg-gradient-to-r from-primary-700 to-indigo-700 shadow-lg shadow-primary-300/40'
          : 'bg-gradient-to-r from-primary-600 to-indigo-600 shadow-md shadow-primary-200/50 dark:shadow-primary-900/30'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-card-bg/20 flex items-center justify-center flex-shrink-0">
          <Sparkles size={17} className="text-white animate-pulse" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-bold text-sm">KAI</p>
          <p className="text-white/70 text-xs">Assistente Inteligente</p>
        </div>
      </div>
      <p className="mt-2.5 text-white/75 text-xs leading-relaxed line-clamp-2">
        Olá! Como posso ajudar hoje?
      </p>
    </motion.button>
  );
}
