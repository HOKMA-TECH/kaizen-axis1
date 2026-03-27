// @ts-nocheck - Edge runtime types loaded via import below.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

type AuditPayload = {
  action?: string;
  entity?: string;
  entityId?: string;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info'
};

const inMemoryRateLimiter = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60 * 1000;
const MAX_EVENTS_PER_WINDOW = 120;

function errJson(message: string, status = 400) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function getIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || '0.0.0.0';
  }
  return '0.0.0.0';
}

function normalizeText(value: string, max = 64) {
  return value.trim().slice(0, max);
}

function recordLocalHit(key: string) {
  const bucket = inMemoryRateLimiter.get(key);
  const now = Date.now();
  if (!bucket || bucket.reset <= now) {
    inMemoryRateLimiter.set(key, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= MAX_EVENTS_PER_WINDOW) {
    return false;
  }
  bucket.count += 1;
  inMemoryRateLimiter.set(key, bucket);
  return true;
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

  let body: AuditPayload;
  try {
    body = await req.json();
  } catch {
    return errJson('JSON inválido');
  }

  const action = body.action ? normalizeText(body.action, 80) : '';
  const entity = body.entity ? normalizeText(body.entity, 80) : '';
  if (!action || !entity) {
    return errJson('action e entity são obrigatórios');
  }

  const ip = getIp(req);
  if (!recordLocalHit(`${ip}|audit`)) {
    return errJson('Taxa de eventos excedida. Aguarde alguns segundos.', 429);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return errJson('Configuração do Supabase ausente', 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  const metadata = body.metadata && typeof body.metadata === 'object'
    ? body.metadata
    : {};
  const sanitizedMetadata = JSON.parse(JSON.stringify(metadata));
  const payload = {
    user_id: body.userId ?? null,
    action,
    entity,
    entity_id: body.entityId ?? null,
    ip_address: ip,
    device_info: req.headers.get('user-agent') || 'unknown',
    metadata: sanitizedMetadata
  };

  const { error } = await supabaseAdmin.from('audit_logs').insert(payload);
  if (error) {
    console.error('Erro ao gravar audit log', error);
    return errJson('Falha ao gravar evento de auditoria', 500);
  }

  return new Response(JSON.stringify({ status: 'logged' }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
