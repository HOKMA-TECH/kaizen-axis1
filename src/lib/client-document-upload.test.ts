import assert from 'node:assert/strict';
import {
  CLIENT_DOCUMENT_ACCEPT,
  inferDocumentContentType,
  isUnknownMimeType,
  prepareClientUploadFile,
  sniffDocumentKind,
  withInferredMime,
} from './client-document-upload';

assert.equal(isUnknownMimeType(''), true);
assert.equal(isUnknownMimeType('application/octet-stream'), true);
assert.equal(isUnknownMimeType('binary/octet-stream'), true);
assert.equal(isUnknownMimeType('application/pdf'), false);

assert.equal(
  inferDocumentContentType({ name: 'rg.pdf', type: 'application/octet-stream' }),
  'application/pdf',
);
assert.equal(
  inferDocumentContentType({ name: 'foto.jpg', type: '' }),
  'image/jpeg',
);
assert.equal(
  inferDocumentContentType({ name: 'contrato.docx', type: 'binary/octet-stream' }),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
);
assert.equal(
  inferDocumentContentType({ name: 'ok.pdf', type: 'application/pdf' }),
  'application/pdf',
);

const remapped = withInferredMime(new File([new Uint8Array([1])], 'rg.pdf', { type: 'application/octet-stream' }));
assert.equal(remapped.type, 'application/pdf');

assert.equal(inferDocumentContentType({ name: '1000001234', type: 'image/jpeg' }), 'image/jpeg');
assert.equal(inferDocumentContentType({ name: 'foto', type: 'image/jpg' }), 'image/jpeg');
assert.equal(inferDocumentContentType({ name: 'scan', type: 'image/pjpeg' }), 'image/jpeg');
assert.equal(inferDocumentContentType({ name: 'print', type: 'image/x-png' }), 'image/png');
assert.equal(inferDocumentContentType({ name: 'arquivo', type: 'application/x-pdf' }), 'application/pdf');
assert.equal(inferDocumentContentType({ name: 'foto.jfif', type: '' }), 'image/jpeg');

assert.equal(sniffDocumentKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime, 'image/jpeg');
assert.equal(sniffDocumentKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime, 'image/png');
assert.equal(sniffDocumentKind(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]))?.mime, 'application/pdf');
assert.equal(
  sniffDocumentKind(new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))?.ext,
  'heic',
);
assert.equal(sniffDocumentKind(new Uint8Array([0x00, 0x01, 0x02, 0x03])), null);

assert.match(CLIENT_DOCUMENT_ACCEPT, /^\.jpg/);
assert.doesNotMatch(CLIENT_DOCUMENT_ACCEPT, /^image\/\*/);

{
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const prepared = await prepareClientUploadFile(new File([jpeg], '1000001234', { type: 'application/octet-stream' }));
  assert.equal(prepared.type, 'image/jpeg');
  assert.match(prepared.name, /\.jpe?g$/i);
}

{
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  const prepared = await prepareClientUploadFile(new File([pdf], 'document', { type: '' }));
  assert.equal(prepared.type, 'application/pdf');
  assert.match(prepared.name, /\.pdf$/i);
}

console.log('client-document-upload tests passed');
