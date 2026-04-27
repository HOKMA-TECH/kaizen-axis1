-- ============================================================
-- Correção do Relatório de XP e Gamificação
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_xp_report(start_date date, end_date date)
 RETURNS TABLE(user_id uuid, user_name text, total_xp bigint, training_xp bigint, sales_xp bigint, missions_xp bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        u.id, 
        p.name,
        COALESCE(SUM(up.points), 0)::BIGINT AS total_xp,
        COALESCE(SUM(up.points) FILTER (WHERE LOWER(up.source) = 'training' OR LOWER(up.source) = 'treinamento'), 0)::BIGINT AS training_xp,
        COALESCE(SUM(up.points) FILTER (WHERE LOWER(up.source) = 'sale' OR LOWER(up.source) = 'venda'), 0)::BIGINT AS sales_xp,
        COALESCE(SUM(up.points) FILTER (WHERE up.source IN ('Missão', 'Meta', 'Mensal')), 0)::BIGINT AS missions_xp
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    -- Only show users with at least 1 point in this period, or show everyone?
    -- Current behavior: LEFT JOIN, so everyone in the roles. Let's make sure it groups well.
    LEFT JOIN public.user_points up ON up.user_id = u.id AND (up.created_at::DATE >= start_date AND up.created_at::DATE <= end_date)
    WHERE UPPER(COALESCE(p.role, '')) IN ('CORRETOR', 'ADMIN', 'DIRETOR', 'GERENTE')
    GROUP BY u.id, p.name
    -- Filter out users who have 0 total xp in this period completely (inner query filter) 
    -- Actually, if we want to show who has 0, we leave them. But typically reports just show who earned.
    -- I will require `total_xp > 0` directly or order by total_xp DESC
    -- We can use HAVING since we are grouping
    HAVING COALESCE(SUM(up.points), 0) > 0
    ORDER BY total_xp DESC;
END;
$function$;
