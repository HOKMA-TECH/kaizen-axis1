-- Campos de perfil específicos do chat (nome, foto, status, disponibilidade)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chat_display_name  text,
  ADD COLUMN IF NOT EXISTS chat_avatar_url    text,
  ADD COLUMN IF NOT EXISTS chat_status_text   text,
  ADD COLUMN IF NOT EXISTS chat_availability  text DEFAULT 'available'
    CHECK (chat_availability IN ('available', 'busy', 'dnd'));
