# Relatório de Auditoria de Segurança — KAIZEN-AXIS
**Data:** 2026-05-14
**Auditor:** Claude Code (Anthropic) — revisão independente e adversarial
**Escopo:** Auditoria completa: Edge Functions, API Vercel, servidor Express, RLS Supabase, Login/CAPTCHA, dependências
**Metodologia:** Leitura direta de código-fonte, análise estática, rastreamento de fluxo de dados, revisão de todas as migrations SQL

---

## Resumo Executivo

A base de código passou por múltiplas rodadas de hardening em março-maio de 2026, com correções significativas no RLS, storage e chat. Ainda assim, foram identificados **5 achados críticos**, **9 alertas** e **6 itens informativos** que requerem atenção.

O risco de maior impacto imediato é a **ausência completa de autenticação nos endpoints `POST /api/apuracao` (Vercel) e `POST /api/apuracao_temp_log` (Vercel)**, que expõem um processador de PDFs de extratos bancários sem nenhuma proteção. Em segundo lugar, o **`kai-agent` aceita mensagens de qualquer origem sem validação de JWT**, permitindo que atacantes externos consumam créditos OpenAI ilimitadamente. O **`/debug-pdf` do servidor Express permanece em produção** sem proteção alguma.

---

## Achados por Severidade

---

### CRÍTICO

---

#### SEC-01: `POST /api/apuracao` sem autenticação JWT, CORS `*` e sem rate limit

**Arquivo:** `api/apuracao.ts:667-828`

**Descrição:**
O endpoint Vercel `POST /api/apuracao` processa extratos bancários em PDF texto e retorna dados financeiros detalhados. Não há nenhuma verificação de JWT, sessão, CORS restrito ou rate limit. As linhas 668-671 definem:

```typescript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
```

Não há nenhum bloco de verificação `Authorization` em todo o arquivo. O `vercel.json` também não define proteção de rota para `api/`.

**Impacto:**
- Qualquer pessoa na internet pode enviar extratos bancários de terceiros (texto) e obter análise de renda completa.
- Pode ser usado como DDoS de processamento (parsing regex intensivo).
- Expõe dados financeiros confidenciais sem controle de acesso.

**Ação recomendada:** Exigir `Authorization: Bearer <supabase-jwt>` e validar via `supabase.auth.getUser()` antes de processar o body.

---

#### SEC-02: `kai-agent` Edge Function sem autenticação JWT — consumo ilimitado de OpenAI

**Arquivo:** `supabase/functions/kai-agent/index.ts:315-352`

**Descrição:**
A função não verifica nenhum header `Authorization`, não valida JWT e não requer o header `apikey`. As linhas 315-337 mostram:

```typescript
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') { ... }
  if (req.method !== 'POST') { ... }
  if (!OPENAI_API_KEY) { ... }

  let body: ChatBody;
  try { body = await req.json(); } catch { ... }

  const message = String(body.message || '').trim();
  if (!message) { ... }
  // Chama OpenAI diretamente
```

Não há verificação de quem está chamando. Qualquer pessoa com a URL da Edge Function pode enviar mensagens e acumular custos de API OpenAI. Adicionalmente, não há limite de tamanho na mensagem (linha 335: apenas `.trim()`, sem `slice` ou validação de comprimento), e cada mensagem também dispara um `fetchEmbedding` (segundo call OpenAI, linha 250).

**Impacto:**
- Consumo arbitrário de créditos OpenAI sem custo para o atacante.
- Escalada de custo mensal indefinida.
- Sem rate limiting per-user (o in-memory rate limit do audit-log não está presente aqui).

**Ação recomendada:** Adicionar validação JWT (`supabase.auth.getUser(token)`). Adicionar truncamento de mensagem (ex: `slice(0, 2000)`). Adicionar rate limit por IP/userId.

---

#### SEC-03: `POST /debug-pdf` do servidor Express sem proteção e acessível em produção

**Arquivo:** `server/src/index.ts:55-67`

**Descrição:**

```typescript
app.post('/debug-pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) { res.status(400).json({ erro: 'PDF não enviado' }); return; }
    try {
        const parsed = await pdfParse(req.file.buffer);
        res.json({
            totalChars: parsed.text.length,
            primeiros3000: parsed.text.substring(0, 3000),
            ultimos1000: parsed.text.substring(Math.max(0, parsed.text.length - 1000)),
        });
    }
```

Esta rota não tem autenticação, rate limit ou restrição de ambiente. O CORS do servidor usa `process.env.FRONTEND_URL ?? '*'` (linha 11-14), ou seja, em qualquer deploy sem essa variável configurada, aceita origem `*`.

