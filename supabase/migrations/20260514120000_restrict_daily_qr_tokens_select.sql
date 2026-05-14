-- SEC-A07: Restringir SELECT em daily_qr_tokens a admins/gestores.
-- Antes: qualquer usuário autenticado podia ler o token QR do dia.
-- Depois: apenas service_role e roles administrativos.
-- Impacto zero: CheckInDisplay usa RPC get_or_create_daily_qr (SECURITY DEFINER).
--              checkin-geo usa RPC validate_daily_qr (SECURITY DEFINER).
--              Nenhum SELECT direto na tabela pelo frontend.

BEGIN;

-- Remove política ampla que permitia leitura por qualquer autenticado
DROP POLICY IF EXISTS "authenticated read qr" ON public.daily_qr_tokens;

-- Nova política: somente roles administrativos podem ler (ex: auditoria/gestão)
CREATE POLICY "admin read qr tokens"
  ON public.daily_qr_tokens
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('ADMIN', 'DIRETOR', 'GERENTE')
    )
  );

COMMIT;
