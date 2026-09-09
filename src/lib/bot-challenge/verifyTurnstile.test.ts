import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTurnstileToken } from './verifyTurnstile.ts';

describe('verifyTurnstileToken', () => {
  it('fails closed when the secret is missing', async () => {
    const result = await verifyTurnstileToken({
      token: 'tok',
      secret: '',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
    }
  });

  it('rejects an empty token before calling siteverify', async () => {
    let called = 0;
    const result = await verifyTurnstileToken({
      token: '  ',
      secret: 'secret',
      fetchImpl: async () => {
        called += 1;
        return new Response('{}', { status: 200 });
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
    assert.equal(called, 0);
  });

  it('accepts a successful siteverify response', async () => {
    const result = await verifyTurnstileToken({
      token: 'ok-token',
      secret: 'secret',
      ip: '1.2.3.4',
      fetchImpl: async (_url, init) => {
        const body = String(init?.body || '');
        assert.match(body, /ok-token/);
        assert.match(body, /1\.2\.3\.4/);
        return Response.json({ success: true });
      },
    });
    assert.equal(result.ok, true);
  });

  it('rejects a failed siteverify response', async () => {
    const result = await verifyTurnstileToken({
      token: 'bad',
      secret: 'secret',
      fetchImpl: async () => Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  });
});