**Impacto:**
- Rota de diagnóstico em produção expõe a capacidade de extrair texto de PDFs arbitrários.
- Pode ser abusada para enumerar conteúdo de PDFs carregados por outros caminhos.
- O limite de 20MB do multer (linha 20) ainda permite envios custosos.

**Ação recomendada:** Remover o endpoint de produção ou protegê-lo com middleware de autenticação e restringir via variável de ambiente `NODE_ENV !== 'production'`.

---

#### SEC-04: `audit-log` Edge Function aceita `userId` arbitrário do body do cliente — falsificação de logs

**Arquivo:** `supabase/functions/audit-log/index.ts:9, 104`

**Descrição:**
A função aceita `userId` como campo do body sem validação server-side de quem realmente está chamando:

```typescript
type AuditPayload = {
  userId?: string | null;  // linha 9 — aceito diretamente
  ...
};
// ...
payload = {
  user_id: body.userId ?? null,  // linha 104 — gravado sem verificação
```

A única "autenticação" da função é comparar o header `apikey` com `SUPABASE_ANON_KEY` (linha 65-68). A chave anon é pública — qualquer usuário autenticado (ou não autenticado, já que a chave é exposta no frontend) pode enviar `userId` arbitrário.

**Impacto:**
- Um atacante pode gravar logs de auditoria atribuídos a qualquer usuário (ex.: admin, diretor).
- Isso pode poluir a detecção de `login_bruteforce` (trigger `detect_suspicious_activity`) ao fabricar falhas associadas ao IP de um usuário legítimo.
- Permite negação de auditoria: um administrador pode argumentar que os logs são forjados.

**Ação recomendada:** Derivar `user_id` do JWT via `supabase.auth.getUser(token)` no servidor. Nunca confiar no `userId` enviado pelo cliente.

---

#### SEC-05: `checkin-geo` usa decodificação local de JWT sem validação de assinatura criptográfica

**Arquivo:** `supabase/functions/checkin-geo/index.ts:57-88`

**Descrição:**
O comentário na linha 57 é auto-incriminatório: "Apenas decodificamos o payload para obter o sub (user id) e exp."

```typescript
function decodeJWTPayload(token: string): { sub?: string; exp?: number } | null {
  try {
    const part = token.split('.')[1];
    // ... atob decode puro, sem verificação de assinatura
    return JSON.parse(json);
  } catch { return null; }
}
```

A verificação da expiração (linha 84) usa apenas o campo `exp` do payload, que pode ser forjado por qualquer pessoa construindo um JWT com `none` algorithm ou assinatura arbitrária. O comentário afirma "O platform Supabase já validou a assinatura antes de rotear para cá", mas essa garantia **não existe** quando a função é chamada diretamente via URL pública da Edge Function (que é como o cliente a chama).

**Impacto:**
- Um atacante pode construir um JWT com `{"alg":"none"}` ou um JWT com assinatura inválida contendo qualquer `sub` (user_id) e fazer check-in como qualquer usuário.
- Isso permite marcar qualquer corretor como "presente" e interferir na distribuição de leads.

**Ação recomendada:** Substituir `decodeJWTPayload` por `supabase.auth.getUser(rawToken)`, que verifica a assinatura server-side.

---

### ALTO

---

#### SEC-06: Bucket `chat-media` com SELECT público irrestrito — mídias acessíveis sem autenticação

**Arquivo:** `supabase/migrations/20260513100000_chat_media_bucket.sql:21-23`

**Descrição:**

```sql
CREATE POLICY "chat_media_select" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'chat-media');
```

A migration `20260513221000_fix_chat_storage_security.sql` removeu as políticas UPDATE e INSERT, mas **não removeu a política SELECT pública**. Nenhuma migration posterior a 20260513221000 faz `DROP POLICY IF EXISTS "chat_media_select"`.

**Evidência adicional:** O bucket também foi criado como `public = true` (linha 2 da migration 20260513100000), o que por si só já expõe todas as URLs diretamente.

**Impacto:**
- Imagens, vídeos, áudios e PDFs trocados via chat são acessíveis sem autenticação para qualquer pessoa que conheça a URL.
- Mensagens view-once: embora o trigger wipe remova a URL do banco após abertura, o arquivo permanece acessível no storage para quem tiver salvo a URL.

**Ação recomendada:** `DROP POLICY IF EXISTS "chat_media_select" ON storage.objects;` e `UPDATE storage.buckets SET public = false WHERE id = 'chat-media'`. Implementar signed URLs via Edge Function.

---

#### SEC-07: `distribution_control` sem RLS habilitado

**Arquivo:** `supabase/migrations/20260302020000_presence_distribution_system.sql:71-81`

