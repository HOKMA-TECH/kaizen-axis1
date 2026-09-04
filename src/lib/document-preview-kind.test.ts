import assert from 'node:assert/strict';
import { classifyDocumentPreviewKind } from './document-preview-kind';

assert.equal(classifyDocumentPreviewKind('comprovante.pdf'), 'pdf');
assert.equal(classifyDocumentPreviewKind('foto.jpg'), 'image');
assert.equal(classifyDocumentPreviewKind('scan.PNG'), 'image');
assert.equal(classifyDocumentPreviewKind('contrato.docx'), 'other');
assert.equal(classifyDocumentPreviewKind('sem-extensao', 'application/pdf'), 'pdf');
assert.equal(classifyDocumentPreviewKind('sem-extensao', 'image/jpeg'), 'image');

console.log('document-preview-kind tests passed');
