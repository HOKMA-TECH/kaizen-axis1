-- Complementa dados obrigatorios dos proponentes adicionais

alter table if exists public.client_proponents
  add column if not exists address text,
  add column if not exists cotista text,
  add column if not exists social_factor text;
