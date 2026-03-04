-- ============================================================
-- SYSTEM HARDENING — Produção robusta
-- Migration: 20260304030000_system_hardening.sql
--
-- Mudanças:
-- 1. distribute_lead(): timezone correto + filtro checkin_date + ordenação justa
-- 2. reset_daily_presence(): cron 00:00 BRT — limpa presença + check-ins antigos
-- 3. checkout_noturno():     cron 22:00 BRT — marca todos como ausentes
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- 1. CORRIGIR distribute_lead()
--
-- Melhorias:
--   a) Valida horário 08:00–22:00 com timezone America/Sao_Paulo (sem UTC manual)
--   b) Filtra corretores por checkin_date = CURRENT_DATE (presença real de hoje)
--   c) Ordena por position_in_queue ASC, depois carga de leads ASC (round-robin justo)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.distribute_lead(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ctrl              RECORD;
  v_corretores        UUID[];
  v_n                 INTEGER;
  v_last_idx          INTEGER := 0;
  v_selected_idx      INTEGER;
  v_selected_corretor UUID;
  v_workload          INTEGER;
  v_attempts          INTEGER := 0;
  v_lead              RECORD;
  v_corretor          RECORD;
  v_brt_hour          INTEGER;
  i                   INTEGER;
BEGIN
  -- ── a. Verificar horário BRT com timezone real ────────────────────────────
  v_brt_hour := EXTRACT(HOUR FROM now() AT TIME ZONE 'America/Sao_Paulo');

  IF v_brt_hour < 8 OR v_brt_hour >= 22 THEN
    UPDATE public.leads
    SET distribution_status = 'aguardando_distribuicao',
        assigned_to         = NULL,
        assigned_at         = NULL
    WHERE id = p_lead_id;

    RETURN jsonb_build_object(
      'success',     true,
      'distributed', false,
      'reason',      'Fora do horário de distribuição (08:00–22:00 BRT)',
      'lead_id',     p_lead_id,
      'brt_hour',    v_brt_hour
    );
  END IF;

  -- ── b. Verificar lead ─────────────────────────────────────────────────────
  SELECT id, name, phone, directorate_id
  INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead não encontrado', 'lead_id', p_lead_id);
  END IF;

  -- ── c. Lock para atomicidade ──────────────────────────────────────────────
  PERFORM pg_advisory_xact_lock(hashtext('distribute_lead'));

  SELECT * INTO v_ctrl
  FROM public.distribution_control
  WHERE id = 1
  FOR UPDATE;

  -- ── d. Buscar corretores elegíveis ────────────────────────────────────────
  --   Condições:
  --     1. Role = CORRETOR (case-insensitive)
  --     2. Status ativo
  --     3. Fez check-in HOJE em daily_checkins (presença verificada no dia)
  --   Ordenação:
  --     1. position_in_queue ASC  → ordem de chegada
  --     2. leads ativos ASC       → equilíbrio de carga
  SELECT ARRAY(
    SELECT p.id
    FROM public.profiles p
    INNER JOIN public.daily_checkins dc
      ON dc.user_id = p.id
      AND dc.checkin_date = CURRENT_DATE      -- ← filtro crítico: presença de HOJE
    WHERE UPPER(p.role) = 'CORRETOR'
      AND UPPER(COALESCE(p.status, '')) IN ('ACTIVE', 'ATIVO')
    ORDER BY
      dc.position_in_queue ASC,              -- ordem de chegada
      (                                      -- desempate: menor carga de leads
        SELECT COUNT(*)
        FROM public.leads l2
        WHERE l2.assigned_to = p.id
          AND LOWER(COALESCE(l2.stage, '')) IN ('novo_lead', 'em_atendimento', 'em_contato')
      ) ASC
  ) INTO v_corretores;

  v_n := COALESCE(array_length(v_corretores, 1), 0);

  IF v_n = 0 THEN
    UPDATE public.leads
    SET distribution_status = 'aguardando_distribuicao',
        assigned_to         = NULL,
        assigned_at         = NULL
    WHERE id = p_lead_id;

    RETURN jsonb_build_object(
      'success',     true,
      'distributed', false,
      'reason',      'Nenhum corretor com check-in hoje',
      'lead_id',     p_lead_id
    );
  END IF;

  -- ── e. Localizar índice do último corretor na lista ───────────────────────
  IF v_ctrl.last_assigned_corretor_id IS NOT NULL THEN
    FOR i IN 1..v_n LOOP
      IF v_corretores[i] = v_ctrl.last_assigned_corretor_id THEN
        v_last_idx := i;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- ── f. Round-robin com limite de carga (máx 5 leads ativos) ──────────────
  LOOP
    v_attempts := v_attempts + 1;

    IF v_attempts > v_n THEN
      UPDATE public.leads
      SET distribution_status = 'aguardando_distribuicao'
      WHERE id = p_lead_id;

      RETURN jsonb_build_object(
        'success',     true,
        'distributed', false,
        'reason',      'Todos os corretores sobrecarregados (limite: 5 leads ativos)',
        'lead_id',     p_lead_id
      );
    END IF;

    v_selected_idx      := (v_last_idx % v_n) + 1;
    v_last_idx          := v_selected_idx;
    v_selected_corretor := v_corretores[v_selected_idx];

    SELECT COUNT(*) INTO v_workload
    FROM public.leads
    WHERE assigned_to = v_selected_corretor
      AND LOWER(COALESCE(stage, '')) IN ('novo_lead', 'em_atendimento', 'em_contato');

    EXIT WHEN v_workload < 5;
  END LOOP;

  -- ── g. Buscar dados do corretor selecionado ───────────────────────────────
  SELECT id, name, directorate_id, telefone
  INTO v_corretor
  FROM public.profiles
  WHERE id = v_selected_corretor;

  -- ── h. Atribuir lead ──────────────────────────────────────────────────────
  UPDATE public.leads
  SET assigned_to         = v_selected_corretor,
      assigned_at         = NOW(),
      distribution_status = 'distribuido'
  WHERE id = p_lead_id;

  -- ── i. Auditoria ──────────────────────────────────────────────────────────
  INSERT INTO public.lead_assignments (lead_id, corretor_id, assigned_at, status)
  VALUES (p_lead_id, v_selected_corretor, NOW(), 'atribuido');

  -- ── j. Atualizar ponteiro round-robin ─────────────────────────────────────
  UPDATE public.distribution_control
  SET last_assigned_corretor_id = v_selected_corretor,
      last_distributed_at       = NOW(),
      total_distributions       = total_distributions + 1,
      updated_at                = NOW()
  WHERE id = 1;

  UPDATE public.profiles
  SET last_lead_assigned_at = NOW()
  WHERE id = v_selected_corretor;

  RETURN jsonb_build_object(
    'success',        true,
    'distributed',    true,
    'lead_id',        p_lead_id,
    'lead_name',      v_lead.name,
    'lead_phone',     v_lead.phone,
    'directorate_id', v_corretor.directorate_id,
    'corretor_id',    v_selected_corretor,
    'corretor_name',  v_corretor.name,
    'corretor_phone', v_corretor.telefone
  );
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- 2. RESET DIÁRIO DE PRESENÇA (cron 00:00 BRT = 03:00 UTC)
--
-- - Marca todos como 'ausente'
-- - Limpa check-ins com mais de 7 dias
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reset_daily_presence()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reset_count   INTEGER;
  v_deleted_count INTEGER;
BEGIN
  -- Marcar todos como ausentes
  UPDATE public.profiles
  SET status_presenca = 'ausente'
  WHERE status_presenca = 'presente';

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;

  -- Limpar check-ins antigos (> 7 dias)
  DELETE FROM public.daily_checkins
  WHERE checkin_date < CURRENT_DATE - INTERVAL '7 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success',       true,
    'reset_count',   v_reset_count,
    'deleted_rows',  v_deleted_count,
    'executed_at',   NOW() AT TIME ZONE 'America/Sao_Paulo',
    'next_date',     (CURRENT_DATE + 1)::TEXT
  );
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- 3. CHECK-OUT NOTURNO (cron 22:00 BRT = 01:00 UTC)
--
-- - Marca todos como 'ausente'
-- - Leads que chegarem após 22:00 ficam pendentes automaticamente
--   porque distribute_lead() já bloqueia fora do horário
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.checkout_noturno()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.profiles
  SET status_presenca = 'ausente'
  WHERE status_presenca = 'presente';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success',        true,
    'checkout_count', v_count,
    'executed_at',    NOW() AT TIME ZONE 'America/Sao_Paulo'
  );
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- 4. CORRIGIR expire_presence() — usar timezone real
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.expire_presence()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Marca como ausente quem não fez check-in nas últimas 8 horas
  -- Usa AT TIME ZONE para garantir comparação correta
  UPDATE public.profiles
  SET status_presenca = 'ausente'
  WHERE status_presenca = 'presente'
    AND ultimo_checkin < (NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success',       true,
    'expired_count', v_count,
    'expired_at',    NOW() AT TIME ZONE 'America/Sao_Paulo'
  );
END;
$$;
