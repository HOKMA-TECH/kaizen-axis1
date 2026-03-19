-- Fix definitivo: cada DELETE tem seu próprio bloco de exceção.
-- Se a tabela não existir, pula silenciosamente.

DROP FUNCTION IF EXISTS delete_user_permanently(UUID);

CREATE OR REPLACE FUNCTION delete_user_permanently(user_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid         UUID    := user_id;
  deleted_count INTEGER := 0;
  user_email    TEXT;
  user_name     TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN') THEN
    RAISE EXCEPTION 'Apenas ADMIN pode excluir usuários permanentemente';
  END IF;

  SELECT name INTO user_name FROM profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = v_uid;

  IF v_uid = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir sua própria conta';
  END IF;

  -- Cada bloco ignora erros de tabela/coluna inexistente
  BEGIN DELETE FROM daily_checkins       WHERE daily_checkins.user_id       = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM checkin_tokens       WHERE checkin_tokens.corretor_id   = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM lead_assignments     WHERE lead_assignments.corretor_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM appointments         WHERE appointments.owner_id        = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM clients              WHERE clients.owner_id             = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM tasks                WHERE tasks.owner_id               = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM developments         WHERE developments.user_id         = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM trainings            WHERE trainings.created_by         = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM training_completions WHERE training_completions.user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM notifications        WHERE notifications.target_user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM user_achievements    WHERE user_achievements.user_id    = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM wa_conversations     WHERE wa_conversations.user_id     = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM client_documents     WHERE client_documents.uploaded_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM portals              WHERE portals.created_by           = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM goals                WHERE goals.created_by             = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN UPDATE directorates SET manager_id = NULL WHERE manager_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE teams        SET manager_id = NULL WHERE manager_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE profiles     SET manager_id = NULL WHERE manager_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  DELETE FROM profiles WHERE id = v_uid;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  DELETE FROM auth.users WHERE auth.users.id = v_uid;

  RETURN json_build_object(
    'success', true,
    'message', 'Usuário deletado permanentemente',
    'user_id', v_uid,
    'user_name', user_name,
    'user_email', user_email,
    'deleted_count', deleted_count
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Erro ao deletar usuário: %', SQLERRM;
END;
$$;
