import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from 0 → target on mount (and whenever target changes),
 * using an ease-out cubic curve. Returns the current animated value.
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(0);
      return;
    }
    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return value;
}
