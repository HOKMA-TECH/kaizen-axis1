type FetchLike = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

type RateScope = {
  scope: 'apuracao' | 'apuracao_daily';
  limit: number;
  windowMs: number;
  limitMessage: string;
};

export type RateLimitResult =
  | { allowed: true; degraded?: true; reason?: string }
  | { allowed: false; status: number; message: string; reason?: string };

type RateLimitOptions = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey?: string;
  token: string;
  userId?: string | null;
  fetchImpl?: FetchLike;
};

const RATE_SCOPES: RateScope[] = [
  {
    scope: 'apuracao',
    limit: 20,
    windowMs: 60_000,
    limitMessage: 'Limite de requisicoes atingido. Aguarde 1 minuto.',
  },
  {
    scope: 'apuracao_daily',
    limit: 100,
    windowMs: 86_400_000,
    limitMessage: 'Cota diaria de apuracoes atingida. Aguarde ate amanha.',
  },
];

function getWindowStart(now: Date, windowMs: number) {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
}

async function responseText(response: Response) {
  return response.text().catch(() => '');
}

async function incrementViaRpc(
  options: Required<Pick<RateLimitOptions, 'supabaseServiceRoleKey' | 'userId'>> &
    Pick<RateLimitOptions, 'supabaseUrl'> & {
      fetchImpl: FetchLike;
      rateScope: RateScope;
      now: Date;
    },
): Promise<RateLimitResult | null> {
  const response = await options.fetchImpl(
    `${options.supabaseUrl}/rest/v1/rpc/increment_request_counter`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.supabaseServiceRoleKey}`,
        apikey: options.supabaseServiceRoleKey,
      },
      body: JSON.stringify({
        _scope: options.rateScope.scope,
        _identifier: options.userId,
        _window_start: getWindowStart(options.now, options.rateScope.windowMs),
      }),
    },
  ).catch(() => null);

  if (!response) {
    return { allowed: true, degraded: true, reason: `rpc:${options.rateScope.scope}:network` };
  }

  if (!response.ok) {
    const body = await responseText(response);
    return { allowed: true, degraded: true, reason: `rpc:${options.rateScope.scope}:${response.status}:${body}` };
  }

  const data = await response.json().catch(() => null);
  const count = typeof data === 'number' ? data : Number(data?.count ?? data ?? 0);
  if (count >= options.rateScope.limit) {
    return {
      allowed: false,
      status: 429,
      message: options.rateScope.limitMessage,
      reason: `rpc:${options.rateScope.scope}:limit`,
    };
  }

  return null;
}

async function checkViaRateGuard(
  options: Pick<RateLimitOptions, 'supabaseUrl' | 'supabaseAnonKey' | 'token'> & {
    fetchImpl: FetchLike;
    rateScope: RateScope;
  },
): Promise<RateLimitResult | null> {
  const response = await options.fetchImpl(`${options.supabaseUrl}/functions/v1/rate-guard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.token}`,
      apikey: options.supabaseAnonKey,
    },
    body: JSON.stringify({ scope: options.rateScope.scope }),
  }).catch(() => null);

  if (!response) {
    return { allowed: true, degraded: true, reason: `rate-guard:${options.rateScope.scope}:network` };
  }

  if (response.status === 429) {
    return {
      allowed: false,
      status: 429,
      message: options.rateScope.limitMessage,
      reason: `rate-guard:${options.rateScope.scope}:limit`,
    };
  }

  if (!response.ok) {
    const body = await responseText(response);
    return { allowed: true, degraded: true, reason: `rate-guard:${options.rateScope.scope}:${response.status}:${body}` };
  }

  return null;
}

export async function enforceApuracaoRateLimits(options: RateLimitOptions): Promise<RateLimitResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = new Date();

  for (const rateScope of RATE_SCOPES) {
    if (options.supabaseServiceRoleKey && options.userId) {
      const rpcResult = await incrementViaRpc({
        supabaseUrl: options.supabaseUrl,
        supabaseServiceRoleKey: options.supabaseServiceRoleKey,
        userId: options.userId,
        fetchImpl,
        rateScope,
        now,
      });

      if (rpcResult?.allowed === false) return rpcResult;
      if (!rpcResult) continue;
    }

    const rateGuardResult = await checkViaRateGuard({
      supabaseUrl: options.supabaseUrl,
      supabaseAnonKey: options.supabaseAnonKey,
      token: options.token,
      fetchImpl,
      rateScope,
    });

    if (rateGuardResult?.allowed === false) return rateGuardResult;
    if (rateGuardResult?.degraded) return rateGuardResult;
  }

  return { allowed: true };
}
