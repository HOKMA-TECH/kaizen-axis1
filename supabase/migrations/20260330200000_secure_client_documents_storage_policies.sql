-- Security hotfix: tighten Storage RLS for client-documents bucket.
-- Prevents authenticated users from signing/downloading arbitrary files by path guessing.

-- Ensure the bucket is private.
UPDATE storage.buckets
SET public = false
WHERE id = 'client-documents';

-- Remove legacy/broad policies for this bucket.
DROP POLICY IF EXISTS "authenticated_read_client_documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_insert_client_documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_client_documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view documents from their clients" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents for their clients" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their client documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update client documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload client documents" ON storage.objects;

-- Defensive cleanup: drop any storage.objects policy mentioning this bucket.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        coalesce(qual, '') ILIKE '%client-documents%'
        OR coalesce(with_check, '') ILIKE '%client-documents%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- UUID folder regex for first path segment.
-- Files are stored as: <client_id>/<filename>

CREATE POLICY storage_client_docs_select_scoped
ON storage.objects
FOR SELECT
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
