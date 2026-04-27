-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: Adiciona policy de INSERT na tabela clients
-- Migration: 20260324000000_fix_clients_insert_policy.sql
--
-- Problema: A tabela clients tem RLS habilitado mas não possui policy de INSERT,
-- bloqueando corretores/coordenadores/gerentes de cadastrar novos clientes.
-- ══════════════════════════════════════════════════════════════════════════════

-- Garante que RLS está habilitado (idempotente)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Remove policy anterior caso exista (idempotente)
DROP POLICY IF EXISTS "authenticated_users_insert_own_clients" ON public.clients;
DROP POLICY IF EXISTS "users_insert_own_clients" ON public.clients;

-- Permite que qualquer usuário autenticado insira clientes onde ele é o owner
CREATE POLICY "users_insert_own_clients" ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());
