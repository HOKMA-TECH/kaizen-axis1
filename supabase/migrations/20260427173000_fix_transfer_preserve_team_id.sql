-- Fix definitivo da TROCA de equipe
-- Problema observado: em algumas trocas, team/team_id voltava para NULL.
-- Causa provável: tentativa de resolver equipe via SELECT em teams durante trigger
-- sob RLS/contexto restrito, resultando NULL na normalizacao.
-- Solucao: preservar team_id informado na troca como fonte de verdade.

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
  -- Regra principal: se veio team_id, preserva exatamente esse valor.
  -- Evita nulificacao indevida durante transferencia.
  IF p_team_id IS NOT NULL THEN
    RETURN p_team_id;
  END IF;

  -- Fallback 1: team em formato UUID
  IF p_team IS NOT NULL AND btrim(p_team) <> '' THEN
    BEGIN
      RETURN p_team::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;

    -- Fallback 2: team em formato nome legado
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

  -- Preserva explicitamente NEW.team_id recebido na troca
  v_new_team_id := COALESCE(NEW.team_id, public.resolve_profile_team_id(NEW.team_id, NEW.team::text));

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
