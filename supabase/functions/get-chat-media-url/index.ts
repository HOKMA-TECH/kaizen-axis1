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

const SIGNED_URL_TTL = 3600; // 1 hour
const RATE_LIMIT_PER_MIN = 120; // generous — one per message load

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

  // ── Rate limit ────────────────────────────────────────────────────────────
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const { data: rateCount, error: rateErr } = await adminClient.rpc('increment_request_counter', {
    _scope: 'get_chat_media_url',
    _identifier: user.id,
    _window_start: windowStart,
  });
  if (rateErr || (rateCount ?? 0) >= RATE_LIMIT_PER_MIN) {
    return jsonResponse({ error: 'Muitas requisições. Aguarde.' }, 429);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  const path = typeof body.path === 'string' ? body.path.trim() : '';
  if (!path) return jsonResponse({ error: 'path obrigatório' }, 400);

  // Extract conversationId = first path segment
  // DM format:    ${uuid1}-${uuid2}/${uuid}.ext  (two UUIDs joined with -)
  // Group format: group-${uuid}/${uuid}.ext
  const conversationId = path.split('/')[0];
  // Validate: only alphanumeric, hyphens allowed — no slashes, dots, or traversal
  if (!conversationId || !/^[a-zA-Z0-9_-]+$/.test(conversationId)) {
    return jsonResponse({ error: 'Path inválido' }, 400);
  }

  // ── Validate conversation membership ──────────────────────────────────────
  // DM: user is sender or receiver in any message in this conversation
  const { data: dmAccess } = await adminClient
    .from('chat_messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .limit(1);

  // Group: conversationId is "group-${uuid}", group_id in DB is the raw UUID
  const groupUuid = conversationId.startsWith('group-') ? conversationId.slice(6) : null;
  const { data: groupAccess } = groupUuid ? await adminClient
    .from('chat_group_members')
    .select('user_id')
    .eq('group_id', groupUuid)
    .eq('user_id', user.id)
    .limit(1) : { data: null };

  if (!dmAccess?.length && !groupAccess?.length) {
    console.warn('[get-chat-media-url] unauthorized access attempt by', user.id, 'for conversation', conversationId);
    return jsonResponse({ error: 'Acesso não autorizado a este arquivo' }, 403);
  }

  // ── Generate signed URL via service role ──────────────────────────────────
  const { data: signed, error: signErr } = await adminClient.storage
    .from('chat-media')
    .createSignedUrl(path, SIGNED_URL_TTL);

  if (signErr || !signed?.signedUrl) {
    console.error('[get-chat-media-url] sign error:', signErr?.message);
    return jsonResponse({ error: 'Falha ao gerar link do arquivo' }, 500);
  }

  return jsonResponse({ signedUrl: signed.signedUrl });
});
