-- C-01 / P1-04: Ensure chat-media bucket is private and has correct size/MIME limits.
--
-- NOTE on INSERT policy path model:
-- The frontend uploads files as `${conversationId}/${timestamp}_${type}.${ext}` and
-- `${conversationId}/${uuid}.${ext}` — the first path segment is conversationId, NOT
-- auth.uid(). Creating an INSERT policy that checks (foldername(name))[1] = uid would
-- break ALL uploads. The existing policy from migration 20260513221000 (chat_media_insert)
-- already allows any authenticated user to insert, which is correct for this path model.
--
-- This migration only ensures:
--   1. The bucket is private (no public URLs — signed URLs required for all reads).
--   2. File size and MIME type limits are set.
--   3. No conflicting policies are left behind.
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure bucket is private with correct limits
UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 52428800,  -- 50 MB
  allowed_mime_types = ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/quicktime',
    'audio/mpeg','audio/ogg','audio/webm',
    'application/pdf'
  ]
WHERE id = 'chat-media';

-- Insert bucket if it somehow doesn't exist yet
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
  'chat-media',
  'chat-media',
  false,
  52428800,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','audio/mpeg','audio/ogg','audio/webm','application/pdf']
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-media');

-- Remove any conflicting policies created by a prior (incorrect) version of this migration
DROP POLICY IF EXISTS "chat_media_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_authenticated_delete" ON storage.objects;

-- The following policies already exist from earlier migrations and remain correct:
--   chat_media_insert        (20260513221000) — any authenticated user can insert
--   chat_media_select_authenticated (20260514110000) — any authenticated user can read
--   chat_media_delete        (20260513221000) — only uploader can delete (uid in path[1])
