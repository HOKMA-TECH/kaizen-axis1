-- APP-11: comparação de papel case-insensitive. Corpo permanece o da 20260827125000.
CREATE OR REPLACE FUNCTION public.delete_user_permanently(user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid         UUID := delete_user_permanently.user_id;
  deleted_count INTEGER := 0;
  user_email    TEXT;
  user_name     TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND UPPER(COALESCE(role, '')) = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Apenas ADMIN pode excluir usuários permanentemente';
  END IF;

  IF v_uid = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir sua própria conta';
  END IF;

  SELECT name INTO user_name FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = v_uid;

  BEGIN UPDATE public.clients SET owner_id = NULL WHERE owner_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.clients SET user_id = NULL WHERE public.clients.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.appointments SET owner_id = NULL WHERE owner_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.appointments SET user_id = NULL WHERE public.appointments.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.tasks SET owner_id = NULL WHERE owner_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.tasks SET assigned_to = NULL WHERE assigned_to = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.tasks SET created_by = NULL WHERE created_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.tasks SET user_id = NULL WHERE public.tasks.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.leads SET assigned_to = NULL WHERE assigned_to = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.lead_assignments SET corretor_id = NULL WHERE corretor_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.goals SET created_by = NULL WHERE created_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.goals SET owner_id = NULL WHERE owner_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.goals SET user_id = NULL WHERE public.goals.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.goals SET assignee_id = NULL WHERE assignee_type IN ('User', 'individual') AND assignee_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.announcements SET author_id = NULL WHERE author_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.announcements SET owner_id = NULL WHERE owner_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.directorates SET manager_id = NULL WHERE manager_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.teams SET manager_id = NULL WHERE manager_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.teams SET members = array_remove(members, v_uid) WHERE members IS NOT NULL AND v_uid = ANY (members); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.profiles SET manager_id = NULL WHERE manager_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.profiles SET coordinator_id = NULL WHERE coordinator_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.presence_queue SET last_assigned_corretor_id = NULL WHERE last_assigned_corretor_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.daily_checkins SET user_id = NULL WHERE public.daily_checkins.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.sales_events SET user_id = NULL WHERE public.sales_events.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.approved_events SET user_id = NULL WHERE public.approved_events.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.system_events SET user_id = NULL WHERE public.system_events.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.developments SET user_id = NULL WHERE public.developments.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.trainings SET created_by = NULL WHERE created_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.client_documents SET uploaded_by = NULL WHERE uploaded_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.profile_documents SET uploaded_by = NULL WHERE uploaded_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.portals SET created_by = NULL WHERE created_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.commission_entries SET owner_id = NULL WHERE owner_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.commission_entries SET paid_by = NULL WHERE paid_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN NULL; END;
  BEGIN UPDATE public.chat_messages SET sender_id = NULL WHERE sender_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN
    BEGIN DELETE FROM public.chat_messages WHERE sender_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END;
  BEGIN UPDATE public.chat_messages SET receiver_id = NULL WHERE receiver_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column OR not_null_violation THEN
    BEGIN DELETE FROM public.chat_messages WHERE receiver_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END;

  BEGIN DELETE FROM public.notifications WHERE target_user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.push_subscriptions WHERE public.push_subscriptions.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.user_achievements WHERE public.user_achievements.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.user_points WHERE public.user_points.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.checkin_tokens WHERE corretor_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.training_completions WHERE public.training_completions.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.chat_group_members WHERE public.chat_group_members.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.chat_message_reactions WHERE public.chat_message_reactions.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.wa_conversations WHERE public.wa_conversations.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.sales_streaks WHERE public.sales_streaks.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.checkin_always_present_users WHERE public.checkin_always_present_users.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.monthly_commission_goals WHERE public.monthly_commission_goals.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  DELETE FROM public.profiles WHERE id = v_uid;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  DELETE FROM auth.users WHERE id = v_uid;

  RETURN json_build_object(
    'success', true,
    'message', 'Usuário excluído permanentemente. O histórico comercial foi preservado.',
    'user_id', v_uid,
    'user_name', user_name,
    'user_email', user_email,
    'deleted_count', deleted_count
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Erro ao excluir usuário: %', SQLERRM;
END;
$$;
