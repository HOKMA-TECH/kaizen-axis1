-- Fix: closed_at para clientes Concluído sem data de fechamento
--
-- Causa raiz: o trigger trg_client_closed_at é BEFORE UPDATE.
-- Clientes inseridos direto com stage='Concluído' (INSERT, não UPDATE)
-- nunca tiveram o trigger disparado e ficaram com closed_at = NULL.
--
-- Esta migration:
-- 1. Faz backfill do closed_at nos clientes afetados, usando o histórico
--    quando disponível (MIN de ações de conclusão) ou created_at como fallback.
-- 2. Adiciona trigger de INSERT para cobrir criações futuras com stage='Concluído'.

-- ── 1. Backfill ───────────────────────────────────────────────────────────────
UPDATE public.clients c
SET closed_at = COALESCE(
  -- Prefere a data mais antiga de mudança para Concluído no histórico
  (
    SELECT MIN(h.created_at)
    FROM public.client_history h
    WHERE h.client_id = c.id
      AND lower(COALESCE(h.action, '')) LIKE '%conclu%'
  ),
  -- Fallback: data de criação do próprio cliente
  c.created_at
)
WHERE c.stage IN ('Concluído', 'Concluido')
  AND c.closed_at IS NULL;

-- ── 2. Trigger de INSERT ──────────────────────────────────────────────────────
-- Garante que clientes criados já como Concluído recebam closed_at imediatamente.
CREATE OR REPLACE FUNCTION public.set_client_closed_at_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage IN ('Concluído', 'Concluido') AND NEW.closed_at IS NULL THEN
    NEW.closed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_closed_at_insert ON public.clients;
CREATE TRIGGER trg_client_closed_at_insert
BEFORE INSERT ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.set_client_closed_at_on_insert();
