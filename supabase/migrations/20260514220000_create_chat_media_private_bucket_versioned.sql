-- P1-05: Version the chat-media-private bucket in migrations.
--
-- The frontend uploads view-once media to `chat-media-private` and
-- generate-view-once-url reads from it. Without this migration, environment
-- reproductions (staging, dev) would break view-once functionality.
--
-- Access model:
--   - INSERT: any authenticated user (path is UUID-based, not user-prefixed)
--   - SELECT: DENIED directly — all reads must go through generate-view-once-url
--             Edge Function which validates the recipient and marks the URL consumed.
--   - DELETE: only service_role (Edge Function wipes after view)
-- ─────────────────────────────────────────────────────────────────────────────

-- Create bucket if it doesn't exist, or update to ensure private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
  'chat-media-private',
  'chat-media-private',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/quicktime',
    'audio/mpeg','audio/ogg','audio/webm',
    'application/pdf'
  ]
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-media-private');

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/quicktime',
    'audio/mpeg','audio/ogg','audio/webm',
    'application/pdf'
  ]
WHERE id = 'chat-media-private';

-- INSERT: any authenticated user can upload view-once media
DROP POLICY IF EXISTS "chat_media_private_insert" ON storage.objects;
CREATE POLICY "chat_media_private_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media-private'
    AND auth.uid() IS NOT NULL
  );

-- SELECT: no direct access — reads must go through Edge Function
-- (No SELECT policy = no one can select directly except service_role)
DROP POLICY IF EXISTS "chat_media_private_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_private_select_authenticated" ON storage.objects;

-- DELETE: service_role only (bypasses RLS); no policy needed for it.
-- Explicitly block authenticated users from deleting (Edge Function handles cleanup)
DROP POLICY IF EXISTS "chat_media_private_delete" ON storage.objects;
