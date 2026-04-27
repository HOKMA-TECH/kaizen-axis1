-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: Políticas RLS do Storage para o bucket client-documents
-- Migration: 20260324030000_storage_client_documents_policies.sql
--
-- Problema: O bucket client-documents não tem políticas de leitura/escrita,
-- então createSignedUrl() falha silenciosamente e documentos não abrem.
-- ══════════════════════════════════════════════════════════════════════════════

-- Garante que o bucket existe (cria se não existir)
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Remove políticas antigas se existirem (idempotente)
DROP POLICY IF EXISTS "authenticated_read_client_documents"   ON storage.objects;
DROP POLICY IF EXISTS "authenticated_insert_client_documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_client_documents" ON storage.objects;

-- Permite que usuários autenticados LEIAM (gerar signed URL / download)
CREATE POLICY "authenticated_read_client_documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'client-documents');

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
