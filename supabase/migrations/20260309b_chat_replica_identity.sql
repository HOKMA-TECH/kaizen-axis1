-- Enable REPLICA IDENTITY FULL on chat_messages so that Supabase Realtime
-- postgres_changes UPDATE events include the full row data (all columns).
-- This is required for UPDATE-based real-time listeners to work correctly.
ALTER TABLE chat_messages REPLICA IDENTITY FULL;
