-- ══════════════════════════════════════════════════════════════════════════════
-- FIX v2: Políticas RLS do Storage para o bucket client-documents
-- Migration: 20260326000000_storage_client_documents_policies_v2.sql
--
-- A geração de signed URL (SELECT) é coberta pela edge function get-doc-url
-- via service role, então não precisa de política SELECT aqui.
-- Esta migration garante que upload (INSERT) e delete (DELETE) funcionem
-- para usuários autenticados — ambas operações chamadas client-side.
-- ══════════════════════════════════════════════════════════════════════════════

-- Garante que o bucket existe e é privado
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Remove políticas antigas (idempotente)
DROP POLICY IF EXISTS "authenticated_read_client_documents"   ON storage.objects;
DROP POLICY IF EXISTS "authenticated_insert_client_documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_client_documents" ON storage.objects;

-- Permite que usuários autenticados façam UPLOAD
CREATE POLICY "authenticated_insert_client_documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-documents');

-- Permite que usuários autenticados DELETEM
CREATE POLICY "authenticated_delete_client_documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'client-documents');

-- Mantém SELECT para compatibilidade (caso alguém chame createSignedUrl diretamente)
CREATE POLICY "authenticated_read_client_documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'client-documents');
