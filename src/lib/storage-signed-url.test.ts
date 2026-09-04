import assert from 'node:assert/strict';
import { rewriteSignedUrlForBrowser } from './storage-signed-url';

const PUBLIC = 'https://supabase.kaizen.example';

assert.equal(
  rewriteSignedUrlForBrowser(
    'http://api-gw:8000/storage/v1/object/sign/client-documents/x.pdf?token=abc',
    PUBLIC,
  ),
  'https://supabase.kaizen.example/storage/v1/object/sign/client-documents/x.pdf?token=abc',
);

assert.equal(
  rewriteSignedUrlForBrowser(
    'https://supabase.kaizen.example/storage/v1/object/sign/client-documents/x.pdf?token=abc',
    PUBLIC,
  ),
  'https://supabase.kaizen.example/storage/v1/object/sign/client-documents/x.pdf?token=abc',
);

assert.equal(
  rewriteSignedUrlForBrowser('not-a-url', PUBLIC),
  'not-a-url',
);

assert.equal(
  rewriteSignedUrlForBrowser(
    'http://api-gw:8000/storage/v1/object/sign/x.pdf?token=abc',
    '',
  ),
  'http://api-gw:8000/storage/v1/object/sign/x.pdf?token=abc',
);

console.log('storage-signed-url tests passed');
