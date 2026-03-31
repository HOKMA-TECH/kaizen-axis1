// @ts-nocheck — Deno runtime types are resolved at deploy time.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Keep CORS contract aligned with the current get-doc-url function.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

type RequestBody = {
  documentId?: string;
  rawPath?: string;
  expiresIn?: number;
};

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function normalizeTtl(expiresIn?: number): number {
  // Safe defaults for sensitive documents.
  const fallback = 60;
  if (typeof expiresIn !== "number" || Number.isNaN(expiresIn)) return fallback;
  return Math.min(Math.max(Math.floor(expiresIn), 30), 300);
}

function normalizeStoragePath(rawPath: string): string {
  const PUBLIC_MARKER = "/object/public/client-documents/";
  const SIGN_MARKER = "/object/sign/client-documents/";
  let path = String(rawPath || "").trim();
  if (path.includes(PUBLIC_MARKER)) {
    path = path.split(PUBLIC_MARKER)[1] || "";
  } else if (path.includes(SIGN_MARKER)) {
    path = (path.split(SIGN_MARKER)[1] || "").split("?")[0] || "";
  }
  return path.replace(/^\/+/, "");
}

async function signFirstExistingPath(
  adminClient: any,
  bucket: string,
  rawPath: string,
  clientId: string,
  ttl: number,
) {
  const base = normalizeStoragePath(rawPath);
  const candidates = new Set<string>();

  if (base) candidates.add(base);
  try {
    const decoded = decodeURIComponent(base);
    if (decoded) candidates.add(decoded);
  } catch {
    // ignore malformed URI sequences
  }

  // Backward compatibility: some legacy rows may store only the filename.
  if (base && !base.includes("/") && clientId) {
    candidates.add(`${clientId}/${base}`);
    try {
      const decoded = decodeURIComponent(base);
      if (decoded) candidates.add(`${clientId}/${decoded}`);
    } catch {
      // ignore malformed URI sequences
    }
  }

  for (const candidate of candidates) {
    const { data, error } = await adminClient.storage.from(bucket).createSignedUrl(candidate, ttl);
    if (!error && data?.signedUrl) {
      return { signedUrl: data.signedUrl, path: candidate };
    }
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Falha de configuração do servidor" }, 500);
  }

  // Mandatory user JWT validation.
  const token = getBearerToken(req.headers.get("Authorization"));
  if (!token) {
    return jsonResponse({ error: "Não autorizado" }, 401);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body inválido" }, 400);
  }

  const documentId = String(body.documentId || "").trim();
  const rawPath = String(body.rawPath || "").trim();
  if (!documentId && !rawPath) {
    return jsonResponse({ error: "documentId ou rawPath é obrigatório" }, 400);
  }

  const ttl = normalizeTtl(body.expiresIn);

  // Client with user JWT -> RLS decides access.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3) Authorization gate: query through RLS.
  let allowedDoc: any = null;
  let allowedDocError: any = null;

  if (documentId) {
    const byId = await userClient
      .from("client_documents")
      .select("id, client_id, url")
      .eq("id", documentId)
      .maybeSingle();
    allowedDoc = byId.data;
    allowedDocError = byId.error;
  }

  if (!allowedDoc && rawPath) {
    const normalizedRawPath = normalizeStoragePath(rawPath);
    const candidates = Array.from(new Set([
      rawPath,
      normalizedRawPath,
      `/object/public/client-documents/${normalizedRawPath}`,
    ].filter(Boolean)));

    for (const candidate of candidates) {
      const byPath = await userClient
        .from("client_documents")
        .select("id, client_id, url")
        .eq("url", candidate)
        .maybeSingle();
      if (!byPath.error && byPath.data) {
        allowedDoc = byPath.data;
        allowedDocError = null;
        break;
      }
      allowedDocError = byPath.error;
    }
  }

  if (allowedDocError) {
    if (String((allowedDocError as any)?.message || "").toLowerCase().includes("jwt")) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }
    // Keep error generic to avoid information leaks.
    return jsonResponse({ error: "Não foi possível processar a solicitação" }, 500);
  }

  // If RLS returned no row, decide 403 vs 404 without exposing extra data publicly.
  if (!allowedDoc) {
    const adminProbe = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let existsDoc: any = null;
    let existsError: any = null;
    if (documentId) {
      const existsById = await adminProbe
        .from("client_documents")
        .select("id")
        .eq("id", documentId)
        .maybeSingle();
      existsDoc = existsById.data;
      existsError = existsById.error;
    } else {
      const normalizedRawPath = normalizeStoragePath(rawPath);
      const existsByPath = await adminProbe
        .from("client_documents")
        .select("id")
        .in("url", [
          rawPath,
          normalizedRawPath,
          `/object/public/client-documents/${normalizedRawPath}`,
        ])
        .limit(1)
        .maybeSingle();
      existsDoc = existsByPath.data;
      existsError = existsByPath.error;
    }

    if (existsError) {
      return jsonResponse({ error: "Não foi possível processar a solicitação" }, 500);
    }

    if (existsDoc) {
      return jsonResponse({ error: "Acesso negado" }, 403);
    }

    return jsonResponse({ error: "Documento não encontrado" }, 404);
  }

  const bucket = "client-documents";
  const path = String((allowedDoc as any).url || "").trim();
  const clientId = String((allowedDoc as any).client_id || "").trim();

  if (!bucket || !path) {
    // Data integrity issue; keep output generic.
    return jsonResponse({ error: "Documento inválido" }, 500);
  }

  // 4) Only after authZ success, generate signed URL with service_role.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signedResult = await signFirstExistingPath(adminClient, bucket, path, clientId, ttl);
  if (!signedResult?.signedUrl) {
    return jsonResponse({ error: "Não foi possível gerar o link do documento" }, 500);
  }

  return jsonResponse({ signedUrl: signedResult.signedUrl }, 200);
});
