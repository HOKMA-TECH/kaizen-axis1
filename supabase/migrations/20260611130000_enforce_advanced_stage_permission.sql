-- Garantia no servidor: apenas ADMIN/DIRETOR/GERENTE/COORDENADOR podem definir
-- etapas avançadas do pipeline (Contrato, Formulários, Conformidade, Abertura de
-- Conta, Repasse, Concluído) — tanto ao CRIAR quanto ao MOVER um cliente.
-- Complementa a trava de front-end (não burlável por API direta).
--
-- Observação: escrituras sem usuário autenticado (service_role / backend confiável)
-- não são bloqueadas — auth.uid() é NULL nesses casos.

CREATE OR REPLACE FUNCTION public.enforce_advanced_stage_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acting_role text;
  advanced_stages text[] := ARRAY['Contrato','Formulários','Conformidade','Abertura de Conta','Repasse','Concluído'];
BEGIN
  -- Só verifica quando a etapa-alvo é avançada e está sendo definida agora
  IF NEW.stage = ANY(advanced_stages)
     AND (TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage) THEN

    -- Operações sem usuário autenticado (backend/service_role) são confiáveis
    IF auth.uid() IS NOT NULL THEN
      SELECT upper(role) INTO acting_role FROM public.profiles WHERE id = auth.uid();

      IF acting_role IS NOT NULL
         AND acting_role NOT IN ('ADMIN','DIRETOR','GERENTE','COORDENADOR') THEN
        RAISE EXCEPTION 'Apenas Coordenador, Gerente, Diretor ou ADMIN podem mover o cliente para "%".', NEW.stage
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_advanced_stage_permission ON public.clients;
CREATE TRIGGER trg_enforce_advanced_stage_permission
  BEFORE INSERT OR UPDATE OF stage ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_advanced_stage_permission();
