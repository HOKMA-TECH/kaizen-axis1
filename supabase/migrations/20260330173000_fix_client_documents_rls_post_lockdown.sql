-- Fix client_documents RLS after lockdown migration
-- Allows authenticated users to work with documents of clients they can access via clients RLS.

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents FORCE ROW LEVEL SECURITY;

-- Remove deny-all fallback and any old policies to avoid conflicts
DROP POLICY IF EXISTS zz_deny_all_authenticated_client_documents ON public.client_documents;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_documents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.client_documents', pol.policyname);
  END LOOP;
END $$;

-- SELECT: user can read docs only from clients visible to that user
CREATE POLICY client_documents_select_scoped
ON public.client_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_documents.client_id
  )
);

-- INSERT: user can add docs only to clients visible to that user
-- and must stamp as uploader himself (when provided by app)
CREATE POLICY client_documents_insert_scoped
ON public.client_documents
FOR INSERT
TO authenticated
WITH CHECK (
  (uploaded_by IS NULL OR uploaded_by = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_documents.client_id
  )
);

-- UPDATE: allow edits only when linked client is still visible
CREATE POLICY client_documents_update_scoped
ON public.client_documents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_documents.client_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_documents.client_id
  )
);

-- DELETE: allow delete only when linked client is visible
CREATE POLICY client_documents_delete_scoped
ON public.client_documents
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_documents.client_id
  )
);
