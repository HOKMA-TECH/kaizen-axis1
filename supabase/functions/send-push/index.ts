// ─── send-push Edge Function ──────────────────────────────────────────────────
// Recebe { notification } no body e envia Web Push para todos os dispositivos
// do usuário alvo usando VAPID.
//
// Variáveis de ambiente necessárias (Supabase Secrets):
//   VAPID_PUBLIC_KEY   — chave pública P-256 em base64url (65 bytes)
//   VAPID_PRIVATE_KEY  — chave privada P-256 em base64url (32 bytes)
//   VAPID_MAILTO       — ex: mailto:admin@seudominio.com
//   SUPABASE_URL       — preenchida automaticamente pelo Supabase
//   SUPABASE_SERVICE_ROLE_KEY — preenchida automaticamente pelo Supabase
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_MAILTO      = Deno.env.get('VAPID_MAILTO') ?? 'mailto:admin@kaizenaxis.com';
const ALLOWED_ROLES = new Set(['ADMIN', 'DIRETOR', 'GERENTE']);
const MAX_PUSH_REQUESTS_PER_MINUTE = 20;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PushNotificationPayload = {
  target_user_id: string;
  title?: string;
  message?: string;
  reference_route?: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function badRequest(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });
}

function normalizeNotification(body: unknown): PushNotificationPayload | null {
  const root = (body && typeof body === 'object') ? (body as Record<string, unknown>) : null;
  const candidate = root?.record ?? root?.notification ?? root;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;

  const notification = candidate as Record<string, unknown>;
  const allowedKeys = new Set(['target_user_id', 'title', 'message', 'reference_route']);
  const hasUnexpectedKey = Object.keys(notification).some((k) => !allowedKeys.has(k));
  if (hasUnexpectedKey) return null;

  const target = String(notification.target_user_id || '').trim();
  if (!target || !UUID_REGEX.test(target)) return null;

  const title = notification.title == null ? undefined : String(notification.title);
  const message = notification.message == null ? undefined : String(notification.message);
  const route = notification.reference_route == null ? undefined : String(notification.reference_route);

  return {
    target_user_id: target,
    title,
    message,
    reference_route: route,
  };
}

// ── Helpers base64url ─────────────────────────────────────────────────────────
function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    b64url.length + (4 - (b64url.length % 4)) % 4, '='
  );
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Cria JWT VAPID assinado com ES256 ─────────────────────────────────────────
async function createVapidJwt(audience: string): Promise<string> {
  const header  = { alg: 'ES256', typ: 'JWT' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_MAILTO,
  };
  const encode   = (obj: object) => bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)));
  const sigInput = `${encode(header)}.${encode(payload)}`;

  // Extrai coordenadas x e y do ponto não comprimido da chave pública (04 || x || y)
  const pubBytes = b64urlToBytes(VAPID_PUBLIC_KEY); // 65 bytes: 0x04 + x(32) + y(32)
  const x = bytesToB64url(pubBytes.slice(1, 33));
  const y = bytesToB64url(pubBytes.slice(33, 65));

  const privKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: VAPID_PRIVATE_KEY, x, y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    new TextEncoder().encode(sigInput)
  );

  return `${sigInput}.${bytesToB64url(new Uint8Array(sig))}`;
}

// ── Envia Web Push para uma subscription ─────────────────────────────────────
async function sendWebPush(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string): Promise<void> {
  const url      = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt      = await createVapidJwt(audience);

  const response = await fetch(subscription.endpoint, {
    method:  'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type':  'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: await encryptPayload(subscription.keys, payload),
  });

  if (!response.ok && response.status !== 201) {
    const text = await response.text().catch(() => '');
    throw new Error(`Push failed ${response.status}: ${text}`);
  }
}

