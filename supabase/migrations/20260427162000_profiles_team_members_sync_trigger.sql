-- Blindagem definitiva de vinculo de equipe
-- Garante que qualquer mudanca em profiles.team/team_id:
-- 1) normalize para um team_id valido
-- 2) mantenha profiles.team e profiles.team_id consistentes
-- 3) sincronize teams.members removendo vinculos antigos e duplicados

CREATE OR REPLACE FUNCTION public.resolve_profile_team_id(
  p_team_id uuid,
  p_team text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_team_id uuid;
BEGIN
  -- Prioridade 1: team_id ja informado
  IF p_team_id IS NOT NULL THEN
    SELECT t.id INTO v_team_id
    FROM public.teams t
    WHERE t.id = p_team_id
    LIMIT 1;

    IF v_team_id IS NOT NULL THEN
      RETURN v_team_id;
    END IF;
  END IF;

  -- Prioridade 2: team em formato UUID
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
      -- segue para tentativa por nome legado
      NULL;
    END;

    -- Prioridade 3: team em formato nome legado
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
AS $$
DECLARE
  v_old_team_id uuid;
  v_new_team_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_team_id := public.resolve_profile_team_id(OLD.team_id, OLD.team::text);

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

  -- Remove de equipe antiga quando mudou
  IF v_old_team_id IS NOT NULL AND v_old_team_id IS DISTINCT FROM v_new_team_id THEN
    UPDATE public.teams
    SET members = array_remove(coalesce(members, '{}'::uuid[]), NEW.id)
    WHERE id = v_old_team_id;
  END IF;

  -- Remove duplicidade em qualquer outra equipe
  IF v_new_team_id IS NOT NULL THEN
    UPDATE public.teams
    SET members = array_remove(coalesce(members, '{}'::uuid[]), NEW.id)
    WHERE id <> v_new_team_id
      AND NEW.id = ANY(coalesce(members, '{}'::uuid[]));

    -- Garante membro na equipe destino
    UPDATE public.teams
    SET members = CASE
      WHEN NEW.id = ANY(coalesce(members, '{}'::uuid[])) THEN coalesce(members, '{}'::uuid[])
      ELSE array_append(coalesce(members, '{}'::uuid[]), NEW.id)
    END
    WHERE id = v_new_team_id;
  ELSE
    -- Sem equipe destino: remove de qualquer members residual
    UPDATE public.teams
    SET members = array_remove(coalesce(members, '{}'::uuid[]), NEW.id)
    WHERE NEW.id = ANY(coalesce(members, '{}'::uuid[]));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_team_before_sync ON public.profiles;
CREATE TRIGGER trg_profiles_team_before_sync
BEFORE INSERT OR UPDATE OF team, team_id
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_profiles_team_before_sync();

DROP TRIGGER IF EXISTS trg_profiles_team_after_sync ON public.profiles;
CREATE TRIGGER trg_profiles_team_after_sync
AFTER INSERT OR UPDATE OF team, team_id OR DELETE
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_profiles_team_after_sync();
