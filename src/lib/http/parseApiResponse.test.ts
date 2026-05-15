import assert from 'node:assert/strict';
import { parseApiResponse } from './parseApiResponse';

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

await runTest('parses JSON API responses', async () => {
  const response = new Response(JSON.stringify({ erro: 'Sessao invalida.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

  const parsed = await parseApiResponse<{ erro: string }>(response);

  assert.deepEqual(parsed, { erro: 'Sessao invalida.' });
});

await runTest('returns a safe error object for non-JSON server responses', async () => {
  const response = new Response('A server error has occurred', {
    status: 500,
    headers: { 'Content-Type': 'text/plain' },
  });

  const parsed = await parseApiResponse<{ erro?: string }>(response);

  assert.equal(parsed.erro, 'Erro 500: A server error has occurred');
});
