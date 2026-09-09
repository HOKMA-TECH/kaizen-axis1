import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isApuracaoRoleAllowed } from './apuracao-auth.ts';

describe('apuracao role allowlist', () => {
  it('matches the income RoleRoute', () => {
    assert.equal(isApuracaoRoleAllowed('ADMIN'), true);
    assert.equal(isApuracaoRoleAllowed('diretor'), true);
    assert.equal(isApuracaoRoleAllowed('GERENTE'), true);
    assert.equal(isApuracaoRoleAllowed('COORDENADOR'), true);
    assert.equal(isApuracaoRoleAllowed('ANALISTA'), true);
    assert.equal(isApuracaoRoleAllowed('CORRETOR'), false);
    assert.equal(isApuracaoRoleAllowed('RECEPCAO'), false);
    assert.equal(isApuracaoRoleAllowed(null), false);
  });
});
