-- P1-01: Remove broad SELECT policy from chat-media bucket.
--
-- The previous policy allowed any authenticated user to SELECT (createSignedUrl)
-- from chat-media, regardless of conversation membership. This meant any user
-- who knew a file path could generate a signed URL for it.
--
-- After this migration:
--   - Direct createSignedUrl from the frontend will fail for authenticated users.
--   - All signed URL generation goes through get-chat-media-url Edge Function,
--     which validates conversation/group membership server-side before signing.
--   - INSERT remains unchanged (upload still works from frontend).
--   - service_role (used by Edge Function) bypasses RLS — no SELECT policy needed for it.
--
-- PREREQUISITES: Deploy get-chat-media-url Edge Function and verify it works
-- before applying this migration. Otherwise chat media will stop loading.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "chat_media_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_select"               ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;

-- No replacement SELECT policy — all reads go through Edge Function.
-- (service_role bypasses RLS and can still createSignedUrl internally.)
