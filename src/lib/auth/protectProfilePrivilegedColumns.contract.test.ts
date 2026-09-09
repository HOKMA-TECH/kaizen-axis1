import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260909120000_protect_profile_privileged_columns.sql'),
  'utf8',
);
const settings = readFileSync(join(root, 'src/pages/Settings.tsx'), 'utf8');
const chatSidebar = readFileSync(join(root, 'src/components/chat/ChatSidebar.tsx'), 'utf8');

describe('protect profile privileged columns', () => {
  it('locks role status and hierarchy fields while allowing admin director and service_role', () => {
    assert.match(migration, /protect_profile_privileged_columns/);
    assert.match(migration, /trg_protect_profile_privileged_columns/);
    for (const field of ['role', 'status', 'directorate_id', 'team_id', 'team', 'manager_id', 'coordinator_id']) {
      assert.match(migration, new RegExp(`NEW\\.${field}\\s+IS DISTINCT FROM\\s+OLD\\.${field}`));
    }
    assert.match(migration, /service_role/);
    assert.match(migration, /ADMIN/);
    assert.match(migration, /DIRETOR/);
    assert.match(migration, /42501/);
    assert.doesNotMatch(migration, /DROP POLICY[\s\S]*profiles_update_own/);
    assert.doesNotMatch(migration, /checkin_unit_code/);
  });

  it('keeps self-service profile updates on free fields only', () => {
    assert.match(settings, /\.from\('profiles'\)/);
    assert.match(settings, /avatar_url:/);
    assert.match(settings, /phone:/);
    assert.doesNotMatch(settings, /\.update\(\{\s*name:[\s\S]{0,400}\brole\s*:/);
    assert.match(chatSidebar, /chat_display_name:/);
    assert.match(chatSidebar, /chat_avatar_url:/);
    assert.doesNotMatch(chatSidebar, /chat_display_name:[\s\S]{0,200}\brole\s*:/);
  });
});
