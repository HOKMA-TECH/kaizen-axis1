-- ============================================================
-- CHECK-IN ANTIFRAUDE + FILA POR ORDEM DE CHEGADA
-- Migration: 20260304010000_checkin_antifraude.sql
-- Depende de: 20260302020000 (profiles.status_presenca, profiles.ultimo_checkin)
-- ============================================================

-- ── 1. TABELA: daily_checkins ──────────────────────────────────────────────────
-- Registra check-ins diários com posição na fila de distribuição.
-- A coluna unique(user_id, checkin_date) garante 1 check-in por dia por usuário.
CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  checkin_time      TIMESTAMPTZ NOT NULL DEFAULT now(),
  position_in_queue INTEGER     NOT NULL,
  latitude          FLOAT8,
  longitude         FLOAT8,
  created_at        TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_user_daily UNIQUE (user_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_date
  ON public.daily_checkins (checkin_date, position_in_queue);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user
  ON public.daily_checkins (user_id, checkin_date);

ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados podem ler a fila do dia (para exibição)
CREATE POLICY "read daily checkins" ON public.daily_checkins
  FOR SELECT TO authenticated USING (true);

-- Apenas service_role insere (via Edge Function checkin-geo)
CREATE POLICY "service inserts checkin" ON public.daily_checkins
  FOR INSERT WITH CHECK (true);


-- ── 2. FUNÇÃO ATÔMICA: fazer_checkin ──────────────────────────────────────────
-- Chamada pela Edge Function checkin-geo após validar horário e geolocalização.
-- Usa pg_advisory_xact_lock para garantir que a posição seja calculada
-- de forma atômica — sem dois corretores receberem a mesma posição.
--
-- Retorna JSONB:
--   { success: true,  position: N, name: "..." }
--   { success: false, error: "ja_fez_checkin", position: N, message: "..." }
CREATE OR REPLACE FUNCTION public.fazer_checkin(
  p_user_id   UUID,
  p_latitude  FLOAT8 DEFAULT NULL,
  p_longitude FLOAT8 DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date    DATE    := CURRENT_DATE;
  v_pos     INTEGER;
  v_name    TEXT;
BEGIN
  -- Lock por dia: garante que dois check-ins simultâneos não calculem a mesma posição
  PERFORM pg_advisory_xact_lock(hashtext('fazer_checkin_' || v_date::TEXT));

  -- Verificar se já fez check-in hoje
  SELECT position_in_queue INTO v_pos
  FROM public.daily_checkins
  WHERE user_id = p_user_id AND checkin_date = v_date;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success',  false,
      'error',    'ja_fez_checkin',
      'message',  'Você já realizou check-in hoje.',
      'position', v_pos
    );
  END IF;

  -- Calcular próxima posição na fila (MAX + 1, dentro do lock)
  SELECT COALESCE(MAX(position_in_queue), 0) + 1
  INTO v_pos
  FROM public.daily_checkins
  WHERE checkin_date = v_date;

  -- Inserir check-in
  INSERT INTO public.daily_checkins
    (user_id, checkin_date, checkin_time, position_in_queue, latitude, longitude)
  VALUES
    (p_user_id, v_date, now(), v_pos, p_latitude, p_longitude);

  -- Marcar presença no profile (usado por distribute_lead)
  UPDATE public.profiles
  SET status_presenca = 'presente',
      ultimo_checkin  = now()
  WHERE id = p_user_id;

  -- Buscar nome para resposta
  SELECT name INTO v_name
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success',  true,
    'position', v_pos,
    'name',     COALESCE(v_name, 'Usuário'),
    'date',     v_date
  );
END;
$$;


-- ── 3. FUNÇÃO: redistribuir_pendentes ─────────────────────────────────────────
-- Chamada pelo cron n8n às 08:00 para distribuir leads que ficaram pendentes
-- porque nenhum corretor estava presente no momento da chegada do lead.
CREATE OR REPLACE FUNCTION public.redistribuir_pendentes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead    RECORD;
  v_result  JSONB;
  v_count   INTEGER := 0;
  v_errors  INTEGER := 0;
BEGIN
  FOR v_lead IN
    SELECT id
    FROM public.leads
    WHERE distribution_status = 'aguardando_distribuicao'
    ORDER BY created_at ASC
  LOOP
    SELECT public.distribute_lead(v_lead.id) INTO v_result;
    IF (v_result->>'distributed')::BOOLEAN THEN
      v_count := v_count + 1;
    ELSE
      v_errors := v_errors + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success',     true,
    'distributed', v_count,
    'still_pending', v_errors,
    'executed_at', NOW()
  );
END;
$$;


-- ── 4. ÍNDICE ADICIONAL: leads pendentes ──────────────────────────────────────
-- Já existe em 20260302020000, mas adiciona fallback caso não exista
CREATE INDEX IF NOT EXISTS idx_leads_dist_status
  ON public.leads (distribution_status)
  WHERE distribution_status = 'aguardando_distribuicao';
