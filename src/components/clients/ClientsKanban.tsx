import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GripVertical } from 'lucide-react';
import { Client, ClientStage } from '@/data/clients';
import { cn } from '@/lib/utils';

/**
 * Quadro Kanban do pipeline com drag-and-drop por Pointer Events — funciona em
 * desktop (mouse) e mobile/iOS (toque).
 *
 * Cada card tem uma ALÇA dedicada (ícone ⠿) com `touch-action: none` +
 * `setPointerCapture`: arraste pela alça. Isso rastreia o dedo de forma confiável
 * no iPhone (Safari). O resto do card continua rolando e o toque abre a ficha.
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
  const [ghost, setGhost] = useState<{ x: number; y: number; name: string } | null>(null);

  const drag = useRef<{ id: string; stage: string; name: string } | null>(null);
  const overStageRef = useRef<string | null>(null);

  const setOver = (s: string | null) => {
    overStageRef.current = s;
    setOverStage(s);
  };

  const cleanup = () => {
    drag.current = null;
    setDragId(null);
    setGhost(null);
    setOver(null);
  };

  const updateFromPoint = (x: number, y: number) => {
    const info = drag.current;
    if (!info) return;
    setGhost({ x, y, name: info.name });
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const col = el?.closest('[data-stage]') as HTMLElement | null;
    setOver(col?.getAttribute('data-stage') ?? null);
  };

  const onHandleDown = (e: React.PointerEvent, c: Client) => {
    e.preventDefault();
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    drag.current = { id: c.id, stage: c.stage, name: c.name };
    setDragId(c.id);
    updateFromPoint(e.clientX, e.clientY);
    if (navigator.vibrate) try { navigator.vibrate(10); } catch { /* noop */ }
  };

  const onHandleMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    e.preventDefault();
    updateFromPoint(e.clientX, e.clientY);
  };

  const onHandleUp = (e: React.PointerEvent) => {
    const info = drag.current;
    if (!info) return;
    e.preventDefault();
    e.stopPropagation();
    const target = overStageRef.current;
    if (target && target !== info.stage) onMove(info.id, target as ClientStage);
    cleanup();
  };

  return (
    <div className="kanban-board flex h-[calc(100vh-16rem)] min-w-0 max-w-full gap-4 overflow-x-auto px-6 pb-4">
      {stages.map((stage) => {
        const items = clients.filter((c) => c.stage === stage);
        return (
          <div
            key={stage}
            data-stage={stage}
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
                  onClick={() => navigate(`/clients/${c.id}`)}
                  className={cn(
                    'relative flex min-h-[112px] cursor-pointer select-none flex-col rounded-xl border border-surface-200 bg-card-bg p-4 pr-11 transition-all hover:border-primary-500/40',
                    dragId === c.id && 'opacity-40',
                  )}
                >
                  {/* Alça de arrasto — touch-action:none + pointer capture (confiável no iOS) */}
                  <div
                    onPointerDown={(e) => onHandleDown(e, c)}
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onPointerCancel={cleanup}
                    onClick={(e) => e.stopPropagation()}
                    style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
                    className="absolute right-1 top-1 bottom-1 flex w-9 cursor-grab items-center justify-center rounded-lg text-text-secondary/60 hover:bg-surface-100 hover:text-text-secondary active:cursor-grabbing"
                    aria-label="Arrastar para outra etapa"
                  >
                    <GripVertical size={18} />
                  </div>

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

      {/* Fantasma seguindo o ponteiro durante o arrasto */}
      {ghost && (
        <div
          className="pointer-events-none fixed z-[100] w-64 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-primary-500/60 bg-card-bg p-3 shadow-2xl shadow-black/40"
          style={{ left: ghost.x, top: ghost.y }}
        >
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary">{ghost.name}</p>
        </div>
      )}
    </div>
  );
}
