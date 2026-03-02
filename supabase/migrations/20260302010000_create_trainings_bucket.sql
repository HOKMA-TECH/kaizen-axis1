-- Create a dedicated public bucket for training materials.
-- Using a public bucket eliminates signed-URL expiry issues and RLS read complexity.
-- Uploads still require authentication via storage policies below.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('trainings', 'trainings', true, 52428800, null)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload training materials
CREATE POLICY "Auth users can upload to trainings"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'trainings');

-- Allow authenticated users to overwrite (upsert) training materials
CREATE POLICY "Auth users can update trainings"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'trainings');

-- Allow authenticated users to delete training materials
CREATE POLICY "Auth users can delete trainings"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'trainings');
