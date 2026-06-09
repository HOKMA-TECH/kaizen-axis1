/**
 * True quando o usuário pediu menos movimento no SO/navegador.
 * SSR-safe: retorna false se `window`/`matchMedia` não existirem.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
