# Security Hardening — KAIZEN-AXIS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar 13 vulnerabilidades identificadas na auditoria de segurança de 2026-05-14 sem quebrar nenhuma funcionalidade em produção, com usuários ativos.

**Architecture:** Quatro ondas em ordem crescente de risco. Cada onda é auto-contida e pode ser revertida independentemente. Onda A = pure backend (Edge Functions + migrations), sem impacto no frontend. Onda B = mudanças coordenadas frontend + Vercel API. Onda C = pequenos ajustes de auditoria. Onda D = dependências. Cada task termina com commit + deploy antes de prosseguir.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Vercel Serverless Functions (Node.js/TypeScript), React 18 + TypeScript + Supabase JS SDK v2, PostgreSQL (RLS migrations), npm.

**Constraint de produção:** Nunca alterar o contrato de resposta de endpoints que o frontend já consome sem atualizar o frontend no mesmo commit. Testar cada Edge Function manualmente no Supabase Dashboard antes de marcar a task como completa.

---

## Mapa de Arquivos

| Arquivo | Tasks que tocam |
|---------|----------------|
| `supabase/functions/checkin-geo/index.ts` | Task 1 |
| `supabase/functions/kai-agent/index.ts` | Task 2 |
| `supabase/functions/send-push/index.ts` | Task 3 |
| `supabase/functions/secure-login/index.ts` | Task 4 |
| `supabase/functions/rate-guard/index.ts` | Task 4 |
| `supabase/functions/export-pipeline-corretor/index.ts` | Task 5 |
| `api/apuracao_temp_log.ts` | Task 6 |
| `server/src/index.ts` | Task 7 |
| `supabase/migrations/20260514100000_rls_distribution_control.sql` | Task 8 (criar) |
| `supabase/migrations/20260514110000_fix_chat_media_select.sql` | Task 9 (criar) |
| `api/apuracao.ts` | Task 10 |
| `src/pages/IncomeAnalysis.tsx` | Task 10, Task 11 |
| `supabase/functions/audit-log/index.ts` | Task 12 |
| `src/pages/Login.tsx` | Task 13 |

---

## ONDA A — Mudanças Puras de Servidor (Zero Impacto no Frontend)

> Cada task desta onda pode ser deployada individualmente. O frontend não precisa ser alterado.

---

### Task 1: `checkin-geo` — Validação Criptográfica de JWT (SEC-05 · CRÍTICO)

**Problema:** A função decodifica o JWT localmente com `atob()` sem verificar a assinatura. Um atacante pode forjar um JWT e fazer check-in como qualquer corretor.

**Por que é seguro alterar:** O frontend (`CheckIn.tsx:347-348`) já envia `Authorization: Bearer ${accessToken}`. A mudança apenas adiciona verificação real no servidor.

**Arquivo:** `supabase/functions/checkin-geo/index.ts`

- [ ] **Step 1: Remover `decodeJWTPayload` e substituir pelo bloco de auth com `getUser`**

Localizar as linhas 57-88 do arquivo. Substituir o bloco inteiro (função `decodeJWTPayload` + bloco de auth do handler) pelo seguinte:

```typescript
// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ── 1. Autenticação via JWT (validação criptográfica server-side) ─────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const rawToken = authHeader.slice(7);
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!anonKey) return json({ error: 'server_misconfigured' }, 500);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    anonKey,
    { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${rawToken}` } } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'unauthorized' }, 401);

  const userId = user.id;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
```

> O restante do handler (a partir de `// ── 2. Body`) permanece **exatamente igual**. Não alterar nada abaixo desta linha.

- [ ] **Step 2: Deploy da função**

```bash
supabase functions deploy checkin-geo
```

Resultado esperado: `Function checkin-geo deployed successfully`

- [ ] **Step 3: Testar manualmente**

