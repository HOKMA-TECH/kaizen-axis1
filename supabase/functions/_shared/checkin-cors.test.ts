import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedCheckinOrigin } from './checkin-cors.ts';

describe('isAllowedCheckinOrigin', () => {
  it('allows the production app origin', () => {
    assert.equal(isAllowedCheckinOrigin('https://app.imobkaizen.com.br'), true);
  });

  it('rejects legacy Vercel and kaizen-axis.space hosts', () => {
    assert.equal(isAllowedCheckinOrigin('https://kaizen-axis.space'), false);
    assert.equal(isAllowedCheckinOrigin('https://kaizen-axis1.vercel.app'), false);
    assert.equal(
      isAllowedCheckinOrigin('https://kaizen-axis1-git-preview-checkin-multiunidade-hokma-tech.vercel.app'),
      false,
    );
  });

  it('allows configured origins and rejects arbitrary websites', () => {
    assert.equal(isAllowedCheckinOrigin('https://preview.example.com', 'https://preview.example.com'), true);
    assert.equal(isAllowedCheckinOrigin('https://attacker.example'), false);
  });

  it('rejects requests without an Origin header', () => {
    assert.equal(isAllowedCheckinOrigin(null), false);
  });
});
