import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');

describe('service worker turnstile bypass', () => {
  it('does not intercept challenges.cloudflare.com', () => {
    assert.match(sw, /challenges\.cloudflare\.com/);
    assert.match(sw, /CACHE_VERSION = 'v8'/);
  });
});