No Supabase Dashboard → Edge Functions → checkin-geo → "Invoke":
- Sem header `Authorization`: deve retornar `401 {"error":"unauthorized"}`
- Com token válido de usuário autenticado: deve prosseguir normalmente

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/checkin-geo/index.ts
git commit -m "fix(security): SEC-05 replace local JWT decode with auth.getUser in checkin-geo"
```

---

### Task 2: `kai-agent` — Validação de JWT (SEC-02 · CRÍTICO)

**Problema:** A função não verifica autenticação. Qualquer pessoa pode fazer chamadas que consomem créditos da API OpenAI.

**Por que é seguro alterar:** O frontend (`src/services/kaiAgent.ts:17-22`) já envia `Authorization: Bearer ${token}` e verifica `if (!token) throw new Error('unauthenticated')`. A mudança apenas fecha o servidor para corresponder ao que o cliente já faz.

**Arquivo:** `supabase/functions/kai-agent/index.ts`

- [ ] **Step 1: Adicionar validação JWT no início do handler**

Localizar a linha 315: `Deno.serve(async (req: Request) => {`

Substituir o bloco de abertura do handler (linhas 315-338, até `const message = ...`) por:

```typescript
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ── Autenticação ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  const token = authHeader.slice(7);

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!SUPABASE_URL || !anonKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }
  const userClient = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  if (!OPENAI_API_KEY) {
    return jsonResponse({ error: 'Server misconfigured: missing OPENAI_API_KEY' }, 500);
  }

  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const message = String(body.message || '').trim().slice(0, 2000);
  if (!message) {
    return jsonResponse({ error: 'Message is required' }, 400);
  }
```

> Notar que `message` agora tem `.slice(0, 2000)` para limitar tamanho. O restante do handler (bloco `try { const history = ... }`) permanece igual.

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy kai-agent
```

- [ ] **Step 3: Testar**

No app em produção, abrir o chat KAI como usuário logado e enviar uma mensagem. Deve funcionar normalmente.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/kai-agent/index.ts
git commit -m "fix(security): SEC-02 add JWT validation and message size limit to kai-agent"
```

---

### Task 3: `send-push` — Scope Check Fail-Closed (SEC-09 · ALTO)

**Problema:** O bloco de verificação de escopo (`app_user_in_scope`) é ignorado silenciosamente quando `SUPABASE_ANON_KEY` não está configurada.

**Arquivo:** `supabase/functions/send-push/index.ts`

- [ ] **Step 1: Localizar o bloco condicional e torná-lo obrigatório**

Localizar as linhas 362-384 que contêm:

```typescript
    if (anonKey) {
      const scopedClient = createClient(SUPABASE_URL, anonKey, {
        ...
      });
      const { data: inScope, error: scopeError } = await scopedClient.rpc('app_user_in_scope', {
        target_user_id: notification.target_user_id,
      });
      if (scopeError || inScope !== true) {
        ...
        return badRequest('Forbidden', 403);
      }
    }
```

Substituir por:

```typescript
    if (!anonKey) {
      logStructured('send_push_denied', {
        correlation_id: correlationId,
        actor_user_id: userId,
        result: 'denied',
        deny_reason: 'server_misconfigured_no_anon_key',
      });
      return badRequest('Forbidden', 403);
    }

    const scopedClient = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: inScope, error: scopeError } = await scopedClient.rpc('app_user_in_scope', {
      target_user_id: notification.target_user_id,
    });

    if (scopeError || inScope !== true) {
      logStructured('send_push_denied', {
        correlation_id: correlationId,
        actor_user_id: userId,
        target_user_id: notification.target_user_id,
        role: userRole,
        result: 'denied',
        deny_reason: 'out_of_scope',
        scope_error: scopeError?.message || null,
      });
      return badRequest('Forbidden', 403);
    }
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy send-push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-push/index.ts
git commit -m "fix(security): SEC-09 fail-closed when SUPABASE_ANON_KEY missing in send-push"
```

---

### Task 4: Off-by-One no Rate Limit (SEC-08 · ALTO)

**Problema:** `count > limit` permite exatamente `limit + 1` tentativas. A condição correta é `count >= limit`.

**Arquivos:** `supabase/functions/secure-login/index.ts:97` e `supabase/functions/rate-guard/index.ts:129`

- [ ] **Step 1: Corrigir `secure-login`**

Localizar linha 97:
```typescript
  if (count > LOGIN_LIMIT.limit) {
```
Alterar para:
```typescript
  if (count >= LOGIN_LIMIT.limit) {
```

- [ ] **Step 2: Corrigir `rate-guard`**

Localizar linha 129:
```typescript
  if (count > config.limit) {
```
Alterar para:
```typescript
  if (count >= config.limit) {
```

- [ ] **Step 3: Deploy ambas as funções**

```bash
supabase functions deploy secure-login
supabase functions deploy rate-guard
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/secure-login/index.ts supabase/functions/rate-guard/index.ts
git commit -m "fix(security): SEC-08 correct off-by-one in rate limit (> to >=)"
```

---

### Task 5: HTTP Header Injection em `export-pipeline-corretor` (SEC-10 · ALTO)

**Problema:** Nome do corretor é inserido no header `Content-Disposition` sem sanitização adequada. Caracteres como `\r\n` podem injetar headers HTTP.

**Arquivo:** `supabase/functions/export-pipeline-corretor/index.ts:264`

- [ ] **Step 1: Sanitizar `corretorName` antes de usar no header**

Localizar linha 264:
```typescript
      'Content-Disposition': `attachment; filename="pipeline-${corretorName.replace(/\s+/g, '-')}.pdf"`,
```

Antes dessa linha (logo após a linha que define `corretorName` a partir do banco), adicionar a sanitização. Localizar onde `corretorName` é definido (buscar `corretorName`) e adicionar logo após:

```typescript
const safeCorretorName = (corretorName || 'corretor')
  .replace(/[^\w\s\-áéíóúàâêôãõüçÁÉÍÓÚÀÂÊÔÃÕÜÇ]/g, '')
  .replace(/\s+/g, '-')
  .slice(0, 80);
```

Então alterar a linha 264 para usar `safeCorretorName`:

```typescript
      'Content-Disposition': `attachment; filename="pipeline-${safeCorretorName}.pdf"`,
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy export-pipeline-corretor
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/export-pipeline-corretor/index.ts
git commit -m "fix(security): SEC-10 sanitize corretorName in Content-Disposition header"
```

---

### Task 6: Remover `api/apuracao_temp_log.ts` (SEC-19 · CRÍTICO)

**Problema:** Arquivo de debug em `api/` é exposto como endpoint Vercel público (`/api/apuracao_temp_log`), sem autenticação.

- [ ] **Step 1: Verificar que nenhum código importa ou referencia este arquivo**

```bash
grep -r "apuracao_temp_log" src/ api/ server/ --include="*.ts" --include="*.tsx"
```

Resultado esperado: zero matches (o arquivo só referencia a si mesmo).

- [ ] **Step 2: Remover o arquivo**

```bash
git rm api/apuracao_temp_log.ts
```

- [ ] **Step 3: Commit e push para invalidar o endpoint no Vercel**

```bash
git commit -m "fix(security): SEC-19 remove debug endpoint api/apuracao_temp_log"
git push
```

> O Vercel redeploye automaticamente e o endpoint `/api/apuracao_temp_log` passa a retornar 404.

---

### Task 7: Bloquear `/debug-pdf` em Produção (SEC-03 · CRÍTICO)

**Problema:** Rota `POST /debug-pdf` no servidor Express está acessível em produção sem autenticação.

**Arquivo:** `server/src/index.ts:55-67`

- [ ] **Step 1: Envolver a rota com guard de ambiente**

Localizar as linhas 51-67:
```typescript
/**
 * POST /debug-pdf
 * ...
 */
app.post('/debug-pdf', upload.single('pdf'), async (req, res) => {
    ...
});
```

Substituir por:

```typescript
/**
 * POST /debug-pdf
 * Disponível APENAS em desenvolvimento local. Bloqueado em produção.
 */
if (process.env.NODE_ENV !== 'production') {
  app.post('/debug-pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) { res.status(400).json({ erro: 'PDF não enviado' }); return; }
    try {
      const parsed = await pdfParse(req.file.buffer);
      res.json({
        totalChars: parsed.text.length,
        primeiros3000: parsed.text.substring(0, 3000),
        ultimos1000: parsed.text.substring(Math.max(0, parsed.text.length - 1000)),
      });
    } catch (e) {
      res.status(500).json({ erro: String(e) });
    }
  });
}
```

- [ ] **Step 2: Garantir que `NODE_ENV=production` está configurado no ambiente de deploy do servidor**

Verificar no painel de deploy (Railway/Render/etc.) se `NODE_ENV=production` está definido. Se não estiver, adicionar.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "fix(security): SEC-03 block /debug-pdf in production via NODE_ENV guard"
```

---

### Task 8: RLS em `distribution_control` (SEC-07 · ALTO)

**Problema:** Tabela não tem RLS habilitado. Qualquer usuário autenticado pode ler e manipular o round-robin de distribuição de leads.

**Nota de segurança:** As funções SECURITY DEFINER (como `fazer_checkin`) executam como `postgres` (superuser) e bypassam RLS. O `service_role` também bypassa RLS por ter o atributo `bypassrls`. A migration abaixo **não quebra nenhuma funcionalidade existente**.

- [ ] **Step 1: Criar migration**

Criar arquivo `supabase/migrations/20260514100000_rls_distribution_control.sql`:

```sql
-- SEC-07: Habilitar RLS em distribution_control
-- Funções SECURITY DEFINER e service_role continuam funcionando (bypassam RLS).
-- Impede que usuários autenticados leiam/modifiquem o round-robin diretamente.

ALTER TABLE public.distribution_control ENABLE ROW LEVEL SECURITY;

-- Nenhuma política explícita necessária:
-- service_role bypassa RLS (atributo bypassrls)
-- SECURITY DEFINER functions executam como postgres (superuser)
-- Usuários anon/authenticated não têm acesso
```

- [ ] **Step 2: Aplicar migration**

```bash
supabase db push
```

Resultado esperado: `Applied 1 migration`

- [ ] **Step 3: Verificar que a distribuição de leads ainda funciona**

Após o deploy, simular ou aguardar uma entrada de lead e verificar nos logs do Supabase que a função de distribuição não retornou erro.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260514100000_rls_distribution_control.sql
git commit -m "fix(security): SEC-07 enable RLS on distribution_control table"
```

---

### Task 9: `chat-media` — Remover SELECT Público (SEC-06 · ALTO)

**Problema:** Bucket `chat-media` tem política SELECT `TO public` (qualquer pessoa sem autenticação acessa as mídias) e `public = true`.

**Migração segura:** Usuários autenticados continuam acessando as mídias. A única mudança é que acesso anônimo (sem sessão) é bloqueado. O chat só é acessível por usuários logados, então zero impacto funcional.

- [ ] **Step 1: Criar migration**

Criar arquivo `supabase/migrations/20260514110000_fix_chat_media_select.sql`:

```sql
-- SEC-06: Remover acesso público (anon) ao bucket chat-media
-- Antes: SELECT TO public (qualquer pessoa sem auth acessa se souber o path)
-- Depois: SELECT TO authenticated (apenas usuários logados)

-- 1. Remover política pública
DROP POLICY IF EXISTS "chat_media_select" ON storage.objects;

-- 2. Criar política restrita a usuários autenticados
CREATE POLICY "chat_media_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND auth.uid() IS NOT NULL
);

-- 3. Marcar bucket como privado
-- Isso remove as URLs públicas diretas; URLs com token ainda funcionam para authenticated
UPDATE storage.buckets
SET public = false
WHERE id = 'chat-media';
```

- [ ] **Step 2: Aplicar migration**

```bash
supabase db push
```

- [ ] **Step 3: Verificar que o chat de mídia ainda funciona**

No app, abrir uma conversa de chat com mídia (imagem ou PDF) e confirmar que a mídia carrega normalmente para usuário autenticado.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260514110000_fix_chat_media_select.sql
git commit -m "fix(security): SEC-06 restrict chat-media bucket to authenticated users only"
```

---

## ONDA B — Mudanças Coordenadas Frontend + Vercel API

> Frontend e API devem ser alterados e deployados juntos. Fazer push de ambos no mesmo commit.

---

### Task 10: `/api/apuracao` — Autenticação JWT (SEC-01 · CRÍTICO)

**Problema:** Endpoint Vercel `POST /api/apuracao` não tem autenticação. Processa extratos bancários sem verificar quem está chamando.

**Estratégia:** Adicionar `Authorization: Bearer <token>` no frontend (IncomeAnalysis.tsx) e validar o token no handler Vercel via chamada à API de auth do Supabase.

**Atenção:** Ambas as mudanças devem ir no MESMO commit e push para não criar janela de quebra.

**Arquivos:** `src/pages/IncomeAnalysis.tsx:567-575` e `api/apuracao.ts:2814-2819`

- [ ] **Step 1: Atualizar o frontend para enviar JWT**

Localizar `src/pages/IncomeAnalysis.tsx` linha 567:

```typescript
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textoExtrato: textoUnificado.trim(),
          hashPdf: hashPdfPrimeiro,
          nomeCliente, cpf: cpf || undefined,
        }),
      });
```

Substituir por:

```typescript
      const { data: { session: incomeSession } } = await supabase.auth.getSession();
      if (!incomeSession?.access_token) {
        setErro('Sessão expirada. Faça login novamente.');
        return;
      }

      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${incomeSession.access_token}`,
        },
        body: JSON.stringify({
          textoExtrato: textoUnificado.trim(),
          hashPdf: hashPdfPrimeiro,
          nomeCliente, cpf: cpf || undefined,
        }),
      });
