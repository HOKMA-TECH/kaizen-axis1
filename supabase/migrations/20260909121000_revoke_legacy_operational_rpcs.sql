-- A-02/A-03/A-04: RPCs operacionais deixam de ser executáveis por anon/authenticated.
-- O corpo de fazer_checkin NÃO muda: checkin-geo-v2 chama com service_role.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'fazer_checkin',
        'distribute_lead',
        'redistribuir_pendentes',
        'reset_daily_presence',
        'checkout_noturno',
        'expire_presence',
        'cleanup_abandoned_conversations'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$$;
