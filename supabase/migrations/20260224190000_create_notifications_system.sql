-- 1. Create the notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- 'lead', 'chat', 'aviso', 'meta', 'missao', 'tarefa', 'anuncio'
    target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    target_role TEXT,
    directorate_id UUID REFERENCES public.directorates(id) ON DELETE CASCADE,
    reference_id UUID,
    reference_route TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 2. Define RLS Policies
-- SELECT Policy
CREATE POLICY "Users can view their notifications" ON public.notifications
    FOR SELECT USING (
        target_user_id = auth.uid() OR
        target_role = (SELECT role FROM profiles WHERE id = auth.uid()) OR
        directorate_id = (SELECT directorate_id FROM profiles WHERE id = auth.uid()) OR
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'ADMIN'
    );

-- UPDATE Policy (Mark as read)
CREATE POLICY "Users can update their own notifications" ON public.notifications
    FOR UPDATE USING (
        target_user_id = auth.uid()
    );

-- DELETE Policy (Delete single notification)
CREATE POLICY "Users can delete their own notifications" ON public.notifications
    FOR DELETE USING (
        target_user_id = auth.uid()
    );

-- INSERT Policy (System/Admin inserts)
CREATE POLICY "Admins and Backend can insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'ADMIN' OR
        true -- Allowed for trigger executions (they run as postgres role typically or inherit caller rights)
    );

-- 3. Create Automated Triggers

-- A. Trigger for New Lead Assignment
CREATE OR REPLACE FUNCTION public.notify_lead_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_corretor_name TEXT;
    v_directorate_id UUID;
BEGIN
    -- Only notify if assigned_to is set and changed
    IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
        -- Get Corretor details
        SELECT name, directorate_id INTO v_corretor_name, v_directorate_id
        FROM public.profiles WHERE id = NEW.assigned_to;

        -- 1. Notify the Corretor
        INSERT INTO public.notifications (
            title, message, type, target_user_id, reference_id, reference_route
        ) VALUES (
            'Novo Lead Recebido',
            COALESCE(NEW.name, 'Lead sem nome') || ' - ' || COALESCE(NEW.ai_summary, 'Novo lead distribuído para você.'),
            'lead',
            NEW.assigned_to,
            NEW.id,
            '/clients/novo-lead' -- Adjust if specific ID routing is preferred
        );

        -- 2. Notify Gerentes and Coordenadores of that directorate (Fan-Out)
        IF v_directorate_id IS NOT NULL THEN
            INSERT INTO public.notifications (
                title, message, type, target_user_id, reference_route
            )
            SELECT 
                'Novo Lead Distribuído',
                'O lead ' || COALESCE(NEW.name, 'Lead') || ' foi distribuído para ' || v_corretor_name,
                'lead',
                id,
                '/clients'
            FROM public.profiles
            WHERE directorate_id = v_directorate_id AND role IN ('GERENTE', 'COORDENADOR');
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_lead_assignment ON public.leads;
CREATE TRIGGER trigger_notify_lead_assignment
AFTER INSERT OR UPDATE OF assigned_to ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.notify_lead_assignment();


-- B. Trigger for New Chat Messages
CREATE OR REPLACE FUNCTION public.notify_new_chat_message()
RETURNS TRIGGER AS $$
DECLARE
    v_sender_name TEXT;
BEGIN
    IF NEW.receiver_id IS NOT NULL THEN
        SELECT name INTO v_sender_name FROM public.profiles WHERE id = NEW.sender_id;

        INSERT INTO public.notifications (
            title, message, type, target_user_id, reference_id, reference_route
        ) VALUES (
            'Nova Mensagem',
            COALESCE(v_sender_name, 'Alguém') || ': ' || LEFT(COALESCE(NEW.content, 'Arquivo/Mídia'), 50),
            'chat',
            NEW.receiver_id,
            NULL,
            '/chat/' || NEW.sender_id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_chat_message ON public.chat_messages;
CREATE TRIGGER trigger_notify_new_chat_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_chat_message();


-- C. Trigger for Announcements (Fan-Out based on target)
CREATE OR REPLACE FUNCTION public.notify_new_announcement()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.directorate_id IS NULL THEN
        INSERT INTO public.notifications (
            title, message, type, target_user_id, reference_id, reference_route
        )
        SELECT 
            'Novo Aviso Global: ' || NEW.title,
            LEFT(NEW.content, 100) || '...',
            'aviso',
            id,
            NEW.id,
            '/admin'
        FROM public.profiles WHERE status IN ('active', 'Ativo');
        
    ELSE
        INSERT INTO public.notifications (
            title, message, type, target_user_id, reference_id, reference_route
        )
        SELECT 
            'Novo Aviso na Diretoria: ' || NEW.title,
            LEFT(NEW.content, 100) || '...',
            'aviso',
            id,
            NEW.id,
            '/admin'
        FROM public.profiles WHERE directorate_id = NEW.directorate_id AND status IN ('active', 'Ativo');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_announcement ON public.announcements;
CREATE TRIGGER trigger_notify_new_announcement
AFTER INSERT ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_announcement();


-- D. Trigger for Goals/Missions (Fan-Out based on target)
CREATE OR REPLACE FUNCTION public.notify_new_goal()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.assignee_type = 'global' THEN
        INSERT INTO public.notifications (
            title, message, type, target_user_id, reference_id, reference_route
        )
        SELECT 
            'Nova ' || NEW.type || ' Global: ' || NEW.title,
            'Objetivo: ' || COALESCE(NEW.target::text, ''),
            'meta',
            id,
            NEW.id,
            '/admin'
        FROM public.profiles WHERE status IN ('active', 'Ativo');
        
    ELSIF NEW.assignee_type = 'directorate' AND NEW.assignee_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            title, message, type, target_user_id, reference_id, reference_route
        )
        SELECT 
            'Nova ' || NEW.type || ' para Diretoria: ' || NEW.title,
            'Objetivo: ' || COALESCE(NEW.target::text, ''),
            'meta',
            id,
            NEW.id,
            '/admin'
        FROM public.profiles WHERE directorate_id = NEW.assignee_id AND status IN ('active', 'Ativo');
        
    ELSIF NEW.assignee_type = 'team' AND NEW.assignee_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            title, message, type, target_user_id, reference_id, reference_route
        )
        SELECT 
            'Nova ' || NEW.type || ' para Equipe: ' || NEW.title,
            'Objetivo: ' || COALESCE(NEW.target::text, ''),
            'meta',
            id,
            NEW.id,
            '/admin'
        FROM public.profiles WHERE team_id = NEW.assignee_id AND status IN ('active', 'Ativo');
        
    ELSIF NEW.assignee_type = 'individual' AND NEW.assignee_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            title, message, type, target_user_id, reference_id, reference_route
        ) VALUES (
            'Nova ' || NEW.type || ' Atribuída a Você: ' || NEW.title,
            'Objetivo: ' || COALESCE(NEW.target::text, ''),
            'meta',
            NEW.assignee_id,
            NEW.id,
            '/admin'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_goal ON public.goals;
CREATE TRIGGER trigger_notify_new_goal
AFTER INSERT ON public.goals
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_goal();