```

> Verificar se `supabase` já está importado no topo de `IncomeAnalysis.tsx`. Se não estiver, adicionar:
> `import { supabase } from '@/lib/supabase';`

- [ ] **Step 2: Remover console.log de debug da linha 565**

Localizar e remover:
```typescript
      // DEBUG — remove após diagnóstico
      console.log('[apuracao] textoUnificado (primeiros 3000 chars):\n', textoUnificado.substring(0, 3000));
```

- [ ] **Step 3: Adicionar validação JWT no handler Vercel**

Localizar `api/apuracao.ts` linha 2814 (função `handler`):

```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ erro: 'Método não permitido.' }); return; }
```

Substituir por:

```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', process.env.VITE_APP_URL ?? 'https://kaizenaxis.com.br');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ erro: 'Método não permitido.' }); return; }

    // ── Autenticação JWT ───────────────────────────────────────────────────────
    const authHeader = req.headers['authorization'] as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ erro: 'Não autorizado.' });
        return;
    }
    const token = authHeader.slice(7);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
        res.status(500).json({ erro: 'Configuração de servidor ausente.' });
        return;
    }

    const authCheck = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
            Authorization: `Bearer ${token}`,
            apikey: supabaseAnonKey,
        },
    }).catch(() => null);

    if (!authCheck || authCheck.status !== 200) {
        res.status(401).json({ erro: 'Sessão inválida. Faça login novamente.' });
        return;
    }
    // ── Fim Autenticação ───────────────────────────────────────────────────────
