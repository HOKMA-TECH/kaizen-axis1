-- ─────────────────────────────────────────────────────────────────────────────
-- R-03 (5th audit): Restringir escrita nos buckets trainings e developments
--
-- Antes: qualquer usuário autenticado podia INSERT/UPDATE/DELETE nos buckets,
--        abrindo risco de upload de conteúdo malicioso ou exclusão por não-admins.
--
-- Depois: somente ADMIN / DIRETOR / GERENTE podem escrever/apagar nesses buckets.
--         Leitura permanece pública (buckets public = true, não alterado aqui).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── trainings ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Auth users can upload to trainings"    ON storage.objects;
DROP POLICY IF EXISTS "Auth users can update trainings"        ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete trainings"        ON storage.objects;

CREATE POLICY "Managers can upload to trainings"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trainings'
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR', 'GERENTE')
);

CREATE POLICY "Managers can update trainings"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'trainings'
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR', 'GERENTE')
);

CREATE POLICY "Managers can delete trainings"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'trainings'
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR', 'GERENTE')
);

-- ── developments ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Auth users can upload to developments"  ON storage.objects;
DROP POLICY IF EXISTS "Auth users can update developments"     ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete developments"     ON storage.objects;

CREATE POLICY "Managers can upload to developments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'developments'
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR', 'GERENTE')
);

CREATE POLICY "Managers can update developments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'developments'
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR', 'GERENTE')
);

CREATE POLICY "Managers can delete developments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'developments'
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR', 'GERENTE')
);
