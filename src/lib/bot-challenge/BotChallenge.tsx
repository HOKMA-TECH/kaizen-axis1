import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { getTurnstileSiteKey } from './siteKey';

export type BotChallengeHandle = {
  consumeToken: () => string;
  reset: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-kaizen-turnstile="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar verificação')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.kaizenTurnstile = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Falha ao carregar verificação')), { once: true });
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export const BotChallenge = forwardRef<BotChallengeHandle, { hidden?: boolean }>(function BotChallenge(
  { hidden = false },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef('');
  const [hint, setHint] = useState('');
  const [ready, setReady] = useState(false);

  const siteKey = getTurnstileSiteKey(import.meta.env);

  const reset = useCallback(() => {
    tokenRef.current = '';
    setReady(false);
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    consumeToken: () => {
      if (!siteKey) {
        throw new Error('Confirme a verificação de segurança antes de continuar.');
      }
      const token = tokenRef.current;
      if (!token) {
        throw new Error('Confirme a verificação de segurança antes de continuar.');
      }
      reset();
      return token;
    },
    reset,
  }), [reset, siteKey]);

  useEffect(() => {
    if (!siteKey || hidden) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          appearance: 'always',
          retry: 'auto',
          'refresh-expired': 'auto',
          callback: (token: string) => {
            tokenRef.current = token || '';
            setReady(Boolean(token));
            if (token) setHint('');
          },
          'expired-callback': () => {
            tokenRef.current = '';
            setReady(false);
            setHint('A verificação expirou. Complete de novo e tente novamente.');
          },
          'error-callback': () => {
            tokenRef.current = '';
            setReady(false);
            setHint('Não foi possível validar a verificação. Tente novamente.');
          },
        });
      })
      .catch(() => {
        if (!cancelled) setHint('Não foi possível carregar a verificação de segurança.');
      });

    return () => {
      cancelled = true;
    };
  }, [hidden, siteKey]);

  if (!siteKey) {
    if (import.meta.env.PROD) return null;
    return (
      <p className="text-xs text-center text-amber-500">
        Verificação desligada neste ambiente (defina VITE_TURNSTILE_SITE_KEY).
      </p>
    );
  }

  return (
    <div className={hidden ? 'hidden' : 'pt-1'} aria-hidden={hidden}>
      <div ref={containerRef} className="flex justify-center" />
      {hint && <p className="mt-2 text-xs text-center text-red-500">{hint}</p>}
      {!ready && !hint && (
        <p className="mt-2 text-xs text-center text-text-secondary">Conclua a verificação para continuar.</p>
      )}
    </div>
  );
});
