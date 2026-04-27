-- ─── Tabela de push subscriptions (Web Push / VAPID) ─────────────────────────
-- Armazena os objetos de subscription do browser para cada usuário/dispositivo.
-- Um mesmo usuário pode ter múltiplos dispositivos (celular + desktop).

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL,
  subscription JSONB      NOT NULL,   -- { endpoint, keys: { p256dh, auth } }
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Cada usuário só gerencia as próprias subscriptions
CREATE POLICY "push_sub_own" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Service role (Edge Function) pode ler todas as subscriptions para enviar push
CREATE POLICY "push_sub_service_read" ON public.push_subscriptions
  FOR SELECT USING (auth.role() = 'service_role');
