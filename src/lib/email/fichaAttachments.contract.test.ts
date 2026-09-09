import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('ficha analysis email attachments', () => {
  it('send-email downloads client documents on the server', () => {
    const source = readFileSync(join(root, 'supabase/functions/send-email/index.ts'), 'utf8');
    assert.match(source, /documentIds/);
    assert.match(source, /\.download\(/);
    assert.match(source, /client_documents/);
  });

  it('the compose form sends documentIds and does not swallow ficha download failures', () => {
    const source = readFileSync(join(root, 'src/pages/SendEmail.tsx'), 'utf8');
    assert.match(source, /documentIds/);
    assert.doesNotMatch(source, /get-doc-url-v2/);
    assert.doesNotMatch(source, /console\.warn\(`Falha ao carregar anexo/);
  });

  it('does not prefill "Para" with the client email from the ficha', () => {
    const source = readFileSync(join(root, 'src/pages/SendEmail.tsx'), 'utf8');
    assert.match(source, /const \[to, setTo\] = useState<string\[\]>\(\[\]\);/);
    assert.doesNotMatch(source, /setTo\(prev => \(prev\.length \? prev : \[found\.email\]\)\)/);
    assert.doesNotMatch(source, /setTo\(\[found\.email\]\)/);
  });
});
