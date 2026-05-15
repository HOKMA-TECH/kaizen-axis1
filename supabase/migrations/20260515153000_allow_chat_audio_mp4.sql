-- Audio recordings can be produced as audio/mp4 on Safari/iOS and some Chromium
-- builds. The chat recorder now prefers audio/webm when available, but the
-- buckets must still accept audio/mp4 for compatible mobile browsers.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/gif','image/webp',
  'video/mp4','video/quicktime',
  'audio/mpeg','audio/ogg','audio/webm','audio/mp4',
  'application/pdf'
]
WHERE id IN ('chat-media', 'chat-media-private');
