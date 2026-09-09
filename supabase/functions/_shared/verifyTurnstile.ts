export type TurnstileVerifyOk = { ok: true };
export type TurnstileVerifyFail = { ok: false; status: number; message: string };
export type TurnstileVerifyResult = TurnstileVerifyOk | TurnstileVerifyFail;

type VerifyInput = {
  token: string;
  secret: string | undefined;
  ip?: string;
  fetchImpl?: typeof fetch;
};

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(input: VerifyInput): Promise<TurnstileVerifyResult> {
  const secret = String(input.secret || '').trim();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
    };
  }

  const token = String(input.token || '').trim();
  if (!token) {
    return { ok: false, status: 400, message: 'Verificação de segurança obrigatória.' };
  }

  const fetchImpl = input.fetchImpl || fetch;
  const body = new URLSearchParams({
    secret,
    response: token,
    ...(input.ip ? { remoteip: input.ip } : {}),
  });

  const verifyRes = await fetchImpl(SITEVERIFY, { method: 'POST', body }).catch(() => null);
  const verifyJson = verifyRes ? await verifyRes.json().catch(() => null) : null;
  if (!verifyJson?.success) {
    return {
      ok: false,
      status: 400,
      message: 'Verificação de segurança inválida ou expirada. Tente novamente.',
    };
  }
  return { ok: true };
}
