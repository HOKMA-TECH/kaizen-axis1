-- Chat improvements: reply/quote, emoji reactions, read receipts

-- Reply/Quote: foreign key to parent message
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL;

-- Emoji reactions: JSONB map of emoji -> array of user IDs
-- Example: { "👍": ["user-uuid-1", "user-uuid-2"], "❤️": ["user-uuid-3"] }
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;

-- Read receipts: timestamp when the receiver read the message
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Index for reply lookups
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to_id ON chat_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
