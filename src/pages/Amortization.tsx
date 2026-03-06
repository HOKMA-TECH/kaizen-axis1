import { useState, useMemo } from 'react';
import { SectionHeader, PremiumCard, RoundedButton } from '@/components/ui/PremiumComponents';
import { DollarSign, Percent, Clock, TrendingDown, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

/* ─── formatação ─── */
const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function parseCurrency(s: string): number {
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function maskCurrency(e: React.ChangeEvent<HTMLInputElement>, set: (v: string) => void) {
  const raw = e.target.value.replace(/\D/g, '');
  if (!raw) { set(''); return; }
  set((parseInt(raw, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

/* ─── linha de resultado ─── */
function Row({ label, value, sub, bold }: { label: string; value: string; sub?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-surface-100 last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <div className="text-right">
        <span className={`text-sm ${bold ? 'font-bold text-text-primary' : 'font-semibold text-text-primary'}`}>{value}</span>
        {sub && <p className="text-xs text-text-secondary">{sub}</p>}
      </div>
    </div>
  );
}

export default function Amortization() {
  const [fin, setFin] = useState('');
  const [taxa, setTaxa] = useState('');
  const [prazo, setPrazo] = useState('');
  const [renda, setRenda] = useState('');
  const [extra, setExtra] = useState('');
  const [erro, setErro] = useState('');

  const [result, setResult] = useState<{
    parcela: number; amortizacao: number; juros: number; pctJuros: number;
    totalJuros: number; totalPago: number;
    eliminadas: number; tempoMeses: number; tempoAnos: number;
    jurosEconomizados: number; valorUtilizado: number; valorSobra: number;
  } | null>(null);

  const finNum = useMemo(() => parseCurrency(fin), [fin]);
  const rendaNum = useMemo(() => parseCurrency(renda), [renda]);
  const extraNum = useMemo(() => parseCurrency(extra), [extra]);
  const prazoNum = useMemo(() => parseInt(prazo) || 0, [prazo]);

  function calcular() {
    setErro('');
    if (finNum < 1) { setErro('Informe o valor do financiamento.'); return; }
    if (prazoNum < 1) { setErro('Informe o prazo em meses.'); return; }
    if (rendaNum < 1) { setErro('Informe a renda bruta mensal.'); return; }

    const parcela = rendaNum * 0.30;
    const amortizacao = finNum / prazoNum;
    const juros = parcela - amortizacao;
    const pctJuros = (juros / parcela) * 100;
    const totalJuros = juros * prazoNum;
    const totalPago = parcela * prazoNum;

    let eliminadas = 0, valorUtilizado = 0, valorSobra = 0, jurosEconomizados = 0;
    if (extraNum > 0 && amortizacao > 0) {
      eliminadas = Math.floor(extraNum / amortizacao);
      valorUtilizado = eliminadas * amortizacao;
      valorSobra = extraNum - valorUtilizado;
      jurosEconomizados = eliminadas * juros;
    }

    setResult({
      parcela, amortizacao, juros, pctJuros,
      totalJuros, totalPago,
      eliminadas, tempoMeses: eliminadas, tempoAnos: eliminadas / 12,
      jurosEconomizados, valorUtilizado, valorSobra,
    });

    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  const ic = "w-full p-3 rounded-xl border border-surface-200 bg-surface-50 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/30 transition-all";
  const lb = "text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1 flex items-center gap-1.5";

  return (
    <div className="p-4 md:p-6 pb-28 min-h-screen bg-surface-50">
      <SectionHeader
        title="Amortização"
        subtitle="Simulador de Amortização"
      />

      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            {/* Badge */}
            <div className="rounded-xl p-3 border border-gold-400/30 bg-card-bg flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gold-400 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                CEF
              </div>
              <div>
                <p className="text-sm font-bold text-gold-600">Sistema PRICE FGTS</p>
                <p className="text-xs text-text-secondary">Parcela = 30% da renda · Amortização = Financiamento ÷ Prazo</p>
              </div>
            </div>

            <div className="space-y-4">

              {/* ── Dados ── */}
              <PremiumCard className="p-4 space-y-3">
                <h3 className="font-bold text-sm flex items-center gap-2 text-gold-600">
                  <DollarSign size={15} /> Dados do Financiamento
                </h3>

                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="flex flex-col">
                    <label className={lb}><DollarSign size={12} /> Financiamento (R$)</label>
                    <input className={ic} value={fin} inputMode="numeric"
                      onChange={e => maskCurrency(e, setFin)} placeholder="136.252,47" />
                  </div>
                  <div className="flex flex-col">
                    <label className={lb}><Percent size={12} /> Taxa Nominal (% a.a.)</label>
                    <input className={ic} value={taxa} inputMode="decimal"
                      onChange={e => setTaxa(e.target.value)} placeholder="5,00" />
                  </div>
                  <div className="flex flex-col">
                    <label className={lb}><Clock size={12} /> Prazo (meses)</label>
                    <input className={ic} value={prazo} type="number" min={1} max={420}
                      onChange={e => setPrazo(e.target.value)} placeholder="420" />
                    {prazoNum > 0 && (
                      <p className="text-xs text-text-secondary mt-0.5">
                        {Math.floor(prazoNum / 12)} anos{prazoNum % 12 ? ` e ${prazoNum % 12} meses` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <label className={lb}><DollarSign size={12} /> Renda Bruta Mensal (R$)</label>
                    <input className={ic} value={renda} inputMode="numeric"
                      onChange={e => maskCurrency(e, setRenda)} placeholder="2.550,00" />
                    {rendaNum > 0 && (
                      <p className="text-xs text-text-secondary mt-0.5">
                        Parcela máx. (30%): <strong className="text-gold-600">{fmtBRL(rendaNum * 0.3)}</strong>
                      </p>
                    )}
                  </div>
                </div>
              </PremiumCard>

              {/* ── Amortização Extra ── */}
              <PremiumCard className="p-4 space-y-3">
                <h3 className="font-bold text-sm flex items-center gap-2 text-gold-600">
                  <TrendingDown size={15} /> Amortização Extra
                  <span className="font-normal text-text-secondary text-xs">(opcional)</span>
                </h3>
                <div>
                  <label className={lb}><DollarSign size={12} /> Valor da Amortização Extra (R$)</label>
                  <input className={ic} value={extra} inputMode="numeric"
                    onChange={e => maskCurrency(e, setExtra)} placeholder="1.000,00" />
                </div>
                <p className="text-xs text-text-secondary">
                  Cada R$ amortizado extra elimina parcelas inteiras sem pagar juros adicionais.
                </p>
              </PremiumCard>

              {/* ── Erro + Botão ── */}
              {erro && (
                <div className="flex items-center gap-2 rounded-xl p-3 bg-red-50 border border-red-200">
                  <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700 font-semibold">{erro}</p>
                </div>
              )}

              <button onClick={calcular}
                className="w-full py-4 rounded-xl font-bold text-base transition-all hover:opacity-90 active:scale-95 bg-gold-400 hover:bg-gold-500 text-white shadow-md shadow-gold-400/20">
                Calcular
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <div id="resultado-amort" className="space-y-4">

              {/* ── Bloco 1: Resumo ── */}
              <PremiumCard className="p-4">
                <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-gold-600">
                  <CheckCircle2 size={15} /> Resumo do Financiamento
                </h3>

                {/* Destaque parcela */}
                <div className="rounded-xl p-4 border-2 border-gold-400/40 bg-card-bg mb-4 text-center">
                  <p className="text-xs font-bold uppercase tracking-wide mb-1 text-gold-600">
                    Parcela Mensal (30% da renda)
                  </p>
                  <p className="text-3xl font-black text-gold-600">{fmtBRL(result.parcela)}</p>
                  <p className="text-xs text-text-secondary mt-1">
                    {fmtBRL(result.amortizacao)} amortização + {fmtBRL(result.juros)} juros
                  </p>
                </div>

                {/* Barra de composição */}
                <div className="rounded-xl bg-surface-100 border border-surface-200 p-3 mb-4">
                  <p className="text-xs font-semibold text-text-secondary mb-2">Composição da parcela</p>
                  <div className="flex rounded-full overflow-hidden h-3 mb-2">
                    <div style={{ width: `${(result.amortizacao / result.parcela) * 100}%`, background: '#D4AF37' }} />
                    <div style={{ width: `${(result.juros / result.parcela) * 100}%`, background: '#9C7E26' }} />
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-gold-400" />
                      Amortização {((result.amortizacao / result.parcela) * 100).toFixed(1)}%
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-gold-600" />
                      Juros {result.pctJuros.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Linhas de detalhe */}
                <div className="divide-y divide-surface-100">
                  <Row label="Financiamento" value={fmtBRL(finNum)} />
                  <Row label="Parcela mensal (30% da renda)" value={fmtBRL(result.parcela)} bold />
                  <Row label="Amortização real por parcela" value={fmtBRL(result.amortizacao)}
                    sub={`${((result.amortizacao / result.parcela) * 100).toFixed(1)}% da parcela — abate o saldo`} />
                  <Row label="Juros por parcela" value={fmtBRL(result.juros)}
                    sub={`${result.pctJuros.toFixed(1)}% da parcela`} />
                  <Row label="Total de juros no contrato" value={fmtBRL(result.totalJuros)} />
                  <Row label="Total pago no contrato" value={fmtBRL(result.totalPago)} bold />
                </div>
              </PremiumCard>

              {/* ── Bloco 2: Amortização Extra ── */}
              {extraNum > 0 && (
                <PremiumCard className="p-4">
                  <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-gold-600">
                    <TrendingDown size={15} /> Resultado da Amortização Extra
                  </h3>

                  {/* Valor destaque */}
                  <div className="rounded-xl p-4 border-2 border-gold-400/40 bg-card-bg mb-4 text-center">
                    <p className="text-xs font-semibold text-text-secondary mb-1">Amortização extra de</p>
                    <p className="text-2xl font-black text-gold-600">{fmtBRL(extraNum)}</p>
                  </div>

                  {/* Métricas grid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl p-4 border border-gold-400/30 bg-card-bg text-center">
                      <p className="text-3xl font-black text-gold-600">{result.eliminadas}</p>
                      <p className="text-xs font-semibold mt-1 text-gold-600">✂️ Parcelas eliminadas</p>
                    </div>
                    <div className="rounded-xl p-4 border border-gold-400/30 bg-card-bg text-center">
                      <p className="text-xl font-black text-gold-600">{fmtBRL(result.jurosEconomizados)}</p>
                      <p className="text-xs font-semibold mt-1 text-gold-600">💰 Juros economizados</p>
                    </div>
                  </div>

                  {/* Tempo economizado */}
                  <div className="rounded-xl p-4 border border-gold-400/30 bg-card-bg mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">⏳ Tempo economizado</span>
                      <div className="text-right">
                        <p className="font-bold text-gold-600">
                          {result.tempoMeses} {result.tempoMeses === 1 ? 'mês' : 'meses'}
                        </p>
                        {result.tempoAnos >= 1 && (
                          <p className="text-xs text-text-secondary">{result.tempoAnos.toFixed(2)} anos</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Detalhamento */}
                  <div className="rounded-xl bg-surface-100 border border-surface-200 p-3 text-xs space-y-2">
                    <p className="font-semibold text-text-secondary">Detalhamento</p>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Parcelas eliminadas × amortização</span>
                      <span className="font-semibold">{result.eliminadas} × {fmtBRL(result.amortizacao)} = {fmtBRL(result.valorUtilizado)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Sobra abatida no saldo devedor</span>
                      <span className="font-semibold">{fmtBRL(result.valorSobra)}</span>
                    </div>
                    <div className="flex justify-between border-t border-surface-200 pt-2">
                      <span className="text-text-secondary">Juros economizados ({result.eliminadas} × {fmtBRL(result.juros)})</span>
                      <span className="font-bold text-gold-600">{fmtBRL(result.jurosEconomizados)}</span>
                    </div>
                  </div>

                  {result.eliminadas === 0 && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl p-3 bg-yellow-50 border border-yellow-200">
                      <AlertTriangle size={14} className="text-yellow-600 flex-shrink-0" />
                      <p className="text-xs text-yellow-700 font-semibold">
                        Valor menor que uma amortização ({fmtBRL(result.amortizacao)}) — nenhuma parcela eliminada, valor abatido no saldo.
                      </p>
                    </div>
                  )}
                </PremiumCard>
              )}

              <RoundedButton variant="outline" fullWidth onClick={() => { setResult(null); setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50); }} className="mt-4 bg-card-bg">
                <RefreshCw size={16} /> Nova Simulação
              </RoundedButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
