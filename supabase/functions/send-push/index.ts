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
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    const userRole = String(profile?.role || '').toUpperCase();
    if (profileError || !ALLOWED_ROLES.has(userRole)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const body = await req.json();
    const notification = body.record ?? body.notification ?? body;

    const targetUserId = notification.target_user_id;
    if (!targetUserId) return new Response('no target_user_id', { status: 200 });

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', targetUserId);

    if (!subs?.length) return new Response('no subscriptions', { status: 200 });

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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('send-push error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
