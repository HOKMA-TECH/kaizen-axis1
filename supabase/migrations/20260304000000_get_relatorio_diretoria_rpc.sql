-- ─── RPC: get_relatorio_diretoria ────────────────────────────────────────────
-- Returns summary, teams, and brokers filtered by directorate UUID.
-- Called from Reports.tsx when scope=diretoria.

CREATE OR REPLACE FUNCTION public.get_relatorio_diretoria(diretoria_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_resumo     jsonb;
  v_equipes    jsonb;
  v_corretores jsonb;
  v_dir_name   text;
BEGIN
  -- Validate directorate exists
  SELECT name INTO v_dir_name FROM public.directorates WHERE id = diretoria_uuid;
  IF v_dir_name IS NULL THEN
    RETURN jsonb_build_object('error', 'Diretoria não encontrada.');
  END IF;

  -- 1. Resumo geral da diretoria
  SELECT jsonb_build_object(
    'total_clientes',  count(*),
    'total_vendas',    count(*) FILTER (WHERE stage = 'Concluído'),
    'taxa_conversao',  ROUND(
                         COALESCE(count(*) FILTER (WHERE stage = 'Concluído'), 0)::numeric
                         / NULLIF(count(*), 0) * 100, 1
                       ),
    'receita_total',   COALESCE(
                         sum(public.parse_currency(intended_value))
                         FILTER (WHERE stage = 'Concluído'), 0
                       )
  )
  INTO v_resumo
  FROM public.clients
  WHERE directorate_id = diretoria_uuid;

  -- 2. Por equipe  (teams.directorate_id → profiles.team = teams.name → clients.owner_id)
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
      AND upper(p.role) = 'CORRETOR'
    GROUP BY p.team
  ) stats ON stats.team_name = t.name
  WHERE t.directorate_id = diretoria_uuid;

  -- 3. Por corretor
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
    GROUP BY c.owner_id
  ) stats ON stats.owner_id = p.id
  WHERE p.directorate_id = diretoria_uuid
    AND upper(p.role) = 'CORRETOR';

  RETURN jsonb_build_object(
    'diretoria_nome', v_dir_name,
    'resumo',         v_resumo,
    'equipes',        v_equipes,
    'corretores',     v_corretores
  );
END;
$$;

-- Index guards for performance (idempotent)
CREATE INDEX IF NOT EXISTS idx_clients_directorate ON public.clients(directorate_id);
CREATE INDEX IF NOT EXISTS idx_profiles_directorate ON public.profiles(directorate_id);
CREATE INDEX IF NOT EXISTS idx_teams_directorate ON public.teams(directorate_id);
