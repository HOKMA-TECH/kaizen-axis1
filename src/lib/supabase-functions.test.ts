import { buildAuthenticatedFunctionHeaders } from './supabase-functions';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await runTest('builds Supabase function headers with bearer token and anon key', () => {
  const headers = buildAuthenticatedFunctionHeaders({
    accessToken: 'user-jwt',
    anonKey: 'anon-key',
  });

  assert(headers.Authorization === 'Bearer user-jwt', 'Authorization header should contain the user JWT');
  assert(headers.apikey === 'anon-key', 'apikey header should contain the anon key');
});

await runTest('rejects missing session before invoking protected functions', () => {
  let didThrow = false;

  try {
    buildAuthenticatedFunctionHeaders({
      accessToken: undefined,
      anonKey: 'anon-key',
    });
  } catch (error: any) {
    didThrow = true;
    assert(
      error.message === 'Sessao expirada. Faca login novamente para enviar e-mail.',
      'missing session should produce an actionable message',
    );
  }

  assert(didThrow, 'missing session should throw');
});
