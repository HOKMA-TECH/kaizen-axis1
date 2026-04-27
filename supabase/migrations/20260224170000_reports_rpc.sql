-- Supabase RPC for Business Intelligence Reports (Kaizen-axis)

CREATE OR REPLACE FUNCTION public.parse_currency(val text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    cleaned text;
BEGIN
    if val is null or val = '' then return 0; end if;
    cleaned := trim(replace(replace(val, 'R$', ''), ' ', ''));
    if cleaned = '' then return 0; end if;
    
    if cleaned like '%,%' then
        cleaned := replace(cleaned, '.', '');
        cleaned := replace(cleaned, ',', '.');
    else
        cleaned := replace(cleaned, '.', '');
    end if;

    RETURN COALESCE(NULLIF(regexp_replace(cleaned, '[^0-9\.-]', '', 'g'), ''), '0')::numeric;
EXCEPTION WHEN OTHERS THEN
    RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_report_metrics(data_inicial DATE, data_final DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- Context
    v_user_id uuid := auth.uid();
    v_user_role text;
    v_directorate_id uuid;
    
    -- Gerenal Metrics
    v_L int := 0;
    v_C int := 0;
    v_V int := 0;
    v_R numeric := 0;
    v_A int := 0;
    v_T numeric := 0;
    v_Taxa_Conversao numeric := 0;
    v_Ticket_Medio numeric := 0;
    v_Tempo_Medio_Conversao numeric := 0;
    
    -- Comparative Metrics
    v_V_atual int := 0;
    v_R_atual numeric := 0;
    v_L_atual int := 0;
    v_crescimento_vendas numeric := 0;
    v_crescimento_receita numeric := 0;
    v_crescimento_leads numeric := 0;
    v_periodo_atual_inicio date := date_trunc('month', current_date)::date;
    v_periodo_atual_fim date := current_date;

    -- JSON outputs
    v_resumo_geral jsonb;
    v_comparativo_mes_atual jsonb;
    v_pipeline jsonb;
    v_performance_corretores jsonb;
    v_tendencia_temporal jsonb;
    v_result jsonb;
    
    v_days_diff int;
    v_group_type text;
BEGIN
    -- 1. Identify User Role & Directorate
    SELECT role, directorate_id INTO v_user_role, v_directorate_id
    FROM public.profiles
    WHERE id = v_user_id;

    -- Safety check
    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'User profile not found.';
    END IF;

    -- 2. Create Temp Tables with Row Level Security explicitly applied
    -- Using temp tables ensures performance and strict RBAC isolation for all subsequent calculations.
    
    DROP TABLE IF EXISTS temp_leads;
    CREATE TEMP TABLE temp_leads AS
    SELECT l.* 
    FROM public.leads l
    WHERE 
        (v_user_role IN ('ADMIN', 'DIRETOR')) OR
        (v_user_role IN ('GERENTE', 'COORDENADOR') AND l.directorate_id = v_directorate_id) OR
        (v_user_role = 'CORRETOR' AND (l.assigned_to = v_user_id OR l.owner_id = v_user_id));

    DROP TABLE IF EXISTS temp_clients;
    CREATE TEMP TABLE temp_clients AS
    SELECT c.* 
    FROM public.clients c
    WHERE 
        (v_user_role IN ('ADMIN', 'DIRETOR')) OR
        (v_user_role IN ('GERENTE', 'COORDENADOR') AND c.directorate_id = v_directorate_id) OR
        (v_user_role = 'CORRETOR' AND c.owner_id = v_user_id);

    DROP TABLE IF EXISTS temp_appointments;
    CREATE TEMP TABLE temp_appointments AS
    SELECT a.* 
    FROM public.appointments a
    WHERE a.client_id IN (SELECT id FROM temp_clients);

    -- 3. Calculate Base Variables for the General Summary (Período Selecionado)
    
    -- L = total leads recebidos no período
    SELECT count(*) INTO v_L FROM temp_leads WHERE created_at::date >= data_inicial AND created_at::date <= data_final;

    -- C = total clientes criados no período
    SELECT count(*) INTO v_C FROM temp_clients WHERE created_at::date >= data_inicial AND created_at::date <= data_final;

    -- V = vendas concluídas, R = receita total, T = soma dos dias de conversão
    -- Assuming stage 'Venda Concluída' determines a sale, and 'updated_at' is the date of sale.
    SELECT 
        count(*), 
        COALESCE(sum(public.parse_currency(intended_value)), 0),
        COALESCE(sum(DATE_PART('day', updated_at - created_at)), 0)
    INTO v_V, v_R, v_T
    FROM temp_clients 
    WHERE stage = 'Venda Concluída' 
      AND updated_at::date >= data_inicial AND updated_at::date <= data_final;

    -- A = total agendamentos
    SELECT count(*) INTO v_A FROM temp_appointments WHERE date::date >= data_inicial AND date::date <= data_final;

    -- 4. Derived Math for General Summary
    IF v_L > 0 THEN
        v_Taxa_Conversao := ROUND((v_V::numeric / v_L::numeric) * 100, 2);
    ELSE
        v_Taxa_Conversao := 0;
    END IF;

    IF v_V > 0 THEN
        v_Ticket_Medio := ROUND((v_R / v_V::numeric), 2);
        v_Tempo_Medio_Conversao := ROUND((v_T / v_V::numeric), 2);
    ELSE
        v_Ticket_Medio := 0;
        v_Tempo_Medio_Conversao := 0;
    END IF;

    v_resumo_geral := jsonb_build_object(
        'L', v_L,
        'C', v_C,
        'V', v_V,
        'R', v_R,
        'A', v_A,
        'Taxa_Conversao', v_Taxa_Conversao,
        'Ticket_Medio', v_Ticket_Medio,
        'Tempo_Medio_Conversao', v_Tempo_Medio_Conversao
    );

    -- 5. Calculate Comparative Metrics (Current Month)
    
    SELECT count(*) INTO v_V_atual FROM temp_clients WHERE stage = 'Venda Concluída' AND updated_at::date >= v_periodo_atual_inicio AND updated_at::date <= v_periodo_atual_fim;
    SELECT COALESCE(sum(public.parse_currency(intended_value)), 0) INTO v_R_atual FROM temp_clients WHERE stage = 'Venda Concluída' AND updated_at::date >= v_periodo_atual_inicio AND updated_at::date <= v_periodo_atual_fim;
    SELECT count(*) INTO v_L_atual FROM temp_leads WHERE created_at::date >= v_periodo_atual_inicio AND created_at::date <= v_periodo_atual_fim;

    -- Vendas Growth
    IF v_V_atual = 0 AND v_V > 0 THEN v_crescimento_vendas := 100;
    ELSIF v_V_atual = 0 AND v_V = 0 THEN v_crescimento_vendas := 0;
    ELSE v_crescimento_vendas := ROUND(((v_V - v_V_atual)::numeric / v_V_atual::numeric) * 100, 2);
    END IF;

    -- Revenue Growth
    IF v_R_atual = 0 AND v_R > 0 THEN v_crescimento_receita := 100;
    ELSIF v_R_atual = 0 AND v_R = 0 THEN v_crescimento_receita := 0;
    ELSE v_crescimento_receita := ROUND(((v_R - v_R_atual)::numeric / v_R_atual::numeric) * 100, 2);
    END IF;

    -- Leads Growth
    IF v_L_atual = 0 AND v_L > 0 THEN v_crescimento_leads := 100;
    ELSIF v_L_atual = 0 AND v_L = 0 THEN v_crescimento_leads := 0;
    ELSE v_crescimento_leads := ROUND(((v_L - v_L_atual)::numeric / v_L_atual::numeric) * 100, 2);
    END IF;

    v_comparativo_mes_atual := jsonb_build_object(
        'crescimento_vendas', v_crescimento_vendas,
        'crescimento_receita', v_crescimento_receita,
        'crescimento_leads', v_crescimento_leads
    );

    -- 6. Pipeline Distribution
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'etapa', stage,
            'quantidade', qtd,
            'percentual', (CASE WHEN v_C > 0 THEN ROUND((qtd::numeric / v_C::numeric) * 100, 2) ELSE 0 END)
        )
    ), '[]'::jsonb)
    INTO v_pipeline
    FROM (
        SELECT stage, COUNT(*) as qtd
        FROM temp_clients
        WHERE created_at::date >= data_inicial AND created_at::date <= data_final
        GROUP BY stage
    ) as p;

    -- 7. Performance by Broker (Corretor)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'corretor_id', u.owner_id,
            'nome', p.name,
            'Li', COALESCE(l.qtd_leads, 0),
            'Vi', u.qtd_vendas,
            'Ri', u.receita,
            'Taxa_Conversao_i', (CASE WHEN COALESCE(l.qtd_leads, 0) > 0 THEN ROUND((u.qtd_vendas::numeric / l.qtd_leads::numeric) * 100, 2) ELSE 0 END),
            'Ticket_Medio_i', (CASE WHEN u.qtd_vendas > 0 THEN ROUND((u.receita / u.qtd_vendas::numeric), 2) ELSE 0 END)
        )
    ), '[]'::jsonb)
    INTO v_performance_corretores
    FROM (
        SELECT owner_id, count(*) as qtd_vendas, COALESCE(sum(public.parse_currency(intended_value)), 0) as receita
        FROM temp_clients
        WHERE stage = 'Venda Concluída' AND updated_at::date >= data_inicial AND updated_at::date <= data_final
        GROUP BY owner_id
    ) u
    LEFT JOIN (
        SELECT owner_id, count(*) as qtd_leads
        FROM temp_leads
        WHERE created_at::date >= data_inicial AND created_at::date <= data_final
        GROUP BY owner_id
    ) l ON u.owner_id = l.owner_id
    JOIN public.profiles p ON p.id = u.owner_id;

    -- 8. Temporal Trend (Daily or Weekly)
    v_days_diff := data_final - data_inicial;
    IF v_days_diff <= 31 THEN
        v_group_type := 'day';
    ELSE
        v_group_type := 'week';
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'periodo', t.periodo,
            'Lt', COALESCE(l.qtd_leads, 0),
            'Vt', COALESCE(v.qtd_vendas, 0),
            'Rt', COALESCE(v.receita, 0)
        ) ORDER BY t.periodo
    ), '[]'::jsonb)
    INTO v_tendencia_temporal
    FROM (
        -- Generate all periods between dates
        SELECT generate_series(
            date_trunc(v_group_type, data_inicial::timestamp),
            date_trunc(v_group_type, data_final::timestamp),
            ('1 ' || v_group_type)::interval
        )::date as periodo
    ) t
    LEFT JOIN (
        SELECT date_trunc(v_group_type, created_at::timestamp)::date as periodo, count(*) as qtd_leads
        FROM temp_leads
        WHERE created_at::date >= data_inicial AND created_at::date <= data_final
        GROUP BY date_trunc(v_group_type, created_at::timestamp)::date
    ) l ON l.periodo = t.periodo
    LEFT JOIN (
        SELECT date_trunc(v_group_type, updated_at::timestamp)::date as periodo, count(*) as qtd_vendas, COALESCE(sum(public.parse_currency(intended_value)), 0) as receita
        FROM temp_clients
        WHERE stage = 'Venda Concluída' AND updated_at::date >= data_inicial AND updated_at::date <= data_final
        GROUP BY date_trunc(v_group_type, updated_at::timestamp)::date
    ) v ON v.periodo = t.periodo;

    -- Combine into final JSON
    v_result := jsonb_build_object(
        'resumo_geral', v_resumo_geral,
        'comparativo_mes_atual', v_comparativo_mes_atual,
        'pipeline', v_pipeline,
        'performance_corretores', v_performance_corretores,
        'tendencia_temporal', v_tendencia_temporal
    );

    RETURN v_result;
END;
$$;
