-- ─────────────────────────────────────────────────────────────────────────────
-- Hotfix: reverter app_user_in_scope do R-02 para versão 4th-audit
--
-- Problema: app_user_in_scope só cobre hierarquia descendente. CORRETOREs não
-- conseguem notificar seu próprio gerente (ex: alerta de cliente parado) nem
-- adicionar usuários de hierarquia superior a grupos de chat.
--
-- Solução: manter a proteção contra mass-blast (sem target_role/directorate_id)
-- mas remover a restrição de scope — qualquer autenticado pode notificar
-- um usuário específico (target_user_id).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;

CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Admins/gestores podem usar qualquer target (role blast, directorate, user específico)
      public.app_current_user_role() IN ('ADMIN', 'DIRETOR', 'GERENTE')
      OR
      -- Outros usuários podem notificar qualquer usuário específico
      -- (sem blast por role ou diretoria — proteção contra spam em massa mantida)
      (
        target_user_id IS NOT NULL
        AND target_role IS NULL
        AND directorate_id IS NULL
      )
    )
  );
