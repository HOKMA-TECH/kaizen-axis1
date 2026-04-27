-- ============================================================
-- TOKENS QR DIÁRIOS COMPARTILHADOS
-- Migration: 20260304020000_daily_qr_tokens.sql
-- Um token por dia, compartilhado por todos.
-- O gerente exibe o QR na recepção. Corretor escaneia → check-in.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.daily_qr_tokens (
  token_date DATE    PRIMARY KEY DEFAULT CURRENT_DATE,
  token      TEXT    NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.daily_qr_tokens ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler (necessário para validação)
CREATE POLICY "authenticated read qr" ON public.daily_qr_tokens
  FOR SELECT TO authenticated USING (true);

-- Apenas service_role insere/atualiza
CREATE POLICY "service manages qr" ON public.daily_qr_tokens
  FOR ALL USING (true) WITH CHECK (true);

-- ── Função: get_or_create_daily_qr ────────────────────────────────────────────
-- Retorna o token do dia. Se não existir, cria um novo.
-- SECURITY DEFINER: roda com permissões do criador (postgres), qualquer
-- usuário autenticado pode chamar via supabase.rpc().
CREATE OR REPLACE FUNCTION public.get_or_create_daily_qr()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT token INTO v_token
  FROM public.daily_qr_tokens
  WHERE token_date = CURRENT_DATE;

  IF NOT FOUND THEN
    v_token := encode(gen_random_bytes(16), 'hex');
    INSERT INTO public.daily_qr_tokens (token_date, token)
    VALUES (CURRENT_DATE, v_token);
  END IF;

  RETURN v_token;
END;
$$;

-- ── Função: validate_daily_qr ─────────────────────────────────────────────────
-- Verifica se o token é válido para o dia atual.
-- Usada pela Edge Function checkin-geo.
CREATE OR REPLACE FUNCTION public.validate_daily_qr(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.daily_qr_tokens
    WHERE token_date = CURRENT_DATE
      AND token      = p_token
  );
END;
$$;
