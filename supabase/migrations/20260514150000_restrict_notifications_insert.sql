-- ─────────────────────────────────────────────────────────────────────────────
-- R-02: Restringir insert em notifications para non-admins
--
-- Antes: qualquer autenticado podia inserir notification com target_role ou
--        directorate_id arbitrários → risco de spam em massa.
--
-- Depois:
--   • ADMIN / DIRETOR / GERENTE: podem inserir com qualquer target.
--   • Demais roles: podem inserir apenas com target_user_id específico
--     (sem blast por role ou diretoria).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;

CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Admins/gestores podem usar qualquer target
      public.app_current_user_role() IN ('ADMIN', 'DIRETOR', 'GERENTE')
      OR
      -- Outros usuários só podem notificar um usuário específico
      (
        target_user_id IS NOT NULL
        AND target_role IS NULL
        AND directorate_id IS NULL
      )
    )
  );
