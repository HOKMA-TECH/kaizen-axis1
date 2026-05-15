-- ══════════════════════════════════════════════════════════════════════════════
-- Fix: increment_request_counter GC window too narrow for daily scopes
-- Migration: 20260514240000_fix_rate_limit_gc_window.sql
--
-- The original GC deleted rows with window_start older than 2 hours.
-- The apuracao_daily scope uses a 24-hour window, so its counter rows were
-- being silently deleted by GC within 2 hours, resetting the daily quota.
-- Fix: extend GC retention to 48 hours so all current windows survive.
-- ══════════════════════════════════════════════════════════════════════════════

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

  -- GC: retain rows for 48 h to cover daily-window scopes (max windowSeconds = 86400 s)
  IF random() < 0.05 THEN
    DELETE FROM public.request_throttles
    WHERE window_start < timezone('utc', now()) - interval '48 hours';
  END IF;

  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_request_counter(text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_request_counter(text, text, timestamptz) TO service_role;
