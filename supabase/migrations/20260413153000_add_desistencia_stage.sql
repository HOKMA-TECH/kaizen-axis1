-- Adiciona a etapa "Desistência" no pipeline de clientes

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
    'Desistência',
    'Concluído',
    'Novo Lead'
  ));
