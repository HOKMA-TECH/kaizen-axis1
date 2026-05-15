import assert from 'node:assert/strict';
import { formatPreview } from './chat-utils';

assert.equal(
  formatPreview('text', 'SEGREDO', false, true),
  'Visualização única',
  'view-once text previews must not expose message content'
);

assert.equal(
  formatPreview('image', '', true, true),
  'Você: Visualização única',
  'view-once media previews should stay generic and keep sender prefix'
);

assert.equal(
  formatPreview('text', 'Mensagem normal', true),
  'Você: Mensagem normal',
  'regular text previews should keep existing behavior'
);

console.log('chat-utils tests passed');
