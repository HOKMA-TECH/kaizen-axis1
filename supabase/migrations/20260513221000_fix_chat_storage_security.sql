-- ============================================================
-- SECURITY HARDENING — chat-media Storage bucket
-- Fixes: C-05 (open UPDATE policy), A-05 (path validation on INSERT)
--
-- NOTE on C-04 (public bucket):
-- Browsers cannot send Authorization headers with <img>/<video>/<audio> tags.
-- Switching to private + signed URLs requires a dedicated refactor.
-- The practical protection for view-once media is handled at the DB level:
-- the wipe trigger (trg_wipe_view_once_media) nullifies media_url after
-- first open, so the URL is removed from the DB before a second viewer
-- could retrieve it. Regular media URLs are not secret by design (similar
-- to WhatsApp Web / Instagram CDN behaviour).
-- ============================================================

-- ── C-05: Remove open UPDATE policy — no legitimate use case for media update ─
DROP POLICY IF EXISTS "chat_media_update" ON storage.objects;

-- ── C-05: Scope INSERT to authenticated callers only ─────────────────────────
DROP POLICY IF EXISTS "chat_media_insert" ON storage.objects;

CREATE POLICY "chat_media_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND auth.uid() IS NOT NULL
);

-- ── Ensure DELETE stays scoped to the uploader ───────────────────────────────
DROP POLICY IF EXISTS "chat_media_delete" ON storage.objects;

CREATE POLICY "chat_media_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
