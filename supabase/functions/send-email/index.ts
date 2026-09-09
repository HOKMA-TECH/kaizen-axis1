// @ts-nocheck — Deno types are not available in the local TS checker; valid at runtime.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { assertActiveProfile } from '../_shared/requireActiveProfile.ts';

const CORS_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '';
const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Vary': 'Origin',
};

const MAX_RECIPIENTS = 5;
const MAX_ATTACHMENTS = 20;
const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024; // 40 MB total (base64 ~33% overhead)
const RATE_LIMIT_PER_MIN = 5;
const DAILY_LIMIT = 50;
// Conservative email regex: local@domain.tld — avoids obvious junk
const EMAIL_RE = /^[^\s@"<>()[\],;:\\]+@[^\s@"<>()[\],;:\\]+\.[^\s@"<>()[\],;:\\]{2,}$/;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function normalizeStoragePath(rawPath: string): string {
  const PUBLIC_MARKER = '/object/public/client-documents/';
  const SIGN_MARKER = '/object/sign/client-documents/';
  let path = String(rawPath || '').trim();
  if (path.includes(PUBLIC_MARKER)) {
    path = path.split(PUBLIC_MARKER)[1] || '';
  } else if (path.includes(SIGN_MARKER)) {
    path = (path.split(SIGN_MARKER)[1] || '').split('?')[0] || '';
  }
  return path.replace(/^\/+/, '');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function downloadFirstExistingPath(adminClient: any, rawPath: string, clientId: string) {
  const base = normalizeStoragePath(rawPath);
  const candidates = new Set<string>();
  if (base) candidates.add(base);
  try {
    const decoded = decodeURIComponent(base);
    if (decoded) candidates.add(decoded);
  } catch { /* ignore */ }
  if (base && !base.includes('/') && clientId) {
    candidates.add(`${clientId}/${base}`);
  }
  for (const candidate of candidates) {
    const { data, error } = await adminClient.storage.from('client-documents').download(candidate);
    if (!error && data) return { blob: data, path: candidate };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  // ── JWT auth (required) ───────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'JWT obrigatório', resend_ok: false }, 401);
  }
  const token = authHeader.slice(7);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'Configuração do servidor ausente', resend_ok: false }, 500);
  }
  if (!resendApiKey) {
    return jsonResponse({ error: 'Serviço de e-mail não configurado', resend_ok: false }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'Não autorizado', resend_ok: false }, 401);
  }
  const active = await assertActiveProfile(userClient, user.id);
  if (!active.ok) {
    return jsonResponse({ error: active.message, resend_ok: false }, active.status);
  }

  // ── Rate limit: 5 emails/min por usuário ──────────────────────────────────
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const { data: rateCount, error: rateErr } = await adminClient.rpc('increment_request_counter', {
    _scope: 'send_email',
    _identifier: user.id,
    _window_start: windowStart,
  });
  if (rateErr || (rateCount ?? 0) >= RATE_LIMIT_PER_MIN) {
    if (rateErr) console.warn('[send-email] rate-limit rpc failed:', rateErr.message);
    return jsonResponse({ error: 'Limite de envio atingido. Aguarde 1 minuto.', resend_ok: false }, 429);
  }

  // ── Daily quota: 50 e-mails/dia por usuário ───────────────────────────────
  const dayStart = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString();
  const { data: dayCount, error: dayErr } = await adminClient.rpc('increment_request_counter', {
    _scope: 'send_email_daily',
    _identifier: user.id,
    _window_start: dayStart,
  });
  if (dayErr || (dayCount ?? 0) >= DAILY_LIMIT) {
    if (dayErr) console.warn('[send-email] daily quota rpc failed:', dayErr.message);
    return jsonResponse({ error: 'Cota diária de e-mails atingida.', resend_ok: false }, 429);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    text?: string;
    attachments?: { filename: string; content: string }[];
    documentIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido', resend_ok: false }, 400);
  }

  const to = Array.isArray(body.to) ? body.to.filter(e => typeof e === 'string' && EMAIL_RE.test(e.trim())) : [];
  const cc = Array.isArray(body.cc) ? body.cc.filter(e => typeof e === 'string' && EMAIL_RE.test(e.trim())) : [];
  const bcc = Array.isArray(body.bcc) ? body.bcc.filter(e => typeof e === 'string' && EMAIL_RE.test(e.trim())) : [];
  const subject = String(body.subject || '').trim().slice(0, 200);
  const text = String(body.text || '').trim().slice(0, 50_000);

  if (to.length === 0) return jsonResponse({ error: 'Destinatário obrigatório', resend_ok: false }, 400);
  if (!subject) return jsonResponse({ error: 'Assunto obrigatório', resend_ok: false }, 400);
  if (!text) return jsonResponse({ error: 'Corpo do e-mail obrigatório', resend_ok: false }, 400);
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
    return jsonResponse({ error: `Máximo de ${MAX_RECIPIENTS} destinatários`, resend_ok: false }, 400);
  }

  // ── Attachment validation ─────────────────────────────────────────────────
  const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
  const documentIds = Array.isArray(body.documentIds)
    ? [...new Set(body.documentIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))]
    : [];
  if (rawAttachments.length + documentIds.length > MAX_ATTACHMENTS) {
    return jsonResponse({ error: `Máximo de ${MAX_ATTACHMENTS} anexos`, resend_ok: false }, 400);
  }

  let totalBytes = 0;
  const attachments: { filename: string; content: string }[] = [];
  for (const att of rawAttachments) {
    if (typeof att.filename !== 'string' || typeof att.content !== 'string') continue;
    const estimated = Math.ceil(att.content.length * 0.75);
    totalBytes += estimated;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return jsonResponse({ error: 'Anexos excedem o tamanho máximo permitido (40 MB)', resend_ok: false }, 400);
    }
    const safeFilename = att.filename.replace(/[^\w.\-]/g, '_').slice(0, 100);
    attachments.push({ filename: safeFilename, content: att.content });
  }

  for (const documentId of documentIds) {
    const { data: allowedDoc, error: allowedErr } = await userClient
      .from('client_documents')
      .select('id, client_id, url, name')
      .eq('id', documentId)
      .maybeSingle();
    if (allowedErr) {
      return jsonResponse({ error: 'Não foi possível anexar os documentos da ficha', resend_ok: false }, 500);
    }
    if (!allowedDoc) {
      return jsonResponse({ error: 'Acesso negado a um documento da ficha', resend_ok: false }, 403);
    }
    const downloaded = await downloadFirstExistingPath(
      adminClient,
      String(allowedDoc.url || ''),
      String(allowedDoc.client_id || ''),
    );
    if (!downloaded) {
      return jsonResponse({ error: `Não foi possível anexar ${allowedDoc.name || 'um documento da ficha'}`, resend_ok: false }, 400);
    }
    const bytes = new Uint8Array(await downloaded.blob.arrayBuffer());
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return jsonResponse({ error: 'Anexos excedem o tamanho máximo permitido (40 MB)', resend_ok: false }, 400);
    }
    const fallbackName = downloaded.path.split('/').pop() || 'documento';
    const safeFilename = String(allowedDoc.name || fallbackName).replace(/[^\w.\-]/g, '_').slice(0, 100);
    attachments.push({ filename: safeFilename, content: bytesToBase64(bytes) });
  }

  const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL');
  if (!RESEND_FROM) {
    return jsonResponse({ error: 'Serviço de e-mail não configurado', resend_ok: false }, 503);
  }

  const resendPayload: Record<string, unknown> = {
    from: RESEND_FROM,
    to,
    subject,
    text,
  };
  if (cc.length > 0) resendPayload.cc = cc;
  if (bcc.length > 0) resendPayload.bcc = bcc;
  if (attachments.length > 0) resendPayload.attachments = attachments;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });

    const resendData = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      console.error('[send-email] resend error', resendRes.status, resendData);
      return jsonResponse({
        error: resendData?.message || `Erro ao enviar e-mail (${resendRes.status})`,
        resend_ok: false,
        resend_data: resendData,
      }, 502);
    }

    return jsonResponse({ resend_ok: true, resend_data: resendData, attached: attachments.length });
  } catch (e: any) {
    console.error('[send-email] fetch error', e);
    return jsonResponse({ error: 'Falha ao conectar ao serviço de e-mail', resend_ok: false }, 502);
  }
});
