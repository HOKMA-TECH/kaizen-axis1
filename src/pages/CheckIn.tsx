import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  QrCode, MapPin, CheckCircle, AlertCircle,
  Loader2, Clock, Users, Trophy, ScanLine,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckinRecord {
  id: string;
  user_id: string;
  position_in_queue: number;
  checkin_time: string;
  profiles: { name: string | null; avatar_url: string | null; role: string | null } | null;
}

type Step = 'idle' | 'locating' | 'sending' | 'success' | 'error' | 'already' | 'login';

interface CheckinResult {
  position?: number;
  message: string;
  distance?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function getBRTHour() {
  return ((new Date().getUTCHours() - 3) + 24) % 24;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckIn() {
  const { user, signOut } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qrToken = searchParams.get('token'); // token vindo do QR scan

  const [step, setStep]       = useState<Step>('idle');
  const [result, setResult]   = useState<CheckinResult | null>(null);
  const [queue, setQueue]     = useState<CheckinRecord[]>([]);
  const [brtHour, setBrtHour] = useState(getBRTHour());

  useEffect(() => {
    const t = setInterval(() => setBrtHour(getBRTHour()), 30_000);
    return () => clearInterval(t);
  }, []);

  const isOpen = brtHour >= 8 && brtHour < 14;

  // ── Fila do dia ───────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('daily_checkins')
      .select('id, user_id, position_in_queue, checkin_time, profiles(name, avatar_url, role)')
      .eq('checkin_date', today)
      .order('position_in_queue', { ascending: true });
    if (data) setQueue(data as unknown as CheckinRecord[]);
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // ── Check-in via QR ───────────────────────────────────────────────────────
  // iOS Safari bloqueia getCurrentPosition se não for disparado por gesto do usuário.
  // Por isso NÃO auto-submitamos: apenas mostramos o banner de confirmação e o botão.
  // O usuário toca no botão → dispara o gesto → iOS permite a solicitação de GPS.
  // (o useEffect anterior que fazia auto-submit foi removido intencionalmente)

  // ── Lógica de check-in ────────────────────────────────────────────────────
  async function submitCheckin(token?: string) {
    setStep('locating');
    setResult(null);

    // iOS Safari: tenta alta precisão (GPS) primeiro.
    // Se der timeout (indoor/sinal fraco), cai para baixa precisão (WiFi/rede) — suficiente para 100m.
    type GeoResult = GeolocationPosition | GeolocationPositionError | null;

    const tryGeo = (highAccuracy: boolean, timeout: number) =>
      new Promise<GeoResult>(resolve => {
        if (!navigator.geolocation) { resolve(null); return; }
        navigator.geolocation.getCurrentPosition(
          pos => resolve(pos),
          err => resolve(err),
          { enableHighAccuracy: highAccuracy, timeout, maximumAge: 60_000 },
        );
      });

    // 1ª tentativa: GPS de alta precisão (15s)
    let geoResult = await tryGeo(true, 15_000);

    // 2ª tentativa: se deu timeout, usa WiFi/rede (sem GPS — mais rápido indoor)
    if (geoResult && 'code' in geoResult && (geoResult as GeolocationPositionError).code === 3) {
      geoResult = await tryGeo(false, 10_000);
    }

    // Determina se é erro ou posição válida
    const isError = !geoResult || 'code' in geoResult;
    if (isError) {
      const code = (geoResult as GeolocationPositionError | null)?.code ?? 0;
      const isIOS     = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isAndroid = /Android/i.test(navigator.userAgent);
      let msg: string;
      if (code === 1) {
        // PERMISSION_DENIED — cada plataforma tem um caminho diferente
        if (isIOS) {
          msg = 'Permissão de localização negada no Safari.\n\nPasso a passo:\n1. Abra o app Ajustes do iPhone\n2. Role até Safari > Avançado > Dados de Sites\n3. Procure "kaizen-axis" e deslize para apagar\n4. Feche esta aba e abra o link novamente\n5. Quando o Safari perguntar, toque em "Permitir"\n\nSe ainda não funcionar: Ajustes > Privacidade e Segurança > Serviços de Localização > Sites do Safari > "Ao Usar o App".';
        } else if (isAndroid) {
          msg = 'Permissão de localização negada. Toque no ícone de cadeado 🔒 na barra de endereço > Permissões > Localização > Permitir. Depois recarregue a página.';
        } else {
          // Desktop (Chrome, Edge, Firefox…)
          msg = 'Permissão de localização bloqueada no navegador. Clique no ícone de cadeado 🔒 à esquerda da barra de endereço, vá em "Permissões do site" (ou "Configurações do site") > Localização > Permitir. Em seguida recarregue a página (F5).';
        }
      } else if (code === 2) {
        msg = 'Sinal de localização indisponível. No computador, verifique se o Windows tem permissão de localização: Configurações > Privacidade > Localização.';
      } else if (code === 3) {
        msg = 'Localização demorou para responder. Tente novamente ou verifique as permissões do navegador.';
      } else {
        msg = 'Seu navegador não suporta localização. Use Chrome ou Edge atualizados.';
      }
      setStep('error');
      setResult({ message: msg });
      return;
    }

    const pos = geoResult as GeolocationPosition;

    setStep('sending');

    const { data: { session: freshSession } } = await supabase.auth.getSession();
    const accessToken = freshSession?.access_token ?? null;

    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), 20_000);

    try {
      const { data, error } = await supabase.functions.invoke('checkin-geo', {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        body: {
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:  pos.coords.accuracy,
          ...(token ? { qrToken: token } : {}),
        },
        signal: abortCtrl.signal,
      });
      clearTimeout(timeoutId);

      if (error) {
        if (error.name === 'FunctionsHttpError') {
          const status = (error as any).context?.status as number | undefined;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const body: any = await (error as any).context?.json().catch(() => ({}));

          if (status === 401) { setStep('login'); return; }

          if (status === 409) {
            setStep('already');
            setResult({ position: body?.position, message: body?.message || 'Você já fez check-in hoje.' });
            fetchQueue();
            return;
          }

          setStep('error');
          setResult({ message: body?.message || body?.error || `Erro ${status}`, distance: body?.distance });
          return;
        }
        setStep('error');
        setResult({ message: 'Erro de conexão. Verifique sua internet.' });
        return;
      }

      // Sucesso 200
      setStep('success');
      setResult({ position: data.position, message: data.message, distance: data.distance });
      fetchQueue();
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setStep('error');
      setResult({ message: isAbort ? 'Servidor demorou demais. Tente novamente.' : 'Erro inesperado. Tente novamente.' });
    }
  }

