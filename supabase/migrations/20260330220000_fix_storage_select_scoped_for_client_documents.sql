-- Hotfix: restore document open/email attachment while keeping bucket private.
-- Strategy:
-- - keep anonymous users blocked from reading client-documents
-- - allow authenticated read only when the object is linked to a client_documents row visible by RLS

BEGIN;

UPDATE storage.buckets
SET public = false
WHERE id = 'client-documents';

DROP POLICY IF EXISTS zz_block_client_docs_select_auth ON storage.objects;
DROP POLICY IF EXISTS storage_client_docs_select_auth_scoped ON storage.objects;
DROP POLICY IF EXISTS authenticated_read_client_documents ON storage.objects;

DROP POLICY IF EXISTS zz_block_client_docs_select_anon ON storage.objects;
CREATE POLICY zz_block_client_docs_select_anon
ON storage.objects
AS RESTRICTIVE
FOR SELECT
TO anon
USING (bucket_id <> 'client-documents');

CREATE POLICY storage_client_docs_select_auth_scoped
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.client_documents d
    WHERE
      d.url = storage.objects.name
      OR d.url = ('/object/public/client-documents/' || storage.objects.name)
      OR split_part(split_part(d.url, '/object/sign/client-documents/', 2), '?', 1) = storage.objects.name
      OR split_part(d.url, '/object/public/client-documents/', 2) = storage.objects.name
  )
);

COMMIT;