```

> O restante da função `handler` permanece intacto a partir da linha `const timestamp = new Date().toISOString();`

- [ ] **Step 4: Configurar variáveis de ambiente no Vercel**

No painel do Vercel (Settings → Environment Variables), verificar que existem:
- `SUPABASE_URL` — URL do projeto Supabase (sem `/` final)
- `SUPABASE_ANON_KEY` — chave anon pública

Se não existirem, adicionar. Valores obtidos em Supabase Dashboard → Settings → API.

- [ ] **Step 5: Commit e push (frontend + backend juntos)**

```bash
git add src/pages/IncomeAnalysis.tsx api/apuracao.ts
git commit -m "fix(security): SEC-01 add JWT auth to /api/apuracao endpoint and client"
git push
```

> O Vercel redeploye automaticamente. Aguardar o deploy antes de testar.

- [ ] **Step 6: Testar em produção**

Abrir a página de Análise de Renda como usuário logado e fazer uma análise completa de um extrato. Confirmar que o resultado aparece normalmente.

---

## ONDA C — Ajustes de Auditoria e LGPD

---

### Task 11: `audit-log` Edge Function — Derivar `userId` do JWT (SEC-04 · CRÍTICO)

**Contexto importante:** A função `auditLogger.ts` no frontend já insere diretamente na tabela `audit_logs` via SDK do Supabase com o JWT do usuário, respeitando RLS. Esta Edge Function (`audit-log`) é uma rota alternativa que aceita `userId` do body. O fix é: se um JWT válido for enviado, usar o `userId` dele; caso contrário (eventos pre-auth como `login_failed`), aceitar `userId: null`.

**Arquivo:** `supabase/functions/audit-log/index.ts`

- [ ] **Step 1: Modificar o handler para derivar `userId` do JWT quando disponível**

Localizar o handler principal. Após o bloco de rate limit (linha ~85), antes de criar o `supabaseAdmin`, adicionar a lógica de extração do userId:

```typescript
  // ── Extrair userId do JWT (quando disponível) ─────────────────────────────
  // Para eventos pre-auth (login_failed sem sessão), userId permanece null.
  // Para eventos autenticados, o userId do token tem precedência sobre o body.
  let resolvedUserId: string | null = null;

  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (supabaseUrl && anonKey) {
      const userClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user?.id) resolvedUserId = user.id;
    }
  }
  // Para eventos pre-auth (sem JWT), aceitar apenas userId: null (ignorar body.userId)
  if (!resolvedUserId && authHeader) {
    // JWT inválido enviado — rejeitar completamente
    return errJson('Não autorizado', 401);
  }
  // resolvedUserId === null para eventos anônimos legítimos (login_failed antes do login)
