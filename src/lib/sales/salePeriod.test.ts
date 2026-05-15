import assert from 'node:assert/strict';
import { getSaleReferenceDate, isSaleInCurrentMonth } from './salePeriod.ts';

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const may2026 = new Date('2026-05-15T12:00:00Z');

runTest('uses closed_at over updated_at and excludes old sale updated in current month', () => {
  const client = {
    stage: 'Concluído',
    closed_at: '2026-04-10T10:00:00Z',
    updated_at: '2026-05-15T10:00:00Z',
  };

  assert.equal(getSaleReferenceDate(client), '2026-04-10T10:00:00Z');
  assert.equal(isSaleInCurrentMonth(client, may2026), false);
});

runTest('includes completed sale closed in current month', () => {
  const client = {
    stage: 'Concluído',
    closed_at: '2026-05-02T10:00:00Z',
    updated_at: '2026-05-15T10:00:00Z',
  };

  assert.equal(isSaleInCurrentMonth(client, may2026), true);
});

runTest('includes completed legacy sale without closed_at using updated_at fallback', () => {
  const client = {
    stage: 'Concluído',
    updated_at: '2026-05-03T10:00:00Z',
  };

  assert.equal(isSaleInCurrentMonth(client, may2026), true);
});

runTest('excludes approved client even when dates are in current month', () => {
  const client = {
    stage: 'Aprovado',
    closed_at: '2026-05-02T10:00:00Z',
    updated_at: '2026-05-03T10:00:00Z',
  };

  assert.equal(isSaleInCurrentMonth(client, may2026), false);
});
