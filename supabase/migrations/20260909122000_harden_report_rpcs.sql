-- A-05/B-01/B-02: relatórios SECURITY DEFINER passam a exigir ADMIN/DIRETOR via JWT.
-- Assinaturas públicas permanecem para não quebrar PresenceReport/AdminPanel.

CREATE OR REPLACE FUNCTION public.app_require_admin_or_diretor()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN 'SERVICE';
  END IF;

  v_role := COALESCE(public.app_current_user_role(), '');
  IF v_role NOT IN ('ADMIN', 'DIRETOR') THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.app_require_admin_or_diretor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_require_admin_or_diretor() TO authenticated, service_role;

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
SET search_path = public
AS $$
DECLARE
  v_role       TEXT;
  v_total_days INTEGER;
BEGIN
  -- p_caller_id é ignorado para autorização; o chamador vem de auth.uid().
  v_role := public.app_require_admin_or_diretor();
  IF v_role = 'DIRETOR' THEN
    p_directorate := public.app_current_user_directorate_id();
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

CREATE OR REPLACE FUNCTION public.get_xp_report(start_date date, end_date date)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  total_xp bigint,
  training_xp bigint,
  sales_xp bigint,
  missions_xp bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.app_require_admin_or_diretor();

  RETURN QUERY
  SELECT
    u.id,
    p.name,
    COALESCE(SUM(up.points), 0)::bigint AS total_xp,
    COALESCE(SUM(up.points) FILTER (
      WHERE LOWER(COALESCE(up.source, '')) IN ('training', 'treinamento')
    ), 0)::bigint AS training_xp,
    COALESCE(SUM(up.points) FILTER (
      WHERE LOWER(COALESCE(up.source, '')) IN ('sale', 'venda')
    ), 0)::bigint AS sales_xp,
    COALESCE(SUM(up.points) FILTER (
      WHERE LOWER(COALESCE(up.source, '')) IN ('missao', 'missão', 'meta', 'mensal', 'mission')
    ), 0)::bigint AS missions_xp
  FROM auth.users u
  JOIN public.profiles p
    ON p.id = u.id
  LEFT JOIN public.user_points up
    ON up.user_id = u.id
   AND up.created_at::date >= start_date
   AND up.created_at::date <= end_date
  WHERE UPPER(COALESCE(p.role, '')) IN ('CORRETOR', 'COORDENADOR', 'GERENTE', 'DIRETOR', 'ADMIN', 'ANALISTA')
  GROUP BY u.id, p.name
  HAVING COALESCE(SUM(up.points), 0) > 0
  ORDER BY total_xp DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_relatorio_diretoria(
  diretoria_uuid uuid,
  p_start_date   timestamptz DEFAULT NULL,
  p_end_date     timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       text;
  v_resumo     jsonb;
  v_equipes    jsonb;
  v_corretores jsonb;
  v_dir_name   text;
BEGIN
  v_role := public.app_require_admin_or_diretor();
  IF v_role = 'DIRETOR'
     AND diretoria_uuid IS DISTINCT FROM public.app_current_user_directorate_id()
  THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_dir_name FROM public.directorates WHERE id = diretoria_uuid;
  IF v_dir_name IS NULL THEN
    RETURN jsonb_build_object('error', 'Diretoria não encontrada.');
  END IF;

  SELECT jsonb_build_object(
    'total_clientes',   count(*),
    'total_vendas',     count(*) FILTER (WHERE stage = 'Concluído'),
    'total_aprovados',  count(*) FILTER (WHERE stage = 'Aprovado'),
    'taxa_conversao',   ROUND(
                          COALESCE(count(*) FILTER (WHERE stage = 'Concluído'), 0)::numeric
                          / NULLIF(count(*), 0) * 100, 1
                        ),
    'receita_total',    COALESCE(
                          sum(public.parse_currency(intended_value))
                          FILTER (WHERE stage = 'Concluído'), 0
                        ),
    'ciclo_medio_dias', COALESCE(
                          ROUND(
                            AVG(
                              EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400
                            ) FILTER (WHERE stage = 'Concluído' AND closed_at IS NOT NULL), 0
                          ), 0
                        )
  )
  INTO v_resumo
  FROM public.clients
  WHERE directorate_id = diretoria_uuid
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date   IS NULL OR created_at <= p_end_date);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'equipe_id',      t.id,
      'equipe_nome',    t.name,
      'total_clientes', COALESCE(stats.total_clientes, 0),
      'total_vendas',   COALESCE(stats.total_vendas, 0)
    ) ORDER BY COALESCE(stats.total_vendas, 0) DESC
  ), '[]'::jsonb)
  INTO v_equipes
  FROM public.teams t
  LEFT JOIN (
    SELECT
      p.team AS team_name,
      count(c.id)                                          AS total_clientes,
      count(c.id) FILTER (WHERE c.stage = 'Concluído')    AS total_vendas
    FROM public.profiles p
    JOIN public.clients c ON c.owner_id = p.id
    WHERE p.directorate_id = diretoria_uuid
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_end_date   IS NULL OR c.created_at <= p_end_date)
    GROUP BY p.team
  ) stats ON stats.team_name = t.name
  WHERE t.directorate_id = diretoria_uuid;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'corretor_id',    p.id,
      'corretor_nome',  p.name,
      'equipe',         COALESCE(p.team, '—'),
      'total_clientes', COALESCE(stats.total_clientes, 0),
      'total_vendas',   COALESCE(stats.total_vendas, 0)
    ) ORDER BY COALESCE(stats.total_vendas, 0) DESC
  ), '[]'::jsonb)
  INTO v_corretores
  FROM public.profiles p
  LEFT JOIN (
    SELECT
      c.owner_id,
      count(c.id)                                          AS total_clientes,
      count(c.id) FILTER (WHERE c.stage = 'Concluído')    AS total_vendas
    FROM public.clients c
    WHERE (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_end_date   IS NULL OR c.created_at <= p_end_date)
    GROUP BY c.owner_id
  ) stats ON stats.owner_id = p.id
  WHERE p.directorate_id = diretoria_uuid
    AND upper(p.role) IN ('CORRETOR', 'GERENTE', 'COORDENADOR');

  RETURN jsonb_build_object(
    'diretoria_nome', v_dir_name,
    'resumo',         v_resumo,
    'equipes',        v_equipes,
    'corretores',     v_corretores
  );
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_presence_report', 'get_xp_report', 'get_relatorio_diretoria')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END
$$;
