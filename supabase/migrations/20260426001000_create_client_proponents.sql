-- Proponentes adicionais por ficha de cliente

create table if not exists public.client_proponents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  cpf text,
  email text,
  phone text,
  profession text,
  gross_income text,
  income_type text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_proponents_client_id
  on public.client_proponents (client_id);

create unique index if not exists uq_client_proponents_primary_per_client
  on public.client_proponents (client_id)
  where is_primary = true;

drop trigger if exists set_client_proponents_updated_at on public.client_proponents;
create trigger set_client_proponents_updated_at
before update on public.client_proponents
for each row
execute function public.update_updated_at_column();

alter table public.client_proponents enable row level security;
alter table public.client_proponents force row level security;

drop policy if exists client_proponents_select_scoped on public.client_proponents;
drop policy if exists client_proponents_insert_scoped on public.client_proponents;
drop policy if exists client_proponents_update_scoped on public.client_proponents;
drop policy if exists client_proponents_delete_scoped on public.client_proponents;

create policy client_proponents_select_scoped
on public.client_proponents
for select
to authenticated
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.clients c
    where c.id = client_proponents.client_id
      and public.app_user_in_scope(c.owner_id)
  )
);

create policy client_proponents_insert_scoped
on public.client_proponents
for insert
to authenticated
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.clients c
    where c.id = client_proponents.client_id
      and public.app_user_in_scope(c.owner_id)
  )
);

create policy client_proponents_update_scoped
on public.client_proponents
for update
to authenticated
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.clients c
    where c.id = client_proponents.client_id
      and public.app_user_in_scope(c.owner_id)
  )
)
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.clients c
    where c.id = client_proponents.client_id
      and public.app_user_in_scope(c.owner_id)
  )
);

create policy client_proponents_delete_scoped
on public.client_proponents
for delete
to authenticated
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.clients c
    where c.id = client_proponents.client_id
      and public.app_user_in_scope(c.owner_id)
  )
);
