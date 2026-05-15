-- ─────────────────────────────────────────────────────────────────────────────
-- R-01: Remover insert direto de authenticated em audit_logs
--
-- Antes: `authenticated_insert_own_audit_logs` permitia que qualquer usuário
--        autenticado inserisse eventos com action/entity arbitrários — abrindo
--        risco de poluição forense e falsos positivos.
--
-- Depois: somente service_role pode inserir (via Edge Function `audit-log`).
--         O frontend foi migrado para chamar a Edge Function que deriva
--         user_id do JWT server-side, valida action/entity e aplica rate limit.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_insert_own_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "authenticated insert own audit logs"  ON public.audit_logs;
