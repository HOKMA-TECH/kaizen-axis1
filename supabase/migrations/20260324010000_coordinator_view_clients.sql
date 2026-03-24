-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: Permite que COORDENADOR visualize clientes dos seus corretores
-- Migration: 20260324010000_coordinator_view_clients.sql
--
-- Problema: A policy SELECT da tabela clients não inclui COORDENADOR,
-- então coordenadores veem 0 clientes mesmo tendo corretores vinculados.
-- ══════════════════════════════════════════════════════════════════════════════

-- Remove política anterior caso exista (idempotente)
DROP POLICY IF EXISTS "coordinator_view_team_clients" ON public.clients;

-- Permite que COORDENADOR veja clientes de corretores com coordinator_id = seu id
CREATE POLICY "coordinator_view_team_clients" ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    -- Clientes do próprio coordenador (se tiver)
    owner_id = auth.uid()
    OR
    -- Clientes dos corretores que têm este coordenador como coordinator_id
    owner_id IN (
      SELECT id FROM public.profiles
      WHERE coordinator_id = auth.uid()
    )
  );
