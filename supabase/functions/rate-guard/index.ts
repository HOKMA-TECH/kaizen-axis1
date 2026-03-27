// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

type RateGuardBody = {
  scope?: 'login' | 'clients_query' | 'document_upload';
  userId?: string | null;
};

const LIMITS: Record<string, { limit: number; windowSeconds: number }> = {
  login: { limit: 10, windowSeconds: 60 },
  clients_query: { limit: 60, windowSeconds: 60 },
  document_upload: { limit: 20, windowSeconds: 60 }
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info'
};

function errJson(message: string, status = 400) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function resolveIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
  if (!forwarded) return '0.0.0.0';
  return forwarded.split(',')[0]?.trim() || '0.0.0.0';
}

function truncateToWindow(date: Date, windowSeconds: number): string {
  const ms = Math.floor(date.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000;
  return new Date(ms).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errJson('Método não permitido', 405);
  }

  const apiKey = req.headers.get('apikey');
  const expectedKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!apiKey || !expectedKey || apiKey !== expectedKey) {
    return errJson('Não autorizado', 401);
  }

  let body: RateGuardBody;
  try {
    body = await req.json();
  } catch {
    return errJson('JSON inválido');
  }

  if (!body.scope || !LIMITS[body.scope]) {
    return errJson('Escopo inválido');
  }

  const config = LIMITS[body.scope];
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return errJson('Configuração do Supabase ausente', 500);
  }

  const identifier = body.scope === 'login'
    ? resolveIp(req)
    : (body.userId || resolveIp(req));

  if (!identifier) {
    return errJson('Identificador inválido', 400);
  }

  const windowStart = truncateToWindow(new Date(), config.windowSeconds);

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  const { data, error } = await supabaseAdmin.rpc('increment_request_counter', {
    _scope: body.scope,
    _identifier: identifier,
    _window_start: windowStart
  });

  if (error) {
    console.error('Erro ao incrementar contador de rate limit', error);
    return errJson('Falha ao aplicar limite', 500);
  }

  const count = typeof data === 'number' ? data : (data?.count ?? 0);
  if (count > config.limit) {
    return errJson('Limite de requisições atingido. Aguarde antes de tentar novamente.', 429);
  }

  return new Response(JSON.stringify({ allowed: true, remaining: Math.max(config.limit - count, 0) }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
