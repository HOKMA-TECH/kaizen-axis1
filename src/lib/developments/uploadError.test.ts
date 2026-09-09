import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDevelopmentUploadError } from './uploadError.ts';

describe('formatDevelopmentUploadError', () => {
  it('maps storage RLS failures to a permission message', () => {
    assert.equal(
      formatDevelopmentUploadError('new row violates row-level security policy', 'image'),
      'Sem permissão para enviar este arquivo. Entre novamente com um perfil ADMIN ou DIRETOR.',
    );
  });

  it('maps mime rejections by upload kind', () => {
    assert.equal(
      formatDevelopmentUploadError('mime type not allowed', 'pdf'),
      'Envie um PDF. Outros tipos não são aceitos no book.',
    );
    assert.equal(
      formatDevelopmentUploadError('Invalid content type', 'image'),
      'Envie uma imagem (JPG, PNG, WEBP ou GIF).',
    );
  });

  it('keeps unknown server messages', () => {
    assert.equal(formatDevelopmentUploadError('payload too large', 'image'), 'payload too large');
    assert.equal(formatDevelopmentUploadError(undefined, 'pdf'), 'Falha no upload. Tente novamente.');
  });
});