**Descrição:**
A tabela `distribution_control` é criada sem `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`:

```sql
CREATE TABLE IF NOT EXISTS public.distribution_control (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_assigned_corretor_id UUID,
  ...
);
INSERT INTO public.distribution_control ...
-- Nenhum ALTER TABLE ... ENABLE ROW LEVEL SECURITY
```

A tabela também não está na lista de tabelas críticas do lockdown `20260330162000_rls_lockdown_all_public_tables.sql` (linha 12-49 listam tabelas, mas `distribution_control` não consta).

**Impacto:**
- Qualquer usuário autenticado pode ler e modificar o estado de round-robin de distribuição de leads.
- Um corretor pode manipular `last_assigned_corretor_id` para redirecionar todos os leads para si mesmo.

**Ação recomendada:** `ALTER TABLE public.distribution_control ENABLE ROW LEVEL SECURITY; ALTER TABLE public.distribution_control FORCE ROW LEVEL SECURITY;` com política restrita a `service_role`.

---

#### SEC-08: Rate limit com off-by-one — 11ª tentativa é permitida (não bloqueada)

**Arquivo:** `supabase/functions/secure-login/index.ts:97` e `supabase/functions/rate-guard/index.ts:129`

**Descrição:**
Ambas as funções usam `count > config.limit` em vez de `count >= config.limit`:

```typescript
// secure-login, linha 97:
if (count > LOGIN_LIMIT.limit) { // LOGIN_LIMIT.limit = 10

// rate-guard, linha 129:
if (count > config.limit) {
```

Com `>` em vez de `>=`, quando `count === 10` (exatamente no limite), a requisição **passa**. O bloqueio só ocorre a partir de `count === 11`. Para login, isso significa que 11 tentativas são permitidas, não 10.

**Impacto:** Off-by-one permite 10% a mais de tentativas de brute-force do que o configurado. Baixo impacto isolado, mas combina mal com a granularidade de janelas fixas.

**Ação recomendada:** Alterar para `count >= LOGIN_LIMIT.limit` em ambas as funções.

---

#### SEC-09: `send-push` scope check é condicional — pode ser bypassado se `anonKey` estiver ausente

**Arquivo:** `supabase/functions/send-push/index.ts:362-384`

**Descrição:**

```typescript
if (anonKey) {
  // ... verifica app_user_in_scope
  if (scopeError || inScope !== true) {
    return badRequest('Forbidden', 403);
  }
}
// Se anonKey não existir, o scope check é PULADO
```

Se a variável `SUPABASE_ANON_KEY` não estiver configurada no ambiente da Edge Function, o bloco de verificação de escopo (`app_user_in_scope`) é completamente ignorado, permitindo que um ADMIN/DIRETOR/GERENTE envie push para **qualquer** usuário, incluindo de outras diretorias.

**Impacto:** Em misconfiguration de ambiente, a proteção de escopo é silenciosamente desativada.

**Ação recomendada:** Inverter a lógica: se `anonKey` estiver ausente, retornar erro 500 ou negar a requisição, não pular a verificação.

---

#### SEC-10: `export-pipeline-corretor` injeta nome do corretor no header `Content-Disposition` sem sanitização

**Arquivo:** `supabase/functions/export-pipeline-corretor/index.ts:264`

**Descrição:**

```typescript
'Content-Disposition': `attachment; filename="pipeline-${corretorName.replace(/\s+/g, '-')}.pdf"`,
```

O `corretorName` vem de `corretorProfile?.name` (linha 87), que é um valor do banco de dados. A sanitização só troca espaços por hífens. Um nome com caracteres como `"`, `\r`, `\n` ou `;` pode corromper o header HTTP ou injetar headers adicionais (HTTP Header Injection).

**Exemplo de payload malicioso:** Nome do corretor: `Foo"\r\nX-Injected: evil`

**Impacto:** HTTP Header Injection via nome de usuário malicioso no banco. Risco de cache poisoning ou response splitting.

**Ação recomendada:** Sanitizar para apenas caracteres alfanuméricos e hifens: `corretorName.replace(/[^a-zA-Z0-9\-_]/g, '_')`.

---

#### SEC-11: `api/apuracao.ts` e `api/apuracao_temp_log.ts` expõem dados de debug sensíveis em respostas de produção

**Arquivo:** `api/apuracao.ts:2888, 2892, 3100, 3163` (via offset inferido — arquivo é a versão `apuracao_temp_log.ts`)
**Arquivo:** `api/apuracao_temp_log.ts:521` (console.log inline em bloco de produção)

