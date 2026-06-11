-- Adiciona a coluna "builder" (construtora de interesse) à tabela clients.
-- Alimenta o gráfico de Construtoras no Painel Administrativo → Relatórios.
-- O valor é preenchido na ficha do cliente (lista do catálogo de empreendimentos
-- ou digitado livremente).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS builder text;

COMMENT ON COLUMN public.clients.builder IS 'Construtora de interesse do cliente (origem: ficha do cliente).';
