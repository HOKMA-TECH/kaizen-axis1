-- SEC-07: Habilitar RLS em distribution_control
-- Funções SECURITY DEFINER e service_role continuam funcionando (bypassam RLS).
-- Impede que usuários autenticados leiam/modifiquem o round-robin diretamente.

ALTER TABLE public.distribution_control ENABLE ROW LEVEL SECURITY;

-- Nenhuma política explícita necessária:
-- service_role bypassa RLS (atributo bypassrls)
-- SECURITY DEFINER functions executam como postgres (superuser)
-- Usuários anon/authenticated não têm acesso
