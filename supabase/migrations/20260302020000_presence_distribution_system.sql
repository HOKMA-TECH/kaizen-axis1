-- ============================================================
-- SISTEMA DE PRESENÇA (QR CODE) E DISTRIBUIÇÃO AUTOMÁTICA DE LEADS
-- Migration: 20260302020000_presence_distribution_system.sql
-- ============================================================

-- ── 1. CAMPOS DE PRESENÇA EM PROFILES ─────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status_presenca TEXT NOT NULL DEFAULT 'ausente'
    CHECK (status_presenca IN ('presente', 'ausente')),
  ADD COLUMN IF NOT EXISTS ultimo_checkin TIMESTAMP WITH TIME ZONE;

-- ── 2. CAMPO assigned_at EM LEADS (assigned_to já existe) ─────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

-- ── 3. TABELA: checkin_tokens ─────────────────────────────────────────────────
-- Gerada pela aplicação e consumida pelo webhook n8n de checkin
CREATE TABLE IF NOT EXISTS public.checkin_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE,
  corretor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at     TIMESTAMP WITH TIME ZONE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_tokens_token    ON public.checkin_tokens(token);
CREATE INDEX IF NOT EXISTS idx_checkin_tokens_corretor ON public.checkin_tokens(corretor_id);

ALTER TABLE public.checkin_tokens ENABLE ROW LEVEL SECURITY;

-- System/service role manages tokens (n8n usa service role key)
CREATE POLICY "Service role manages checkin tokens"
  ON public.checkin_tokens FOR ALL
  USING (true) WITH CHECK (true);

-- ── 4. TABELA: lead_assignments (auditoria de distribuições) ──────────────────
CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                 UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status                  TEXT NOT NULL DEFAULT 'atribuido'
    CHECK (status IN ('atribuido', 'visualizado', 'em_contato', 'finalizado', 'reatribuido')),
  tempo_primeiro_contato  TIMESTAMP WITH TIME ZONE,
  observacao              TEXT,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead     ON public.lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_corretor ON public.lead_assignments(corretor_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_status   ON public.lead_assignments(status);

ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Corretores veem proprias atribuicoes" ON public.lead_assignments
  FOR SELECT USING (
    corretor_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid())
       IN ('GERENTE', 'COORDENADOR', 'ADMIN', 'DIRETOR')
  );

CREATE POLICY "Sistema insere atribuicoes" ON public.lead_assignments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Sistema atualiza atribuicoes" ON public.lead_assignments
  FOR UPDATE USING (true);

