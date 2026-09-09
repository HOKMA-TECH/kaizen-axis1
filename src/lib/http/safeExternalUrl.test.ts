import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toSafeExternalUrl } from './safeExternalUrl.ts';

describe('toSafeExternalUrl', () => {
  it('accepts http and https urls', () => {
    assert.equal(toSafeExternalUrl('https://example.com/book.pdf'), 'https://example.com/book.pdf');
    assert.equal(toSafeExternalUrl('http://legado.exemplo.com'), 'http://legado.exemplo.com/');
  });

  it('rejects javascript data and blob schemes', () => {
    assert.equal(toSafeExternalUrl('javascript:alert(1)'), null);
    assert.equal(toSafeExternalUrl('data:text/html,<script>alert(1)</script>'), null);
    assert.equal(toSafeExternalUrl('blob:https://example.com/abc'), null);
    assert.equal(toSafeExternalUrl('not a url'), null);
    assert.equal(toSafeExternalUrl(''), null);
  });
});
