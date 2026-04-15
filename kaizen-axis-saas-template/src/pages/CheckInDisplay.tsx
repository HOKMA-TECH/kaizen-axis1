import { useState, useEffect, useCallback } from 'react';
import QRCode from 'react-qr-code';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Clock, Users, Shield, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBRTTime() {
  const now = new Date();
  // BRT = UTC-3
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return {
    h:    brt.getUTCHours(),
    m:    brt.getUTCMinutes(),
    s:    brt.getUTCSeconds(),
    date: brt.toISOString().slice(0, 10),
    label: brt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
    time:  `${String(brt.getUTCHours()).padStart(2, '0')}:${String(brt.getUTCMinutes()).padStart(2, '0')}:${String(brt.getUTCSeconds()).padStart(2, '0')}`,
  };
}

function secondsUntilMidnight() {
  const t = getBRTTime();
  return (23 - t.h) * 3600 + (59 - t.m) * 60 + (59 - t.s);
}

function formatCountdown(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckInDisplay() {
  const [qrUrl, setQrUrl]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [clock, setClock]         = useState(getBRTTime());
  const [countdown, setCountdown] = useState(secondsUntilMidnight());
  const [checkins, setCheckins]   = useState(0);
  const [online, setOnline]       = useState(navigator.onLine);

  // ── Carregar token diário ──────────────────────────────────────────────────
  const loadToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: token, error: rpcErr } = await supabase.rpc('get_or_create_daily_qr');
      if (rpcErr || !token) throw new Error(rpcErr?.message || 'Erro ao gerar QR');
      const appUrl = window.location.origin;
      setQrUrl(`${appUrl}/checkin?token=${token}`);
    } catch (e: any) {
      setError(e.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadToken(); }, [loadToken]);

  // ── Clock tick + auto-refresh à meia-noite ────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const now = getBRTTime();
      setClock(now);
      const secs = secondsUntilMidnight();
      setCountdown(secs);
      // Recarregar token quando a meia-noite virar (novo token)
      if (secs === 0) { loadToken(); }
    }, 1_000);
    return () => clearInterval(t);
  }, [loadToken]);

  // ── Check-ins do dia ──────────────────────────────────────────────────────
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const fetchCount = async () => {
      const { count } = await supabase
        .from('daily_checkins')
        .select('id', { count: 'exact', head: true })
        .eq('checkin_date', today);
      if (count !== null) setCheckins(count);
    };
    fetchCount();
    // Realtime para atualizar o contador
    const channel = supabase
      .channel('display-checkins')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_checkins' },
        () => fetchCount())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Online status ─────────────────────────────────────────────────────────
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const isOpen = clock.h >= 8 && clock.h < 16;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-8 select-none">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-10">
        {/* Logo / branding */}
        <div>
          <p className="text-gold-400 font-bold text-2xl tracking-widest uppercase">KAIZEN AXIS</p>
          <p className="text-gray-500 text-xs mt-0.5 uppercase tracking-widest">Sistema de Check-in</p>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-4">
          {online
            ? <Wifi size={16} className="text-green-400" />
            : <WifiOff size={16} className="text-red-400 animate-pulse" />}
          <div className="flex items-center gap-1.5 bg-gray-800 rounded-full px-3 py-1.5">
            <Users size={13} className="text-gray-400" />
            <span className="text-xs font-semibold text-white">{checkins} check-in{checkins !== 1 ? 's' : ''} hoje</span>
          </div>
        </div>
      </div>

      {/* ── Main card ─────────────────────────────────────────────────────── */}
      <div className="w-full max-w-2xl bg-gray-900 rounded-3xl border border-gray-800 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-gold-500/10 to-gold-400/5 border-b border-gray-800 px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl font-bold">Check-in Diário</h1>
            <p className="text-gray-400 text-sm mt-0.5 capitalize">{clock.label}</p>
          </div>
          <div className="text-right">
            <p className="text-white font-mono text-3xl font-bold tracking-tight">{clock.time}</p>
            <div className={`flex items-center justify-end gap-1.5 mt-1 ${isOpen ? 'text-green-400' : 'text-gray-500'}`}>
              <div className={`w-2 h-2 rounded-full ${isOpen ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
              <span className="text-xs font-medium">{isOpen ? 'Aberto · 08:00–16:00' : 'Fechado · abre às 08:00'}</span>
            </div>
          </div>
        </div>

        {/* QR Area */}
        <div className="flex flex-col items-center py-10 px-8">

          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="w-64 h-64 bg-gray-800 rounded-2xl flex items-center justify-center">
                <RefreshCw size={32} className="text-gold-400 animate-spin" />
              </motion.div>
            ) : error ? (
              <motion.div key="error"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="w-64 h-64 bg-gray-800 rounded-2xl flex flex-col items-center justify-center gap-3 text-center px-4">
                <p className="text-red-400 text-sm">{error}</p>
                <button onClick={loadToken}
                  className="flex items-center gap-2 text-xs text-gold-400 hover:text-gold-300 font-medium">
                  <RefreshCw size={13} /> Tentar novamente
                </button>
              </motion.div>
            ) : qrUrl ? (
              <motion.div key="qr"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="bg-white p-5 rounded-2xl shadow-2xl shadow-gold-400/10">
                <QRCode
                  value={qrUrl}
                  size={240}
                  fgColor="#111111"
                  bgColor="#FFFFFF"
                  level="M"
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Instructions */}
          <div className="mt-8 text-center max-w-sm">
            <p className="text-white font-semibold text-lg mb-2">
              Escaneie com a câmera do celular
            </p>
            <p className="text-gray-400 text-sm leading-relaxed">
              Aponte a câmera para o QR Code acima. O app abrirá automaticamente
              e validará sua localização para confirmar o check-in.
            </p>
          </div>
        </div>

        {/* Footer info bar */}
        <div className="border-t border-gray-800 px-8 py-4 grid grid-cols-3 gap-4">
          <div className="flex flex-col items-center text-center">
            <Shield size={16} className="text-gold-400 mb-1" />
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Validação</p>
            <p className="text-xs text-gray-300 font-medium">GPS ≤ 100m</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <Clock size={16} className="text-gold-400 mb-1" />
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Horário</p>
            <p className="text-xs text-gray-300 font-medium">08:00 – 16:00</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <RefreshCw size={16} className="text-gold-400 mb-1" />
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Novo QR em</p>
            <p className="text-xs text-gray-300 font-mono font-medium">{formatCountdown(countdown)}</p>
          </div>
        </div>
      </div>

      {/* Refresh button (manual) */}
      <button
        onClick={loadToken}
        className="mt-6 flex items-center gap-2 text-gray-600 hover:text-gray-400 text-xs transition-colors"
      >
        <RefreshCw size={12} /> Atualizar QR manualmente
      </button>
    </div>
  );
}
