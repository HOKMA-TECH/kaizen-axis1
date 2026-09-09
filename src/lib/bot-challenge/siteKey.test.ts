import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTurnstileSiteKey } from './siteKey.ts';

describe('getTurnstileSiteKey', () => {
  it('returns the trimmed site key in development even if empty', () => {
    assert.equal(getTurnstileSiteKey({ PROD: false, VITE_TURNSTILE_SITE_KEY: '' }), '');
  });

  it('throws in production when the site key is missing', () => {
    assert.throws(
      () => getTurnstileSiteKey({ PROD: true, VITE_TURNSTILE_SITE_KEY: '   ' }),
      /VITE_TURNSTILE_SITE_KEY/,
    );
  });

  it('returns the production site key when present', () => {
    assert.equal(
      getTurnstileSiteKey({ PROD: true, VITE_TURNSTILE_SITE_KEY: '0xpublic' }),
      '0xpublic',
    );
  });
});
