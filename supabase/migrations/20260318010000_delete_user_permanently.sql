-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Exclusão Permanente de Usuários
-- Descrição: Cria função RPC para deletar permanentemente um usuário e todos
--            os seus dados relacionados do banco de dados
-- ════════════════════════════════════════════════════════════════════════════

-- Drop function if exists
DROP FUNCTION IF EXISTS delete_user_permanently(UUID);

-- Create function to delete user permanently
CREATE OR REPLACE FUNCTION delete_user_permanently(user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER := 0;
  user_email TEXT;
  user_name TEXT;
BEGIN
  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. VERIFICAÇÃO DE PERMISSÕES
  -- ══════════════════════════════════════════════════════════════════════════

  -- Verifica se o usuário atual é ADMIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Apenas ADMIN pode excluir usuários permanentemente';
  END IF;

  -- Verifica se o usuário a ser deletado existe
  SELECT email, name INTO user_email, user_name
  FROM profiles
  WHERE id = user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  -- Impede que o ADMIN delete a si mesmo
  IF user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir sua própria conta';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. EXCLUSÃO EM CASCATA DOS DADOS RELACIONADOS
  -- ══════════════════════════════════════════════════════════════════════════

  -- Delete from check_ins
  DELETE FROM check_ins WHERE user_id = user_id;

  -- Delete from appointments (as responsible or creator)
  DELETE FROM appointments WHERE responsible_id = user_id OR created_by = user_id;

  -- Delete from clients (as responsible or creator)
  DELETE FROM clients WHERE responsible_id = user_id OR created_by = user_id;

  -- Delete from tasks
  DELETE FROM tasks WHERE user_id = user_id OR assigned_to = user_id;

  -- Delete from notifications
  DELETE FROM notifications WHERE target_user_id = user_id OR created_by = user_id;

  -- Delete from developments
  DELETE FROM developments WHERE user_id = user_id;

  -- Delete from trainings
  DELETE FROM trainings WHERE created_by = user_id;

  -- Delete from training_progress
  DELETE FROM training_progress WHERE user_id = user_id;

  -- Delete from presence_distributions
  DELETE FROM presence_distributions WHERE user_id = user_id;

  -- Delete from wa_conversations
  DELETE FROM wa_conversations WHERE user_id = user_id;

  -- Delete from client_documents
  DELETE FROM client_documents WHERE uploaded_by = user_id;

  -- Remove user from team members arrays
  UPDATE teams
  SET members = array_remove(members, user_id)
  WHERE user_id = ANY(members);

  -- Update directorates if user is manager
  UPDATE directorates
  SET manager_id = NULL
  WHERE manager_id = user_id;

  -- Update profiles if user is manager of others
  UPDATE profiles
  SET manager_id = NULL
  WHERE manager_id = user_id;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. EXCLUSÃO DO PERFIL
  -- ══════════════════════════════════════════════════════════════════════════

  DELETE FROM profiles WHERE id = user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. EXCLUSÃO DO AUTH.USERS (Supabase Auth)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Deleta o usuário do sistema de autenticação do Supabase
  DELETE FROM auth.users WHERE id = user_id;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. RETORNO
  -- ══════════════════════════════════════════════════════════════════════════

  RETURN json_build_object(
    'success', true,
    'message', 'Usuário deletado permanentemente',
    'user_id', user_id,
    'user_name', user_name,
    'user_email', user_email,
    'deleted_count', deleted_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro ao deletar usuário: %', SQLERRM;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ══════════════════════════════════════════════════════════════════════════

COMMENT ON FUNCTION delete_user_permanently(UUID) IS
'Deleta permanentemente um usuário e todos os seus dados relacionados.
Apenas ADMIN pode executar esta função.
ATENÇÃO: Esta ação é IRREVERSÍVEL!';