  function handleButtonClick() {
    if (step === 'error') { setStep('idle'); setResult(null); return; }
    if (!isOpen || step !== 'idle') return;
    submitCheckin(qrToken ?? undefined);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const myCheckin       = queue.find(c => c.user_id === user?.id);
  const alreadyDone     = !!myCheckin || step === 'already' || step === 'success';
  const isLoading       = step === 'locating' || step === 'sending';
  const displayPosition = result?.position ?? myCheckin?.position_in_queue;
  const cameFromQR      = !!qrToken;

  const btnColor = !isOpen
    ? 'bg-surface-200 text-text-secondary cursor-not-allowed'
    : alreadyDone
    ? 'bg-green-500 text-white shadow-green-400/30'
    : step === 'error'
    ? 'bg-red-500 text-white shadow-red-400/30 cursor-pointer'
    : 'bg-gold-400 text-white shadow-gold-400/40 cursor-pointer';

  const btnLabel = isLoading
    ? (step === 'locating' ? 'Localizando...' : 'Verificando...')
    : alreadyDone ? 'Feito!'
    : step === 'error' ? 'Tentar novamente'
    : cameFromQR ? 'Confirmar check-in'
    : 'Fazer Check-in';

  return (
    <div className="flex flex-col min-h-screen bg-surface-50 pb-24">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-card-bg border-b border-surface-100 px-5 pt-10 pb-5">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Check-in</h1>
        <p className="text-sm text-text-secondary mt-1">
          {isOpen ? 'Janela de check-in aberta' : 'Disponível das 08:00 às 14:00'}
        </p>
      </div>

      <div className="flex-1 px-5 pt-6 space-y-5">

        {/* ── QR escaneado: banner de confirmação ───────────────────────── */}
        <AnimatePresence>
          {cameFromQR && !alreadyDone && step !== 'error' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 bg-gold-400/10 border border-gold-400/30 rounded-2xl px-4 py-3"
            >
              <ScanLine size={18} className="text-gold-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gold-600 dark:text-gold-400">QR Code escaneado</p>
                <p className="text-xs text-gold-600/70 dark:text-gold-400/70">
                  {isLoading ? 'Validando sua localização...' : 'Toque no botão abaixo para liberar o GPS e confirmar'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Button area ───────────────────────────────────────────────── */}
        <div className="flex flex-col items-center py-6 gap-5">

          {/* Time badge */}
          <div className={cn(
            'flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold',
            isOpen
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-surface-100 text-text-secondary',
          )}>
            <Clock size={13} />
            {isOpen ? 'Aberto · 08:00–14:00' : 'Fechado · abre às 08:00'}
          </div>

          {/* Main button */}
          <motion.button
            whileTap={isOpen && !alreadyDone && !isLoading ? { scale: 0.96 } as any : undefined}
            onClick={handleButtonClick}
            disabled={isLoading || (!isOpen && step !== 'error')}
            className={cn(
              'w-40 h-40 rounded-full flex flex-col items-center justify-center gap-2',
              'shadow-lg transition-all duration-300',
              btnColor,
            )}
          >
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div key="loading"
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <Loader2 size={36} className="animate-spin" />
                </motion.div>
              ) : alreadyDone ? (
                <motion.div key="ok"
                  initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <CheckCircle size={36} />
                </motion.div>
              ) : step === 'error' ? (
                <motion.div key="err"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <AlertCircle size={36} />
                </motion.div>
              ) : cameFromQR ? (
                <motion.div key="qr"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ScanLine size={36} />
                </motion.div>
              ) : (
                <motion.div key="idle"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <QrCode size={36} />
                </motion.div>
              )}
            </AnimatePresence>
            <span className="text-sm font-semibold text-center leading-tight px-3">{btnLabel}</span>
          </motion.button>

          {/* Result card */}
          <AnimatePresence>
            {(result || myCheckin) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={cn(
                  'w-full max-w-xs rounded-2xl p-4 text-center border',
                  alreadyDone
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800',
                )}
              >
                {(alreadyDone) && displayPosition && (
                  <>
                    <p className="text-4xl font-bold text-green-600 dark:text-green-400">
                      #{displayPosition}
                    </p>
                    <p className="text-[11px] text-green-600/60 dark:text-green-400/60 mt-0.5 mb-2">
                      na fila de distribuição hoje
                    </p>
                  </>
                )}
                <p className={cn(
                  'text-sm font-medium',
                  step === 'error' ? 'text-left whitespace-pre-line' : 'text-center',
                  alreadyDone
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-700 dark:text-red-400',
                )}>
                  {result?.message || 'Check-in registrado!'}
                </p>
                {result?.distance !== undefined && (
                  <p className={cn(
                    'text-xs mt-1 flex items-center justify-center gap-1',
                    step === 'error' ? 'text-red-500/70' : 'text-green-500/70',
                  )}>
                    <MapPin size={11} />
                    {step === 'error'
                      ? `${result.distance}m da imobiliária (máximo: 100m)`
                      : `${result.distance}m da imobiliária`}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sessão expirada — mostra card com botão de login */}
          {step === 'login' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-xs rounded-2xl p-5 text-center border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 space-y-3"
            >
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Sessão expirada
              </p>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/70">
                Sua sessão venceu. Faça login novamente para continuar.
              </p>
              <button
                onClick={async () => { await signOut(); navigate('/login'); }}
                className="w-full py-2 rounded-full bg-amber-500 text-white text-sm font-semibold"
              >
                Ir para Login
              </button>
            </motion.div>
          )}
        </div>

        {/* ── Fila do dia ───────────────────────────────────────────────── */}
        {queue.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <Users size={14} className="text-text-secondary" />
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest">
                Fila de hoje · {queue.length} {queue.length === 1 ? 'corretor' : 'corretores'}
              </p>
            </div>
            <div className="bg-card-bg rounded-2xl border border-surface-100 overflow-hidden divide-y divide-surface-50">
              {queue.map((c) => {
                const isMe = c.user_id === user?.id;
                const p    = c.profiles as { name: string | null; role: string | null } | null;
                return (
                  <div key={c.id} className={cn('flex items-center gap-3 px-4 py-3', isMe && 'bg-gold-400/5')}>
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold',
                      c.position_in_queue === 1 ? 'bg-gold-400 text-white' : 'bg-surface-100 text-text-secondary',
                    )}>
                      {c.position_in_queue === 1 ? <Trophy size={12} /> : c.position_in_queue}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-sm font-medium truncate',
                        isMe ? 'text-gold-600 dark:text-gold-400' : 'text-text-primary',
                      )}>
                        {p?.name || 'Usuário'}{isMe ? ' · você' : ''}
                      </p>
                      <p className="text-xs text-text-secondary">{formatTime(c.checkin_time)}</p>
                    </div>
                    {p?.role && (
                      <span className="text-[10px] text-text-secondary capitalize flex-shrink-0">{p.role}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Info cards (só quando idle e fila vazia) ──────────────────── */}
        {!alreadyDone && step === 'idle' && queue.length === 0 && (
          <div className="space-y-2.5 pt-2">
            {[
              { icon: Clock,    label: 'Horário de check-in', value: '08:00 – 14:00' },
              { icon: MapPin,   label: 'Raio permitido',      value: '50m da imobiliária' },
              { icon: Users,    label: 'Distribuição ativa',  value: '08:00 – 22:00, Round-Robin' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 bg-card-bg rounded-xl p-4 border border-surface-100">
                <div className="w-8 h-8 rounded-full bg-gold-400/10 flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-gold-500" />
                </div>
                <div>
                  <p className="text-xs text-text-secondary">{label}</p>
                  <p className="text-sm font-medium text-text-primary">{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
