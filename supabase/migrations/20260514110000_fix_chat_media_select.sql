-- SEC-06: Remover acesso público (anon) ao bucket chat-media
-- Antes: SELECT TO public (qualquer pessoa sem auth acessa se souber o path)
-- Depois: SELECT TO authenticated (apenas usuários logados)

-- 1. Remover política pública
DROP POLICY IF EXISTS "chat_media_select" ON storage.objects;

-- 2. Criar política restrita a usuários autenticados
CREATE POLICY "chat_media_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND auth.uid() IS NOT NULL
);

-- 3. Marcar bucket como privado
UPDATE storage.buckets
SET public = false
WHERE id = 'chat-media';
