-- Hotfix: client_documents schema differs across environments (uploaded_by may not exist)
-- Recreate all operational policies without depending on uploaded_by column.

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_documents_select_scoped ON public.client_documents;
DROP POLICY IF EXISTS client_documents_insert_scoped ON public.client_documents;
DROP POLICY IF EXISTS client_documents_update_scoped ON public.client_documents;
DROP POLICY IF EXISTS client_documents_delete_scoped ON public.client_documents;
DROP POLICY IF EXISTS "Users can view documents from their clients" ON public.client_documents;
DROP POLICY IF EXISTS "Users can insert documents for their clients" ON public.client_documents;
DROP POLICY IF EXISTS "Users can delete documents from their clients" ON public.client_documents;
DROP POLICY IF EXISTS zz_deny_all_authenticated_client_documents ON public.client_documents;

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

CREATE POLICY client_documents_insert_scoped
ON public.client_documents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_documents.client_id
  )
);

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
