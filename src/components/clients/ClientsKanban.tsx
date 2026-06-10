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
    <div className="kanban-board flex h-[calc(100vh-16rem)] min-w-0 max-w-full gap-4 overflow-x-auto px-6 pb-4">
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
              'flex h-full w-80 flex-shrink-0 flex-col rounded-2xl border transition-colors',
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
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-2.5 pb-2.5">
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
                    'flex min-h-[112px] cursor-grab flex-col rounded-xl border border-surface-200 bg-card-bg p-4 transition-all hover:border-primary-500/40 active:cursor-grabbing',
                    dragId === c.id && 'opacity-40',
                  )}
                >
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-text-primary">{c.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-snug text-text-secondary">{c.development || 'Sem empreendimento'}</p>
                  </div>
                  {c.intendedValue && (
                    <p className="font-ui mt-auto inline-block w-fit rounded-md bg-surface-100 px-2 py-0.5 text-xs font-semibold text-text-primary">
                      {c.intendedValue}
                    </p>
                  )}
                </div>
              ))}
              {items.length === 0 && (
                <div className="flex min-h-[112px] items-center justify-center rounded-xl border border-dashed border-surface-200 text-center text-[11px] text-text-secondary/50">
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
