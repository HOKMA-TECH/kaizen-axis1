// @ts-nocheck - Deno types are not available in the local TS checker; valid at runtime.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Signed URL TTL: 30 seconds. The DB marks the message as opened before this
// URL is returned, so the frontend must snapshot it for playback.
const VIEW_ONCE_TTL = 30;

const CORS_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '';
const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Vary': 'Origin',
};

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
    return jsonResponse({ error: 'Metodo nao permitido' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Nao autorizado' }, 401);
  }
  const token = authHeader.slice(7);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'Configuracao do servidor ausente' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'Nao autorizado' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const voWindowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const { data: voCount, error: voRateErr } = await adminClient.rpc('increment_request_counter', {
    _scope: 'view_once_url',
    _identifier: user.id,
    _window_start: voWindowStart,
  });
  if (voRateErr || (voCount ?? 0) >= 60) {
    if (voRateErr) console.warn('[generate-view-once-url] rate-limit rpc failed:', voRateErr.message);
    return jsonResponse({ error: 'Limite de requisicoes atingido. Aguarde 1 minuto.' }, 429);
  }

  let body: { message_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalido' }, 400);
  }

  const messageId = String(body.message_id || '').trim();
  if (!messageId || !/^[0-9a-f-]{36}$/i.test(messageId)) {
    return jsonResponse({ error: 'message_id invalido' }, 400);
  }

  const { data: message, error: msgError } = await userClient
    .from('chat_messages')
    .select('id, sender_id, receiver_id, group_id, media_url, media_path, type, view_once, view_once_opened')
    .eq('id', messageId)
    .eq('view_once', true)
    .maybeSingle();

  if (msgError) {
    console.error('[generate-view-once-url] query error:', msgError.message);
    return jsonResponse({ error: 'Erro ao buscar mensagem' }, 500);
  }

  if (!message) {
    return jsonResponse({ error: 'Mensagem nao encontrada ou acesso negado' }, 404);
  }

  if (message.view_once_opened) {
    return jsonResponse({ error: 'Esta midia ja foi visualizada e nao esta mais disponivel.' }, 410);
  }

  // New uploads store the storage path in media_path. Older records may still
  // have the path in media_url, so keep the fallback for compatibility.
  const mediaPath = String(message.media_path || message.media_url || '').trim();
  if (!mediaPath) {
    return jsonResponse({ error: 'Midia nao disponivel' }, 404);
  }

  const { error: openErr } = await userClient
    .rpc('chat_open_view_once', { p_message_id: messageId });

  if (openErr) {
    console.error('[generate-view-once-url] chat_open_view_once error:', openErr.message);
    return jsonResponse({ error: 'Nao foi possivel abrir a midia. Tente novamente.' }, 500);
  }

  const buckets = ['chat-media-private', 'chat-media'];
  let signedUrl: string | null = null;

  for (const bucket of buckets) {
    const { data, error: signErr } = await adminClient.storage
      .from(bucket)
      .createSignedUrl(mediaPath, VIEW_ONCE_TTL);
    if (!signErr && data?.signedUrl) {
      signedUrl = data.signedUrl;
      break;
    }
  }

  if (!signedUrl) {
    return jsonResponse({ error: 'Nao foi possivel gerar o link da midia.' }, 500);
  }

  return jsonResponse({ signedUrl, expiresIn: VIEW_ONCE_TTL });
});