```

Então, no objeto `payload` (linha ~103), substituir:
```typescript
    user_id: body.userId ?? null,
```
por:
```typescript
    user_id: resolvedUserId,
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy audit-log
```

- [ ] **Step 3: Testar**

Testar login com credenciais erradas — deve gerar um evento `login_failed` no painel de logs do Supabase com `user_id: null`. Testar uma ação autenticada — deve gerar evento com `user_id` correto.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/audit-log/index.ts
git commit -m "fix(security): SEC-04 derive userId from JWT in audit-log, reject spoofed userId"
```

---

### Task 12: Remover Email de Logs de Auditoria (SEC-12 · ALTO · LGPD)

**Problema:** `formData.email` é armazenado em texto plano em `audit_logs.metadata`, o que pode ser uma violação de LGPD. O `user_id` já identifica o usuário de forma suficiente.

**Arquivo:** `src/pages/Login.tsx` — 3 ocorrências

- [ ] **Step 1: Remover email dos 3 logAuditEvent em Login.tsx**

Ocorrência 1 (linha ~276) — `login_failed` antes do MFA:
```typescript
        metadata: { email: formData.email, reason: error.message }
```
Substituir por:
```typescript
        metadata: { reason: error.message }
```

Ocorrência 2 (linha ~314) — `login_failed` no MFA:
```typescript
        metadata: { email: formData.email, stage: 'mfa', reason: error.message }
```
Substituir por:
```typescript
        metadata: { stage: 'mfa', reason: error.message }
```