-- ── 5. TABELA: distribution_control (estado do round-robin) ──────────────────
-- Singleton: uma única linha, acessada com SELECT FOR UPDATE para garantir atomicidade
CREATE TABLE IF NOT EXISTS public.distribution_control (
  id                        INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_assigned_corretor_id UUID REFERENCES auth.users(id),
  last_distributed_at       TIMESTAMP WITH TIME ZONE,
  total_distributions       INTEGER DEFAULT 0,
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garantir que a linha singleton existe
INSERT INTO public.distribution_control (id, total_distributions)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- ── 6. FUNÇÃO PRINCIPAL: distribute_lead ──────────────────────────────────────
-- ATÔMICA via SELECT FOR UPDATE na tabela distribution_control.
-- Previne race conditions: dois leads não podem ser atribuídos simultaneamente.
-- Retorna JSONB com resultado da distribuição.
CREATE OR REPLACE FUNCTION public.distribute_lead(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ctrl              RECORD;
  v_corretores        UUID[];
  v_n                 INTEGER;
  v_last_idx          INTEGER := 0;   -- 0 = nenhum anterior (1-indexed array)
  v_selected_idx      INTEGER;
  v_selected_corretor UUID;
  v_workload          INTEGER;
  v_attempts          INTEGER := 0;
  v_lead              RECORD;
  v_corretor          RECORD;
  i                   INTEGER;
BEGIN
  -- ── a. Verificar lead ──────────────────────────────────────────────────────
  SELECT id, name, phone, directorate_id
  INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead não encontrado', 'lead_id', p_lead_id);
  END IF;

  -- ── b. Adquirir lock na linha de controle de distribuição ─────────────────
  -- Garante que apenas uma execução concorrente passa por aqui de cada vez
  PERFORM pg_advisory_xact_lock(hashtext('distribute_lead'));

  SELECT * INTO v_ctrl
  FROM public.distribution_control
  WHERE id = 1
  FOR UPDATE;

  -- ── c. Buscar corretores elegíveis (presentes + ativos, round-robin order) ─
  -- NOTA: Se sua base usa 'Corretor' ao invés de 'CORRETOR', ajuste UPPER(role)
  SELECT ARRAY(
    SELECT id
    FROM public.profiles
    WHERE UPPER(role) = 'CORRETOR'
      AND status_presenca = 'presente'
      AND UPPER(COALESCE(status, '')) IN ('ACTIVE', 'ATIVO')
    ORDER BY COALESCE(ultimo_checkin, '1970-01-01'::timestamptz) ASC, id ASC
  ) INTO v_corretores;

  v_n := COALESCE(array_length(v_corretores, 1), 0);

  -- ── d. Failsafe: nenhum corretor presente ────────────────────────────────
  IF v_n = 0 THEN
    UPDATE public.leads
    SET distribution_status = 'aguardando_distribuicao',
        assigned_to         = NULL,
        assigned_at         = NULL
    WHERE id = p_lead_id;

    RETURN jsonb_build_object(
      'success',      true,
      'distributed',  false,
      'reason',       'Nenhum corretor presente',
      'lead_id',      p_lead_id
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

  -- ── f. Round-robin com validação de carga (max 5 leads ativos) ───────────
  LOOP
    v_attempts := v_attempts + 1;

    IF v_attempts > v_n THEN
      -- Todos os corretores presentes estão sobrecarregados
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

    -- Avançar para o próximo corretor de forma circular
    v_selected_idx      := (v_last_idx % v_n) + 1;
    v_last_idx          := v_selected_idx;
    v_selected_corretor := v_corretores[v_selected_idx];

    -- Contar leads ativos do corretor candidato
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

  -- ── i. Registrar auditoria ────────────────────────────────────────────────
  INSERT INTO public.lead_assignments (lead_id, corretor_id, assigned_at, status)
  VALUES (p_lead_id, v_selected_corretor, NOW(), 'atribuido');

  -- ── j. Atualizar estado do round-robin ────────────────────────────────────
  UPDATE public.distribution_control
  SET last_assigned_corretor_id = v_selected_corretor,
      last_distributed_at       = NOW(),
      total_distributions       = total_distributions + 1,
      updated_at                = NOW()
  WHERE id = 1;

  -- ── k. Manter compatibilidade com lógica anterior ────────────────────────
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

-- ── 7. FUNÇÃO: expire_presence (chamada pelo cron n8n a cada 30min) ──────────
CREATE OR REPLACE FUNCTION public.expire_presence()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.profiles
  SET status_presenca = 'ausente'
  WHERE status_presenca = 'presente'
    AND ultimo_checkin < NOW() - INTERVAL '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success',       true,
    'expired_count', v_count,
    'expired_at',    NOW()
  );
END;
$$;

-- ── 8. FUNÇÃO: checkin_corretor (chamada pelo webhook n8n) ────────────────────
CREATE OR REPLACE FUNCTION public.checkin_corretor(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token   RECORD;
  v_corretor RECORD;
BEGIN
  -- Buscar token válido, não expirado, não usado
  SELECT * INTO v_token
  FROM public.checkin_tokens
  WHERE token      = p_token
    AND expires_at > NOW()
    AND used_at   IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token inválido ou expirado');
  END IF;

  -- Buscar corretor
  SELECT id, name INTO v_corretor
  FROM public.profiles
  WHERE id = v_token.corretor_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Corretor não encontrado');
  END IF;

  -- Marcar presença
  UPDATE public.profiles
  SET status_presenca = 'presente',
      ultimo_checkin  = NOW()
  WHERE id = v_token.corretor_id;

  -- Invalidar token (single-use)
  UPDATE public.checkin_tokens
  SET used_at = NOW()
  WHERE id = v_token.id;

  RETURN jsonb_build_object(
    'success',       true,
    'corretor_id',   v_corretor.id,
    'corretor_name', v_corretor.name,
    'checkin_at',    NOW()
  );
END;
$$;

-- ── 9. FUNÇÃO: generate_checkin_token (chamada pela aplicação Next.js) ────────
-- Uso: SELECT public.generate_checkin_token(corretor_id, 480) -- 480 min = 8h
CREATE OR REPLACE FUNCTION public.generate_checkin_token(
  p_corretor_id    UUID,
  p_valid_minutes  INTEGER DEFAULT 480
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token      TEXT;
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Token: 64 chars hex aleatório
  v_token      := encode(gen_random_bytes(32), 'hex');
  v_expires_at := NOW() + (p_valid_minutes || ' minutes')::INTERVAL;

  INSERT INTO public.checkin_tokens (token, corretor_id, expires_at)
  VALUES (v_token, p_corretor_id, v_expires_at);

  RETURN jsonb_build_object(
    'token',       v_token,
    'expires_at',  v_expires_at,
    'qr_url',      '/checkin?token=' || v_token
  );
END;
$$;

-- ── 10. ÍNDICES ADICIONAIS PARA PERFORMANCE ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_presenca
  ON public.profiles(status_presenca)
  WHERE status_presenca = 'presente';

CREATE INDEX IF NOT EXISTS idx_leads_assigned_stage
  ON public.leads(assigned_to, stage)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_distribution_status
  ON public.leads(distribution_status)
  WHERE distribution_status = 'aguardando_distribuicao';
