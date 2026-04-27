-- ============================================================
-- Correção na Gamificação: Time e Vendas
-- 1. Se for uma meta de equipe (Team), XP vai para todos
-- 2. Venda sempre atribui conta/XP ao Dono (user_id/owner_id) 
--    independentemente de quem alterou o status
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_gamification_from_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_already_processed BOOLEAN;
    v_streak_record     public.sales_streaks%ROWTYPE;
    v_today             DATE := CURRENT_DATE;
    v_days_diff         INT;
    v_affected_goal     RECORD;
    v_dev_id            UUID;
    v_contract_value    NUMERIC(15,2);
    v_user_id           UUID;
    v_is_sale           BOOLEAN := FALSE;
    v_is_approved       BOOLEAN := FALSE;
    v_goal_xp           INT;
    v_team_member_id    UUID;
BEGIN
    -- Determinar se é venda ou aprovação
    IF NEW.stage IN ('Concluído', 'Concluida', 'Venda Concluída') THEN
        v_is_sale := TRUE;
    ELSIF NEW.stage = 'Aprovado' THEN
        IF TG_OP = 'INSERT' OR COALESCE(OLD.stage, '') != 'Aprovado' THEN
            v_is_approved := TRUE;
        END IF;
    END IF;

    IF NOT v_is_sale AND NOT v_is_approved THEN RETURN NEW; END IF;

    -- O usuário que FEZ a venda (Dono do Lead), não necessariamente o admin que clicou
    v_user_id := COALESCE(NEW.owner_id, NEW.user_id);

    BEGIN
        v_contract_value := COALESCE(REPLACE(REPLACE(NEW.intended_value, '.', ''), ',', '.')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
        v_contract_value := 0;
    END;

    SELECT id INTO v_dev_id FROM public.developments WHERE name = NEW.development LIMIT 1;

    -- 1. Anti-Duplicação para Vendas
    IF v_is_sale THEN
        SELECT EXISTS(SELECT 1 FROM public.sales_events WHERE client_id = NEW.id) INTO v_already_processed;
        IF NOT v_already_processed THEN
            INSERT INTO public.sales_events (client_id, user_id, contract_value, development_id)
            VALUES (NEW.id, v_user_id, v_contract_value, v_dev_id);

            INSERT INTO public.system_events (type, user_id, payload)
            VALUES ('sale_completed', v_user_id, jsonb_build_object('client_id', NEW.id, 'value', v_contract_value));

            INSERT INTO public.user_points (user_id, points, source, reference_id)
            VALUES (v_user_id, 500, 'sale', NEW.id);

            -- Streak Update (sempre para o v_user_id)
            SELECT * INTO v_streak_record FROM public.sales_streaks WHERE user_id = v_user_id;
            IF NOT FOUND THEN
                INSERT INTO public.sales_streaks (user_id, current_streak, longest_streak, last_sale_date)
                VALUES (v_user_id, 1, 1, v_today);
            ELSE
                v_days_diff := v_today - v_streak_record.last_sale_date;
                IF v_days_diff = 1 THEN
                    UPDATE public.sales_streaks
                    SET current_streak = current_streak + 1,
                        longest_streak = GREATEST(longest_streak, current_streak + 1),
                        last_sale_date = v_today
                    WHERE user_id = v_user_id;
                ELSIF v_days_diff > 1 THEN
                    UPDATE public.sales_streaks
                    SET current_streak = 1, last_sale_date = v_today
                    WHERE user_id = v_user_id;
                END IF;
            END IF;

            PERFORM public.check_user_achievements(v_user_id);
        END IF;
    END IF;

    -- Anti-Duplicação para Aprovações
    IF v_is_approved THEN
        SELECT EXISTS(SELECT 1 FROM public.approved_events WHERE client_id = NEW.id) INTO v_already_processed;
        IF NOT v_already_processed THEN
            INSERT INTO public.approved_events (client_id, user_id, development_id)
            VALUES (NEW.id, v_user_id, v_dev_id);
            PERFORM public.check_user_achievements(v_user_id);
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    -- 2. Progresso nas Metas (Global, Por Corretor, Por Equipe)
    FOR v_affected_goal IN
        SELECT * FROM public.goals
        WHERE status = 'active'
        AND (
            assignee_type = 'All' OR
            (assignee_type = 'User' AND assignee_id = v_user_id) OR
            (assignee_type = 'Team' AND assignee_id IN (
                SELECT team_id FROM public.profiles WHERE id = v_user_id AND team_id IS NOT NULL
            )) OR
            (assignee_type = 'Directorate' AND assignee_id IN (
                SELECT directorate_id FROM public.profiles WHERE id = v_user_id AND directorate_id IS NOT NULL
            ))
        )
        AND (property_id = v_dev_id OR property_id IS NULL)
    LOOP
        IF (v_is_sale AND (v_affected_goal.objective_type IS NULL OR v_affected_goal.objective_type = 'sales')) OR
           (v_is_approved AND v_affected_goal.objective_type = 'approved_clients') THEN

            UPDATE public.goals
            SET current_progress = current_progress +
                CASE WHEN v_affected_goal.measure_type = 'currency' THEN v_contract_value ELSE 1 END
            WHERE id = v_affected_goal.id
            RETURNING * INTO v_affected_goal;

            -- Se a Venda FEZ a meta bater!
            IF v_affected_goal.current_progress >= v_affected_goal.target AND v_affected_goal.status = 'active' THEN
                v_goal_xp := COALESCE(v_affected_goal.points,
                    CASE WHEN v_affected_goal.type = 'Missão' THEN 500 ELSE 300 END);

                -- Distribuir os XP:
                IF v_affected_goal.assignee_type = 'Team' THEN
                    -- Se a meta for da equipe, RECOMPENSA TODOS DA EQUIPE
                    FOR v_team_member_id IN
                        SELECT id FROM public.profiles 
                        WHERE team_id = v_affected_goal.assignee_id 
                          AND UPPER(COALESCE(status, '')) IN ('ACTIVE', 'ATIVO')
                    LOOP
                        INSERT INTO public.user_points (user_id, points, source, reference_id)
                        VALUES (v_team_member_id, v_goal_xp, v_affected_goal.type, v_affected_goal.id);

                        INSERT INTO public.system_events (type, user_id, payload)
                        VALUES (
                            CASE WHEN v_affected_goal.type = 'Missão' THEN 'mission_completed' ELSE 'goal_achieved' END,
                            v_team_member_id,
                            jsonb_build_object('goal_id', v_affected_goal.id, 'title', v_affected_goal.title, 'xp', v_goal_xp)
                        );
                        PERFORM public.check_user_achievements(v_team_member_id);
                    END LOOP;

                ELSIF v_affected_goal.assignee_type = 'Directorate' THEN
                    -- Se a meta for da diretoria, RECOMPENSA TODOS DA DIRETORIA
                    FOR v_team_member_id IN
                        SELECT id FROM public.profiles 
                        WHERE directorate_id = v_affected_goal.assignee_id 
                          AND UPPER(COALESCE(status, '')) IN ('ACTIVE', 'ATIVO')
                    LOOP
                        INSERT INTO public.user_points (user_id, points, source, reference_id)
                        VALUES (v_team_member_id, v_goal_xp, v_affected_goal.type, v_affected_goal.id);

                        INSERT INTO public.system_events (type, user_id, payload)
                        VALUES (
                            CASE WHEN v_affected_goal.type = 'Missão' THEN 'mission_completed' ELSE 'goal_achieved' END,
                            v_team_member_id,
                            jsonb_build_object('goal_id', v_affected_goal.id, 'title', v_affected_goal.title, 'xp', v_goal_xp)
                        );
                        PERFORM public.check_user_achievements(v_team_member_id);
                    END LOOP;
                    
                ELSE
                    -- Se for Global (All) ou Específica de Usuário (User), dá apenas para quem bateu a meta
                    INSERT INTO public.user_points (user_id, points, source, reference_id)
                    VALUES (v_user_id, v_goal_xp, v_affected_goal.type, v_affected_goal.id);

                    INSERT INTO public.system_events (type, user_id, payload)
                    VALUES (
                        CASE WHEN v_affected_goal.type = 'Missão' THEN 'mission_completed' ELSE 'goal_achieved' END,
                        v_user_id,
                        jsonb_build_object('goal_id', v_affected_goal.id, 'title', v_affected_goal.title, 'xp', v_goal_xp)
                    );
                    -- Check achievements
                    PERFORM public.check_user_achievements(v_user_id);
                END IF;

                -- Conclui a Meta
                UPDATE public.goals SET status = 'achieved', closed_at = NOW() WHERE id = v_affected_goal.id;
            END IF;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;
