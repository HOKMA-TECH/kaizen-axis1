-- ============================================================
-- PRESENCA AUTOMATICA NO CHECK-IN (A PARTIR DA DATA DE INICIO)
-- Migration: 20260506143000_checkin_always_present_users.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.checkin_always_present_users (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_always_present_enabled_start
  ON public.checkin_always_present_users (enabled, start_date);

ALTER TABLE public.checkin_always_present_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read always present users" ON public.checkin_always_present_users;
CREATE POLICY "Authenticated read always present users"
  ON public.checkin_always_present_users
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Service manages always present users" ON public.checkin_always_present_users;
CREATE POLICY "Service manages always present users"
  ON public.checkin_always_present_users
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION public.get_presence_report(
  p_start       DATE    DEFAULT CURRENT_DATE - 30,
  p_end         DATE    DEFAULT CURRENT_DATE,
  p_directorate UUID    DEFAULT NULL,
  p_team        TEXT    DEFAULT NULL,
  p_corretor    UUID    DEFAULT NULL,
  p_caller_id   UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role       TEXT;
  v_dir_id     UUID;
  v_total_days INTEGER;
BEGIN
  IF p_caller_id IS NOT NULL THEN
    SELECT UPPER(role), directorate_id
    INTO v_role, v_dir_id
    FROM public.profiles
    WHERE id = p_caller_id;

    IF v_role = 'DIRETOR' THEN
      p_directorate := v_dir_id;
    END IF;
  END IF;

  v_total_days := GREATEST((p_end - p_start) + 1, 1);

  RETURN (
    WITH effective_checkins AS (
      SELECT dc.user_id, dc.checkin_date
      FROM public.daily_checkins dc
      WHERE dc.checkin_date BETWEEN p_start AND p_end
      UNION
      SELECT ap.user_id, gs::DATE AS checkin_date
      FROM public.checkin_always_present_users ap
      CROSS JOIN generate_series(GREATEST(ap.start_date, p_start), p_end, INTERVAL '1 day') gs
      WHERE ap.enabled = TRUE
        AND ap.start_date <= p_end
    )
    SELECT jsonb_build_object(
      'metrics', (
        SELECT jsonb_build_object(
          'total_checkins',    COALESCE(SUM(sub.dc_count), 0),
          'usuarios_ativos',   COUNT(*) FILTER (WHERE sub.last_ci >= CURRENT_DATE - 7),
          'usuarios_inativos', COUNT(*) FILTER (WHERE sub.last_ci < CURRENT_DATE - 7 OR sub.last_ci IS NULL),
          'media_diaria',      ROUND(COALESCE(SUM(sub.dc_count)::NUMERIC / v_total_days, 0), 1)
        )
        FROM (
          SELECT
            p.id,
            COUNT(ec.checkin_date) AS dc_count,
            MAX(ec.checkin_date)   AS last_ci
          FROM public.profiles p
          LEFT JOIN effective_checkins ec ON ec.user_id = p.id
          WHERE (p_directorate IS NULL OR p.directorate_id = p_directorate)
            AND (p_team IS NULL        OR p.team = p_team)
            AND (p_corretor IS NULL    OR p.id = p_corretor)
          GROUP BY p.id
        ) sub
      ),
      'daily_presence', COALESCE((
        SELECT jsonb_agg(row ORDER BY row->>'date')
        FROM (
          SELECT jsonb_build_object('date', ec.checkin_date::TEXT, 'checkins', COUNT(*)) AS row
          FROM effective_checkins ec
          JOIN public.profiles p ON p.id = ec.user_id
          WHERE (p_directorate IS NULL OR p.directorate_id = p_directorate)
            AND (p_team IS NULL        OR p.team = p_team)
            AND (p_corretor IS NULL    OR p.id = p_corretor)
          GROUP BY ec.checkin_date
        ) t
      ), '[]'::JSONB),
      'weekly_presence', COALESCE((
        SELECT jsonb_agg(row ORDER BY row->>'week_key')
        FROM (
          SELECT jsonb_build_object(
            'week',     'Sem ' || LPAD(TO_CHAR(ec.checkin_date, 'IW'), 2, '0'),
            'week_key', TO_CHAR(ec.checkin_date, 'IYYY') || '-' || LPAD(TO_CHAR(ec.checkin_date, 'IW'), 2, '0'),
            'checkins', COUNT(*)
          ) AS row
          FROM effective_checkins ec
          JOIN public.profiles p ON p.id = ec.user_id
          WHERE (p_directorate IS NULL OR p.directorate_id = p_directorate)
            AND (p_team IS NULL        OR p.team = p_team)
            AND (p_corretor IS NULL    OR p.id = p_corretor)
          GROUP BY TO_CHAR(ec.checkin_date, 'IYYY'), TO_CHAR(ec.checkin_date, 'IW')
        ) t
      ), '[]'::JSONB),
      'by_directorate', COALESCE((
        SELECT jsonb_agg(row ORDER BY (row->>'checkins')::INT DESC)
        FROM (
          SELECT jsonb_build_object('name', COALESCE(d.name, 'Sem Diretoria'), 'checkins', COUNT(ec.checkin_date)) AS row
          FROM public.profiles p
          LEFT JOIN effective_checkins ec ON ec.user_id = p.id
          LEFT JOIN public.directorates d ON d.id = p.directorate_id
          WHERE (p_directorate IS NULL OR p.directorate_id = p_directorate)
          GROUP BY d.name
        ) t
      ), '[]'::JSONB),
      'ranking', COALESCE((
        SELECT jsonb_agg(row ORDER BY (row->>'dias_presenca')::INT DESC, row->>'name')
        FROM (
          SELECT jsonb_build_object(
            'id',             p.id,
            'name',           p.name,
            'directorate_id', p.directorate_id,
            'team',           p.team,
            'dias_presenca',  COUNT(DISTINCT ec.checkin_date),
            'ultimo_checkin', MAX(ec.checkin_date),
            'taxa_presenca',  ROUND(COUNT(DISTINCT ec.checkin_date)::NUMERIC * 100.0 / v_total_days, 1),
            'leads_atendidos', (SELECT COUNT(*) FROM public.leads l WHERE l.assigned_to = p.id AND l.created_at::DATE BETWEEN p_start AND p_end),
            'vendas', (SELECT COUNT(*) FROM public.leads l WHERE l.assigned_to = p.id AND l.created_at::DATE BETWEEN p_start AND p_end AND LOWER(COALESCE(l.stage, '')) IN ('convertido', 'concluído', 'contrato', 'conclusao', 'concluido')),
            'score', (COUNT(DISTINCT ec.checkin_date) * 2 + (SELECT COUNT(*) FROM public.leads l WHERE l.assigned_to = p.id AND l.created_at::DATE BETWEEN p_start AND p_end) + (SELECT COUNT(*) FROM public.leads l WHERE l.assigned_to = p.id AND l.created_at::DATE BETWEEN p_start AND p_end AND LOWER(COALESCE(l.stage, '')) IN ('convertido', 'concluído', 'contrato', 'conclusao', 'concluido')) * 5)
          ) AS row
          FROM public.profiles p
          LEFT JOIN effective_checkins ec ON ec.user_id = p.id
          WHERE (p_directorate IS NULL OR p.directorate_id = p_directorate)
            AND (p_team IS NULL        OR p.team = p_team)
            AND (p_corretor IS NULL    OR p.id = p_corretor)
          GROUP BY p.id, p.name, p.directorate_id, p.team
        ) t
      ), '[]'::JSONB),
      'alerts', COALESCE((
        SELECT jsonb_agg(row ORDER BY (row->>'dias_ausente')::INT DESC)
        FROM (
          SELECT jsonb_build_object(
            'id',             p.id,
            'name',           p.name,
            'team',           p.team,
            'directorate_id', p.directorate_id,
            'dias_ausente',   CURRENT_DATE - COALESCE(MAX(ec.checkin_date), '1970-01-01'::DATE)
          ) AS row
          FROM public.profiles p
          LEFT JOIN effective_checkins ec ON ec.user_id = p.id
          WHERE UPPER(COALESCE(p.status, '')) IN ('ACTIVE', 'ATIVO')
            AND (p_directorate IS NULL OR p.directorate_id = p_directorate)
          GROUP BY p.id, p.name, p.team, p.directorate_id
          HAVING MAX(ec.checkin_date) IS NOT NULL
             AND CURRENT_DATE - MAX(ec.checkin_date) > 10
        ) t
      ), '[]'::JSONB)
    )
  );
END;
$$;

INSERT INTO public.checkin_always_present_users (user_id, enabled, start_date)
SELECT p.id, TRUE, CURRENT_DATE
FROM public.profiles p
WHERE UPPER(TRANSLATE(TRIM(COALESCE(p.name, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')) IN (
  'GUSTAVO MACIEL',
  'BRENER RIBEIRO DE SOUZA',
  'ANDREY GUIMARAES MUNIZ',
  'PABLO ALCANTARA',
  'LUIZA MONTTEIRO',
  'BRUNO RIBEIRO DE SOUZA',
  'EVERSON DIEGO SANTOS DA SILVA',
  'MAICON OLIVEIRA'
)
ON CONFLICT (user_id) DO UPDATE
SET enabled = EXCLUDED.enabled,
    start_date = LEAST(public.checkin_always_present_users.start_date, EXCLUDED.start_date),
    updated_at = NOW();
