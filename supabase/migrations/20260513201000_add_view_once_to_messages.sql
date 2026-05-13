-- Add view-once support: messages that can only be opened once by the recipient.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS view_once         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_once_opened  boolean NOT NULL DEFAULT false;
