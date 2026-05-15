// @ts-nocheck — Deno types are not available in the local TS checker; valid at runtime.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '';
const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Vary': 'Origin',
};

const RATE_LIMIT_PER_MIN = 30;
const ALLOWED_TYPES = new Set(['chat', 'aviso', 'lead', 'meta', 'missao', 'tarefa', 'anuncio']);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  // ── JWT auth ──────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Não autorizado' }, 401);
  }
  const token = authHeader.slice(7);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'Configuração do servidor ausente' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'Não autorizado' }, 401);
  }

  // ── Rate limit: 30 notificações/min por usuário ───────────────────────────
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const { data: rateCount, error: rateErr } = await adminClient.rpc('increment_request_counter', {
    _scope: 'send_notification',
    _identifier: user.id,
    _window_start: windowStart,
  });
  if (rateErr || (rateCount ?? 0) >= RATE_LIMIT_PER_MIN) {
    if (rateErr) console.warn('[send-notification] rate-limit rpc failed:', rateErr.message);
    return jsonResponse({ error: 'Limite de notificações atingido. Aguarde 1 minuto.' }, 429);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    target_user_id?: string;
    target_user_ids?: string[];
    title?: string;
    message?: string;
    type?: string;
    reference_id?: string;
    reference_route?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  // Normalizar destinatários (aceita single ou batch)
  const rawIds: string[] = [];
  if (body.target_user_id && typeof body.target_user_id === 'string') rawIds.push(body.target_user_id);
  if (Array.isArray(body.target_user_ids)) {
    for (const id of body.target_user_ids) {
      if (typeof id === 'string') rawIds.push(id);
    }
  }

  // Validar UUIDs
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const targetIds = [...new Set(rawIds.filter(id => UUID_RE.test(id)))];

  if (targetIds.length === 0) return jsonResponse({ error: 'target_user_id inválido ou ausente' }, 400);
  if (targetIds.length > 50) return jsonResponse({ error: 'Máximo de 50 destinatários por chamada' }, 400);

  const title = String(body.title || '').trim().slice(0, 200);
  const message = String(body.message || '').trim().slice(0, 1000);
  const type = String(body.type || '').trim();

  if (!title) return jsonResponse({ error: 'title obrigatório' }, 400);
  if (!message) return jsonResponse({ error: 'message obrigatório' }, 400);
  if (!ALLOWED_TYPES.has(type)) return jsonResponse({ error: 'type inválido' }, 400);

  const reference_id = body.reference_id && UUID_RE.test(String(body.reference_id))
    ? String(body.reference_id)
    : null;
  const reference_route = body.reference_route
    ? String(body.reference_route).trim().slice(0, 200)
    : null;

  // ── Verificar que os destinatários são usuários reais no sistema ──────────
  const { data: profiles, error: profileErr } = await adminClient
    .from('profiles')
    .select('id')
    .in('id', targetIds);

  if (profileErr) {
    console.error('[send-notification] profile check error:', profileErr.message);
    return jsonResponse({ error: 'Erro ao verificar destinatários' }, 500);
  }

  const validIds = new Set((profiles ?? []).map((p: any) => p.id));
  const rows = targetIds
    .filter(id => validIds.has(id))
    .map(id => ({
      target_user_id: id,
      title,
      message,
      type,
      reference_id,
      reference_route,
    }));

  if (rows.length === 0) return jsonResponse({ error: 'Nenhum destinatário válido encontrado' }, 400);

  // ── Inserir via service role (bypassa RLS) ────────────────────────────────
  const { error: insertErr } = await adminClient.from('notifications').insert(rows);
  if (insertErr) {
    console.error('[send-notification] insert error:', insertErr.message);
    return jsonResponse({ error: 'Falha ao enviar notificação' }, 500);
  }

  return jsonResponse({ ok: true, sent: rows.length });
});
