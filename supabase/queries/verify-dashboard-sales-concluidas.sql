-- Auditoria de vendas concluidas exibidas no Dashboard / quadro de comissoes.
-- Uso:
-- 1. Cole este arquivo no SQL Editor do Supabase.
-- 2. Ajuste o mes em params se quiser auditar outro periodo.
-- 3. Rode cada SELECT separadamente se o SQL Editor mostrar apenas um resultado por vez.
--
-- Regra esperada do Dashboard:
-- - Venda entra no mes vigente quando clients.stage = 'Concluido'/'Concluído'
-- - Data principal da venda: clients.closed_at
-- - Fallback legado: clients.updated_at apenas quando closed_at esta NULL
--
-- Este SQL nao altera dados. E somente leitura.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1) RESUMO POR DIRETORIA NO PERIODO AUDITADO
-- ═══════════════════════════════════════════════════════════════════════════════
WITH params AS (
  SELECT
    DATE '2026-05-01' AS periodo_inicio,
    DATE '2026-06-01' AS proximo_periodo_inicio,
    ARRAY[
      'DIRETORIA ANDREY',
      'DIRETORIA KAIZEN',
      'DIRETORIA PABLO'
    ]::text[] AS diretorias
),
sales_base AS (
  SELECT
    c.id,
    c.name AS cliente,
    c.stage,
    c.intended_value,
    c.created_at,
    c.updated_at,
    c.closed_at,
    COALESCE(c.closed_at, c.updated_at) AS data_venda_dashboard,
    c.directorate_id,
    d.name AS diretoria,
    c.owner_id,
    p.name AS corretor,
    p.role AS corretor_role,
    p.team AS equipe_nome,
    p.team_id,
    t.name AS equipe_canonica
  FROM public.clients c
  LEFT JOIN public.directorates d ON d.id = c.directorate_id
  LEFT JOIN public.profiles p ON p.id = c.owner_id
  LEFT JOIN public.teams t ON t.id = p.team_id
  CROSS JOIN params prm
  WHERE c.stage IN ('Concluído', 'Concluido')
    AND (
      array_length(prm.diretorias, 1) IS NULL
      OR d.name = ANY(prm.diretorias)
    )
),
audit AS (
  SELECT
    sb.*,
    (sb.closed_at >= prm.periodo_inicio::timestamptz
      AND sb.closed_at < prm.proximo_periodo_inicio::timestamptz) AS fechado_no_periodo_por_closed_at,
    (sb.closed_at IS NULL
      AND sb.updated_at >= prm.periodo_inicio::timestamptz
      AND sb.updated_at < prm.proximo_periodo_inicio::timestamptz) AS incluido_por_fallback_updated_at,
    (sb.data_venda_dashboard >= prm.periodo_inicio::timestamptz
      AND sb.data_venda_dashboard < prm.proximo_periodo_inicio::timestamptz) AS aparece_no_dashboard_do_periodo
  FROM sales_base sb
  CROSS JOIN params prm
)
SELECT
  COALESCE(diretoria, 'SEM DIRETORIA') AS diretoria,
  COUNT(*) AS vendas_concluidas_total_visiveis,
  COUNT(*) FILTER (WHERE aparece_no_dashboard_do_periodo) AS vendas_que_devem_aparecer_no_dashboard,
  COUNT(*) FILTER (WHERE fechado_no_periodo_por_closed_at) AS vendas_com_closed_at_no_periodo,
  COUNT(*) FILTER (WHERE incluido_por_fallback_updated_at) AS vendas_legadas_sem_closed_at_por_updated_at,
  COUNT(*) FILTER (
    WHERE closed_at IS NOT NULL
      AND updated_at >= (SELECT periodo_inicio FROM params)::timestamptz
      AND updated_at < (SELECT proximo_periodo_inicio FROM params)::timestamptz
      AND NOT fechado_no_periodo_por_closed_at
  ) AS vendas_antigas_editadas_no_periodo_nao_devem_entrar,
  SUM(
    CASE
      WHEN aparece_no_dashboard_do_periodo
      THEN COALESCE(
        NULLIF(
          regexp_replace(
            replace(replace(replace(intended_value::text, 'R$', ''), '.', ''), ',', '.'),
            '[^0-9.-]',
            '',
            'g'
          ),
          ''
        ),
        '0'
      )::numeric
      ELSE 0
    END
  ) AS vgv_dashboard_periodo_estimado
