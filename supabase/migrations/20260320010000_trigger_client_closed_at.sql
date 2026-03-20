-- Trigger: preenche closed_at nos clientes quando stage muda para 'Concluído'
-- Isso alimenta o cálculo de Ciclo Médio de Venda nos relatórios.

CREATE OR REPLACE FUNCTION public.set_client_closed_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage = 'Concluído' AND (OLD.stage IS DISTINCT FROM 'Concluído') THEN
    NEW.closed_at = NOW();
  END IF;
  -- Se saiu de Concluído (reversão), limpa o closed_at
  IF NEW.stage != 'Concluído' AND OLD.stage = 'Concluído' THEN
    NEW.closed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_closed_at ON public.clients;
CREATE TRIGGER trg_client_closed_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.set_client_closed_at();
