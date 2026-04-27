-- Storage policies for training files in the 'documents' bucket.
-- Without these, Supabase blocks uploads and signed-URL generation
-- for the trainings/ folder (private bucket by default).

-- Allow authenticated users to upload to trainings/
CREATE POLICY "Authenticated users can upload training files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents' AND name LIKE 'trainings/%');

-- Allow authenticated users to read / generate signed URLs for trainings/
CREATE POLICY "Authenticated users can read training files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'documents' AND name LIKE 'trainings/%');

-- Allow authenticated users to overwrite training files (upsert: true)
CREATE POLICY "Authenticated users can update training files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'documents' AND name LIKE 'trainings/%');

-- Allow authenticated users to delete training files
CREATE POLICY "Authenticated users can delete training files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'documents' AND name LIKE 'trainings/%');
