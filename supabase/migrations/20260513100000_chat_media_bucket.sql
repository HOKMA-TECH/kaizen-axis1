-- Bucket para mídias do chat (imagens, vídeos, áudios, avatars)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/heic','video/mp4','video/quicktime','video/webm','audio/webm','audio/mp4','audio/mpeg','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/csv']
)
ON CONFLICT (id) DO NOTHING;

-- Política: autenticados podem fazer upload
CREATE POLICY "chat_media_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-media');

-- Política: autenticados podem atualizar (upsert)
CREATE POLICY "chat_media_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'chat-media');

-- Política: leitura pública
CREATE POLICY "chat_media_select" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'chat-media');

-- Política: dono pode deletar
CREATE POLICY "chat_media_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