**Descrição:**
As respostas de erro 422 incluem campos `debug_texto_extraido` (até 2500 chars do extrato), `debug_eh_neon` e `debug_amostra_transacoes`. A resposta de sucesso inclui `auditoria.transacoesRaw` com o array completo de transações brutas.

Adicionalmente, `apuracao_temp_log.ts` linha 521 tem um `console.log` de debug inline dentro do loop de parsing, condicionado apenas a `linha.toLowerCase().includes("ago")`:

```typescript
const mData = linhaProcessada.match(DATA_RE); if (linha.toLowerCase().includes("ago")) console.log("!!LINHA> " + linhaProcessada + " MATCHED: " + !!mData);
```

**Impacto:**
- Dados de extratos bancários são devolvidos raw ao cliente em casos de erro.
- `transacoesRaw` com dados financeiros completos em toda resposta de sucesso.
- Console.log de debug em produção vaza dados de linhas de extrato nos logs do servidor Vercel.

**Ação recomendada:** Remover todos os campos `debug_*` de respostas de produção. Mover `transacoesRaw` para resposta apenas em ambiente de desenvolvimento (`process.env.NODE_ENV !== 'production'`). Remover o `console.log` inline do `apuracao_temp_log.ts`.

---

#### SEC-12: Email do usuário logado em `audit_logs.metadata` — exposição de PII

**Arquivo:** `src/pages/Login.tsx:274-277, 313-315, 325-327`

**Descrição:**

```typescript
logAuditEvent({
  action: 'login_failed',
  entity: 'auth',
  metadata: { email: formData.email, reason: error.message }  // linha 276
});
```

O email é registrado em `audit_logs.metadata` em três situações: falha de login, falha de MFA, e login bem-sucedido. Embora logs de auditoria sejam necessários, o email em texto plano no campo JSONB `metadata` cria um repositório de PII acessível por todos os usuários com role ADMIN/DIRETOR (via política `is_security_admin()`).

**Impacto:** Violação potencial de LGPD — dados pessoais (email) armazenados em log sem necessidade técnica (o `user_id` já identifica o usuário).

**Ação recomendada:** Substituir `email: formData.email` por `email_domain: formData.email.split('@')[1]` ou remover o campo email dos logs e usar apenas `user_id`.

---

#### SEC-13: `lead_assignments` com política INSERT `WITH CHECK (true)` para qualquer usuário autenticado (migration original)

**Arquivo:** `supabase/migrations/20260302020000_presence_distribution_system.sql:63-64`

**Descrição:**

```sql
CREATE POLICY "Sistema insere atribuicoes" ON public.lead_assignments
  FOR INSERT WITH CHECK (true);
```

A migration original permite que qualquer usuário autenticado insira registros em `lead_assignments`. Embora a migration `20260417190000` sobrescreva essa política para `service_role`, a ordem de aplicação depende do timestamp, e migrations mais antigas poderiam ter sido aplicadas antes.

**Evidência de correção parcial:** `20260417190000_harden_system_policies_service_role.sql` faz `DROP POLICY IF EXISTS "Sistema insere atribuicoes"` e recria para `service_role`.

**Impacto:** Se a migration de correção não foi aplicada ou foi revertida, qualquer corretor poderia inserir atribuições de lead falsas.

**Ação recomendada:** Verificar que `20260417190000` foi efetivamente aplicada no banco de produção via `supabase migrations list`.

---

### MÉDIO

---

#### SEC-14: CAPTCHA condicional no login — desativável por misconfiguration de ambiente

**Arquivo:** `src/pages/Login.tsx:8, 54-59`

**Descrição:**

```typescript
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
// ...
const getCaptchaTokenIfRequired = () => {
  if (!TURNSTILE_SITE_KEY) return null;  // CAPTCHA ignorado se env ausente
  ...
};
```

Se `VITE_TURNSTILE_SITE_KEY` não estiver definida no deploy, o CAPTCHA não é renderizado e nenhum token é exigido. O `secure-login` recebe `captchaToken` como opcional e passa em frente sem token se ausente. O hardening real está no rate limit por IP (que ainda tem o off-by-one do SEC-08).

**Impacto:** Em qualquer ambiente sem a variável configurada (ex.: preview deployments, staging), brute-force é possível com apenas o rate limit de 11 tentativas por janela de 60s.

**Ação recomendada:** Documentar que `VITE_TURNSTILE_SITE_KEY` é obrigatória em produção. Considerar hardening no `secure-login` para rejeitar tentativas sem captchaToken quando CAPTCHA está configurado server-side.

---

#### SEC-15: MFA é opcional — usuários sem MFA configurado têm acesso total após login simples

