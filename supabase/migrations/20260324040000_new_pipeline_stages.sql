-- ══════════════════════════════════════════════════════════════════════════════
-- Novas etapas do pipeline: Agendamento, Formulários, Conformidade,
-- Abertura de Conta, Repasse
-- Migration: 20260324040000_new_pipeline_stages.sql
-- ══════════════════════════════════════════════════════════════════════════════

-- Remove constraint antiga de stage (se existir) e recria com os novos valores
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_stage_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_stage_check CHECK (stage IN (
    'Documentação',
    'Em Análise',
    'Aprovado',
    'Condicionado',
    'Reprovado',
    'Agendamento',
    'Em Tratativa',
    'Contrato',
    'Formulários',
    'Conformidade',
    'Abertura de Conta',
    'Repasse',
    'Concluído',
    'Novo Lead'
  ));

-- Atualiza trigger closed_at para incluir novos stages (sem mudança de lógica,
-- apenas garante que o trigger funciona com os novos valores)
CREATE OR REPLACE FUNCTION public.set_client_closed_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage = 'Concluído' AND (OLD.stage IS DISTINCT FROM 'Concluído') THEN
    NEW.closed_at = NOW();
  END IF;
  IF NEW.stage != 'Concluído' AND OLD.stage = 'Concluído' THEN
    NEW.closed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;
