import assert from 'node:assert/strict';
import { enforceApuracaoRateLimits } from './apuracao-rate-limit.js';

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

await runTest('allows apuracao in degraded mode when rate-guard is unavailable', async () => {
  const calls: FetchCall[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return jsonResponse(500, { error: 'Falha ao aplicar limite' });
  };

  const result = await enforceApuracaoRateLimits({
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-key',
    token: 'user-token',
    userId: 'user-1',
    fetchImpl,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.degraded, true);
  assert.match(result.reason ?? '', /rate-guard/);
  assert.equal(calls.length, 1);
});

await runTest('keeps blocking when the rate limit is actually exceeded', async () => {
  const fetchImpl = async () => jsonResponse(429, { error: 'Limite excedido' });

  const result = await enforceApuracaoRateLimits({
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-key',
    token: 'user-token',
    userId: 'user-1',
    fetchImpl,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 429);
  assert.equal(result.message, 'Limite de requisicoes atingido. Aguarde 1 minuto.');
});

await runTest('uses direct RPC when the service role key is available', async () => {
  const calls: FetchCall[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return jsonResponse(200, 1);
  };

  const result = await enforceApuracaoRateLimits({
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-key',
    supabaseServiceRoleKey: 'service-key',
    token: 'user-token',
    userId: 'user-1',
    fetchImpl,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.degraded, undefined);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url.includes('/rest/v1/rpc/increment_request_counter')));
});
