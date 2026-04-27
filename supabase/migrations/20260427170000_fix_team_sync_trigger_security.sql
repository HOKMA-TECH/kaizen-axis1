-- Fix definitivo: trigger de equipe com SECURITY DEFINER
-- Causa raiz: funcao de trigger rodando como usuario autenticado sob RLS,
-- sem visibilidade em teams em alguns cenarios, resolvendo team_id como NULL.

CREATE OR REPLACE FUNCTION public.resolve_profile_team_id(
  p_team_id uuid,
  p_team text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
BEGIN
  IF p_team_id IS NOT NULL THEN
    SELECT t.id INTO v_team_id
    FROM public.teams t
    WHERE t.id = p_team_id
    LIMIT 1;

    IF v_team_id IS NOT NULL THEN
      RETURN v_team_id;
    END IF;
  END IF;

  IF p_team IS NOT NULL AND btrim(p_team) <> '' THEN
    BEGIN
      SELECT t.id INTO v_team_id
      FROM public.teams t
      WHERE t.id = p_team::uuid
      LIMIT 1;

      IF v_team_id IS NOT NULL THEN
        RETURN v_team_id;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;

    SELECT t.id INTO v_team_id
    FROM public.teams t
    WHERE lower(btrim(t.name)) = lower(btrim(p_team))
    ORDER BY t.id
    LIMIT 1;

    IF v_team_id IS NOT NULL THEN
      RETURN v_team_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_profiles_team_before_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved_team_id uuid;
BEGIN
  v_resolved_team_id := public.resolve_profile_team_id(NEW.team_id, NEW.team::text);

  NEW.team_id := v_resolved_team_id;
  NEW.team := CASE WHEN v_resolved_team_id IS NULL THEN NULL ELSE v_resolved_team_id::text END;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_profiles_team_after_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_team_id uuid;
  v_new_team_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.teams
    SET members = array_remove(coalesce(members, '{}'::uuid[]), OLD.id)
    WHERE OLD.id = ANY(coalesce(members, '{}'::uuid[]));
    RETURN OLD;
  END IF;

  v_old_team_id := CASE
    WHEN TG_OP = 'UPDATE' THEN public.resolve_profile_team_id(OLD.team_id, OLD.team::text)
    ELSE NULL
  END;

  v_new_team_id := public.resolve_profile_team_id(NEW.team_id, NEW.team::text);

  IF v_old_team_id IS NOT NULL AND v_old_team_id IS DISTINCT FROM v_new_team_id THEN
    UPDATE public.teams
    SET members = array_remove(coalesce(members, '{}'::uuid[]), NEW.id)
    WHERE id = v_old_team_id;
  END IF;

  IF v_new_team_id IS NOT NULL THEN
    UPDATE public.teams
    SET members = array_remove(coalesce(members, '{}'::uuid[]), NEW.id)
    WHERE id <> v_new_team_id
      AND NEW.id = ANY(coalesce(members, '{}'::uuid[]));

    UPDATE public.teams
    SET members = CASE
      WHEN NEW.id = ANY(coalesce(members, '{}'::uuid[])) THEN coalesce(members, '{}'::uuid[])
      ELSE array_append(coalesce(members, '{}'::uuid[]), NEW.id)
    END
    WHERE id = v_new_team_id;
  ELSE
    UPDATE public.teams
    SET members = array_remove(coalesce(members, '{}'::uuid[]), NEW.id)
    WHERE NEW.id = ANY(coalesce(members, '{}'::uuid[]));
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_target_team_id uuid;
BEGIN
  -- Backfill pontual para casos já quebrados (ex.: Ana Silva) para a equipe teste
  SELECT t.id
  INTO v_target_team_id
  FROM public.teams t
  WHERE lower(btrim(t.name)) = lower('equipe teste')
  ORDER BY t.id
  LIMIT 1;

  IF v_target_team_id IS NOT NULL THEN
    UPDATE public.profiles p
    SET team_id = v_target_team_id,
        team = v_target_team_id::text
    WHERE lower(p.name) LIKE '%ana silva%';
  END IF;

  -- Reprocessa os perfis para consolidar sync
  UPDATE public.profiles
  SET team = team
  WHERE id IS NOT NULL;
END
$$;
