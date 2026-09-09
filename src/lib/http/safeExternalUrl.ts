export function toSafeExternalUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export function openSafeExternalUrl(raw: string | null | undefined): boolean {
  const href = toSafeExternalUrl(raw);
  if (!href || typeof window === 'undefined') return false;
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}
