// @ts-nocheck — Deno types are not available in the local TS checker; valid at runtime.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ── Config ────────────────────────────────────────────────────────────────────
const OFFICE_LAT  = parseFloat(Deno.env.get('OFFICE_LATITUDE')  || '-23.5505');
const OFFICE_LNG  = parseFloat(Deno.env.get('OFFICE_LONGITUDE') || '-46.6333');
const MAX_RADIUS  = 50;   // metros — raio máximo da imobiliária
const MAX_ACCURACY = 30;  // metros — precisão mínima aceitável do GPS

// ── Haversine ─────────────────────────────────────────────────────────────────
// Fórmula exata para distância entre dois pontos GPS na superfície da Terra.
// Retorna distância em metros.
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R     = 6_371_000;
  const toRad = (d: number) => d * (Math.PI / 180);
  const φ1    = toRad(lat1);
  const φ2    = toRad(lat2);
  const Δφ    = toRad(lat2 - lat1);
  const Δλ    = toRad(lng2 - lng1);
  const a     = Math.sin(Δφ / 2) ** 2
              + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ── Hora BRT via Intl (correto para horário de verão e ajustes futuros) ──────
function getBRTHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour:     'numeric',
      hour12:   false,
    }).format(new Date()),
    10,
  );
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// ── Decode JWT payload sem chamada de rede ────────────────────────────────────
// O platform Supabase já validou a assinatura antes de rotear para cá.
// Apenas decodificamos o payload para obter o sub (user id) e exp.
function decodeJWTPayload(token: string): { sub?: string; exp?: number } | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const json   = atob(padded.padEnd(padded.length + (4 - padded.length % 4) % 4, '='));
    return JSON.parse(json);
  } catch { return null; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ── 1. Autenticação via JWT (decode local — sem chamada de rede) ──────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const rawToken = authHeader.replace(/^Bearer\s+/i, '');
  const payload  = decodeJWTPayload(rawToken);
  if (!payload?.sub) return json({ error: 'unauthorized' }, 401);

  // Verifica expiração (exp é em segundos)
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const userId = payload.sub;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // ── 2. Body ───────────────────────────────────────────────────────────────
  let body: { latitude: number; longitude: number; accuracy?: number; qrToken?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'invalid_json' }, 400); }

  const { latitude, longitude, accuracy, qrToken } = body;

  // ── 3. Validar coordenadas ────────────────────────────────────────────────
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return json({ error: 'coordenadas_ausentes', message: 'latitude e longitude são obrigatórios.' }, 422);
  }

  // Rejeitar coordenadas nulas ou impossíveis
  if (latitude === 0 && longitude === 0) {
    return json({ error: 'coordenadas_invalidas', message: 'GPS retornou coordenadas inválidas (0,0). Tente novamente.' }, 422);
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return json({ error: 'coordenadas_invalidas', message: 'Coordenadas GPS fora da faixa válida.' }, 422);
  }

  // ── 4. Validar precisão do GPS ────────────────────────────────────────────
  if (typeof accuracy === 'number' && accuracy > MAX_ACCURACY) {
    return json({
      error:    'gps_impreciso',
      message:  `GPS impreciso (±${Math.round(accuracy)}m). Vá para um local aberto e tente novamente.`,
      accuracy: Math.round(accuracy),
    }, 403);
  }

  // ── 5. Validar token do QR (se fornecido) ────────────────────────────────
  if (qrToken !== undefined) {
    const { data: valid } = await supabase.rpc('validate_daily_qr', { p_token: qrToken });
    if (!valid) {
      return json({
        error:   'token_invalido',
        message: 'QR Code inválido ou de outro dia. Peça ao gestor para exibir o QR atual.',
      }, 403);
    }
  }

  // ── 6. Janela de horário: 08:00–14:00 BRT ────────────────────────────────
  // TEMPORÁRIO: Bloqueio de horário removido para testes
  const brtHour = getBRTHour();
  // if (brtHour < 8 || brtHour >= 14) {
  //   return json({ error: 'fora_do_horario', message: 'Check-in permitido apenas entre 08:00 e 14:00.', brt_hour: brtHour }, 403);
  // }
  console.log('[CHECKIN-GEO] Bloqueio de horário DESATIVADO para testes. Hora BRT:', brtHour);

  // ── 7. Geolocalização (Haversine) ─────────────────────────────────────────
  const distance = haversineMeters(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
  if (distance > MAX_RADIUS) {
    return json({
      error:    'fora_do_raio',
      message:  `Você está a ${Math.round(distance)}m da imobiliária. Máximo permitido: ${MAX_RADIUS}m.`,
      distance: Math.round(distance),
    }, 403);
  }

  // ── 8. Inserção atômica via RPC ───────────────────────────────────────────
  const { data, error: rpcErr } = await supabase.rpc('fazer_checkin', {
    p_user_id:   userId,
    p_latitude:  latitude,
    p_longitude: longitude,
  });

  if (rpcErr) {
    console.error('[checkin-geo] RPC error:', rpcErr);
    return json({ error: 'db_error', message: rpcErr.message }, 500);
  }

  const result = data as {
    success:   boolean;
    error?:    string;
    message?:  string;
    position?: number;
    name?:     string;
  };

  if (!result.success && result.error === 'ja_fez_checkin') {
    return json({
      error:    'ja_fez_checkin',
      message:  result.message,
      position: result.position,
    }, 409);
  }

  return json({
    ok:       true,
    position: result.position,
    name:     result.name,
    message:  'Check-in realizado com sucesso!',
    distance: Math.round(distance),
  });
});
