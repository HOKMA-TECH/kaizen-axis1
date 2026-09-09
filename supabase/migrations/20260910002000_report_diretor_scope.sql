-- DIRETOR deixa de ver XP/métricas de outras diretorias.
CREATE OR REPLACE FUNCTION public.get_xp_report(start_date date, end_date date)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  total_xp bigint,
  training_xp bigint,
  sales_xp bigint,
  missions_xp bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role text;
  v_dir uuid;
BEGIN
  v_role := public.app_require_admin_or_diretor();
  v_dir := public.app_current_user_directorate_id();

  RETURN QUERY
  SELECT
    u.id,
    p.name,
    COALESCE(SUM(up.points), 0)::bigint AS total_xp,
    COALESCE(SUM(up.points) FILTER (
      WHERE LOWER(COALESCE(up.source, '')) IN ('training', 'treinamento')
    ), 0)::bigint AS training_xp,
    COALESCE(SUM(up.points) FILTER (
      WHERE LOWER(COALESCE(up.source, '')) IN ('sale', 'venda')
    ), 0)::bigint AS sales_xp,
    COALESCE(SUM(up.points) FILTER (
      WHERE LOWER(COALESCE(up.source, '')) IN ('missao', 'missão', 'meta', 'mensal', 'mission')
    ), 0)::bigint AS missions_xp
  FROM auth.users u
  JOIN public.profiles p
    ON p.id = u.id
  LEFT JOIN public.user_points up
    ON up.user_id = u.id
   AND up.created_at::date >= start_date
   AND up.created_at::date <= end_date
  WHERE UPPER(COALESCE(p.role, '')) IN ('CORRETOR', 'COORDENADOR', 'GERENTE', 'DIRETOR', 'ADMIN', 'ANALISTA')
    AND (
      v_role = 'ADMIN'
      OR p.directorate_id IS NOT DISTINCT FROM v_dir
    )
  GROUP BY u.id, p.name
  HAVING COALESCE(SUM(up.points), 0) > 0
  ORDER BY total_xp DESC;
END;
$function$;
