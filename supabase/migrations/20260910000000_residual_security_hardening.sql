-- Residual security after 2026090912* : QR global, reports, fila, mirrors, scope, storage, FORCE RLS.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_or_create_daily_qr'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.app_user_in_scope(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      target_user_id = auth.uid()
      OR public.app_current_user_role() = 'ADMIN'
      OR (
        public.app_current_user_role() = 'DIRETOR'
        AND EXISTS (
          SELECT 1
          FROM public.profiles t
          WHERE t.id = target_user_id
            AND t.directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id()
        )
      )
      OR (
        public.app_current_user_role() = 'COORDENADOR'
        AND target_user_id IN (
          SELECT p.id FROM public.profiles p WHERE p.coordinator_id = auth.uid()
        )
      )
      OR (
        public.app_current_user_role() = 'GERENTE'
        AND (
          target_user_id IN (SELECT p.id FROM public.profiles p WHERE p.manager_id = auth.uid())
          OR target_user_id IN (
            SELECT p.id
            FROM public.profiles p
            INNER JOIN public.teams t ON t.id = p.team::uuid
            WHERE t.manager_id = auth.uid()
          )
          OR target_user_id IN (
            SELECT p.id
            FROM public.profiles p
            WHERE p.coordinator_id IN (
              SELECT c.id FROM public.profiles c WHERE c.manager_id = auth.uid()
            )
          )
        )
      )
    );
$$;

DROP POLICY IF EXISTS "read daily checkins restricted" ON public.daily_checkins;
CREATE POLICY "read daily checkins restricted"
  ON public.daily_checkins
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND UPPER(COALESCE(p.role, '')) IN (
          'ADMIN', 'DIRETOR', 'GERENTE', 'RECEPCAO', 'RECEPCAO_ZN', 'RECEPCAO_NI'
        )
    )
  );

DROP POLICY IF EXISTS "sales_mirrors_select_leadership" ON public.sales_mirrors;
CREATE POLICY "sales_mirrors_select_leadership"
ON public.sales_mirrors
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND UPPER(COALESCE(p.role, '')) = 'ADMIN'
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.clients c ON c.id = sales_mirrors.client_id
    WHERE p.id = auth.uid()
      AND UPPER(COALESCE(p.role, '')) IN ('DIRETOR', 'GERENTE', 'COORDENADOR')
      AND c.directorate_id IS NOT DISTINCT FROM p.directorate_id
  )
);

ALTER TABLE public.sales_mirrors FORCE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND NOT c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.delete_user_permanently(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_permanently(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "chat_media_insert" ON storage.objects;
CREATE POLICY "chat_media_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS chat_media_private_insert ON storage.objects;
CREATE POLICY chat_media_private_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-media-private'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE OR REPLACE FUNCTION public.protect_http_url_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate text;
BEGIN
  IF TG_TABLE_NAME = 'developments' AND NEW.book_pdf_url IS NOT NULL THEN
    candidate := lower(btrim(NEW.book_pdf_url));
    IF candidate <> '' AND candidate !~ '^https://' THEN
      RAISE EXCEPTION 'URL inválida: use apenas https';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'portals' AND NEW.url IS NOT NULL THEN
    candidate := lower(btrim(NEW.url));
    IF candidate <> '' AND candidate !~ '^https://' THEN
      RAISE EXCEPTION 'URL inválida: use apenas https';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'developments' AND column_name = 'book_pdf_url'
  ) THEN
    DROP TRIGGER IF EXISTS trg_protect_developments_urls ON public.developments;
    CREATE TRIGGER trg_protect_developments_urls
    BEFORE INSERT OR UPDATE ON public.developments
    FOR EACH ROW EXECUTE FUNCTION public.protect_http_url_columns();
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'portals' AND column_name = 'url'
  ) THEN
    DROP TRIGGER IF EXISTS trg_protect_portals_urls ON public.portals;
    CREATE TRIGGER trg_protect_portals_urls
    BEFORE INSERT OR UPDATE ON public.portals
    FOR EACH ROW EXECUTE FUNCTION public.protect_http_url_columns();
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.push_dispatch_config
  DROP COLUMN IF EXISTS service_role_key;

ALTER TABLE IF EXISTS public.push_dispatch_config
  ADD COLUMN IF NOT EXISTS supabase_url text;

CREATE OR REPLACE FUNCTION public.tg_notifications_dispatch_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  base_url text;
  service_key text;
  endpoint text;
BEGIN
  SELECT NULLIF(btrim(c.supabase_url), '') INTO base_url
  FROM public.push_dispatch_config c
  WHERE c.id = 1;
  service_key := NULLIF(current_setting('app.settings.service_role_key', true), '');
  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'push dispatch skipped: missing url or app.settings.service_role_key';
    RETURN NEW;
  END IF;
  endpoint := rtrim(base_url, '/') || '/functions/v1/send-push';
  BEGIN
    PERFORM net.http_post(
      url := endpoint,
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', to_jsonb(NEW)
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      timeout_milliseconds := 4000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_notifications_dispatch_push: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
