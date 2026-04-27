-- ============================================================
-- CONVERSAS WHATSAPP — Estado do agente de IA
-- Migration: 20260304040000_wa_conversations.sql
--
-- Armazena histórico de conversa com leads via WhatsApp
-- até que a qualificação seja concluída e o lead seja criado.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wa_conversations (
  phone        TEXT        PRIMARY KEY,
  push_name    TEXT,
  messages     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  status       TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.wa_conversations IS 'Estado da conversa do agente IA por número de WhatsApp';
COMMENT ON COLUMN public.wa_conversations.messages IS 'Array de {role, content} para o histórico OpenAI';

-- Índice para limpeza de conversas antigas
CREATE INDEX IF NOT EXISTS idx_wa_conversations_updated
  ON public.wa_conversations(updated_at);

-- RLS
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;

-- Somente service_role acessa (n8n usa service_role key)
CREATE POLICY "service_role full access" ON public.wa_conversations
  USING (true) WITH CHECK (true);

-- ── Função: limpar conversas abandonadas (> 24h sem resposta) ─────────────
CREATE OR REPLACE FUNCTION public.cleanup_abandoned_conversations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.wa_conversations
  WHERE status = 'active'
    AND updated_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', v_count,
    'executed_at', NOW() AT TIME ZONE 'America/Sao_Paulo'
  );
END;
$$;
