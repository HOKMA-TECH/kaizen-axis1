const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

const SUPABASE_STORAGE_HOST = viteEnv?.VITE_SUPABASE_URL
  ? new URL(viteEnv.VITE_SUPABASE_URL).hostname
  : '';

export function isTrustedMediaUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'blob:') return true;
    return (
      parsed.hostname === SUPABASE_STORAGE_HOST &&
      (parsed.protocol === 'https:' || parsed.protocol === 'http:')
    );
  } catch {
    return false;
  }
}

export function isValidChatMediaConversationSegment(segment: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(segment);
}
