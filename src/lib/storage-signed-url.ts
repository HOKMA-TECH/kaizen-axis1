function publicOriginFrom(baseUrl?: string): string | null {
  const raw = String(baseUrl || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function rewriteSignedUrlForBrowser(
  signedUrl: string,
  publicBaseUrl: string = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_URL || '',
): string {
  const publicOrigin = publicOriginFrom(publicBaseUrl);
  if (!publicOrigin) return signedUrl;

  try {
    const parsed = new URL(signedUrl);
    if (parsed.origin === publicOrigin) return signedUrl;
    return `${publicOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return signedUrl;
  }
}
