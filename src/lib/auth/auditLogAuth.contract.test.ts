import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const source = readFileSync(join(root, 'supabase/functions/audit-log/index.ts'), 'utf8');

describe('audit-log authorization', () => {
  it('requires jwt except for login_failed on auth', () => {
    assert.match(source, /action !== 'login_failed' \|\| entity !== 'auth'/);
    assert.match(source, /Não autorizado/);
    assert.match(source, /reason: typeof metadata.reason === 'string'/);
    assert.match(source, /user_id: resolvedUserId/);
  });
});
