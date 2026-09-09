SELECT tgname FROM pg_trigger WHERE tgname = 'trg_protect_profile_privileged_columns';
SELECT p.proname || '=' || has_function_privilege('authenticated', p.oid, 'execute')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fazer_checkin','distribute_lead','reset_daily_presence','cleanup_abandoned_conversations','get_or_create_daily_qr')
ORDER BY 1;
SELECT p.proname || '=service_role:' || has_function_privilege('service_role', p.oid, 'execute')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'fazer_checkin';
SELECT proname FROM pg_proc WHERE proname IN ('app_current_user_is_active','app_require_admin_or_diretor') ORDER BY 1;
