-- ─────────────────────────────────────────────────────────────────────────────
-- R-02 (5th audit): Adicionar app_user_in_scope ao insert de notifications
--
-- Antes: non-admins podiam inserir notification com qualquer target_user_id,
--        bastava não usar target_role nem directorate_id.
--
-- Depois: non-admins só podem notificar usuários dentro do seu scope
--         (app_user_in_scope garante que o target_user_id pertence à hierarquia
--         do usuário autenticado — e.g. próprio cliente ou usuário sob gestão).
-- ─────────────────────────────────────────────────────────────────────────────

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
      -- Outros usuários só podem notificar usuários dentro do seu scope
      (
        target_user_id IS NOT NULL
        AND target_role IS NULL
        AND directorate_id IS NULL
        AND public.app_user_in_scope(target_user_id)
      )
    )
  );
