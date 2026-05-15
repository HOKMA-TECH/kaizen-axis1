-- P1-01: Drop the remaining INSERT policy that allows any authenticated user
-- to insert directly into notifications.
--
-- The policy "notifications_insert_authenticated" was created in
-- 20260514150000 and recreated in 20260514180000. The previous lockdown
-- migration (20260514190000) dropped three other policy names but missed
-- this one. This migration closes that gap.
--
-- After this migration, INSERT into notifications is only possible via:
--   1. service_role (Edge Function send-notification)
--   2. SECURITY DEFINER functions / trusted triggers
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

-- Drop ALL known INSERT policies (idempotent)
DROP POLICY IF EXISTS "notifications_insert_authenticated"        ON public.notifications;
DROP POLICY IF EXISTS "authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications"            ON public.notifications;
DROP POLICY IF EXISTS "allow_insert_notifications"                ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_admin"                ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_service"              ON public.notifications;

-- No INSERT policy is created here.
-- service_role bypasses RLS by default — the send-notification Edge Function
-- uses service_role exclusively and validates the caller's identity via JWT.
