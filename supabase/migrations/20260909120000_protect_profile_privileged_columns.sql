-- A-01: impede autoescalada de papel/status/hierarquia no próprio perfil.
-- Mantém profiles_update_own para campos livres (nome, avatar, telefone, endereço).
-- A unidade de check-in permanece na trigger já existente.

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_dir uuid;
  v_privileged boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  v_privileged :=
    NEW.role IS DISTINCT FROM OLD.role
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.directorate_id IS DISTINCT FROM OLD.directorate_id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.team IS DISTINCT FROM OLD.team
    OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
    OR NEW.coordinator_id IS DISTINCT FROM OLD.coordinator_id;

  IF NOT v_privileged THEN
    RETURN NEW;
  END IF;

  IF COALESCE((SELECT auth.role()), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_role := COALESCE((SELECT public.app_current_user_role()), '');
  v_dir := (SELECT public.app_current_user_directorate_id());

  IF v_role = 'ADMIN' THEN
    RETURN NEW;
  END IF;

  IF v_role = 'DIRETOR'
     AND UPPER(COALESCE(NEW.role, '')) <> 'ADMIN'
     AND UPPER(COALESCE(OLD.role, '')) <> 'ADMIN'
     AND NEW.directorate_id IS NOT DISTINCT FROM v_dir
     AND (OLD.directorate_id IS NULL OR OLD.directorate_id IS NOT DISTINCT FROM v_dir)
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Não é permitido alterar papel, status ou vínculos hierárquicos.'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_privileged_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_privileged_columns() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_privileged_columns();
