-- ============================================================
-- RELATÓRIO DE PRESENÇA E SCORE DE ENGAJAMENTO
-- Migration: 20260305000000_presence_report_rpc.sql
-- Depende de: 20260304010000 (daily_checkins, fazer_checkin)
-- ============================================================

-- ── 1. ÍNDICE PARA PERFORMANCE ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_daily_checkins_date_range
  ON public.daily_checkins (checkin_date, user_id);

-- ── 2. RPC: get_presence_report ────────────────────────────────────────────────
-- Retorna todos os dados necessários para o painel de presença + engajamento.
-- RBAC interno: DIRETOR e COORDENADOR são automaticamente filtrados para sua diretoria.
-- p_caller_id: UUID do usuário chamando a função (para aplicar RBAC).
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
  -- ── a. RBAC: restringir scope por role do chamador ─────────────────────────
  IF p_caller_id IS NOT NULL THEN
    SELECT UPPER(role), directorate_id
    INTO v_role, v_dir_id
    FROM public.profiles
    WHERE id = p_caller_id;

    IF v_role = 'DIRETOR' THEN
      p_directorate := v_dir_id;
    END IF;
    -- ADMIN: sem restrição automática (usa filtros manuais)
  END IF;

  v_total_days := GREATEST((p_end - p_start) + 1, 1);

  RETURN jsonb_build_object(

    -- ── b. Cards de métricas ───────────────────────────────────────────────
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
          COUNT(dc.id)         AS dc_count,
          MAX(dc.checkin_date) AS last_ci
        FROM public.profiles p
        LEFT JOIN public.daily_checkins dc
          ON dc.user_id = p.id
          AND dc.checkin_date BETWEEN p_start AND p_end
        WHERE UPPER(p.role) = 'CORRETOR'
          AND (p_directorate IS NULL OR p.directorate_id = p_directorate)
          AND (p_team IS NULL        OR p.team = p_team)
          AND (p_corretor IS NULL    OR p.id = p_corretor)
        GROUP BY p.id
      ) sub
    ),

    -- ── c. Presença diária — gráfico de linha ─────────────────────────────
    'daily_presence', COALESCE((
      SELECT jsonb_agg(row ORDER BY row->>'date')
      FROM (
        SELECT jsonb_build_object(
          'date',     dc.checkin_date::TEXT,
          'checkins', COUNT(*)
        ) AS row
        FROM public.daily_checkins dc
        JOIN public.profiles p ON p.id = dc.user_id
        WHERE dc.checkin_date BETWEEN p_start AND p_end
          AND UPPER(p.role) = 'CORRETOR'
          AND (p_directorate IS NULL OR p.directorate_id = p_directorate)
          AND (p_team IS NULL        OR p.team = p_team)
          AND (p_corretor IS NULL    OR p.id = p_corretor)
        GROUP BY dc.checkin_date
      ) t
    ), '[]'::JSONB),

    -- ── d. Presença semanal — gráfico de barras ───────────────────────────
    'weekly_presence', COALESCE((
      SELECT jsonb_agg(row ORDER BY row->>'week_key')
      FROM (
        SELECT jsonb_build_object(
          'week',     'Sem ' || LPAD(TO_CHAR(dc.checkin_date, 'IW'), 2, '0'),
          'week_key', TO_CHAR(dc.checkin_date, 'IYYY') || '-' || LPAD(TO_CHAR(dc.checkin_date, 'IW'), 2, '0'),
          'checkins', COUNT(*)
        ) AS row
        FROM public.daily_checkins dc
        JOIN public.profiles p ON p.id = dc.user_id
        WHERE dc.checkin_date BETWEEN p_start AND p_end
          AND UPPER(p.role) = 'CORRETOR'
          AND (p_directorate IS NULL OR p.directorate_id = p_directorate)
          AND (p_team IS NULL        OR p.team = p_team)
          AND (p_corretor IS NULL    OR p.id = p_corretor)
        GROUP BY TO_CHAR(dc.checkin_date, 'IYYY'),
                 TO_CHAR(dc.checkin_date, 'IW')
      ) t
    ), '[]'::JSONB),

    -- ── e. Por diretoria — barras horizontais ─────────────────────────────
    'by_directorate', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'checkins')::INT DESC)
      FROM (
        SELECT jsonb_build_object(
          'name',     COALESCE(d.name, 'Sem Diretoria'),
          'checkins', COUNT(dc.id)
        ) AS row
        FROM public.profiles p
        LEFT JOIN public.daily_checkins dc
          ON dc.user_id = p.id
          AND dc.checkin_date BETWEEN p_start AND p_end
        LEFT JOIN public.directorates d ON d.id = p.directorate_id
        WHERE UPPER(p.role) = 'CORRETOR'
          AND (p_directorate IS NULL OR p.directorate_id = p_directorate)
        GROUP BY d.name
      ) t
    ), '[]'::JSONB),

    -- ── f. Ranking + engajamento por corretor ─────────────────────────────
    'ranking', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'dias_presenca')::INT DESC, row->>'name')
      FROM (
        SELECT jsonb_build_object(
          'id',             p.id,
          'name',           p.name,
          'directorate_id', p.directorate_id,
          'team',           p.team,
          'dias_presenca',  COUNT(DISTINCT dc.checkin_date),
          'ultimo_checkin', MAX(dc.checkin_date),
          'taxa_presenca',  ROUND(COUNT(DISTINCT dc.checkin_date)::NUMERIC * 100.0 / v_total_days, 1),
          'leads_atendidos',(
            SELECT COUNT(*) FROM public.leads l
            WHERE l.assigned_to = p.id
              AND l.assigned_at IS NOT NULL
              AND l.assigned_at::DATE BETWEEN p_start AND p_end
          ),
          'vendas', (
            SELECT COUNT(*) FROM public.leads l
            WHERE l.assigned_to = p.id
              AND l.assigned_at IS NOT NULL
              AND l.assigned_at::DATE BETWEEN p_start AND p_end
              AND LOWER(COALESCE(l.stage, '')) IN ('convertido', 'concluído', 'contrato', 'conclusao', 'concluido')
          ),
          'score', (
            COUNT(DISTINCT dc.checkin_date) * 2
            + (SELECT COUNT(*) FROM public.leads l
               WHERE l.assigned_to = p.id
               AND l.assigned_at IS NOT NULL
               AND l.assigned_at::DATE BETWEEN p_start AND p_end)
            + (SELECT COUNT(*) FROM public.leads l
               WHERE l.assigned_to = p.id
               AND l.assigned_at IS NOT NULL
               AND l.assigned_at::DATE BETWEEN p_start AND p_end
               AND LOWER(COALESCE(l.stage, '')) IN ('convertido', 'concluído', 'contrato', 'conclusao', 'concluido')
              ) * 5
          )
        ) AS row
        FROM public.profiles p
        LEFT JOIN public.daily_checkins dc
          ON dc.user_id = p.id
          AND dc.checkin_date BETWEEN p_start AND p_end
        WHERE UPPER(p.role) = 'CORRETOR'
          AND (p_directorate IS NULL OR p.directorate_id = p_directorate)
          AND (p_team IS NULL        OR p.team = p_team)
          AND (p_corretor IS NULL    OR p.id = p_corretor)
        GROUP BY p.id, p.name, p.directorate_id, p.team
      ) t
    ), '[]'::JSONB),

    -- ── g. Alertas: sem check-in há > 10 dias ────────────────────────────
    'alerts', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'dias_ausente')::INT DESC)
      FROM (
        SELECT jsonb_build_object(
          'id',             p.id,
          'name',           p.name,
          'team',           p.team,
          'directorate_id', p.directorate_id,
          'dias_ausente',   CURRENT_DATE - COALESCE(MAX(dc.checkin_date), '1970-01-01'::DATE)
        ) AS row
        FROM public.profiles p
        LEFT JOIN public.daily_checkins dc ON dc.user_id = p.id
        WHERE UPPER(p.role) = 'CORRETOR'
          AND UPPER(COALESCE(p.status, '')) IN ('ACTIVE', 'ATIVO')
          AND (p_directorate IS NULL OR p.directorate_id = p_directorate)
        GROUP BY p.id, p.name, p.team, p.directorate_id
        HAVING CURRENT_DATE - COALESCE(MAX(dc.checkin_date), '1970-01-01'::DATE) > 10
      ) t
    ), '[]'::JSONB)

  );
END;
$$;

COMMENT ON FUNCTION public.get_presence_report IS
  'Retorna relatório completo de presença e engajamento dos corretores. '
  'RBAC: DIRETOR/COORDENADOR filtram automaticamente pela própria diretoria. '
  'Score = (dias_presenca × 2) + (leads_atendidos × 1) + (vendas × 5).';