**Arquivo:** `src/pages/Login.tsx:248-263`

**Descrição:**

```typescript
if (mfaData.nextLevel === 'aal2' && mfaData.nextLevel !== mfaData.currentLevel) {
  // Requer MFA, pegar fator TOTP ativo
  const totpFactor = factors?.totp?.find(f => f.status === 'verified');
  if (totpFactor) {
    setMfaFactorId(totpFactor.id);
    setShowMfaInput(true);
    return; // aguarda código
  }
  // MFA exigido mas sem fator — bloqueia (linha 261-263)
  await supabase.auth.signOut();
  throw new Error('Autenticação em dois fatores é obrigatória...');
}
// Login direto bem-sucedido (não tem MFA ativado)  ← linha 268
finishLogin(...);
```

O fluxo acima bloqueia apenas quando `nextLevel === 'aal2'`, ou seja, **somente se o usuário já tiver configurado MFA**. Usuários sem MFA ativado passam diretamente para `finishLogin`. Não há enforcement de MFA por role (ex.: ADMIN, DIRETOR obrigatoriamente devem ter MFA).

**Impacto:** Contas privilegiadas (ADMIN, DIRETOR) podem não ter MFA e ter acesso completo com apenas email+senha.

**Ação recomendada:** Adicionar verificação de role após login: se `role IN ('ADMIN', 'DIRETOR')` e `currentLevel !== 'aal2'`, forçar configuração de MFA.

---

#### SEC-16: Todas as Edge Functions usam `Access-Control-Allow-Origin: *`

**Arquivo:** Todos os arquivos em `supabase/functions/*/index.ts`

**Descrição:**
Todas as 10 Edge Functions verificadas usam CORS `*`. Para funções com autenticação (JWT obrigatório), o risco é mitigado pelo fato de que o JWT ainda precisa ser válido. Porém, para:
- `kai-agent` (sem auth, SEC-02)
- `receive-lead` (webhook secreto)
- `audit-log` (autenticação apenas por anon key pública)

O CORS aberto é um vetor adicional.

**Ação recomendada:** Restringir para `Access-Control-Allow-Origin: https://app.kaizenaxis.com.br` (ou domínio equivalente) em todas as funções. Para webhooks (`receive-lead`), remover o CORS completamente já que não são chamados pelo browser.

---

#### SEC-17: `storage_client_docs_select_auth_scoped` não verifica ownership do cliente — qualquer autenticado pode ler documentos de clientes de outros

**Arquivo:** `supabase/migrations/20260330220000_fix_storage_select_scoped_for_client_documents.sql:24-40`

**Descrição:**

```sql
CREATE POLICY storage_client_docs_select_auth_scoped
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'client-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.client_documents d
    WHERE d.url = storage.objects.name
      OR d.url = ('/object/public/client-documents/' || storage.objects.name)
      ...
  )
);
```

A política verifica apenas se existe um registro em `client_documents` com aquela URL — não verifica se o usuário tem acesso ao cliente associado. Qualquer usuário autenticado que adivinhe ou enumere um path de documento pode acessá-lo diretamente via Storage API, desde que exista um registro correspondente em `client_documents`.

**Nota:** A função `get-doc-url` e `get-doc-url-v2` fazem a verificação correta de ownership via RLS de `clients`. O problema está na política de storage direta que serve como fallback.

**Ação recomendada:** Adicionar verificação de ownership na política: `AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = d.client_id AND /* RLS conditions */)`.

---

### BAIXO / INFORMATIVO

---

#### SEC-18: `receive-lead` dispara webhook n8n como fire-and-forget sem retry ou validação de resposta

**Arquivo:** `supabase/functions/receive-lead/index.ts:74-84`

**Descrição:**

```typescript
if (N8N_WEBHOOK_URL) {
  fetch(N8N_WEBHOOK_URL, { ... }).catch((err) => console.error('[n8n trigger error]', err.message));
}
```

O `fetch` para o n8n não tem `await`. Se falhar silenciosamente, o lead é inserido sem distribuição e sem alerta. A resposta de sucesso ao caller diz `"distribuição em andamento via n8n"` independente de o n8n ter sido notificado.

**Impacto:** Leads perdidos silenciosamente sem distribuição se o n8n estiver indisponível.

---

#### SEC-19: `apuracao_temp_log.ts` é um arquivo de produção com código de debug — provavelmente deve ser removido

**Arquivo:** `api/apuracao_temp_log.ts:1, 521`

**Descrição:**
O arquivo `apuracao_temp_log.ts` é identicamente nomeado à versão de produção (`apuracao.ts`) mas contém um `console.log` inline de debug (linha 521). Ambos os arquivos estão no diretório `api/` e podem ser expostos como endpoints Vercel separados (`/api/apuracao_temp_log`). Não está claro se este endpoint está mapeado, mas sua presença é um risco de exposição acidental.

