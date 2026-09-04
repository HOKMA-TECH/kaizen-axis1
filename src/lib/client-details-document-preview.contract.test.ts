import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'ClientDetails.tsx'),
  'utf8',
);

assert.match(source, /rewriteSignedUrlForBrowser/);
assert.match(source, /DocumentPreviewOverlay/);
assert.doesNotMatch(source, /window\.open\(\s*signedUrl/);

console.log('client-details-document-preview contract passed');
