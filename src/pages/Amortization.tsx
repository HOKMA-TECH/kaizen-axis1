import { useState, useMemo } from 'react';
import { SectionHeader, PremiumCard } from '@/components/ui/PremiumComponents';
import {
  DollarSign, User, Calendar, Percent, Clock, TrendingDown,
  ChevronDown, ChevronUp, Printer, AlertTriangle, CheckCircle2, Shield, Home,
} from 'lucide-react';

/* ════════════════════════════════════════════════════
   CONSTANTES
════════════════════════════════════════════════════ */
const MIP_TABLE = [
  { maxAge: 30, rate: 0.000085   },
  { maxAge: 40, rate: 0.0001124  },
  { maxAge: 50, rate: 0.000202   },
  { maxAge: 55, rate: 0.000399   },
  { maxAge: 60, rate: 0.000642   },
  { maxAge: 65, rate: 0.000856   },
  { maxAge: Infinity, rate: 0.001262 },
] as const;

const DFI_RATE  = 0.0000890;
const MESES_PT  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const AZUL      = '#005CA9';
const AZUL_ESC  = '#003D6E';
const LARANJA   = '#F47920';
const VERDE     = '#1B6B3A';
const VERDE_CLR = '#ECFDF5';

/* ════════════════════════════════════════════════════
   TIPOS
════════════════════════════════════════════════════ */
interface Row {
  k: number; mes: number; ano: number;
  sd_ini: number; amort: number; juros: number;
  pmt: number; mip: number; dfi: number;
  total: number; sd_fim: number;
}

interface ExtraResult {
  SD_M: number; SD_novo: number; restantes: number;
  novos_meses: number; parcelas_econ: number; anos_econ: number; economia_A: number;
  nova_PMT: number; reducao: number; economia_B: number;
}

type FGTSModo = 'entrada' | 'amort' | 'parcelas';

interface FGTSParcelaReduzida {
  k: number; mes: number; ano: number;
  total_orig: number; total_novo: number; reducao: number;
}

interface FGTSResult {
  modo: FGTSModo;
  fgtsVal: number;
  fgtsMes: number;
  /* Modo 1 — na entrada */
  PV_original: number; PMT_original: number;
  PV_novo: number;     PMT_novo: number;
  economia_mensal: number; economia_total: number;
  /* Modo 2 — amortização extraordinária */
  extra?: ExtraResult;
  /* Modo 3 — redução de parcelas por 12 meses */
  reducao_mensal?: number;
  parcelas_reduzidas?: FGTSParcelaReduzida[];
}

interface CalcResult {
  i: number; PMT: number; schedule: Row[];
  totalJuros: number; totalMIP: number; totalDFI: number; totalPago: number;
  row1: Row; extra: ExtraResult | null; parcelaTotalHoje: number;
  fgts: FGTSResult | null;
}

/* ════════════════════════════════════════════════════
   FUNÇÕES PURAS
════════════════════════════════════════════════════ */
const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function parseCurrency(s: string): number {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(v) ? 0 : v;
}

function aliquotaMIP(age: number): number {
  for (const b of MIP_TABLE) if (age <= b.maxAge) return b.rate;
  return MIP_TABLE[MIP_TABLE.length - 1].rate;
}

function calcIdade(nascStr: string, refMes: number, refAno: number): number {
  const p = nascStr.split('/');
  if (p.length !== 3 || p[2].length < 4) return 35;
  const nm = parseInt(p[1]), ny = parseInt(p[2]);
  if (isNaN(nm) || isNaN(ny)) return 35;
  let a = refAno - ny;
  if (nm > refMes) a--;
  return Math.max(0, a);
}

function getMesAno(mes1: number, ano1: number, k: number) {
  const off = (mes1 - 1) + (k - 1);
  return { mes: (off % 12) + 1, ano: ano1 + Math.floor(off / 12) };
}

/** Saldo devedor fechado após k pagamentos: SD_k = PV·[(1+i)^n − (1+i)^k] / [(1+i)^n − 1] */
function saldoK(PV: number, i: number, n: number, k: number): number {
  const fn = Math.pow(1 + i, n);
  return PV * (fn - Math.pow(1 + i, k)) / (fn - 1);
}

function buildSchedule(
  PV: number, i: number, n: number, PMT: number,
  nasc: string, mes1: number, ano1: number
): Row[] {
  const rows: Row[] = [];
  let SD = PV;
  for (let k = 1; k <= n; k++) {
    const sd_ini = SD;
    const juros  = sd_ini * i;
    const amort  = PMT - juros;
    const sd_fim = Math.max(0, sd_ini - amort);
    const { mes, ano } = getMesAno(mes1, ano1, k);
    const mip = sd_ini * aliquotaMIP(calcIdade(nasc, mes, ano));
    const dfi = sd_ini * DFI_RATE;
    rows.push({ k, mes, ano, sd_ini, amort, juros, pmt: PMT, mip, dfi, total: PMT + mip + dfi, sd_fim });
    if (sd_fim < 0.01) break;
    SD = sd_fim;
  }
  return rows;
}

/** Calcula ExtraResult dado SD_novo, PMT, i, restantes */
function calcExtra(SD_M: number, SD_novo: number, PMT: number, i: number, restantes: number): ExtraResult | undefined {
  if (SD_novo <= 1) return undefined;
  const novos_meses   = Math.ceil(Math.log(PMT / (PMT - SD_novo * i)) / Math.log(1 + i));
  const parcelas_econ = restantes - novos_meses;
  const anos_econ     = parcelas_econ / 12;
  const economia_A    = PMT * restantes - PMT * novos_meses;
  const fB            = Math.pow(1 + i, restantes);
  const nova_PMT      = SD_novo * (i * fB) / (fB - 1);
  const reducao       = PMT - nova_PMT;
  const economia_B    = PMT * restantes - nova_PMT * restantes;
  return { SD_M, SD_novo, restantes, novos_meses, parcelas_econ, anos_econ, economia_A, nova_PMT, reducao, economia_B };
}