FROM audit
GROUP BY COALESCE(diretoria, 'SEM DIRETORIA')
ORDER BY diretoria;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2) LISTA DETALHADA DAS VENDAS E DATAS DE CONCLUSAO
-- ═══════════════════════════════════════════════════════════════════════════════
WITH params AS (
  SELECT
    DATE '2026-05-01' AS periodo_inicio,
    DATE '2026-06-01' AS proximo_periodo_inicio,
    ARRAY[
      'DIRETORIA ANDREY',
      'DIRETORIA KAIZEN',
      'DIRETORIA PABLO'
    ]::text[] AS diretorias
),
history_concluido AS (
  SELECT
    h.client_id,
    MIN(h.created_at) AS primeira_mudanca_para_concluido_em,
    MAX(h.created_at) AS ultima_mudanca_para_concluido_em,
    STRING_AGG(
      to_char(h.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI')
        || ' - ' || COALESCE(h.user_name, 'sem usuario')
        || ': ' || COALESCE(h.action, ''),
      E'\n'
      ORDER BY h.created_at
    ) AS historico_concluido
  FROM public.client_history h
  WHERE lower(COALESCE(h.action, '')) LIKE '%conclu%'
  GROUP BY h.client_id
),
sales_base AS (
  SELECT
    c.id,
    c.name AS cliente,
    c.stage,
    c.intended_value,
    c.development,
    c.created_at,
    c.updated_at,
    c.closed_at,
    COALESCE(c.closed_at, c.updated_at) AS data_venda_dashboard,
    c.directorate_id,
    d.name AS diretoria,
    c.owner_id,
    p.name AS corretor,
    p.role AS corretor_role,
    p.team AS equipe_nome,
    p.team_id,
    t.name AS equipe_canonica,
    hc.primeira_mudanca_para_concluido_em,
    hc.ultima_mudanca_para_concluido_em,
    hc.historico_concluido
  FROM public.clients c
  LEFT JOIN public.directorates d ON d.id = c.directorate_id
  LEFT JOIN public.profiles p ON p.id = c.owner_id
  LEFT JOIN public.teams t ON t.id = p.team_id
  LEFT JOIN history_concluido hc ON hc.client_id = c.id
  CROSS JOIN params prm
  WHERE c.stage IN ('Concluído', 'Concluido')
    AND (
      array_length(prm.diretorias, 1) IS NULL
      OR d.name = ANY(prm.diretorias)
    )
)
SELECT
  diretoria,
  cliente,
  corretor,
  COALESCE(equipe_canonica, equipe_nome) AS equipe,
  development AS empreendimento,
  intended_value AS vgv,
  stage,
  to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS criado_em_br,
  to_char(closed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS fechado_em_closed_at_br,
  to_char(updated_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS atualizado_em_updated_at_br,
  to_char(data_venda_dashboard AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS data_usada_pelo_dashboard_br,
  to_char(primeira_mudanca_para_concluido_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS primeira_mudanca_historico_concluido_br,
  CASE
    WHEN closed_at IS NULL THEN 'ATENCAO: sem closed_at; dashboard usa updated_at como fallback legado'
    WHEN closed_at >= (SELECT periodo_inicio FROM params)::timestamptz
      AND closed_at < (SELECT proximo_periodo_inicio FROM params)::timestamptz
      THEN 'OK: venda fechada no periodo por closed_at'
    WHEN updated_at >= (SELECT periodo_inicio FROM params)::timestamptz
      AND updated_at < (SELECT proximo_periodo_inicio FROM params)::timestamptz
      THEN 'NAO ENTRA: venda antiga apenas atualizada/editada no periodo'
    ELSE 'FORA DO PERIODO'
  END AS diagnostico_dashboard,
  historico_concluido
FROM sales_base
ORDER BY
  diretoria NULLS LAST,
  data_venda_dashboard DESC NULLS LAST,
  cliente;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3) SOMENTE POSSIVEIS PROBLEMAS PARA INVESTIGAR
-- ═══════════════════════════════════════════════════════════════════════════════
WITH params AS (
  SELECT
    DATE '2026-05-01' AS periodo_inicio,
    DATE '2026-06-01' AS proximo_periodo_inicio,
    ARRAY[
      'DIRETORIA ANDREY',
      'DIRETORIA KAIZEN',
      'DIRETORIA PABLO'
    ]::text[] AS diretorias
),
history_concluido AS (
  SELECT
    h.client_id,
    MIN(h.created_at) AS primeira_mudanca_para_concluido_em,
    MAX(h.created_at) AS ultima_mudanca_para_concluido_em
  FROM public.client_history h
  WHERE lower(COALESCE(h.action, '')) LIKE '%conclu%'
  GROUP BY h.client_id
),
sales_base AS (
  SELECT
    c.id,
    c.name AS cliente,
    c.stage,
    c.intended_value,
    c.created_at,
    c.updated_at,
    c.closed_at,
    COALESCE(c.closed_at, c.updated_at) AS data_venda_dashboard,
    d.name AS diretoria,
    p.name AS corretor,
    hc.primeira_mudanca_para_concluido_em,
    hc.ultima_mudanca_para_concluido_em
  FROM public.clients c
  LEFT JOIN public.directorates d ON d.id = c.directorate_id
  LEFT JOIN public.profiles p ON p.id = c.owner_id
  LEFT JOIN history_concluido hc ON hc.client_id = c.id
  CROSS JOIN params prm
  WHERE c.stage IN ('Concluído', 'Concluido')
    AND (
      array_length(prm.diretorias, 1) IS NULL
      OR d.name = ANY(prm.diretorias)
    )
)
SELECT
  diretoria,
  cliente,
  corretor,
  intended_value AS vgv,
  to_char(closed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS closed_at_br,
  to_char(updated_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS updated_at_br,
  to_char(primeira_mudanca_para_concluido_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS historico_concluido_br,
  CASE
    WHEN closed_at IS NULL
      THEN 'SEM_CLOSED_AT'
    WHEN primeira_mudanca_para_concluido_em IS NULL
      THEN 'SEM_HISTORICO_CONCLUIDO'
    WHEN ABS(EXTRACT(EPOCH FROM (closed_at - primeira_mudanca_para_concluido_em))) > 300
      THEN 'CLOSED_AT_DIFERE_DO_HISTORICO_MAIS_DE_5_MIN'
    WHEN updated_at >= (SELECT periodo_inicio FROM params)::timestamptz
      AND updated_at < (SELECT proximo_periodo_inicio FROM params)::timestamptz
      AND NOT (
        closed_at >= (SELECT periodo_inicio FROM params)::timestamptz
        AND closed_at < (SELECT proximo_periodo_inicio FROM params)::timestamptz
      )
      THEN 'VENDA_ANTIGA_ATUALIZADA_NO_PERIODO'
    ELSE 'OK'
  END AS alerta
FROM sales_base
WHERE
  closed_at IS NULL
  OR primeira_mudanca_para_concluido_em IS NULL
  OR ABS(EXTRACT(EPOCH FROM (closed_at - primeira_mudanca_para_concluido_em))) > 300
  OR (
    updated_at >= (SELECT periodo_inicio FROM params)::timestamptz
    AND updated_at < (SELECT proximo_periodo_inicio FROM params)::timestamptz
    AND NOT (
      closed_at >= (SELECT periodo_inicio FROM params)::timestamptz
      AND closed_at < (SELECT proximo_periodo_inicio FROM params)::timestamptz
    )
  )
ORDER BY alerta, diretoria, cliente;
