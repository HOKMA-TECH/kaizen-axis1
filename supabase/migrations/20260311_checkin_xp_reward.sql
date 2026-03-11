-- ============================================================
-- INTEGRAÇÃO: Check-in concede 50 XP
-- Migration: 20260311_checkin_xp_reward.sql
-- Depende de:
--   - 20260304010000 (fazer_checkin function)
--   - 20260309_gamification_team_rewards.sql (user_points table)
-- ============================================================

-- Atualizar a função fazer_checkin para conceder 50 XP ao usuário
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
  v_already_processed BOOLEAN;
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

  -- ═══════════════════════════════════════════════════════════════════════════
  -- NOVO: Conceder 50 XP pelo check-in (integração com sistema de gamificação)
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Verificar se já concedeu XP para este check-in (anti-duplicação)
  SELECT EXISTS(
    SELECT 1
    FROM public.user_points
    WHERE user_id = p_user_id
      AND source = 'checkin'
      AND DATE(created_at) = v_date
  ) INTO v_already_processed;

  -- Se ainda não concedeu XP hoje, conceder 50 XP
  IF NOT v_already_processed THEN
    -- Inserir pontos na tabela user_points
    INSERT INTO public.user_points (user_id, points, source, reference_id)
    VALUES (p_user_id, 50, 'checkin', NULL);

    -- Registrar evento no sistema
    INSERT INTO public.system_events (type, user_id, payload)
    VALUES (
      'checkin_completed',
      p_user_id,
      jsonb_build_object(
        'position', v_pos,
        'date', v_date,
        'xp_earned', 50
      )
    );

    -- Verificar conquistas (achievements) - caso o usuário desbloqueie alguma
    PERFORM public.check_user_achievements(p_user_id);
  END IF;

  -- Buscar nome para resposta
  SELECT name INTO v_name
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success',  true,
    'position', v_pos,
    'name',     COALESCE(v_name, 'Usuário'),
    'date',     v_date,
    'xp_earned', 50
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- COMENTÁRIO: Explicação do sistema de XP integrado
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Como funciona:
-- 1. Usuário faz check-in (física ou via QR Code)
-- 2. Sistema valida localização, horário e duplicação
-- 3. Se check-in válido:
--    a. Registra na fila de distribuição (daily_checkins)
--    b. Concede 50 XP (user_points)
--    c. Registra evento no sistema (system_events)
--    d. Verifica se desbloqueou achievements
-- 4. XP aparece no leaderboard e perfil do usuário em tempo real
--
-- Anti-duplicação:
-- - O constraint unique(user_id, checkin_date) garante 1 check-in/dia
-- - A verificação de user_points garante que não conceda XP duplicado
--   mesmo se houver retry na Edge Function
--
-- Integração com Gamificação:
-- - user_points: Tabela centralizada de XP (usado no leaderboard)
-- - system_events: Feed de atividades (usado para notificações)
-- - check_user_achievements: Verifica se usuário desbloqueou badges
-- - useGamification hook: Atualiza UI em tempo real via Realtime
--
-- Exemplo de achievements desbloqueáveis:
-- - "Pontual": Check-in por 7 dias seguidos
-- - "Maratonista": Check-in por 30 dias seguidos
-- - "Primeiro do Dia": Posição #1 na fila 10 vezes
-- ══════════════════════════════════════════════════════════════════════════════
