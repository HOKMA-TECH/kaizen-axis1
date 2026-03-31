const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
import { supabase } from '@/lib/supabase';

export type RateLimitScope = 'login' | 'clients_query' | 'document_upload';

interface RateGuardOptions {
  userId?: string | null;
}

class RateLimiter {
  private endpoint: string | null;

  constructor() {
    this.endpoint = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/rate-guard` : null;
  }

  async enforce(scope: RateLimitScope, opts?: RateGuardOptions) {
    if (!this.endpoint || !SUPABASE_ANON_KEY) return;

    try {
      let authHeader: string | null = null;
      if (scope !== 'login') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          authHeader = `Bearer ${session.access_token}`;
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      };
      if (authHeader) headers.Authorization = authHeader;

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          scope,
          userId: opts?.userId ?? null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data?.message || 'Limite de requisições atingido. Aguarde antes de tentar novamente.';
        if (res.status === 429) {
          throw new Error(message);
        }
        if (scope === 'login') {
          throw new Error(message || 'Serviço de segurança indisponível. Tente novamente em instantes.');
        }
        console.warn('[rate-limit] Falha ao validar limite:', message);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Limite de requisições')) {
        throw err;
      }
      // Fail-closed para login: se a edge function cair, bloqueia em vez de permitir
      if (scope === 'login') {
        throw new Error('Serviço de segurança indisponível. Tente novamente em instantes.');
      }
      console.warn('[rate-limit] Falha ao contactar rate guard', err);
    }
  }
}

export const rateLimiter = new RateLimiter();
