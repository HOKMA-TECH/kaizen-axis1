-- Remove constraint antiga chk_client_stage (nome legado) se ainda existir
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS chk_client_stage;

-- Garante que clients_stage_check está atualizado com todos os estágios
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
