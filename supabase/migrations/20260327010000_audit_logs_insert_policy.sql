-- Permite que usuários autenticados insiram seus próprios registros de auditoria
-- diretamente no banco, sem depender da edge function audit-log.
CREATE POLICY "authenticated_insert_own_audit_logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
