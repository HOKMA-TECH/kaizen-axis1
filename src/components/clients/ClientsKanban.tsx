import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client, ClientStage } from '@/data/clients';
import { cn } from '@/lib/utils';

/**
 * Quadro Kanban do pipeline de clientes com drag-and-drop nativo (HTML5).
 * Altura limitada à viewport: cada coluna rola verticalmente por dentro e o
 * quadro rola horizontalmente — nada de colunas estourando a página.
 */
export function ClientsKanban({
  clients,
  stages,
  onMove,
}: {
  clients: Client[];
  stages: ClientStage[];
  onMove: (clientId: string, stage: ClientStage) => void;
}) {
  const navigate = useNavigate();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const handleDrop = (stage: ClientStage) => {
    if (dragId) {
      const c = clients.find((x) => x.id === dragId);
      if (c && c.stage !== stage) onMove(dragId, stage);
    }
    setDragId(null);
    setOverStage(null);
  };

  return (
    <div className="kanban-board flex h-[calc(100vh-16rem)] gap-3 overflow-x-auto px-6 pb-4">
      {stages.map((stage) => {
        const items = clients.filter((c) => c.stage === stage);
        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStage(stage);
            }}
            onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(stage);
            }}
            className={cn(
              'flex h-full w-72 flex-shrink-0 flex-col rounded-2xl border transition-colors',
              overStage === stage
                ? 'border-primary-500/60 bg-primary-500/5'
                : 'border-surface-200 bg-surface-100/40',
            )}
          >
            {/* Header da coluna (fixo) */}
            <div className="flex flex-shrink-0 items-center justify-between px-3 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{stage}</span>
              <span className="font-ui rounded-md bg-surface-100 px-1.5 py-0.5 text-[10px] font-bold text-text-secondary">
                {items.length}
              </span>
            </div>

            {/* Cards (rolagem interna) */}
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {items.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                  onClick={() => navigate(`/clients/${c.id}`)}
                  className={cn(
                    'cursor-grab rounded-xl border border-surface-200 bg-card-bg p-3 transition-all hover:border-primary-500/40 active:cursor-grabbing',
                    dragId === c.id && 'opacity-40',
                  )}
                >
                  <p className="truncate text-sm font-semibold text-text-primary">{c.name}</p>
                  <p className="truncate text-xs text-text-secondary">{c.development || 'Sem empreendimento'}</p>
                  {c.intendedValue && (
                    <p className="font-ui mt-2 inline-block rounded-md bg-surface-100 px-2 py-0.5 text-xs font-semibold text-text-primary">
                      {c.intendedValue}
                    </p>
                  )}
                </div>
              ))}
              {items.length === 0 && (
                <div className="rounded-xl border border-dashed border-surface-200 py-5 text-center text-[11px] text-text-secondary/50">
                  Solte aqui
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