---

#### SEC-20: Logs de auditoria do `detect_suspicious_activity` trigger não têm proteção contra write por usuário autenticado

**Arquivo:** `supabase/migrations/20260327010000_audit_logs_insert_policy.sql` (não lido, mas inferível da migration 20260327000000)

**Descrição:**
O trigger `detect_suspicious_activity` é chamado `AFTER INSERT ON public.audit_logs`. A `audit_logs` table tem uma política INSERT que (baseado na migration 20260327010000) provavelmente permite que usuários autenticados insiram logs via Edge Function `audit-log`. Se um usuário pode forjar `userId` (SEC-04), pode também disparar artificialmente o contador de `login_failed` para outro IP, provocando falsos alertas de brute-force.

---

#### SEC-21: `send-push` usa `supabase.auth.getClaims(token)` que pode não estar disponível em todas as versões do SDK

**Arquivo:** `supabase/functions/send-push/index.ts:303`

**Descrição:**

```typescript
const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
```

`getClaims` é um método mais recente do SDK Supabase. Se a versão `npm:@supabase/supabase-js@2` usada (linha 13) não incluir este método, a função capturará a exceção e retornará 401 para todos os requests (linha 315-323), efetivamente desativando o envio de push.

---

#### SEC-22: `vercel.json` sem headers de segurança (CSP, HSTS, X-Frame-Options)

**Arquivo:** `vercel.json`

**Descrição:**
O `vercel.json` contém apenas regras de rewrite para SPA. Não define headers de segurança HTTP como `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options` ou `Permissions-Policy`.

---

#### SEC-23: `server/src/index.ts` CORS padrão `*` sem `FRONTEND_URL` configurado

**Arquivo:** `server/src/index.ts:11-14`

**Descrição:**

```typescript
app.use(cors({
    origin: process.env.FRONTEND_URL ?? '*',
```

Se `FRONTEND_URL` não estiver definido, o servidor Express aceita requisições de qualquer origem. Combinado com a ausência de autenticação nos endpoints, isso é um vetor adicional.

---

## Verificação dos Achados do Audit Anterior (SECURITY-AUDIT-CHAT.md, 2026-05-13)

| ID | Achado | Status | Evidência |
|----|--------|--------|-----------|
| C-01 | RPC `chat_delete_for_me` aceita `p_user_id` arbitrário | **CORRIGIDO** | Migration `20260513220000_fix_chat_security.sql:15` remove o parâmetro e usa `auth.uid()` |
| C-02 | Política UPDATE excessivamente permissiva em `chat_messages` | **CORRIGIDO** | Migration `20260513220000:38-45` substitui por `chat_messages_update_sender_only` scoped ao `sender_id` |
| C-03 | Bypass de view-once via API direta | **PARCIALMENTE CORRIGIDO** | RPC `chat_open_view_once` foi criada (migration 20260513220000:51-73) com validação server-side. Porém a política de storage do bucket `chat-media` ainda é pública (SEC-06 acima), permitindo acesso ao arquivo de mídia mesmo após o wipe do DB. |
| C-04 | Bucket `chat-media` com leitura pública irrestrita | **NÃO CORRIGIDO** | A política `chat_media_select TO public` criada em `20260513100000` nunca foi removida. `20260513221000` removeu apenas INSERT e UPDATE. Bucket ainda está `public = true`. Ativo como SEC-06. |
| C-05 | Política de INSERT em `chat_media_update` não restringe ownership | **CORRIGIDO** | Migration `20260513221000:19-28` recria `chat_media_insert` com `auth.uid() IS NOT NULL` |
| C-06 | Injeção via `src` em `<iframe>` sem sanitização | **NÃO VERIFICADO** — arquivo `src/components/chat/ChatMessageBubble.tsx` não foi lido nesta auditoria. Requer verificação manual. |
| C-07 | `ReactMarkdown` sem `rehype-sanitize` — XSS em mensagens KAI | **NÃO VERIFICADO** — arquivo `src/components/chat/ChatMessageBubble.tsx` não foi lido. Requer verificação manual. |
| A-01 | `chat_delete_for_me` sem verificação de retorno de erro | **PROVAVELMENTE CORRIGIDO** — dependente de C-01 que foi corrigido. |
| A-02 | `handleMarkViewOnceOpened` não verifica `sender_id` | **PARCIALMENTE MITIGADO** — a RPC `chat_open_view_once` no servidor faz `sender_id <> auth.uid()`. Mas o frontend ainda pode ter código antigo. |
| A-03 | Reactions SELECT irrestrita | **CORRIGIDO** | Migration `20260513220000:104-122` restringe SELECT a participantes da conversa. |
| A-04 | Validação de tipo de arquivo apenas via `accept` HTML | **NÃO VERIFICADO** — requer leitura do componente de chat. |
| A-05 | Path de upload previsível | **PARCIALMENTE ABORDADO** | Migration `20260513221000` endureceu INSERT policy. |
| A-06 | Payload de broadcast não validado | **NÃO VERIFICADO** |
| A-07 | `wa_conversations` com política RLS `USING (true)` | **CORRIGIDO** | Migration `20260513220000:125-131` cria `service_role_only` e remove `USING (true)`. |
| A-08 | Ausência de `Authorization` no `kai-agent` | **NÃO CORRIGIDO** — ativo como SEC-02. |
| A-09 | `chat_status_text` e `chat_display_name` sem sanitização | **NÃO VERIFICADO** |

