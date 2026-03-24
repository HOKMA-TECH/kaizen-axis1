-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: Permite que COORDENADOR visualize agendamentos dos seus corretores
-- Migration: 20260324020000_coordinator_view_appointments.sql
--
-- Problema: A tabela appointments não possui policy SELECT para COORDENADOR,
-- então coordenadores veem apenas seus próprios agendamentos (ou nenhum),
-- mas não os dos corretores vinculados via coordinator_id.
-- ══════════════════════════════════════════════════════════════════════════════

-- Remove política anterior caso exista (idempotente)
DROP POLICY IF EXISTS "coordinator_view_team_appointments" ON public.appointments;

-- Permite que COORDENADOR veja agendamentos de corretores com coordinator_id = seu id
CREATE POLICY "coordinator_view_team_appointments" ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    -- Agendamentos do próprio coordenador
    user_id = auth.uid()
    OR
    -- Agendamentos dos corretores que têm este coordenador como coordinator_id
    user_id IN (
      SELECT id FROM public.profiles
      WHERE coordinator_id = auth.uid()
    )
  );
