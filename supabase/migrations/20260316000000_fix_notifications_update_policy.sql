-- Fix notifications UPDATE policy to allow marking as read notifications targeted by role/directorate
--
-- PROBLEMA: A política atual só permite UPDATE se target_user_id = auth.uid()
-- Isso bloqueia o UPDATE de notificações direcionadas por role/directorate (target_user_id IS NULL)
--
-- SOLUÇÃO: Permitir UPDATE se o usuário pode VER a notificação (mesma lógica do SELECT)

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;

CREATE POLICY "Users can update their notifications" ON public.notifications
    FOR UPDATE USING (
        target_user_id = auth.uid() OR
        target_role = (SELECT role FROM profiles WHERE id = auth.uid()) OR
        directorate_id = (SELECT directorate_id FROM profiles WHERE id = auth.uid()) OR
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'ADMIN'
    );
