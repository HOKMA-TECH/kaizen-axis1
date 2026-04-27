-- RLS Lockdown (defense-in-depth)
-- Goal: guarantee no accidental exposure via anon/public and enforce deny-by-default.

-- 1) Remove blanket table/sequence access from anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- 2) Ensure RLS is ON + FORCE on all critical tables (if they exist)
DO $$
DECLARE
  tbl text;
  critical_tables text[] := ARRAY[
    'achievements',
    'announcements',
    'appointments',
    'approved_events',
    'audit_logs',
    'chat_messages',
    'client_documents',
    'client_history',
    'clients',
    'daily_checkins',
    'daily_qr_tokens',
    'developments',
    'directorates',
    'followup_log',
    'goals',
    'income_audits',
    'leads',
    'message_history',
    'missions_templates',
    'n8n_chat_histories',
    'notifications',
    'portals',
    'profiles',
    'push_subscriptions',
    'request_throttles',
    'sales_events',
    'sales_streaks',
    'security_events',
    'system_events',
    'tasks',
    'teams',
    'training_completions',
    'trainings',
    'user_achievements',
    'user_points',
    'wa_conversations'
  ];
BEGIN
  FOREACH tbl IN ARRAY critical_tables LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;

-- 3) Drop any policy that explicitly grants access to anon/public roles
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        roles @> ARRAY['anon']::name[]
        OR roles @> ARRAY['public']::name[]
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- 4) For any critical table without authenticated/service_role policy, create explicit deny-all
DO $$
DECLARE
  tbl text;
  has_policy boolean;
  critical_tables text[] := ARRAY[
    'achievements',
    'announcements',
    'appointments',
    'approved_events',
    'audit_logs',
    'chat_messages',
    'client_documents',
    'client_history',
    'clients',
    'daily_checkins',
    'daily_qr_tokens',
    'developments',
    'directorates',
    'followup_log',
    'goals',
    'income_audits',
    'leads',
    'message_history',
    'missions_templates',
    'n8n_chat_histories',
    'notifications',
    'portals',
    'profiles',
    'push_subscriptions',
    'request_throttles',
    'sales_events',
    'sales_streaks',
    'security_events',
    'system_events',
    'tasks',
    'teams',
    'training_completions',
    'trainings',
    'user_achievements',
    'user_points',
    'wa_conversations'
  ];
BEGIN
  FOREACH tbl IN ARRAY critical_tables LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND (
          roles @> ARRAY['authenticated']::name[]
          OR roles @> ARRAY['service_role']::name[]
        )
    ) INTO has_policy;

    IF NOT has_policy THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
        'zz_deny_all_authenticated_' || tbl,
        tbl
      );
    END IF;
  END LOOP;
END $$;