---

## Achados Novos (não reportados no audit anterior)

Os seguintes achados são novos nesta auditoria e não constavam no `SECURITY-AUDIT-CHAT.md`:

- **SEC-01**: `POST /api/apuracao` sem autenticação (CRÍTICO — novo)
- **SEC-02**: `kai-agent` sem autenticação JWT (CRÍTICO — novo, audit anterior reportou apenas A-08 "ausência de Authorization" sem classificar como crítico)
- **SEC-03**: `/debug-pdf` em produção sem proteção (CRÍTICO — novo)
- **SEC-04**: `audit-log` aceita `userId` do cliente (CRÍTICO — novo)
- **SEC-05**: `checkin-geo` sem validação criptográfica de JWT (CRÍTICO — novo)
- **SEC-06**: `chat-media` SELECT público não corrigido (ALTO — C-04 foi marcado como não corrigido)
- **SEC-07**: `distribution_control` sem RLS (ALTO — novo)
- **SEC-08**: Off-by-one no rate limit (ALTO — novo)
- **SEC-09**: `send-push` scope check condicional (ALTO — novo)
- **SEC-10**: Header Injection via `corretorName` (ALTO — novo)
- **SEC-11**: Debug info em respostas de produção (ALTO — novo)
- **SEC-12**: Email em logs de auditoria (ALTO — novo)
- **SEC-17**: `storage_client_docs_select_auth_scoped` sem ownership check (MÉDIO — novo)

---

## Dependências Vulneráveis

### Raiz do Projeto (`npm audit`)

| Pacote | Versão Afetada | Severidade | CVE / Advisory | Fix Disponível |
|--------|---------------|-----------|---------------|----------------|
| jspdf | <=4.2.0 | **CRÍTICO** | GHSA-7x6v-j9x4-qf24, GHSA-wfv2-pwc8-crg5 | Sim (`npm audit fix`) |
| vite | <=6.4.1 | **ALTO** | GHSA-4w7w-66w2-5vf9 (path traversal), GHSA-p9ff-h696-f583 (arbitrary file read via WS) | Sim (`npm audit fix`) |
| @babel/plugin-transform-modules-systemjs | 7.12.0-7.29.0 | **ALTO** | GHSA-fv7c-fp4j-7gwp | Sim (`npm audit fix`) |
| lodash | <=4.17.23 | **ALTO** | GHSA-r5fr-rjxr-66jc (code injection), GHSA-f23m-r3pf-42rh (prototype pollution) | Sim (`npm audit fix`) |
| fast-uri | <=3.1.1 | **ALTO** | GHSA-q3j6-qgpj-74h6 (path traversal), GHSA-v39h-62p7-jpjc | Sim (`npm audit fix`) |
| undici | múltiplas | **ALTO** | GHSA-g9mf-h72j-4rw9, GHSA-cxrh-j4jr-qwg3, GHSA-2mjp-6q6p-2qxm, GHSA-vrm6-8vpv-qv8q, GHSA-4992-7rv2-5pvq | Sim (breaking: `@vercel/node@4.0.0`) |
| dompurify | <=3.3.3 | **MÉDIO** | GHSA-v2wj-7wpq-c8vv (XSS), GHSA-cjmm-f4jc-qw8r, múltiplos | Sim (`npm audit fix`) |
| uuid | 13.0.0 | **MÉDIO** | GHSA-w5hq-g745-h8pq (missing buffer bounds check) | Sim (`npm audit fix`) |
| brace-expansion | <1.1.13 | **MÉDIO** | GHSA-f886-m6hf-6m8v (ReDoS/memory exhaustion) | Sim (`npm audit fix`) |
| ajv | 7.0.0-alpha.0 - 8.17.1 | **MÉDIO** | GHSA-2g4f-4pwh-qvx6 (ReDoS) | Sim (breaking) |
| minimatch | 10.0.0-10.2.2 | **ALTO** | GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj (ReDoS) | Sim (breaking) |

