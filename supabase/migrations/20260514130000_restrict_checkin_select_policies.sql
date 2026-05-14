-- ─────────────────────────────────────────────────────────────────────────────
-- R-01: Restringir SELECT em daily_checkins
--   Antes: todos os autenticados viam TODOS os registros históricos.
--   Depois:
--     • Usuário vê os próprios registros em qualquer data (para histórico pessoal).
--     • Qualquer autenticado vê os registros de HOJE (necessário para a fila).
--     • ADMIN / DIRETOR / GERENTE veem tudo.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read daily checkins" ON public.daily_checkins;

-- Acesso a registros próprios (qualquer data) + fila de hoje (todos)
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
        AND p.role IN ('ADMIN', 'DIRETOR', 'GERENTE')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- R-02: Restringir SELECT em checkin_always_present_users
--   Antes: todos os autenticados viam TODOS os registros (incluindo histórico).
--   Depois:
--     • Qualquer autenticado vê apenas linhas enabled = true (necessário
--       para reconstrução da fila do dia).
--     • ADMIN / DIRETOR / GERENTE veem tudo.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.checkin_always_present_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read always present users" ON public.checkin_always_present_users;

CREATE POLICY "read always present active"
  ON public.checkin_always_present_users
  FOR SELECT
  TO authenticated
  USING (
    enabled = true
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'DIRETOR', 'GERENTE')
    )
  );
