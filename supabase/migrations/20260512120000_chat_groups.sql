-- Chat groups tables
CREATE TABLE IF NOT EXISTS chat_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  avatar_url  text
);

CREATE TABLE IF NOT EXISTS chat_group_members (
  group_id    uuid NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- RLS
ALTER TABLE chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_group_members ENABLE ROW LEVEL SECURITY;

-- Members can see groups they belong to
CREATE POLICY "members_see_group" ON chat_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_group_members
      WHERE group_id = chat_groups.id AND user_id = auth.uid()
    )
  );

-- Authenticated users can create groups
CREATE POLICY "auth_create_group" ON chat_groups
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- Members can see group membership
CREATE POLICY "members_see_membership" ON chat_group_members
  FOR SELECT USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM chat_groups WHERE id = group_id AND created_by = auth.uid()
    )
  );

-- Group creator can add members
CREATE POLICY "creator_add_members" ON chat_group_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_groups WHERE id = group_id AND created_by = auth.uid()
    )
  );
