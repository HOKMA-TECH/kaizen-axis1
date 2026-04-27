// @ts-nocheck — Deno types are not available in the local TS checker; valid at runtime.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

function errJson(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errJson('Método não permitido', 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return errJson('Configuração do servidor inválida', 500);

  const apiKey = req.headers.get('apikey');
  if (!apiKey || apiKey !== anonKey) return errJson('Não autorizado', 401);

  const token = getBearerToken(req.headers.get('Authorization'));
  if (!token) return errJson('Token ausente', 401);

  let body: { bucket?: string; path?: string; expiresIn?: number };
  try {
    body = await req.json();
  } catch {
    return errJson('Body inválido');
  }

  const bucket = String(body.bucket || '');
  const rawPath = String(body.path || '');
  const path = rawPath.replace(/^\/+/, '').trim();
  if (!bucket || !path) return errJson('bucket e path são obrigatórios');
  if (bucket !== 'client-documents') return errJson('Bucket não permitido', 403);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData?.user) return errJson('Sessão inválida', 401);

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const root = path.split('/')[0] || '';

  if (isUuid(root)) {
    // Access check is delegated to clients RLS.
    const { data: clientRow, error: clientErr } = await userClient
      .from('clients')
      .select('id')
      .eq('id', root)
      .maybeSingle();

    if (clientErr || !clientRow) return errJson('Acesso negado ao documento', 403);
  } else if (root === 'general_audits') {
    // Verify ownership server-side (no direct Storage SELECT policy is exposed to users).
    const { data: objRow, error: objErr } = await adminClient
      .schema('storage')
      .from('objects')
      .select('owner')
      .eq('bucket_id', 'client-documents')
      .eq('name', path)
      .maybeSingle();

    if (objErr || !objRow || objRow.owner !== authData.user.id) {
      return errJson('Acesso negado ao documento', 403);
    }
  } else {
    return errJson('Path inválido', 403);
  }

  const ttlRaw = typeof body.expiresIn === 'number' ? body.expiresIn : 120;
  const ttl = Math.min(Math.max(ttlRaw, 30), 600);

  const { data: signedData, error: signError } = await adminClient.storage
    .from(bucket)
    .createSignedUrl(path, ttl);

  if (signError || !signedData?.signedUrl) {
    console.error('Erro ao gerar signed URL:', signError);
    return errJson('Não foi possível gerar o link do documento', 500);
  }

  return new Response(JSON.stringify({ signedUrl: signedData.signedUrl }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