/* ════════════════════════════════════════════════════
   MÁSCARAS
════════════════════════════════════════════════════ */
function maskCurrency(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) {
  const raw = e.target.value.replace(/\D/g, '');
  if (!raw) { setter(''); return; }
  const num = parseInt(raw, 10) / 100;
  setter(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}
function maskDate(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) {
  let v = e.target.value.replace(/\D/g, '');
  if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
  if (v.length > 5) v = v.slice(0, 5) + '/' + v.slice(5, 9);
  setter(v);
}
function maskMonthYear(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) {
  let v = e.target.value.replace(/\D/g, '');
  if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2, 6);
  setter(v);
}

/* ════════════════════════════════════════════════════
   SUB-COMPONENTE: MetricCard
════════════════════════════════════════════════════ */
function MCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: 'blue' | 'red' | 'orange' | 'green';
}) {
  const styles: Record<string, { bg: string; border: string; val: string }> = {
    blue:   { bg: '#EBF4FF', border: AZUL,     val: AZUL_ESC },
    red:    { bg: '#FEF2F2', border: '#B02A37', val: '#B02A37' },
    orange: { bg: '#FFF4EC', border: LARANJA,   val: '#7C3100' },
    green:  { bg: VERDE_CLR, border: VERDE,     val: VERDE    },
  };
  const s = color ? styles[color] : { bg: '#F9FAFB', border: '#D1D5DB', val: '#1F2937' };
  return (
    <div className="rounded-xl p-3 border" style={{ background: s.bg, borderColor: s.border }}>
      <p className="text-xs text-text-secondary mb-1 uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-sm font-bold" style={{ color: s.val }}>{value}</p>
      {sub && <p className="text-xs text-text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   SUB-COMPONENTE: ExtraCard (Opt A / Opt B)
════════════════════════════════════════════════════ */
function ExtraCard({ extra, PMT, title }: { extra: ExtraResult; PMT: number; title?: string }) {
  return (
    <div>
      {title && (
        <p className="text-xs font-bold mb-2 px-1" style={{ color: LARANJA }}>{title}</p>
      )}
      <div className="text-xs rounded-lg px-3 py-2 mb-3 bg-surface-100 border border-surface-200">
        SD antes: <strong>{fmtBRL(extra.SD_M)}</strong>
        {' '}· SD após: <strong>{fmtBRL(extra.SD_novo)}</strong>
        {' '}· Restantes: <strong>{extra.restantes}</strong>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Opt A */}
        <div className="rounded-xl p-4 border-2" style={{ background: '#EBF4FF', borderColor: AZUL }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full text-white text-xs font-black flex items-center justify-center flex-shrink-0" style={{ background: AZUL }}>A</div>
            <div>
              <p className="font-bold text-sm" style={{ color: AZUL_ESC }}>Reduzir o Prazo</p>
              <p className="text-xs text-text-secondary">Mantém PMT = {fmtBRL(PMT)}</p>
            </div>
          </div>
          <div className="text-center my-3">
            <p className="text-xs text-text-secondary">Novas parcelas restantes</p>
            <p className="text-4xl font-black" style={{ color: AZUL }}>{extra.novos_meses}</p>
            <p className="text-sm font-semibold" style={{ color: AZUL_ESC }}>de {extra.restantes} originais</p>
            <div className="flex justify-center flex-wrap gap-2 mt-2">
              <span className="bg-white rounded-full px-2.5 py-0.5 text-xs font-bold text-green-700">✂️ {extra.parcelas_econ} parcelas economizadas</span>
              <span className="bg-white rounded-full px-2.5 py-0.5 text-xs font-bold text-green-700">📅 {extra.anos_econ.toFixed(2)} anos a menos</span>
            </div>
          </div>
          <div className="space-y-1 text-xs">
            {[
              ['Restantes originais', extra.restantes.toString()],
              ['Novas restantes',     extra.novos_meses.toString()],
              ['PMT mantida',         fmtBRL(PMT)],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between py-1 border-b border-blue-100">
                <span className="text-text-secondary">{l}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
            <div className="flex justify-between py-1 font-bold">
              <span className="text-text-secondary">Economia em juros</span>
              <span className="text-green-700">{fmtBRL(extra.economia_A)}</span>
            </div>
          </div>
        </div>
        {/* Opt B */}
        <div className="rounded-xl p-4 border-2" style={{ background: '#FFF4EC', borderColor: LARANJA }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full text-white text-xs font-black flex items-center justify-center flex-shrink-0" style={{ background: LARANJA }}>B</div>
            <div>
              <p className="font-bold text-sm" style={{ color: '#7C3100' }}>Reduzir a Parcela</p>
              <p className="text-xs text-text-secondary">Mantém prazo ({extra.restantes} meses)</p>
            </div>
          </div>
          <div className="text-center my-3">
            <p className="text-xs text-text-secondary">Nova parcela base (PMT)</p>
            <p className="text-4xl font-black" style={{ color: LARANJA }}>{fmtBRL(extra.nova_PMT)}</p>
            <p className="text-sm font-semibold" style={{ color: '#7C3100' }}>era {fmtBRL(PMT)}</p>
            <span className="inline-flex items-center gap-1 bg-white rounded-full px-2.5 py-0.5 text-xs font-bold text-green-700 mt-2">
              ↓ Redução de {fmtBRL(extra.reducao)}/mês
            </span>
          </div>
          <div className="space-y-1 text-xs">
            {[
              ['PMT atual',     fmtBRL(PMT)],
              ['Novo PMT',      fmtBRL(extra.nova_PMT)],
              ['Prazo mantido', `${extra.restantes} meses`],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between py-1 border-b border-orange-100">
                <span className="text-text-secondary">{l}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
            <div className="flex justify-between py-1 font-bold">
              <span className="text-text-secondary">Economia em juros</span>
              <span className="text-green-700">{fmtBRL(extra.economia_B)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
════════════════════════════════════════════════════ */
export default function Amortization() {
  // ── State: campos do formulário
  const [aval,   setAval]   = useState('');
  const [compra, setCompra] = useState('');
  const [fin,    setFin]    = useState('');
  const [sub,    setSub]    = useState('');
  const [renda,  setRenda]  = useState('');
  const [nasc,   setNasc]   = useState('');
  const [inicio, setInicio] = useState('');
  const [taxa,   setTaxa]   = useState('5,00');
  const [prazo,  setPrazo]  = useState('420');
  const [exMes,  setExMes]  = useState('');
  const [exVal,  setExVal]  = useState('');

  // ── State: FGTS
  const [fgtsAtivo,  setFgtsAtivo]  = useState(false);
  const [fgtsVal,    setFgtsVal]    = useState('');
  const [fgtsModo,   setFgtsModo]   = useState<FGTSModo>('entrada');
  const [fgtsMesStr, setFgtsMesStr] = useState('');

  // ── State: UI
  const [result,    setResult]    = useState<CalcResult | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [erro,      setErro]      = useState('');

  // ── Valores derivados em tempo real
  const avalNum    = useMemo(() => parseCurrency(aval),   [aval]);
  const compraNum  = useMemo(() => parseCurrency(compra), [compra]);
  const finNum     = useMemo(() => parseCurrency(fin),    [fin]);
  const subNum     = useMemo(() => parseCurrency(sub),    [sub]);
  const rendaNum   = useMemo(() => parseCurrency(renda),  [renda]);
  const exValNum   = useMemo(() => parseCurrency(exVal),  [exVal]);
  const exMesNum   = useMemo(() => parseInt(exMes) || 0,  [exMes]);
  const taxaNum    = useMemo(() => parseFloat(taxa.replace(',', '.')) || 0, [taxa]);
  const nNum       = useMemo(() => Math.max(12, Math.min(420, parseInt(prazo) || 420)), [prazo]);
  const fgtsNum    = useMemo(() => parseCurrency(fgtsVal), [fgtsVal]);
  const fgtsMesNum = useMemo(() => parseInt(fgtsMesStr) || 0, [fgtsMesStr]);

  const valorBase = useMemo(() => {
    if (avalNum > 0 && compraNum > 0) return Math.min(avalNum, compraNum);
    return avalNum || compraNum || 0;
  }, [avalNum, compraNum]);

  const recursosProprios = useMemo(() =>
    Math.max(0, valorBase - finNum - subNum), [valorBase, finNum, subNum]);

  const parcelaMaxima = useMemo(() => rendaNum * 0.3, [rendaNum]);

  const startParsed = useMemo(() => {
    const p = inicio.split('/');
    if (p.length !== 2 || p[1].length < 4) return null;
    const mes = parseInt(p[0]), ano = parseInt(p[1]);
    if (isNaN(mes) || isNaN(ano) || mes < 1 || mes > 12) return null;
    return { mes, ano };
  }, [inicio]);

  // Pré-visualização FGTS modo entrada (tempo real)
  const fgtsPreviewPMT = useMemo(() => {
    if (!fgtsAtivo || fgtsModo !== 'entrada' || fgtsNum <= 0 || finNum <= 0 || taxaNum <= 0) return null;
    const PV_novo = Math.max(0, finNum - fgtsNum);
    if (PV_novo < 1000) return null;
    const i  = taxaNum / 12 / 100;
    const fn = Math.pow(1 + i, nNum);
    return PV_novo * (i * fn) / (fn - 1);
  }, [fgtsAtivo, fgtsModo, fgtsNum, finNum, taxaNum, nNum]);

  // ── Cálculo principal
  function calcular() {
    setErro('');
    if (finNum < 1000) { setErro('Preencha o valor do financiamento.'); return; }
    if (taxaNum <= 0)  { setErro('Taxa inválida.'); return; }
    if (nNum < 12)     { setErro('Prazo mínimo: 12 meses.'); return; }

    const PV  = finNum;
    const i   = taxaNum / 12 / 100;   // taxa proporcional (regra Caixa FGTS)
    const fn  = Math.pow(1 + i, nNum);
    const PMT = PV * (i * fn) / (fn - 1);

    const mes1  = startParsed?.mes || 1;
    const ano1  = startParsed?.ano || new Date().getFullYear();
    const nascS = nasc.length === 10 ? nasc : '01/01/1990';

    const schedule = buildSchedule(PV, i, nNum, PMT, nascS, mes1, ano1);

    const totalJuros = schedule.reduce((s, r) => s + r.juros, 0);
    const totalMIP   = schedule.reduce((s, r) => s + r.mip,   0);
    const totalDFI   = schedule.reduce((s, r) => s + r.dfi,   0);
    const totalPago  = PMT * schedule.length;
    const row1       = schedule[0];

    let parcelaTotalHoje = row1.total;
    const hoje  = new Date();
    const kHoje = (hoje.getFullYear() - ano1) * 12 + (hoje.getMonth() + 1 - mes1) + 1;
    if (kHoje >= 1 && kHoje <= schedule.length) {
      parcelaTotalHoje = schedule[kHoje - 1].total;
    }

    // Amortização extra manual
    let extra: ExtraResult | null = null;
    if (exMesNum >= 1 && exMesNum < nNum && exValNum > 0) {
      const SD_M    = saldoK(PV, i, nNum, exMesNum);
      const SD_novo = Math.max(0, SD_M - exValNum);
      const restantes = nNum - exMesNum;
      extra = calcExtra(SD_M, SD_novo, PMT, i, restantes) ?? null;
    }

    // ── FGTS
    let fgts: FGTSResult | null = null;
    if (fgtsAtivo && fgtsNum > 0) {
      if (fgtsModo === 'entrada') {
        const PV_novo         = Math.max(0, PV - fgtsNum);
        const PMT_novo        = PV_novo * (i * fn) / (fn - 1);
        const economia_mensal = PMT - PMT_novo;
        const economia_total  = economia_mensal * nNum;
        fgts = {
          modo: 'entrada', fgtsVal: fgtsNum, fgtsMes: 0,
          PV_original: PV, PMT_original: PMT,
          PV_novo, PMT_novo, economia_mensal, economia_total,
        };
      } else if (fgtsModo === 'amort' && fgtsMesNum >= 1 && fgtsMesNum < nNum) {
        const SD_M    = saldoK(PV, i, nNum, fgtsMesNum);
        const SD_novo = Math.max(0, SD_M - fgtsNum);
        const restantes = nNum - fgtsMesNum;
        const extraFGTS = calcExtra(SD_M, SD_novo, PMT, i, restantes);
        fgts = {
          modo: 'amort', fgtsVal: fgtsNum, fgtsMes: fgtsMesNum,
          PV_original: PV, PMT_original: PMT,
          PV_novo: 0, PMT_novo: 0, economia_mensal: 0, economia_total: 0,
          extra: extraFGTS,
        };
      } else if (fgtsModo === 'parcelas' && fgtsMesNum >= 1) {
        const reducao_mensal = fgtsNum / 12;
        const inicio_k = fgtsMesNum;
        const fim_k    = Math.min(fgtsMesNum + 11, schedule.length);
        const parcelas_reduzidas: FGTSParcelaReduzida[] = [];
        for (let k = inicio_k; k <= fim_k; k++) {
          const r = schedule[k - 1];
          if (r) {
            parcelas_reduzidas.push({
              k: r.k, mes: r.mes, ano: r.ano,
              total_orig: r.total,
              total_novo: Math.max(0, r.total - reducao_mensal),
              reducao: reducao_mensal,
            });
          }
        }
        fgts = {
          modo: 'parcelas', fgtsVal: fgtsNum, fgtsMes: fgtsMesNum,
          PV_original: PV, PMT_original: PMT,
          PV_novo: 0, PMT_novo: 0, economia_mensal: 0, economia_total: 0,
          reducao_mensal,
          parcelas_reduzidas,
        };
      }
    }

    setResult({ i, PMT, schedule, totalJuros, totalMIP, totalDFI, totalPago, row1, extra, parcelaTotalHoje, fgts });
    setTimeout(() => document.getElementById('resultado-fgts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  // ── Estilos reutilizáveis
  const ic = "w-full p-3 rounded-xl border border-surface-200 bg-surface-50 dark:bg-surface-100 text-text-primary text-sm focus:outline-none focus:ring-2 transition-all";
  const lb = "text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1 flex items-center gap-1.5";

  return (
    <div className="p-4 md:p-6 pb-28 min-h-screen bg-surface-50">
      <SectionHeader
        title="Calculadora FGTS"
        subtitle="Sistema PRICE — Minha Casa Minha Vida · Caixa Econômica Federal"
      />

      {/* ══ Badge CEF ══ */}
      <div className="rounded-xl p-3 border flex items-center gap-3 mb-5" style={{ background: '#EBF4FF', borderColor: AZUL }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0" style={{ background: AZUL }}>CEF</div>
        <div>
          <p className="text-sm font-bold" style={{ color: AZUL_ESC }}>Sistema PRICE FGTS</p>
          <p className="text-xs text-text-secondary">Taxa proporcional i = taxa/12/100 · (a+j) fixo · MIP + DFI por faixa etária</p>
        </div>
      </div>

      <div className="space-y-4">

        {/* ══ Seção 1: Dados do Imóvel ══ */}
        <PremiumCard className="p-4 space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: AZUL }}>
            <Home size={15} /> Dados do Imóvel
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={lb}><DollarSign size={12} /> Valor de Avaliação (R$)</label>
              <input className={ic} value={aval} inputMode="numeric"
                onChange={e => maskCurrency(e, setAval)} placeholder="140.800,00" />
            </div>
            <div>
              <label className={lb}><DollarSign size={12} /> Valor de Compra/Venda (R$)</label>
              <input className={ic} value={compra} inputMode="numeric"
                onChange={e => maskCurrency(e, setCompra)} placeholder="140.800,00" />
            </div>
          </div>
          {valorBase > 0 && (
            <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#EBF4FF', color: AZUL_ESC }}>
              Valor base usado: <strong>{fmtBRL(valorBase)}</strong>
              {avalNum > 0 && compraNum > 0 && (
                <span className="ml-1 text-gray-500">
                  ({valorBase === avalNum ? 'avaliação' : 'compra/venda'} é o menor)
                </span>
              )}
            </div>
          )}
        </PremiumCard>

        {/* ══ Seção 2: Dados do Financiamento ══ */}
        <PremiumCard className="p-4 space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: AZUL }}>
            <DollarSign size={15} /> Dados do Financiamento
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={lb}><DollarSign size={12} /> Financiamento (R$)</label>
              <input className={ic} value={fin} inputMode="numeric"
                onChange={e => maskCurrency(e, setFin)} placeholder="140.800,00" />
            </div>
            <div>
              <label className={lb}><DollarSign size={12} /> Subsídio do Governo (R$)</label>
              <input className={ic} value={sub} inputMode="numeric"
                onChange={e => maskCurrency(e, setSub)} placeholder="0,00" />
              <p className="text-xs text-text-secondary mt-0.5">Informativo — não altera o PMT</p>
            </div>
          </div>
          {(finNum > 0 || subNum > 0) && (
            <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#EBF4FF', color: AZUL_ESC }}>
              Recursos próprios: <strong>{fmtBRL(recursosProprios)}</strong>
              {valorBase > 0 && (
                <span className="ml-1 text-gray-500">
                  ({fmtBRL(valorBase)} − {fmtBRL(finNum)}{subNum > 0 ? ` − ${fmtBRL(subNum)}` : ''})
                </span>
              )}
            </div>
          )}
        </PremiumCard>

        {/* ══ Seção 3: Dados do Cliente ══ */}
        <PremiumCard className="p-4 space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: AZUL }}>
            <User size={15} /> Dados do Cliente
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={lb}><DollarSign size={12} /> Renda Bruta Mensal (R$)</label>
              <input className={ic} value={renda} inputMode="numeric"
                onChange={e => maskCurrency(e, setRenda)} placeholder="5.000,00" />
            </div>
            <div>
              <label className={lb}><User size={12} /> Data de Nascimento</label>
              <input className={ic} value={nasc} inputMode="numeric" maxLength={10}
                onChange={e => maskDate(e, setNasc)} placeholder="dd/mm/aaaa" />
              {nasc.length === 10 && (
                <p className="text-xs text-text-secondary mt-0.5">
                  Alíquota MIP hoje: {(aliquotaMIP(calcIdade(nasc, new Date().getMonth()+1, new Date().getFullYear())) * 100).toFixed(5)}%/mês
                </p>
              )}
            </div>
          </div>
          {parcelaMaxima > 0 && (
            <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#EBF4FF', color: AZUL_ESC }}>
              Parcela máxima (30% da renda): <strong>{fmtBRL(parcelaMaxima)}</strong>
            </div>
          )}
        </PremiumCard>

        {/* ══ Seção 4: Dados do Contrato ══ */}
        <PremiumCard className="p-4 space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: AZUL }}>
            <Clock size={15} /> Dados do Contrato
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={lb}><Percent size={12} /> Taxa Nominal (% a.a.)</label>
              <input className={ic} value={taxa} inputMode="decimal"
                onChange={e => setTaxa(e.target.value)} placeholder="5,00" />
              {taxaNum > 0 && (
                <p className="text-xs text-text-secondary mt-0.5">
                  i = {(taxaNum / 12 / 100 * 100).toFixed(6)}%/mês (proporcional)
                </p>
              )}
            </div>
            <div>
              <label className={lb}><Clock size={12} /> Prazo (meses)</label>
              <input className={ic} value={prazo} type="number" min={12} max={420}
                onChange={e => setPrazo(e.target.value)} />
              <p className="text-xs text-text-secondary mt-0.5">
                {nNum} meses = {Math.floor(nNum/12)} anos{nNum%12 ? ` e ${nNum%12} meses` : ''}
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={lb}><Calendar size={12} /> Data da 1ª Parcela</label>
              <input className={ic} value={inicio} inputMode="numeric" maxLength={7}
                onChange={e => maskMonthYear(e, setInicio)} placeholder="mm/aaaa" />
            </div>
          </div>
        </PremiumCard>

        {/* ══ Seção 5: Amortização Extra ══ */}
        <PremiumCard className="p-4 space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: LARANJA }}>
            <TrendingDown size={15} /> Amortização Extra
            <span className="font-normal text-text-secondary text-xs">(opcional)</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lb}><Clock size={12} /> Após a parcela nº</label>
              <input className={ic} value={exMes} type="number" min={1}
                onChange={e => setExMes(e.target.value)} placeholder="24" />
            </div>
            <div>
              <label className={lb}><DollarSign size={12} /> Valor extra (R$)</label>
              <input className={ic} value={exVal} inputMode="numeric"
                onChange={e => maskCurrency(e, setExVal)} placeholder="5.000,00" />
            </div>
          </div>
        </PremiumCard>

        {/* ══ Seção 6: Uso do FGTS ══ */}
        <PremiumCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: VERDE }}>
              <DollarSign size={15} /> Uso do FGTS
              <span className="font-normal text-text-secondary text-xs">(opcional)</span>
            </h3>
            <button
              onClick={() => setFgtsAtivo(v => !v)}
              className="px-3 py-1 rounded-full text-xs font-bold transition-all border"
              style={fgtsAtivo
                ? { background: VERDE, color: 'white', borderColor: VERDE }
                : { background: 'transparent', color: '#6B7280', borderColor: '#D1D5DB' }}
            >
              {fgtsAtivo ? '✓ Ativado' : 'Ativar'}
            </button>
          </div>

          {fgtsAtivo && (
            <>
              {/* Saldo FGTS */}
              <div>
                <label className={lb}><DollarSign size={12} /> Saldo FGTS disponível (R$)</label>
                <input className={ic} value={fgtsVal} inputMode="numeric"
                  onChange={e => maskCurrency(e, setFgtsVal)} placeholder="10.000,00" />
              </div>

              {/* Modo de utilização */}
              <div>
                <label className={lb}>Forma de utilização</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['entrada', 'amort', 'parcelas'] as const).map(m => {
                    const labels = {
                      entrada:  'Na Entrada',
                      amort:    'Amortizar SD',
                      parcelas: 'Reduzir 12×',
                    };
                    const descs = {
                      entrada:  'Reduz o valor financiado e o PMT',
                      amort:    'Abate saldo devedor (Opt A ou B)',
                      parcelas: 'Desconto em 12 parcelas consecutivas',
                    };
                    const sel = fgtsModo === m;
                    return (
                      <button key={m} onClick={() => setFgtsModo(m)}
                        className="rounded-xl p-2.5 border-2 text-left transition-all"
                        style={{
                          borderColor: sel ? VERDE : '#E5E7EB',
                          background:  sel ? VERDE_CLR : 'transparent',
                        }}
                      >
                        <p className="text-xs font-bold leading-tight" style={{ color: sel ? VERDE : '#374151' }}>
                          {labels[m]}
                        </p>
                        <p className="text-xs text-text-secondary mt-0.5 leading-tight">{descs[m]}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Campo mês para modo 2 e 3 */}
              {(fgtsModo === 'amort' || fgtsModo === 'parcelas') && (
                <div>
                  <label className={lb}><Clock size={12} />
                    {fgtsModo === 'amort' ? 'Após a parcela nº' : 'A partir da parcela nº'}
                  </label>
                  <input className={ic} value={fgtsMesStr} type="number" min={1}
                    onChange={e => setFgtsMesStr(e.target.value)}
                    placeholder={fgtsModo === 'amort' ? '24' : '13'} />
                  {fgtsModo === 'parcelas' && (
                    <p className="text-xs text-text-secondary mt-0.5">
                      O desconto será aplicado por 12 meses consecutivos
                    </p>
                  )}
                </div>
              )}

              {/* Pré-visualização em tempo real (modo entrada) */}
              {fgtsModo === 'entrada' && fgtsNum > 0 && finNum > 0 && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: VERDE_CLR, color: VERDE }}>
                  <p>Financiamento com FGTS: <strong>{fmtBRL(Math.max(0, finNum - fgtsNum))}</strong>
                    <span className="text-gray-500 ml-1">(era {fmtBRL(finNum)})</span>
                  </p>
                  {fgtsPreviewPMT !== null && (
                    <p className="mt-0.5">PMT estimado: <strong>{fmtBRL(fgtsPreviewPMT)}</strong>
                      {' '}· economia <strong>{fmtBRL(parseCurrency(fin) * (taxaNum / 12 / 100) * Math.pow(1 + taxaNum / 12 / 100, nNum) / (Math.pow(1 + taxaNum / 12 / 100, nNum) - 1) - fgtsPreviewPMT)}/mês</strong>
                    </p>
                  )}
                </div>
              )}

              {/* Pré-visualização modo 3 */}
              {fgtsModo === 'parcelas' && fgtsNum > 0 && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: VERDE_CLR, color: VERDE }}>
                  Desconto por parcela: <strong>{fmtBRL(fgtsNum / 12)}/mês</strong> por 12 meses
                  {' '}· Total FGTS utilizado: <strong>{fmtBRL(fgtsNum)}</strong>
                </div>
              )}
            </>
          )}
        </PremiumCard>

        {/* ══ Botão Calcular ══ */}
        {erro && (
          <div className="flex items-center gap-2 rounded-xl p-3 bg-red-50 border border-red-200">
            <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-700 font-semibold">{erro}</p>
          </div>
        )}
        <button
          onClick={calcular}
          className="w-full py-4 rounded-xl text-white font-bold text-base transition-all hover:opacity-90"
          style={{ background: AZUL }}
        >
          Calcular Financiamento
        </button>
      </div>

      {/* ══ RESULTADOS ══ */}
      {result && (
        <div id="resultado-fgts" className="mt-6 space-y-5">

          {/* ── Cards de Resumo ── */}
          <PremiumCard className="p-4">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: AZUL }}>
              <CheckCircle2 size={15} /> Resumo do Financiamento
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <MCard label="Valor Base do Imóvel" value={fmtBRL(valorBase)}
                sub={avalNum > 0 && compraNum > 0 ? (valorBase === avalNum ? 'avaliação' : 'compra/venda') : undefined} />
              {subNum > 0 && <MCard label="Subsídio do Governo" value={fmtBRL(subNum)} sub="informativo" color="orange" />}
              <MCard label="Recursos Próprios" value={fmtBRL(recursosProprios)} />
              <MCard label="Financiamento (PV)" value={fmtBRL(finNum)} color="blue" />

              {/* PMT — destaque especial */}
              <div className="rounded-xl p-3 border-2 col-span-2 md:col-span-1" style={{ background: '#EBF4FF', borderColor: AZUL }}>
                <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: AZUL }}>Parcela (a+j) — FIXA</p>
                <p className="text-lg font-black" style={{ color: AZUL_ESC }}>{fmtBRL(result.PMT)}</p>
                <span className="inline-block text-xs font-bold px-2 py-0.5 rounded-full text-white mt-1" style={{ background: AZUL }}>
                  não muda nunca
                </span>
                <p className="text-xs text-text-secondary mt-1">{result.schedule.length} parcelas · i = {(result.i * 100).toFixed(6)}%/mês</p>
              </div>

              <MCard label="Parcela Total 1º Mês" value={fmtBRL(result.row1.total)} sub="PMT + MIP + DFI"
                color={rendaNum > 0 && result.PMT > parcelaMaxima ? 'red' : undefined} />
              <MCard label="Parcela Total Hoje" value={fmtBRL(result.parcelaTotalHoje)} sub="MIP com idade atual" />
              <MCard label="Total de Juros" value={fmtBRL(result.totalJuros)} sub={`${result.schedule.length} meses`} color="red" />
              <MCard label="Total Pago (sem seg.)" value={fmtBRL(result.totalPago)} sub={`PMT × ${result.schedule.length}`} />
              <MCard label="Total MIP" value={fmtBRL(result.totalMIP)} sub="Seguro vida/invalidez" />
              <MCard label="Total DFI" value={fmtBRL(result.totalDFI)} sub="Seguro danos físicos" />
            </div>

            {/* Barra de composição */}
            {(() => {
              const r = result.row1;
              const tot = r.total;
              const pAm = r.amort / tot * 100;
              const pJu = r.juros  / tot * 100;
              const pM  = r.mip    / tot * 100;
              const pD  = r.dfi    / tot * 100;
              return (
                <div className="mt-3 rounded-xl bg-surface-100 border border-surface-200 p-3">
                  <p className="text-xs font-semibold text-text-secondary mb-2">Composição da 1ª Parcela Total ({fmtBRL(tot)})</p>
                  <div className="flex rounded-full overflow-hidden h-2.5 mb-2">
                    <div style={{ width: `${pAm}%`, background: '#1B6B3A' }} />
                    <div style={{ width: `${pJu}%`, background: '#B02A37' }} />
                    <div style={{ width: `${pM}%`,  background: AZUL      }} />
                    <div style={{ width: `${pD}%`,  background: '#7C3AED' }} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {[
                      ['#1B6B3A', `Amortização ${pAm.toFixed(1)}%`],
                      ['#B02A37', `Juros ${pJu.toFixed(1)}%`],
                      [AZUL,      `MIP ${pM.toFixed(2)}%`],
                      ['#7C3AED', `DFI ${pD.toFixed(2)}%`],
                    ].map(([c, l]) => (
                      <span key={l} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: c }} />
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Alerta de renda */}
            {rendaNum > 0 && (
              result.PMT <= parcelaMaxima
                ? <div className="mt-3 flex items-center gap-2 rounded-xl p-3 bg-green-50 border border-green-200">
                    <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
                    <p className="text-xs text-green-700 font-semibold">
                      ✅ Renda adequada — PMT {fmtBRL(result.PMT)} ≤ 30% da renda ({fmtBRL(parcelaMaxima)})
                    </p>
                  </div>
                : <div className="mt-3 flex items-center gap-2 rounded-xl p-3 bg-red-50 border border-red-200">
                    <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-700 font-semibold">
                      ⚠️ Renda insuficiente — PMT {fmtBRL(result.PMT)} &gt; 30% da renda ({fmtBRL(parcelaMaxima)})
                    </p>
                  </div>
            )}

            {/* Tabela MIP/DFI */}
            <details className="mt-3">
              <summary className="text-xs cursor-pointer font-semibold flex items-center gap-1" style={{ color: AZUL }}>
                <Shield size={12} /> Ver tabela MIP/DFI por faixa etária
              </summary>
              <div className="mt-2 rounded-xl overflow-hidden border border-surface-200 text-xs">
                <div className="grid grid-cols-3 text-white font-bold px-3 py-2" style={{ background: AZUL }}>
                  <span>Faixa</span><span>MIP (%/mês)</span><span>DFI (%/mês)</span>
                </div>
                {[['≤ 30','0,00850%'],['31–40','0,01124%'],['41–50','0,02020%'],['51–55','0,03990%'],['56–60','0,06420%'],['61–65','0,08560%'],['66+','0,12620%']]
                  .map(([f, m], i) => (
                  <div key={f} className={`grid grid-cols-3 px-3 py-1.5 ${i % 2 === 0 ? 'bg-surface-50' : ''}`}>
                    <span>{f} anos</span><span>{m}</span><span>0,00890%</span>
                  </div>
                ))}
              </div>
            </details>
          </PremiumCard>

          {/* ── Resultado FGTS ── */}
          {result.fgts && (
            <PremiumCard className="p-4">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: VERDE }}>
                <DollarSign size={15} /> Simulação FGTS — {
                  result.fgts.modo === 'entrada'  ? 'Uso na Entrada' :
                  result.fgts.modo === 'amort'    ? `Amortização Extraordinária (após parcela ${result.fgts.fgtsMes})` :
                  `Redução de Parcelas por 12 meses (a partir da parcela ${result.fgts.fgtsMes})`
                }
              </h3>

              {/* Modo 1 — Entrada */}
              {result.fgts.modo === 'entrada' && (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <MCard label="FGTS Utilizado"      value={fmtBRL(result.fgts.fgtsVal)} color="green" />
                    <MCard label="Financ. sem FGTS"    value={fmtBRL(result.fgts.PV_original)} />
                    <MCard label="Financ. com FGTS"    value={fmtBRL(result.fgts.PV_novo)}     color="green" />
                    <MCard label="PMT sem FGTS"        value={fmtBRL(result.fgts.PMT_original)} />
                  </div>

                  <div className="rounded-xl p-4 border-2" style={{ background: VERDE_CLR, borderColor: VERDE }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black flex-shrink-0" style={{ background: VERDE }}>
                        <DollarSign size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: VERDE }}>Nova PMT com FGTS na Entrada</p>
                        <p className="text-xs text-text-secondary">Financiamento reduzido de {fmtBRL(result.fgts.PV_original)} para {fmtBRL(result.fgts.PV_novo)}</p>
                      </div>
                    </div>
                    <div className="text-center my-3">
                      <p className="text-xs text-text-secondary">Nova parcela base (PMT)</p>
                      <p className="text-4xl font-black" style={{ color: VERDE }}>{fmtBRL(result.fgts.PMT_novo)}</p>
                      <p className="text-sm font-semibold text-text-secondary">era {fmtBRL(result.fgts.PMT_original)}</p>
                      <span className="inline-flex items-center gap-1 bg-white rounded-full px-3 py-0.5 text-xs font-bold mt-2" style={{ color: VERDE }}>
                        ↓ {fmtBRL(result.fgts.economia_mensal)}/mês de economia
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      {[
                        ['FGTS utilizado na entrada', fmtBRL(result.fgts.fgtsVal)],
                        ['Financiamento resultante',  fmtBRL(result.fgts.PV_novo)],
                        ['PMT original',              fmtBRL(result.fgts.PMT_original)],
                        ['Nova PMT',                  fmtBRL(result.fgts.PMT_novo)],
                        ['Economia por parcela',      fmtBRL(result.fgts.economia_mensal)],
                      ].map(([l, v]) => (
                        <div key={l} className="flex justify-between py-1.5 border-b border-green-100">
                          <span className="text-text-secondary">{l}</span>
                          <span className="font-semibold">{v}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-1.5 font-bold text-sm">
                        <span style={{ color: VERDE }}>Economia total estimada</span>
                        <span style={{ color: VERDE }}>{fmtBRL(result.fgts.economia_total)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Modo 2 — Amortização extraordinária */}
              {result.fgts.modo === 'amort' && (
                result.fgts.extra
                  ? <ExtraCard extra={result.fgts.extra} PMT={result.PMT}
                      title={`FGTS de ${fmtBRL(result.fgts.fgtsVal)} aplicado como amortização extraordinária na parcela ${result.fgts.fgtsMes}`}
                    />
                  : <div className="rounded-xl p-3 bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
                      O saldo FGTS informado é maior ou igual ao saldo devedor nessa parcela — o financiamento seria quitado.
                    </div>
              )}

              {/* Modo 3 — Redução de parcelas por 12 meses */}
              {result.fgts.modo === 'parcelas' && result.fgts.parcelas_reduzidas && (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <MCard label="FGTS Total"        value={fmtBRL(result.fgts.fgtsVal)}           color="green" />
                    <MCard label="Desconto/mês"      value={fmtBRL(result.fgts.reducao_mensal!)}    color="green" />
                    <MCard label="Meses beneficiados" value={`${result.fgts.parcelas_reduzidas.length} meses`} />
                  </div>

                  <div className="rounded-xl overflow-hidden border border-surface-200 text-xs">
                    <div className="grid grid-cols-4 text-white font-bold px-3 py-2" style={{ background: VERDE }}>
                      <span>Nº</span>
                      <span>Mês/Ano</span>
                      <span className="text-right">Total Original</span>
                      <span className="text-right">Com FGTS</span>
                    </div>
                    {result.fgts.parcelas_reduzidas.map((r, idx) => (
                      <div key={r.k} className={`grid grid-cols-4 px-3 py-2 border-b border-surface-100 ${idx % 2 === 0 ? 'bg-surface-50' : ''}`}>
                        <span className="font-medium text-gray-500">{r.k}</span>
                        <span>{MESES_PT[r.mes - 1]}/{r.ano}</span>
                        <span className="text-right line-through text-text-secondary">{fmtBRL(r.total_orig)}</span>
                        <span className="text-right font-bold" style={{ color: VERDE }}>{fmtBRL(r.total_novo)}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-4 px-3 py-2 font-bold text-sm" style={{ background: VERDE_CLR }}>
                      <span className="col-span-2" style={{ color: VERDE }}>Total do período</span>
                      <span className="text-right text-text-secondary line-through text-xs">
                        {fmtBRL(result.fgts.parcelas_reduzidas.reduce((s, r) => s + r.total_orig, 0))}
                      </span>
                      <span className="text-right" style={{ color: VERDE }}>
                        {fmtBRL(result.fgts.parcelas_reduzidas.reduce((s, r) => s + r.total_novo, 0))}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary mt-2 italic">
                    O FGTS abate diretamente o valor total da parcela (PMT + MIP + DFI). O saldo devedor segue o plano PRICE original.
                  </p>
                </>
              )}
            </PremiumCard>
          )}

          {/* ── Amortização Extra Manual ── */}
          {result.extra && (
            <PremiumCard className="p-4">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2" style={{ color: LARANJA }}>
                <TrendingDown size={15} /> Análise da Amortização Extra
              </h3>
              <ExtraCard extra={result.extra} PMT={result.PMT} />
            </PremiumCard>
          )}

          {/* ── Tabela Completa ── */}
          <PremiumCard className="overflow-hidden">
            <div className="p-4 flex items-center justify-between flex-wrap gap-2">
              <button
                onClick={() => setShowTable(v => !v)}
                className="flex items-center gap-2 font-semibold text-sm text-text-primary"
              >
                <span className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center">
                  {showTable ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
                Plano de Amortização Completo
                <span className="text-xs text-text-secondary font-normal">({result.schedule.length} parcelas)</span>
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-surface-200 hover:bg-surface-100 transition-colors text-text-secondary"
              >
                <Printer size={13} /> Imprimir / Salvar PDF
              </button>
            </div>

            {showTable && (
              <>
                <div style={{ maxHeight: '500px', overflowY: 'auto', overflowX: 'auto' }}>
                  <table className="w-full text-xs border-collapse" style={{ minWidth: '840px' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: AZUL, color: 'white' }}>
                      <tr>
                        {[
                          { h: 'Nº',          aj: false },
                          { h: 'Mês/Ano',     aj: false },
                          { h: 'SD Inicial',  aj: false },
                          { h: 'Amortização', aj: false },
                          { h: 'Juros',       aj: false },
                          { h: '(a+j)',       aj: true  },
                          { h: 'MIP',         aj: false },
                          { h: 'DFI',         aj: false },
                          { h: 'Total',       aj: false },
                          { h: 'SD Final',    aj: false },
                        ].map(({ h, aj }) => (
                          <th key={h}
                            className={`px-2 py-2 font-semibold whitespace-nowrap ${h === 'Nº' || h === 'Mês/Ano' ? 'text-left' : 'text-right'}`}
                            style={aj ? { background: 'rgba(255,255,255,0.18)' } : {}}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.schedule.map(r => {
                        const isExtra = r.k === exMesNum && exValNum > 0;
                        const isFGTS  = result.fgts?.fgtsMes === r.k && (result.fgts?.modo === 'amort' || result.fgts?.modo === 'parcelas');
                        const isFGTSRange = result.fgts?.modo === 'parcelas' &&
                          result.fgts.parcelas_reduzidas?.some(pr => pr.k === r.k);
                        const isAniv  = r.k % 12 === 0;
                        let bg = '';
                        if (isFGTSRange)  bg = '#ECFDF5';
                        else if (isExtra || isFGTS) bg = '#FFF3CD';
                        else if (isAniv)  bg = '#EBF3FC';
                        return (
                          <tr key={r.k} style={{ background: bg, borderBottom: '1px solid #F3F4F6' }}>
                            <td className="px-2 py-1.5 text-left text-gray-500 font-medium">
                              {(isExtra || isFGTS) && '★ '}{r.k}
                            </td>
                            <td className="px-2 py-1.5 text-left whitespace-nowrap">
                              {MESES_PT[r.mes - 1]}/{r.ano}
                            </td>
                            <td className="px-2 py-1.5 text-right">{fmtBRL(r.sd_ini)}</td>
                            <td className="px-2 py-1.5 text-right" style={{ color: '#1B6B3A' }}>{fmtBRL(r.amort)}</td>
                            <td className="px-2 py-1.5 text-right" style={{ color: '#B02A37' }}>{fmtBRL(r.juros)}</td>
                            <td className="px-2 py-1.5 text-right font-bold" style={{ background: 'rgba(0,92,169,0.07)', color: AZUL_ESC }}>{fmtBRL(r.pmt)}</td>
                            <td className="px-2 py-1.5 text-right" style={{ color: AZUL }}>{fmtBRL(r.mip)}</td>
                            <td className="px-2 py-1.5 text-right" style={{ color: '#7C3AED' }}>{fmtBRL(r.dfi)}</td>
                            <td className="px-2 py-1.5 text-right font-bold">{fmtBRL(r.total)}</td>
                            <td className="px-2 py-1.5 text-right">{fmtBRL(r.sd_fim)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-center text-text-secondary py-2 border-t border-surface-200 italic">
                  (a+j) constante em todo o contrato · Amortização cresce mês a mês · MIP e DFI decrescem com o saldo
                  {exValNum > 0 && ` · ★ parcela ${exMesNum} = amortização extra`}
                  {result.fgts?.modo === 'amort'    && ` · ★ parcela ${result.fgts.fgtsMes} = uso do FGTS`}
                  {result.fgts?.modo === 'parcelas' && ` · verde = parcelas com desconto FGTS`}
                  {' '}· linhas azuis = aniversários do contrato
                </p>
              </>
            )}
          </PremiumCard>

        </div>
      )}

      <style>{`
        @media print {
          body > *:not(#resultado-fgts) { display: none !important; }
          #resultado-fgts { display: block !important; }
          @page { margin: 1cm; }
        }
      `}</style>
    </div>
  );
}
