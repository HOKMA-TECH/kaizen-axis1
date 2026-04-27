-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: Permite que GERENTE visualize clientes dos seus corretores/coordenadores
-- Migration: 20260325040000_manager_view_clients.sql
--
-- Problema: A policy SELECT da tabela clients não incluía GERENTE.
-- Um corretor sem coordenador (manager_id direto ao gerente) ficava invisível
-- para o gerente porque o RLS bloqueava a query silenciosamente.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── GERENTE: vê clientes de quem tem manager_id = seu id ─────────────────────
-- Cobre:
--   1. Corretores com manager_id = gerente (sem coordenador)
--   2. Coordenadores com manager_id = gerente
--   3. Corretores cujo coordenador tem manager_id = gerente (cascata)

DROP POLICY IF EXISTS "manager_view_team_clients" ON public.clients;

CREATE POLICY "manager_view_team_clients" ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    -- Próprios clientes
    owner_id = auth.uid()
    OR
    -- Membros diretos (corretor ou coordenador com manager_id = gerente)
    owner_id IN (
      SELECT id FROM public.profiles
      WHERE manager_id = auth.uid()
    )
    OR
    -- Corretores de coordenadores que são do gerente (hierarquia completa)
    owner_id IN (
      SELECT p.id FROM public.profiles p
      WHERE p.coordinator_id IN (
        SELECT id FROM public.profiles
        WHERE manager_id = auth.uid()
      )
    )
  );

-- ── DIRETOR / ADMIN: vê todos os clientes ────────────────────────────────────
DROP POLICY IF EXISTS "director_admin_view_all_clients" ON public.clients;

CREATE POLICY "director_admin_view_all_clients" ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND UPPER(COALESCE(role, '')) IN ('ADMIN', 'DIRETOR')
    )
  );
