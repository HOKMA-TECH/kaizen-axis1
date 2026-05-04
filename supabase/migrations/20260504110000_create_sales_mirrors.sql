create table if not exists public.sales_mirrors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  const_invest text,
  empreendimento text,
  cliente_1 text,
  cpf_1 text,
  cliente_2 text,
  cpf_2 text,
  vgv text,
  origem text,
  unidade text,
  gerente text,
  bloco text,
  coordenador text,
  corretor text,
  data_ato text,
  valor_ato text,
  pago_pela_kaizen text,
  cca text,
  data_contrato text,
  ass_gerente text,
  ass_diretor_venda text,
  ass_setor_avulso text,
  ass_diretor_financeiro text,
  ass_diretor_comercial text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales_mirrors enable row level security;

drop policy if exists "sales_mirrors_select_leadership" on public.sales_mirrors;
create policy "sales_mirrors_select_leadership"
on public.sales_mirrors
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and upper(coalesce(p.role, '')) in ('ADMIN', 'DIRETOR', 'GERENTE')
  )
);

drop policy if exists "sales_mirrors_insert_leadership" on public.sales_mirrors;
create policy "sales_mirrors_insert_leadership"
on public.sales_mirrors
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and upper(coalesce(p.role, '')) in ('ADMIN', 'DIRETOR', 'GERENTE')
  )
  and exists (
    select 1 from public.clients c where c.id = client_id and c.stage = 'Concluído'
  )
);

drop policy if exists "sales_mirrors_update_leadership" on public.sales_mirrors;
create policy "sales_mirrors_update_leadership"
on public.sales_mirrors
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and upper(coalesce(p.role, '')) in ('ADMIN', 'DIRETOR', 'GERENTE')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and upper(coalesce(p.role, '')) in ('ADMIN', 'DIRETOR', 'GERENTE')
  )
  and exists (
    select 1 from public.clients c where c.id = client_id and c.stage = 'Concluído'
  )
);
