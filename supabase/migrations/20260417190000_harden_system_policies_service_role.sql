-- Harden system-level RLS policies to explicit service_role.
-- Keeps authenticated read paths and restricts write paths used by automation.

BEGIN;

ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service inserts checkin" ON public.daily_checkins;
CREATE POLICY "service inserts checkin"
  ON public.daily_checkins
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "service manages qr" ON public.daily_qr_tokens;
CREATE POLICY "service manages qr"
  ON public.daily_qr_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages checkin tokens" ON public.checkin_tokens;
CREATE POLICY "Service role manages checkin tokens"
  ON public.checkin_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Sistema insere atribuicoes" ON public.lead_assignments;
CREATE POLICY "Sistema insere atribuicoes"
  ON public.lead_assignments
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Sistema atualiza atribuicoes" ON public.lead_assignments;
CREATE POLICY "Sistema atualiza atribuicoes"
  ON public.lead_assignments
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
