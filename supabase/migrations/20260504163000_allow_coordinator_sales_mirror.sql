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
      and upper(coalesce(p.role, '')) in ('ADMIN', 'DIRETOR', 'GERENTE', 'COORDENADOR')
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
      and upper(coalesce(p.role, '')) in ('ADMIN', 'DIRETOR', 'GERENTE', 'COORDENADOR')
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
      and upper(coalesce(p.role, '')) in ('ADMIN', 'DIRETOR', 'GERENTE', 'COORDENADOR')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and upper(coalesce(p.role, '')) in ('ADMIN', 'DIRETOR', 'GERENTE', 'COORDENADOR')
  )
  and exists (
    select 1 from public.clients c where c.id = client_id and c.stage = 'Concluído'
  )
);
