-- Pré-voo: ACLs das RPCs citadas na auditoria.
-- Rodar no Postgres Axis de produção antes da onda 2.

SELECT p.proname,
       pg_catalog.pg_get_userbyid(a.grantee) AS grantee,
       a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a ON true
WHERE n.nspname = 'public'
  AND p.proname IN (
    'fazer_checkin',
    'distribute_lead',
    'redistribuir_pendentes',
    'reset_daily_presence',
    'checkout_noturno',
    'expire_presence',
    'cleanup_abandoned_conversations',
    'get_relatorio_diretoria',
    'get_presence_report',
    'get_xp_report',
    'get_manager_corretor_ids',
    'get_diretor_corretor_ids'
  )
ORDER BY 1, 2;
