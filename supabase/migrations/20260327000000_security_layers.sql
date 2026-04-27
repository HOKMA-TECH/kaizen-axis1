-- ══════════════════════════════════════════════════════════════════════════════
-- Camadas de Segurança
-- Migration: 20260327000000_security_layers.sql
-- Cria infraestrutura de auditoria, monitoramento e rate limiting no banco.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Audit Logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  ip_address  inet,
  device_info text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_security_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role
    INTO current_role
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN UPPER(COALESCE(current_role, '')) IN ('ADMIN', 'DIRETOR');
END;
$$;

REVOKE ALL ON FUNCTION public.is_security_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_security_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_security_admin() TO service_role;

DROP POLICY IF EXISTS "security_admin_read_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "service_role_manage_audit_logs" ON public.audit_logs;

CREATE POLICY "security_admin_read_audit_logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.is_security_admin());

CREATE POLICY "service_role_manage_audit_logs"
ON public.audit_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ── Security Events ───────────────────────────────────────────────────────────
CREATE TYPE IF NOT EXISTS public.security_event_severity AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE IF NOT EXISTS public.security_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type     text NOT NULL,
  description    text,
  severity       public.security_event_severity NOT NULL DEFAULT 'medium',
  source_action  text,
  ip_address     inet,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events (event_type);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_admin_read_events" ON public.security_events;
DROP POLICY IF EXISTS "service_role_manage_events" ON public.security_events;

CREATE POLICY "security_admin_read_events"
ON public.security_events
FOR SELECT
TO authenticated
USING (public.is_security_admin());

CREATE POLICY "service_role_manage_events"
ON public.security_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ── Rate Limiting Support ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.request_throttles (
  scope        text NOT NULL,
  identifier   text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0,
  last_request_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (scope, identifier, window_start)
);

CREATE INDEX IF NOT EXISTS idx_request_throttles_scope ON public.request_throttles (scope);

ALTER TABLE public.request_throttles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_throttles" ON public.request_throttles;

CREATE POLICY "service_role_manage_throttles"
ON public.request_throttles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.increment_request_counter(
  _scope text,
  _identifier text,
  _window_start timestamptz
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO public.request_throttles (scope, identifier, window_start, count, last_request_at)
  VALUES (_scope, _identifier, _window_start, 1, timezone('utc', now()))
  ON CONFLICT (scope, identifier, window_start)
  DO UPDATE SET
    count = public.request_throttles.count + 1,
    last_request_at = timezone('utc', now())
  RETURNING public.request_throttles.count INTO new_count;

  -- GC simples para evitar crescimento indefinido
  IF random() < 0.05 THEN
    DELETE FROM public.request_throttles
    WHERE window_start < timezone('utc', now()) - interval '2 hours';
  END IF;

  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_request_counter(text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_request_counter(text, text, timestamptz) TO service_role;

-- ── Suspicious Behavior Trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.detect_suspicious_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  failure_count integer;
  view_count integer;
  download_count integer;
  existing_event uuid;
BEGIN
  IF NEW.action = 'login_failed' THEN
    SELECT count(*) INTO failure_count
    FROM public.audit_logs
    WHERE action = 'login_failed'
      AND (ip_address = NEW.ip_address OR (NEW.user_id IS NOT NULL AND user_id = NEW.user_id))
      AND created_at >= timezone('utc', now()) - interval '10 minutes';

    IF failure_count >= 5 THEN
      SELECT id INTO existing_event
      FROM public.security_events
      WHERE event_type = 'login_bruteforce'
        AND (ip_address = NEW.ip_address OR (NEW.user_id IS NOT NULL AND user_id = NEW.user_id))
        AND created_at >= timezone('utc', now()) - interval '10 minutes'
      LIMIT 1;

      IF existing_event IS NULL THEN
        INSERT INTO public.security_events (user_id, event_type, description, severity, source_action, ip_address, metadata)
        VALUES (
          NEW.user_id,
          'login_bruteforce',
          'Múltiplas tentativas de login falhadas detectadas',
          'high',
          NEW.action,
          NEW.ip_address,
          jsonb_build_object('failures', failure_count)
        );
      END IF;
    END IF;

  ELSIF NEW.action = 'client_view' THEN
    SELECT count(*) INTO view_count
    FROM public.audit_logs
    WHERE action = 'client_view'
      AND user_id = NEW.user_id
      AND created_at >= timezone('utc', now()) - interval '1 minute';

    IF view_count >= 50 THEN
      SELECT id INTO existing_event
      FROM public.security_events
      WHERE event_type = 'mass_client_access'
        AND user_id = NEW.user_id
        AND created_at >= timezone('utc', now()) - interval '5 minutes'
      LIMIT 1;

      IF existing_event IS NULL THEN
        INSERT INTO public.security_events (user_id, event_type, description, severity, source_action, metadata)
        VALUES (
          NEW.user_id,
          'mass_client_access',
          'Volume incomum de fichas de clientes acessadas',
          'medium',
          NEW.action,
          jsonb_build_object('views_last_minute', view_count)
        );
      END IF;
    END IF;

  ELSIF NEW.action = 'document_downloaded' THEN
    SELECT count(*) INTO download_count
    FROM public.audit_logs
    WHERE action = 'document_downloaded'
      AND user_id = NEW.user_id
      AND created_at >= timezone('utc', now()) - interval '1 hour';

    IF download_count >= 100 THEN
      SELECT id INTO existing_event
      FROM public.security_events
      WHERE event_type = 'mass_document_download'
        AND user_id = NEW.user_id
        AND created_at >= timezone('utc', now()) - interval '1 hour'
      LIMIT 1;

      IF existing_event IS NULL THEN
        INSERT INTO public.security_events (user_id, event_type, description, severity, source_action, metadata)
        VALUES (
          NEW.user_id,
          'mass_document_download',
          'Downloads excessivos de documentos detectados',
          'high',
          NEW.action,
          jsonb_build_object('downloads_last_hour', download_count)
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_suspicious_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_suspicious_activity() TO service_role;

DROP TRIGGER IF EXISTS trg_detect_suspicious_activity ON public.audit_logs;

CREATE TRIGGER trg_detect_suspicious_activity
AFTER INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.detect_suspicious_activity();
