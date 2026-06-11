-- Adiciona a coluna "neighborhood" (bairro de interesse) à tabela clients.
-- Funciona em conjunto com region_of_interest (cidade): cidade → bairro.
-- Alimenta o drill-down do gráfico de Regiões no Painel Administrativo.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS neighborhood text;

COMMENT ON COLUMN public.clients.neighborhood IS 'Bairro de interesse do cliente (dentro da cidade em region_of_interest).';