Ocorrência 3 (linha ~326) — `login_success`:
```typescript
      metadata: { email: formData.email }
```
Substituir por:
```typescript
      metadata: { email_domain: formData.email.split('@')[1] }
```

> Para `login_success`, manter o domínio do email (ex: `gmail.com`) ajuda em análises sem expor dados pessoais.

- [ ] **Step 2: Commit**

```bash
git add src/pages/Login.tsx
git commit -m "fix(security): SEC-12 remove PII email from audit_logs metadata (LGPD)"
git push
```

---

## ONDA D — Dependências Vulneráveis

---

### Task 13: Atualizar Dependências Vulneráveis (SEC-DEPS · CRÍTICO/ALTO)

**Problema:** 24 vulnerabilidades no projeto principal (1 crítico: jspdf) e 4 no servidor (1 crítico: handlebars).

**Estratégia segura:** Usar `--legacy-peer-deps` para evitar conflitos. Testar o build antes de commitar. Não usar `--force` que pode introduzir incompatibilidades.

- [ ] **Step 1: Atualizar dependências do projeto principal**

```bash
cd c:/Users/hokma/OneDrive/Desktop/Projetos/KAIZEN-AXIS
npm audit fix --legacy-peer-deps
```

Verificar o output. Se houver breaking changes (vulnerabilidades que precisam de `--force`), NÃO aplicar ainda — anotar para análise manual.

