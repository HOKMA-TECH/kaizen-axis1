import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('reset password recovery gate', () => {
  it('requires PASSWORD_RECOVERY and an 8-character password', () => {
    const source = readFileSync(join(root, 'src/pages/ResetPassword.tsx'), 'utf8');
    assert.match(source, /PASSWORD_RECOVERY/);
    assert.match(source, /method === 'recovery'/);
    assert.match(source, /length < 8/);
    assert.doesNotMatch(source, /if \(session\) setReady\(true\)/);
  });
});
