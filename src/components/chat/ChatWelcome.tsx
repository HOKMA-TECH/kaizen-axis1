import { MessageSquare } from 'lucide-react';

export function ChatWelcome() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-surface-50 dark:bg-surface-900/20 select-none">
      <div
        className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center"
        style={{ animation: 'float 3s ease-in-out infinite' }}
      >
        <MessageSquare size={28} className="text-primary-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-text-primary">Suas mensagens</p>
        <p className="text-xs text-text-secondary mt-1">
          Selecione uma conversa para começar
        </p>
      </div>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
