import { useGsapCountUp } from '@/lib/motion';

/**
 * Número com contagem animada (GSAP) ao entrar. Reaproveita o primitivo
 * useGsapCountUp. `pad` preenche com zero à esquerda (ex.: 2 → "02").
 */
export function CountNumber({
  value,
  className,
  pad,
}: {
  value: number;
  className?: string;
  pad?: number;
}) {
  const ref = useGsapCountUp<HTMLSpanElement>(value, {
    duration: 0.9,
    format: (v) => {
      const n = Math.round(v).toString();
      return pad ? n.padStart(pad, '0') : n;
    },
  });
  return (
    <span ref={ref} className={className}>
      {pad ? '0'.padStart(pad, '0') : '0'}
    </span>
  );
}
