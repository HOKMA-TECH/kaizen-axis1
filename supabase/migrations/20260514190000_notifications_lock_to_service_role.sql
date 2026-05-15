-- C-03: Remove authenticated INSERT on notifications; only service_role (Edge Function) may insert.
-- Authenticated users can still read their own notifications (existing SELECT policy unchanged).

-- Drop any existing INSERT policy for authenticated users
DROP POLICY IF EXISTS "authenticated users can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can insert notifications" ON notifications;
DROP POLICY IF EXISTS "allow_insert_notifications" ON notifications;

-- Ensure RLS is enabled
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default; no INSERT policy needed for it.
-- All INSERTs from frontend are now routed through the send-notification Edge Function
-- which uses the service_role key and validates the caller's identity via JWT.
