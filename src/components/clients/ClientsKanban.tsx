import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client, ClientStage } from '@/data/clients';
import { cn } from '@/lib/utils';

/**
 * Quadro Kanban do pipeline com drag-and-drop por Pointer Events — funciona em
 * desktop (mouse) e mobile (toque). No toque, segure o card ~180ms para começar
 * a arrastar (assim o scroll vertical/horizontal continua funcionando); um toque
 * curto abre a ficha do cliente.
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
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; name: string } | null>(null);

  // Estado mutável do gesto atual (evita closures obsoletas nos listeners globais)
  const drag = useRef<{
    id: string;
    stage: string;
    name: string;
    startX: number;
    startY: number;
    pointerType: string;
    started: boolean;
    timer: number | null;
  } | null>(null);
  const overStageRef = useRef<string | null>(null);
  const draggingRef = useRef(false);

  const DRAG_THRESHOLD = 8;     // mouse: distância p/ iniciar arrasto
  const SCROLL_THRESHOLD = 12;  // toque: além disso antes do long-press = scroll
  const LONG_PRESS_MS = 180;    // toque: tempo p/ entrar em modo arrasto

  const setOver = (s: string | null) => {
    overStageRef.current = s;
    setOverStage(s);
  };

  const beginDrag = (x: number, y: number) => {
    const info = drag.current;
    if (!info) return;
    info.started = true;
    draggingRef.current = true;
    setDragId(info.id);
    setGhost({ x, y, name: info.name });
    if (navigator.vibrate) try { navigator.vibrate(10); } catch { /* noop */ }
  };

  const cleanup = () => {
    if (drag.current?.timer) window.clearTimeout(drag.current.timer);
    drag.current = null;
    draggingRef.current = false;
    setDragId(null);
    setGhost(null);
    setOver(null);
  };

  // Listeners globais (montados uma vez) — leem o ref `drag`
  useEffect(() => {
    const onMoveEvt = (e: PointerEvent) => {
      const info = drag.current;
      if (!info) return;
      const dx = e.clientX - info.startX;
      const dy = e.clientY - info.startY;
      const dist = Math.hypot(dx, dy);

      if (!info.started) {
        if (info.pointerType === 'mouse') {
          if (dist > DRAG_THRESHOLD) beginDrag(e.clientX, e.clientY);
        } else if (dist > SCROLL_THRESHOLD) {
          // No toque, mover antes do long-press = intenção de rolar → aborta o arrasto
          if (info.timer) window.clearTimeout(info.timer);
          drag.current = null;
        }
        return;
      }

      // Em modo arrasto: move o fantasma e detecta a coluna sob o ponteiro
      setGhost({ x: e.clientX, y: e.clientY, name: info.name });
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const col = el?.closest('[data-stage]') as HTMLElement | null;
      setOver(col?.getAttribute('data-stage') ?? null);
    };

    const onUp = () => {
      const info = drag.current;
      if (!info) return;
      if (info.timer) window.clearTimeout(info.timer);
      if (info.started) {
        const target = overStageRef.current;
        if (target && target !== info.stage) onMove(info.id, target as ClientStage);
      } else {
        // toque/clique curto sem arrasto → abre a ficha
        navigate(`/clients/${info.id}`);
      }
      cleanup();
    };

    const onCancel = () => cleanup();

    window.addEventListener('pointermove', onMoveEvt);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);

    // Bloqueia o scroll nativo enquanto arrasta (touchmove precisa ser não-passivo)
    const board = boardRef.current;
    const blockScroll = (e: TouchEvent) => { if (draggingRef.current) e.preventDefault(); };
    board?.addEventListener('touchmove', blockScroll, { passive: false });

    return () => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      board?.removeEventListener('touchmove', blockScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMove, navigate]);

  const handlePointerDown = (e: React.PointerEvent, c: Client) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    drag.current = {
      id: c.id,
      stage: c.stage,
      name: c.name,
      startX: e.clientX,
      startY: e.clientY,
      pointerType: e.pointerType,
      started: false,
      timer: null,
    };
    if (e.pointerType !== 'mouse') {
      const x = e.clientX, y = e.clientY;
      drag.current.timer = window.setTimeout(() => beginDrag(x, y), LONG_PRESS_MS);
    }
  };

  return (
    <div ref={boardRef} className="kanban-board flex h-[calc(100vh-16rem)] min-w-0 max-w-full gap-4 overflow-x-auto px-6 pb-4">
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
                  onPointerDown={(e) => handlePointerDown(e, c)}
                  style={{ touchAction: 'pan-x pan-y' }}
                  className={cn(
                    'flex min-h-[112px] cursor-grab select-none flex-col rounded-xl border border-surface-200 bg-card-bg p-4 transition-all hover:border-primary-500/40 active:cursor-grabbing',
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
