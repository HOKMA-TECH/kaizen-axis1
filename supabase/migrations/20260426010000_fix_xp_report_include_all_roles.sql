-- Corrige ranking de XP para incluir perfis com pontuacao alta que nao sao exibidos
-- Mantem comportamento: ranking por periodo selecionado

create or replace function public.get_xp_report(start_date date, end_date date)
returns table(
  user_id uuid,
  user_name text,
  total_xp bigint,
  training_xp bigint,
  sales_xp bigint,
  missions_xp bigint
)
language plpgsql
security definer
as $function$
begin
  return query
  select
    u.id,
    p.name,
    coalesce(sum(up.points), 0)::bigint as total_xp,
    coalesce(sum(up.points) filter (
      where lower(coalesce(up.source, '')) in ('training', 'treinamento')
    ), 0)::bigint as training_xp,
    coalesce(sum(up.points) filter (
      where lower(coalesce(up.source, '')) in ('sale', 'venda')
    ), 0)::bigint as sales_xp,
    coalesce(sum(up.points) filter (
      where lower(coalesce(up.source, '')) in ('missao', 'missão', 'meta', 'mensal', 'mission')
    ), 0)::bigint as missions_xp
  from auth.users u
  join public.profiles p
    on p.id = u.id
  left join public.user_points up
    on up.user_id = u.id
   and up.created_at::date >= start_date
   and up.created_at::date <= end_date
  where upper(coalesce(p.role, '')) in ('CORRETOR', 'COORDENADOR', 'GERENTE', 'DIRETOR', 'ADMIN', 'ANALISTA')
  group by u.id, p.name
  having coalesce(sum(up.points), 0) > 0
  order by total_xp desc;
end;
$function$;