// ── Encriptação AES-128-GCM + ECDH (RFC 8291) ────────────────────────────────
async function encryptPayload(
  keys: { p256dh: string; auth: string },
  plaintext: string
): Promise<Uint8Array> {
  const authSecret = b64urlToBytes(keys.auth);            // 16 bytes
  const receiverPubRaw = b64urlToBytes(keys.p256dh);      // 65 bytes (04 x y)

  // Importa chave pública do receptor
  const receiverPub = await crypto.subtle.importKey(
    'raw', receiverPubRaw,
    { name: 'ECDH', namedCurve: 'P-256' }, true, []
  );

  // Gera par efêmero
  const senderPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const senderPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', senderPair.publicKey));

  // Deriva segredo compartilhado (256 bits)
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverPub }, senderPair.privateKey, 256
  ));

  // salt aleatório de 16 bytes
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK via HKDF-SHA256
  const concat = (...arrs: Uint8Array[]) => {
    const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
    let offset = 0;
    for (const a of arrs) { out.set(a, offset); offset += a.length; }
    return out;
  };
  const hkdfExtract = async (ikm: Uint8Array, salt: Uint8Array) => {
    const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
  };
  const hkdfExpand = async (prk: Uint8Array, info: Uint8Array, length: number) => {
    const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const t    = new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(info, new Uint8Array([1]))));
    return t.slice(0, length);
  };

  const keyInfo  = concat(new TextEncoder().encode('Content-Encoding: aes128gcm\0'), new Uint8Array([0]), new Uint8Array([16]));
  const nonceInfo = concat(new TextEncoder().encode('Content-Encoding: nonce\0'), new Uint8Array([0]), new Uint8Array([12]));

  // ikm = PRK via auth
  const prkCombine = concat(
    new TextEncoder().encode('WebPush: info\0'),
    receiverPubRaw, senderPubRaw
  );
  const prk  = await hkdfExtract(ecdhSecret, authSecret);
  const ikm  = await hkdfExpand(prk, prkCombine, 32);
  const prk2 = await hkdfExtract(ikm, salt);

  const contentKey   = await hkdfExpand(prk2, keyInfo,   16);
  const contentNonce = await hkdfExpand(prk2, nonceInfo, 12);

  // Importa chave AES-GCM
  const aesKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, ['encrypt']);

  // Payload com padding (record size 4096)
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const rs = 4096;
  const paddedContent  = concat(plaintextBytes, new Uint8Array([2])); // delimiter byte
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: contentNonce, tagLength: 128 }, aesKey, paddedContent
  ));

  // Monta header RFC 8291: salt(16) + rs(4) + keyid_len(1) + keyid(65) + ciphertext
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = 65;
  header.set(senderPubRaw, 21);

  return concat(header, encrypted);
}

// ─── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return badRequest('Method not allowed', 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      return badRequest('Unauthorized', 401);
    }

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;

    if (claimsError || !userId) {
      return badRequest('Unauthorized', 401);
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    const userRole = String(profile?.role || '').toUpperCase();
    if (profileError || !ALLOWED_ROLES.has(userRole)) {
      return badRequest('Forbidden', 403);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest('Invalid JSON body', 400);
    }

    const notification = normalizeNotification(body);
    if (!notification) {
      return badRequest('Invalid payload. Expected notification.target_user_id (UUID) and supported fields only.', 422);
    }

    const { data: throttleData, error: throttleError } = await supabase.rpc('increment_request_counter', {
      _scope: 'send_push',
      _identifier: `${userId}:${notification.target_user_id}`,
      _max_requests: MAX_PUSH_REQUESTS_PER_MINUTE,
      _window_seconds: 60,
    });

    if (throttleError) {
      console.error('send-push rate-limit error:', throttleError.message);
      return badRequest('Rate limit unavailable', 503);
    }

    if ((throttleData ?? 0) > MAX_PUSH_REQUESTS_PER_MINUTE) {
      return badRequest('Too many requests', 429);
    }

    const targetUserId = notification.target_user_id;

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', targetUserId);

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, failed: 0, note: 'no subscriptions' }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    const payload = JSON.stringify({
      title: notification.title   ?? 'Kaizen Axis',
      body:  notification.message ?? 'Nova notificação',
      url:   notification.reference_route ?? '/',
    });

    const results = await Promise.allSettled(
      subs.map(({ subscription }) => sendWebPush(subscription, payload))
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) {
      console.error('Push failures:', failed.map(f => (f as any).reason?.message));
    }

    return new Response(JSON.stringify({ sent: subs.length, failed: failed.length }), {
      headers: JSON_HEADERS,
    });
  } catch (err) {
    console.error('send-push error:', err);
    return badRequest('Internal error', 500);
  }
});
