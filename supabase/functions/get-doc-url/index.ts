// @ts-nocheck — Deno types are not available in the local TS checker; valid at runtime.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

function errJson(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Edge Function ─────────────────────────────────────────────────────────────
// Gera uma signed URL para um arquivo no Storage usando a service role.
// Isso ignora completamente as políticas RLS do Storage, resolvendo o bug
// recorrente de "Erro ao abrir documento" causado por políticas perdidas.
//
// Body: { bucket: string; path: string; expiresIn?: number }
// Auth: apikey: <SUPABASE_ANON_KEY>  (não depende de JWT do usuário — sem expiração)
// Returns: { signedUrl: string }
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') return errJson('Método não permitido', 405);

  // Valida a apikey (anon key) — não depende de JWT do usuário que expira a cada 1h
  const apiKey = req.headers.get('apikey');
  const expectedKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!apiKey || !expectedKey || apiKey !== expectedKey) {
    return errJson('Não autorizado', 401);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Lê o body
  let body: { bucket?: string; path?: string; expiresIn?: number };
  try {
    body = await req.json();
  } catch {
    return errJson('Body inválido');
  }

  const expiresRaw = typeof body.expiresIn === 'number' ? body.expiresIn : 120;
  const ttl = Math.min(Math.max(expiresRaw, 30), 600);
  const { bucket, path } = body;
  if (!bucket || !path) return errJson('bucket e path são obrigatórios');

  // Gera a signed URL usando service role (ignora RLS)
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, ttl);

  if (error || !data?.signedUrl) {
    console.error('Erro ao gerar signed URL:', error);
    return errJson('Não foi possível gerar o link do documento. Verifique se o arquivo existe.', 500);
  }

  return new Response(JSON.stringify({ signedUrl: data.signedUrl }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
