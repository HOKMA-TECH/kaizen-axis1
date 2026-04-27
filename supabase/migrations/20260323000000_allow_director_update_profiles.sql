-- ══════════════════════════════════════════════════════════════════════════════
-- Permite que DIRETOR atualize perfis (aprovação/rejeição de novos usuários)
-- Anteriormente apenas ADMIN tinha permissão de UPDATE na tabela profiles.
-- Políticas são cumulativas (OR) — esta não remove permissões existentes.
-- ══════════════════════════════════════════════════════════════════════════════

-- Remover política anterior caso já exista (idempotente)
DROP POLICY IF EXISTS "directors_update_profiles" ON public.profiles;
DROP POLICY IF EXISTS "admins_directors_update_profiles" ON public.profiles;

-- Permitir ADMIN e DIRETOR atualizarem qualquer perfil
CREATE POLICY "admins_directors_update_profiles" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND UPPER(COALESCE(role, '')) IN ('ADMIN', 'DIRETOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND UPPER(COALESCE(role, '')) IN ('ADMIN', 'DIRETOR')
    )
  );
