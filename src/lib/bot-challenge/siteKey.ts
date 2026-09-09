export type ViteLikeEnv = {
  PROD?: boolean;
  VITE_TURNSTILE_SITE_KEY?: string;
};

export function getTurnstileSiteKey(env: ViteLikeEnv): string {
  const key = String(env.VITE_TURNSTILE_SITE_KEY || '').trim();
  if (env.PROD && !key) {
    throw new Error('VITE_TURNSTILE_SITE_KEY is required in production');
  }
  return key;
}
