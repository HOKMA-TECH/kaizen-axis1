-- Critical security hotfix:
-- Disable direct Storage signed URL generation for client-documents via /storage/v1/object/sign.
-- App must use Edge Function get-doc-url (which enforces access checks).

UPDATE storage.buckets
SET public = false
WHERE id = 'client-documents';

-- Remove any SELECT policy that allows reading client-documents in storage.objects.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd = 'SELECT'
      AND (
        coalesce(qual, '') ILIKE '%client-documents%'
        OR coalesce(with_check, '') ILIKE '%client-documents%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Keep upload/update/delete restricted by scope; no direct SELECT policy.
DROP POLICY IF EXISTS storage_client_docs_insert_scoped ON storage.objects;
DROP POLICY IF EXISTS storage_client_docs_update_scoped ON storage.objects;
DROP POLICY IF EXISTS storage_client_docs_delete_scoped ON storage.objects;

CREATE POLICY storage_client_docs_insert_scoped
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-documents'
  AND auth.uid() IS NOT NULL
  AND (
    (
      split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE c.id = split_part(name, '/', 1)::uuid
      )
    )
    OR (
      split_part(name, '/', 1) = 'general_audits'
      AND owner = auth.uid()
    )
  )
);

CREATE POLICY storage_client_docs_update_scoped
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-documents'
  AND auth.uid() IS NOT NULL
  AND (
    (
      split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE c.id = split_part(name, '/', 1)::uuid
      )
    )
    OR (
      split_part(name, '/', 1) = 'general_audits'
      AND owner = auth.uid()
    )
  )
)
WITH CHECK (
  bucket_id = 'client-documents'
  AND auth.uid() IS NOT NULL
  AND (
    (
      split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE c.id = split_part(name, '/', 1)::uuid
      )
    )
    OR (
      split_part(name, '/', 1) = 'general_audits'
      AND owner = auth.uid()
    )
  )
);

CREATE POLICY storage_client_docs_delete_scoped
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-documents'
  AND auth.uid() IS NOT NULL
  AND (
    (
      split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE c.id = split_part(name, '/', 1)::uuid
      )
    )
    OR (
      split_part(name, '/', 1) = 'general_audits'
      AND owner = auth.uid()
    )
  )
);