- [ ] **Step 2: Verificar que o build ainda compila**

```bash
npm run build
```

Resultado esperado: build sem erros. Se houver erros de tipos ou imports quebrados, verificar os changelogs das libs atualizadas e ajustar.

- [ ] **Step 3: Atualizar dependências do servidor Express**

```bash
cd server
npm audit fix --legacy-peer-deps
cd ..
```

- [ ] **Step 4: Verificar audit residual**

```bash
npm audit
cd server && npm audit && cd ..
```

Anotar vulnerabilidades que restaram (normalmente as que exigem breaking changes, como `undici` → `@vercel/node@4`).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/package.json server/package-lock.json
git commit -m "fix(security): update vulnerable dependencies (npm audit fix)"
git push
```

---

## Verificação Final

Após todas as tasks:

- [ ] Abrir o app em produção e testar os fluxos críticos:
  - Login com email/senha válidos
  - Check-in de corretor (CheckIn page)
  - Chat com KAI
  - Análise de renda (IncomeAnalysis)
  - Exportação de pipeline PDF
  - Chat com envio de mídia

- [ ] Verificar no Supabase Dashboard → Logs → Edge Functions que nenhuma função está retornando 500 inesperado

- [ ] Rodar `npm audit` e confirmar que críticos foram eliminados

---

## Resumo de Prioridade

| Task | SEC ID | Severidade | Onda | Risco de quebra |
|------|--------|-----------|------|----------------|
| 1 — checkin-geo JWT | SEC-05 | CRÍTICO | A | Zero (frontend já envia JWT) |
| 2 — kai-agent JWT | SEC-02 | CRÍTICO | A | Zero (frontend já envia JWT) |
| 3 — send-push fail-closed | SEC-09 | ALTO | A | Zero |
| 4 — rate limit off-by-one | SEC-08 | ALTO | A | Zero |
| 5 — header injection | SEC-10 | ALTO | A | Zero |
| 6 — delete apuracao_temp_log | SEC-19 | CRÍTICO | A | Zero |
| 7 — gate debug-pdf | SEC-03 | CRÍTICO | A | Zero (NODE_ENV=production) |
| 8 — distribution_control RLS | SEC-07 | ALTO | A | Zero (SECDEF bypassa) |
| 9 — chat-media SELECT auth | SEC-06 | ALTO | A | Zero (chat é autenticado) |
| 10 — /api/apuracao JWT | SEC-01 | CRÍTICO | B | Baixo (deploy coordenado) |
| 11 — audit-log userId | SEC-04 | CRÍTICO | C | Baixo (pre-auth funciona) |
| 12 — email em logs | SEC-12 | ALTO | C | Zero |
| 13 — dependências | DEPS | CRÍTICO/ALTO | D | Baixo (verify build) |

---

_Plano criado em 2026-05-14_
_Auditoria de referência: `SECURITY-AUDIT-2026-05-14.md`_
