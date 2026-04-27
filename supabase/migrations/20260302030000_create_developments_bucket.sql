-- Public bucket for developments media (images, PDFs, avatars).
-- Public = true to avoid signed-URL expiry issues on page refresh.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'developments',
  'developments',
  true,
  52428800, -- 50 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload
CREATE POLICY "Auth users can upload to developments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'developments');

-- Authenticated users can overwrite (upsert)
CREATE POLICY "Auth users can update developments"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'developments');

-- Authenticated users can delete
CREATE POLICY "Auth users can delete developments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'developments');

-- Anyone can read (public bucket)
CREATE POLICY "Public can read developments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'developments');
