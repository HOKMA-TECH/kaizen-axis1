-- Reconciliacao em lote de vinculos de equipe
-- Objetivo:
-- 1) normalizar profiles.team/team_id para um unico team_id valido
-- 2) remover coordinator_id residual de perfis que nao sao CORRETOR
-- 3) reconstruir teams.members com base na verdade em profiles.team_id

DO $$
BEGIN
  -- 1) Resolve equipe efetiva para cada perfil (prioridade: team_id -> team(UUID) -> team(nome legado))
  CREATE TEMP TABLE tmp_profile_team_resolution (
    profile_id UUID PRIMARY KEY,
    effective_team_id UUID
  ) ON COMMIT DROP;

  INSERT INTO tmp_profile_team_resolution (profile_id, effective_team_id)
  SELECT
    p.id,
    COALESCE(
      t_by_team_id.id,
      t_by_team_uuid.id,
      t_by_name.id
    ) AS effective_team_id
  FROM public.profiles p
  LEFT JOIN public.teams t_by_team_id
    ON t_by_team_id.id = p.team_id
  LEFT JOIN public.teams t_by_team_uuid
    ON t_by_team_uuid.id::text = p.team::text
  LEFT JOIN LATERAL (
    SELECT t.id
    FROM public.teams t
    WHERE lower(trim(t.name)) = lower(trim(COALESCE(p.team::text, '')))
    ORDER BY t.id
    LIMIT 1
  ) t_by_name ON TRUE;

  -- Atualiza profiles para manter team e team_id consistentes
  UPDATE public.profiles p
  SET
    team_id = r.effective_team_id,
    team = r.effective_team_id::text
  FROM tmp_profile_team_resolution r
  WHERE p.id = r.profile_id
    AND (
      p.team_id IS DISTINCT FROM r.effective_team_id
      OR p.team::text IS DISTINCT FROM r.effective_team_id::text
    );

  -- Perfis sem equipe efetiva devem ficar com team/team_id nulos
  UPDATE public.profiles p
  SET
    team_id = NULL,
    team = NULL
  FROM tmp_profile_team_resolution r
  WHERE p.id = r.profile_id
    AND r.effective_team_id IS NULL
    AND (p.team_id IS NOT NULL OR p.team IS NOT NULL);

  -- 2) Se for gestor unico de uma equipe, garante vinculo nessa equipe
  WITH single_managers AS (
    SELECT
      manager_id,
      (array_agg(id ORDER BY id))[1] AS team_id
    FROM public.teams
    WHERE manager_id IS NOT NULL
    GROUP BY manager_id
    HAVING COUNT(*) = 1
  )
  UPDATE public.profiles p
  SET
    team_id = sm.team_id,
    team = sm.team_id::text
  FROM single_managers sm
  WHERE p.id = sm.manager_id
    AND (
      p.team_id IS DISTINCT FROM sm.team_id
      OR p.team::text IS DISTINCT FROM sm.team_id::text
    );

  -- Perfis nao-corretores nao devem manter coordinator_id residual
  UPDATE public.profiles
  SET coordinator_id = NULL
  WHERE coordinator_id IS NOT NULL
    AND upper(COALESCE(role, '')) <> 'CORRETOR';

  -- 3) Reconstrucao completa de teams.members a partir de profiles.team_id
  UPDATE public.teams t
  SET members = COALESCE(src.members, '{}'::uuid[])
  FROM (
    SELECT p.team_id AS team_id, array_agg(p.id ORDER BY p.id) AS members
    FROM public.profiles p
    WHERE p.team_id IS NOT NULL
    GROUP BY p.team_id
  ) src
  WHERE t.id = src.team_id;

  -- Equipes sem perfis vinculados ficam com array vazio
  UPDATE public.teams t
  SET members = '{}'::uuid[]
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.team_id = t.id
  )
    AND (t.members IS NULL OR cardinality(t.members) > 0);
END
$$;
