import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  RevealContainer,
  useGsapCountUp,
  prefersReducedMotion,
} from '@/lib/motion';

const brl = (v: number) =>
  'R$ ' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v).toLocaleString('pt-BR'));
const intFmt = (suffix = '') => (v: number) => Math.round(v).toLocaleString('pt-BR') + suffix;

// ── Stat com count-up ───────────────────────────────────────────────────────
function Stat({
  label,
  value,
  format,
  accent,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  accent?: boolean;
}) {
  const ref = useGsapCountUp<HTMLDivElement>(value, { format, duration: 1.5 });
  return (
    <div data-reveal className="flex-1 border-r border-border px-5 py-5 last:border-r-0">
      <div className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div
        ref={ref}
        className={cn(
          'mt-2.5 text-3xl font-medium tracking-tight tabular-nums',
          accent ? 'text-accent' : 'text-foreground',
        )}
      >
        0
      </div>
    </div>
  );
}

// ── Mini-gráfico de barras (height animada por GSAP) ────────────────────────
function Bars() {
  const ref = useRef<HTMLDivElement>(null);
  const heights = [40, 62, 48, 80, 66, 100];
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bars = el.querySelectorAll<HTMLElement>('[data-bar]');
    if (prefersReducedMotion()) {
      bars.forEach((b, i) => (b.style.height = `${heights[i]}%`));
      return;
    }
    const tw = gsap.fromTo(
      bars,
      { height: '0%' },
      { height: (i) => `${heights[i]}%`, duration: 1.1, ease: 'power3.out', stagger: 0.07, delay: 0.4 },
    );
    return () => {
      tw.kill();
    };
  }, []);
  return (
    <div ref={ref} className="flex h-[72px] max-w-[300px] flex-1 items-end gap-[7px]">
      {heights.map((_, i) => (
        <div
          key={i}
          data-bar
          className={cn(
            'flex-1 rounded-t-[3px]',
            i === heights.length - 1
              ? 'bg-gradient-to-b from-accent to-primary'
              : 'bg-[#1b212c]',
          )}
          style={{ height: 0 }}
        />
      ))}
    </div>
  );
}

// ── CTA magnético ───────────────────────────────────────────────────────────
function MagneticCTA() {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      gsap.to(el, {
        x: (e.clientX - r.left - r.width / 2) * 0.18,
        y: (e.clientY - r.top - r.height / 2) * 0.28,
        duration: 0.35,
      });
    };
    const leave = () => gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.45)' });
    const down = () => gsap.to(el, { scale: 0.96, duration: 0.1 });
    const up = () => gsap.to(el, { scale: 1, duration: 0.2, ease: 'back.out(2)' });
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    return () => {
      el.removeEventListener('mousemove', move);
      el.removeEventListener('mouseleave', leave);
      el.removeEventListener('mousedown', down);
      el.removeEventListener('mouseup', up);
    };
  }, []);
  return (
    <Button ref={ref} size="lg">
      Ver análise completa
    </Button>
  );
}

// ── Glow flutuante ──────────────────────────────────────────────────────────
function Glow() {
  const g1 = useRef<HTMLDivElement>(null);
  const g2 = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const t1 = gsap.to(g1.current, { x: 28, y: 36, duration: 12, ease: 'sine.inOut', repeat: -1, yoyo: true });
    const t2 = gsap.to(g2.current, { x: -22, y: -26, duration: 14, ease: 'sine.inOut', repeat: -1, yoyo: true });
    return () => {
      t1.kill();
      t2.kill();
    };
  }, []);
  return (
    <>
      <div
        ref={g1}
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-28 h-[380px] w-[380px] rounded-full blur-[80px]"
        style={{ background: 'radial-gradient(circle, #2563eb66, transparent 70%)' }}
      />
      <div
        ref={g2}
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-16 h-[340px] w-[340px] rounded-full blur-[80px]"
        style={{ background: 'radial-gradient(circle, #1e3a8a55, transparent 70%)' }}
      />
    </>
  );
}

export default function V3Showcase() {
  return (
    <div className="v3-root min-h-screen w-full font-sans antialiased flex items-center justify-center p-4 sm:p-8">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card p-8 sm:p-10">
        <Glow />
        <RevealContainer className="relative z-10">
          {/* Topbar */}
          <div
            data-reveal
            className="flex items-center justify-between border-b border-border pb-4"
          >
            <div className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.24em] text-foreground">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] text-[12px] font-black text-white">
                K
              </span>
              Kaizen Axis
            </div>
            <div className="flex items-center gap-3.5">
              <span className="text-[11px] tracking-wide text-muted-foreground">Relatório · Jun 2026</span>
              <span className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                Buscar <span className="font-semibold text-accent">⌘K</span>
              </span>
            </div>
          </div>

          {/* Hero */}
          <p data-reveal className="mt-8 text-[10px] font-semibold uppercase tracking-[0.26em] text-accent">
            Plataforma imobiliária
          </p>
          <h1
            data-reveal
            className="v3-serif mt-4 text-[40px] sm:text-[50px] font-normal leading-none tracking-tight text-foreground"
          >
            Inteligência
            <br />
            <em className="italic text-accent">em tempo real</em>
          </h1>
          <p data-reveal className="mt-4 max-w-[460px] text-[15px] leading-relaxed text-muted-foreground">
            Pipeline, comissões e metas da equipe com a clareza de um relatório premium — e a fluidez
            de um produto moderno.
          </p>

          {/* Métricas */}
          <div data-reveal className="mt-8 flex border-y border-border">
            <Stat label="VGV do mês" value={2400000} format={brl} accent />
            <Stat label="Vendas" value={128} format={intFmt()} />
            <Stat label="Meta atingida" value={94} format={intFmt('%')} />
            <Stat label="Clientes ativos" value={312} format={intFmt()} />
          </div>

          {/* Gráfico + CTA */}
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div data-reveal>
              <Bars />
            </div>
            <div data-reveal className="flex items-center gap-3.5">
              <MagneticCTA />
              <Button variant="outline">Exportar</Button>
            </div>
          </div>
        </RevealContainer>
      </div>
    </div>
  );
}
