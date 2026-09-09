import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isActiveStatus,
  isInactiveStatus,
  isPendingStatus,
} from './profileStatus.ts';

describe('profile status helpers', () => {
  it('treats pending variants as pending regardless of case', () => {
    assert.equal(isPendingStatus('pending'), true);
    assert.equal(isPendingStatus('Pendente'), true);
    assert.equal(isPendingStatus('PENDING'), true);
    assert.equal(isPendingStatus('  pendente  '), true);
    assert.equal(isPendingStatus('Ativo'), false);
    assert.equal(isPendingStatus('rejected'), false);
    assert.equal(isPendingStatus(null), false);
    assert.equal(isPendingStatus(undefined), false);
  });

  it('treats active and inactive variants case-insensitively', () => {
    assert.equal(isActiveStatus('Ativo'), true);
    assert.equal(isActiveStatus('active'), true);
    assert.equal(isActiveStatus('ACTIVE'), true);
    assert.equal(isActiveStatus('pending'), false);
    assert.equal(isInactiveStatus('Inativo'), true);
    assert.equal(isInactiveStatus('inactive'), true);
    assert.equal(isInactiveStatus('Ativo'), false);
  });
});