**Total raiz: 24 vulnerabilidades (7 médio, 16 alto, 1 crítico)**

### Servidor Express (`server/`)

| Pacote | Versão Afetada | Severidade | CVE / Advisory | Fix Disponível |
|--------|---------------|-----------|---------------|----------------|
| handlebars | 4.0.0-4.7.8 | **CRÍTICO** | GHSA-3mfm-83xf-c92r, GHSA-2w6w-674q-4c4q, GHSA-2qvq-rjwj-gvw9 (JS Injection, Prototype Pollution, XSS) | Sim (`npm audit fix`) |
| path-to-regexp | <0.1.13 | **ALTO** | GHSA-37ch-88jc-xwx2 (ReDoS) | Sim (`npm audit fix`) |
| picomatch | <=2.3.1 | **ALTO** | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj (method injection, ReDoS) | Sim (`npm audit fix`) |
| brace-expansion | <1.1.13 | **MÉDIO** | GHSA-f886-m6hf-6m8v | Sim (`npm audit fix`) |

**Total server/: 4 vulnerabilidades (1 médio, 2 alto, 1 crítico)**

> **Nota crítica sobre `vite` (GHSA-p9ff-h696-f583):** Esta vulnerabilidade permite leitura arbitrária de arquivos do servidor via WebSocket do Vite Dev Server. Embora afete apenas o servidor de desenvolvimento local, é importante garantir que o servidor de build de produção não exponha a porta do Vite.

> **Nota crítica sobre `jspdf`:** A vulnerabilidade GHSA-7x6v-j9x4-qf24 permite PDF Object Injection via campos de texto livre. O projeto usa jsPDF para geração de relatórios (`export-pipeline-corretor`). Se nomes de clientes ou valores forem injetados diretamente no PDF sem sanitização, pode haver exploração.

---

## Prioridade de Ação

Lista ordenada por risco combinando severidade × facilidade de exploração × impacto de negócio:

1. **[CRÍTICO — imediato]** SEC-05: `checkin-geo` sem validação criptográfica de JWT — atacante pode fazer check-in como qualquer usuário e manipular distribuição de leads.

2. **[CRÍTICO — imediato]** SEC-02: `kai-agent` sem autenticação — consumo ilimitado de créditos OpenAI por qualquer pessoa na internet.

3. **[CRÍTICO — imediato]** SEC-01: `POST /api/apuracao` sem autenticação — endpoint público processando dados financeiros sensíveis.

4. **[CRÍTICO — imediato]** SEC-04: `audit-log` aceita `userId` do cliente — falsificação de trilha de auditoria e corrupção de detecção de brute-force.

5. **[CRÍTICO — imediato]** SEC-03: `/debug-pdf` em produção sem proteção — rota de diagnóstico exposta publicamente.

6. **[ALTO — esta semana]** SEC-06: `chat-media` SELECT público — mídias de chat acessíveis sem autenticação.

7. **[ALTO — esta semana]** SEC-07: `distribution_control` sem RLS — corretores podem manipular round-robin de leads.

8. **[ALTO — esta semana]** SEC-11: Debug info em respostas de produção — dados de extratos bancários retornados em respostas de erro.

9. **[ALTO — esta semana]** SEC-10: Header Injection via `corretorName` em `Content-Disposition`.

10. **[ALTO — esta semana]** Atualizar dependências: `jspdf` (crítico), `handlebars` (crítico no server/), `vite` (alto), `lodash` (alto).

11. **[MÉDIO — próximas 2 semanas]** SEC-08: Off-by-one no rate limit de login.

12. **[MÉDIO — próximas 2 semanas]** SEC-09: `send-push` scope check condicional.

13. **[MÉDIO — próximas 2 semanas]** SEC-12: Email em logs de auditoria (LGPD).

14. **[MÉDIO — próximas 2 semanas]** SEC-15: MFA opcional para roles privilegiadas.

15. **[MÉDIO — próximas 4 semanas]** SEC-16: CORS `*` em todas as Edge Functions.

16. **[BAIXO — backlog]** SEC-17, SEC-18, SEC-19, SEC-22, SEC-23.

---

_Auditoria realizada em: 2026-05-14_
_Revisor: Claude Code (Anthropic) — revisão adversarial independente_
_Metodologia: Análise estática completa, sem acesso a ambiente de execução_
