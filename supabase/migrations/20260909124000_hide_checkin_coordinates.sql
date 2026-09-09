-- A-07: esconde GPS da fila REST e inclui recepção na policy elevada.
-- Mantém checkin_date = CURRENT_DATE para a fila visível no /checkin.

REVOKE SELECT ON TABLE public.daily_checkins FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id,
  user_id,
  checkin_date,
  checkin_time,
  position_in_queue,
  created_at
) ON TABLE public.daily_checkins TO authenticated;
REVOKE SELECT (latitude, longitude) ON TABLE public.daily_checkins FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "read daily checkins restricted" ON public.daily_checkins;
CREATE POLICY "read daily checkins restricted"
  ON public.daily_checkins
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR checkin_date = CURRENT_DATE
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND UPPER(COALESCE(p.role, '')) IN (
          'ADMIN',
          'DIRETOR',
          'GERENTE',
          'RECEPCAO',
          'RECEPCAO_ZN',
          'RECEPCAO_NI'
        )
    )
  );
