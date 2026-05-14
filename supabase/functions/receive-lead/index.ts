// @ts-nocheck — Deno types are not available in the local TS checker; valid at runtime.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const WEBHOOK_SECRET  = Deno.env.get('LEAD_WEBHOOK_SECRET');
const N8N_WEBHOOK_URL = Deno.env.get('N8N_LEAD_CREATED_WEBHOOK_URL');

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '*';
const corsHeaders = {
  'Access-Control-Allow-Origin':  CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Webhook-Signature, X-Webhook-Timestamp',
  'Vary': 'Origin',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// ── HMAC-SHA256 helpers (Web Crypto — available in Deno) ──────────────────────
async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function computeHmacHex(key: CryptoKey, data: string): Promise<string> {
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time hex comparison to prevent timing attacks. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ── Replay cache (in-memory, scoped to this isolate) ─────────────────────────
// Keeps seen signatures for up to MAX_REPLAY_SECONDS to block replays within
// the timestamp window. The isolate restarts periodically, so this is a
// best-effort guard that complements the timestamp window.
const SEEN_SIGNATURES = new Map<string, number>(); // sig -> seen_at (unix ms)
const MAX_TIMESTAMP_SKEW_SECONDS = 300; // 5 minutes

function pruneSeenSignatures() {
  const cutoff = Date.now() - MAX_TIMESTAMP_SKEW_SECONDS * 1_000;
  for (const [k, v] of SEEN_SIGNATURES) {
    if (v < cutoff) SEEN_SIGNATURES.delete(k);
  }
}

// ── Edge Function ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!WEBHOOK_SECRET) {
    console.error('[receive-lead] LEAD_WEBHOOK_SECRET is not configured');
    return jsonResponse({ error: 'Webhook secret is not configured' }, 500);
  }

  // ── 1. Read raw body (needed for HMAC verification before parsing JSON) ─────
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse({ error: 'Failed to read request body' }, 400);
  }

  // ── 2. Timestamp validation ───────────────────────────────────────────────
  const tsHeader = req.headers.get('X-Webhook-Timestamp');
  if (!tsHeader) {
    return jsonResponse({ error: 'Missing X-Webhook-Timestamp header' }, 401);
  }
  const ts = parseInt(tsHeader, 10);
  if (!Number.isFinite(ts)) {
    return jsonResponse({ error: 'Invalid X-Webhook-Timestamp value' }, 401);
  }
  const nowSeconds = Math.floor(Date.now() / 1_000);
  if (Math.abs(nowSeconds - ts) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return jsonResponse({ error: 'Request timestamp expired or too far in the future' }, 401);
  }

  // ── 3. HMAC-SHA256 signature verification ─────────────────────────────────
  // Expected header: X-Webhook-Signature: sha256=<hex>
  // Signed payload:  "<timestamp>.<rawBody>"
  const sigHeader = req.headers.get('X-Webhook-Signature');
  if (!sigHeader || !sigHeader.startsWith('sha256=')) {
    return jsonResponse({ error: 'Missing or malformed X-Webhook-Signature header' }, 401);
  }
  const receivedHex = sigHeader.slice(7); // strip "sha256="

  let hmacKey: CryptoKey;
  try {
    hmacKey = await importHmacKey(WEBHOOK_SECRET);
  } catch {
    return jsonResponse({ error: 'Server error initialising HMAC key' }, 500);
  }

  const expectedHex = await computeHmacHex(hmacKey, `${ts}.${rawBody}`);
  if (!safeCompare(expectedHex, receivedHex)) {
    return jsonResponse({ error: 'Invalid webhook signature' }, 401);
  }

  // ── 4. Replay protection ──────────────────────────────────────────────────
  pruneSeenSignatures();
  if (SEEN_SIGNATURES.has(receivedHex)) {
    return jsonResponse({ error: 'Duplicate request detected' }, 409);
  }
  SEEN_SIGNATURES.set(receivedHex, Date.now());

  // ── 5. Parse body ─────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { name, phone, origin, ai_summary, ai_metadata, directorate_id } = body as any;

  if (!name || !phone) {
    return jsonResponse({ error: 'name and phone are required' }, 422);
  }

  // ── 6. Persist lead ───────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  try {
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert([{
        name,
        phone,
        origin: origin || 'whatsapp',
        ai_summary: ai_summary || null,
        ai_metadata: ai_metadata || null,
        directorate_id: directorate_id || null,
        stage: 'novo_lead',
        assigned_to: null,
        distribution_status: 'aguardando_distribuicao',
        interest_level: (ai_metadata as any)?.priority === 'alta' ? 'Alto'
          : (ai_metadata as any)?.priority === 'media' ? 'Médio' : 'Baixo',
      }])
      .select()
      .single();

    if (error) throw error;

    // ── Disparar workflow de distribuição no n8n (fire-and-forget) ────────────
    if (N8N_WEBHOOK_URL) {
      fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id:        newLead.id,
          lead_name:      newLead.name,
          lead_phone:     newLead.phone,
          directorate_id: newLead.directorate_id,
        }),
      }).catch((err: Error) => console.error('[n8n trigger error]', err.message));
    } else {
      console.warn('[receive-lead] N8N_LEAD_CREATED_WEBHOOK_URL não configurada — distribuição não disparada.');
    }

    return jsonResponse({
      success: true,
      lead_id: newLead.id,
      distribution_status: 'aguardando_distribuicao',
      note: 'Distribuição em andamento via n8n.',
    });
  } catch (e: any) {
    console.error('[receive-lead] Error inserting lead:', e);
    return jsonResponse({ error: e.message || 'Internal error' }, 500);
  }
});
