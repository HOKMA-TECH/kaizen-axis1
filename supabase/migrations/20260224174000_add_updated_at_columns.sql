-- 1. Create the trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Add updated_at to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT NOW();

-- 3. Set updated_at to created_at by default
UPDATE public.clients SET updated_at = created_at WHERE updated_at > created_at + interval '1 hour' OR updated_at IS NULL;

-- 4. Try to backfill updated_at from client_history for sales
UPDATE public.clients c
SET updated_at = h.date
FROM (
  SELECT client_id, MAX(date) as date
  FROM public.client_history
  WHERE action LIKE '%Venda Concluída%' OR action LIKE '%Estágio alterado para%'
  GROUP BY client_id
) h
WHERE c.id = h.client_id;

-- 5. Add trigger for clients
DROP TRIGGER IF EXISTS set_clients_updated_at ON public.clients;
CREATE TRIGGER set_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Add updated_at to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT NOW();
UPDATE public.leads SET updated_at = created_at WHERE updated_at > created_at + interval '1 hour' OR updated_at IS NULL;

-- 7. Add trigger for leads
DROP TRIGGER IF EXISTS set_leads_updated_at ON public.leads;
CREATE TRIGGER set_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
