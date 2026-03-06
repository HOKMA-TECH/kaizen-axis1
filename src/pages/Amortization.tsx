import { useState, useEffect, useMemo, useCallback } from 'react';
import { SectionHeader, PremiumCard } from '@/components/ui/PremiumComponents';
import {
  Calculator, DollarSign, Percent, Clock, TrendingDown,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Printer,
  ArrowRight, Home, Wallet, User, Calendar, Shield,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

/* ─────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────── */
type System = 'SAC' | 'PRICE';

interface TableRow {
  k: number;
  monthLabel: string;
  balStart: number;
  amort: number;
  interest: number;
  aj: number;           // amort + interest (PMT para PRICE, variável para SAC)
  mip: number;
  dfi: number;
  parcelaTotal: number; // aj + mip + dfi
  balEnd: number;
  isExtra?: boolean;
}

interface BaseResult {
  monthlyRate: number;
  firstInstallment: number;   // parcelaTotal k=1
  lastInstallment: number;
  totalInterest: number;
  totalPaid: number;
  totalMIP: number;
  totalDFI: number;
  pmt: number;                // fixed PMT (PRICE) or fixed amortization A (SAC)
  rows: TableRow[];
}

interface ExtraResult {
  extraMonth: number;
  balanceAfterExtra: number;
  pmtBefore: number;
  remainingBefore: number;
  optA: {
    newMonths: number;
    savedMonths: number;
    savedYears: number;
    totalInterestSaved: number;
  };
  optB: {
    newPmt: number;
    reduction: number;
    totalInterestSaved: number;
  };
}

/* ─────────────────────────────────────────────────────────────────
   CONSTANTS — MIP (Caixa MCMV) e DFI
───────────────────────────────────────────────────────────────── */
const MIP_BRACKETS = [
  { maxAge: 30, rate: 0.00011100 },  // 0.01110% ao mês
  { maxAge: 40, rate: 0.00023500 },  // 0.02350%
  { maxAge: 50, rate: 0.00041500 },  // 0.04150%
  { maxAge: 55, rate: 0.00066800 },  // 0.06680%
  { maxAge: 60, rate: 0.00104900 },  // 0.10490%
  { maxAge: 65, rate: 0.00133900 },  // 0.13390%
  { maxAge: 70, rate: 0.00180000 },  // 0.18000%
];
const DFI_RATE = 0.0000890; // 0.00890% ao mês (fixo)

const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/* ─────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────── */
const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtPct = (v: number, digits = 4) => `${(v * 100).toFixed(digits)}%`;

const parseNum = (s: string): number => {
  const c = s.replace(/[^\d,]/g, '').replace(',', '.');
  const n = parseFloat(c);
  return isNaN(n) ? 0 : n;
};

const formatInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function getMipRate(ageFloor: number): number {
  for (const b of MIP_BRACKETS) if (ageFloor <= b.maxAge) return b.rate;
  return MIP_BRACKETS[MIP_BRACKETS.length - 1].rate;
}

function getMonthLabel(startYear: number, startMonth0: number, k: number): string {
  const offset = startMonth0 + k - 1;
  return `${MONTHS_PT[offset % 12]}/${startYear + Math.floor(offset / 12)}`;
}

/** Saldo devedor pelo método fechado (PRICE): SD_k = PV × [(1+i)^n − (1+i)^k] / [(1+i)^n − 1] */
function sdClosed(pv: number, i: number, n: number, k: number): number {
  const pow_n = Math.pow(1 + i, n);
  return pv * (pow_n - Math.pow(1 + i, k)) / (pow_n - 1);
}

/** Idade em anos (fracionada) entre dobDate e refDate */
function calcAge(dobDate: Date, refDate: Date): number {
  const msPerYear = 365.25 * 24 * 3600 * 1000;
  return (refDate.getTime() - dobDate.getTime()) / msPerYear;
}

/* ─────────────────────────────────────────────────────────────────
   CORE — SAC (taxa efetiva composta)
───────────────────────────────────────────────────────────────── */
function calcSAC(
  pv: number, ratePct: number, n: number,
  sy: number, sm0: number
): BaseResult {
  const i = Math.pow(1 + ratePct / 100, 1 / 12) - 1;
  const sacA = pv / n;
  const rows: TableRow[] = [];
  let balance = pv, totInt = 0, totPaid = 0, first = 0, last = 0;

  for (let k = 1; k <= n; k++) {
    const balStart = balance;
    const interest = balStart * i;
    const amort = Math.min(sacA, balStart);
    const aj = amort + interest;
    const balEnd = Math.max(0, balStart - amort);
    rows.push({ k, monthLabel: getMonthLabel(sy, sm0, k), balStart, amort, interest, aj, mip: 0, dfi: 0, parcelaTotal: aj, balEnd });
    totInt += interest;
    totPaid += aj;
    if (k === 1) first = aj;
    if (k === n || balEnd < 0.01) { last = aj; break; }
    balance = balEnd;
  }
  return { monthlyRate: i, firstInstallment: first, lastInstallment: last, totalInterest: totInt, totalPaid: totPaid, totalMIP: 0, totalDFI: 0, pmt: sacA, rows };
}

/* ─────────────────────────────────────────────────────────────────
   CORE — PRICE FGTS (taxa proporcional: i = taxa/12/100)
───────────────────────────────────────────────────────────────── */
function calcPriceFGTS(
  pv: number, ratePct: number, n: number,
  baseAge: number,  // idade em anos no início do contrato
  sy: number, sm0: number
): BaseResult {
  const i = ratePct / 12 / 100;  // taxa proporcional (não composta)
  const pow_n = Math.pow(1 + i, n);
  const pmt = pv * (i * pow_n) / (pow_n - 1);
  const rows: TableRow[] = [];
  let totInt = 0, totMIP = 0, totDFI = 0, first = 0, last = 0;

  for (let k = 1; k <= n; k++) {
    const balStart = sdClosed(pv, i, n, k - 1);
    const interest = balStart * i;
    const amort = pmt - interest;
    const balEnd = Math.max(0, sdClosed(pv, i, n, k));
    const ageAtK = baseAge + k / 12;
    const mip = balStart * getMipRate(Math.floor(ageAtK));
    const dfi = balStart * DFI_RATE;
    const parcelaTotal = pmt + mip + dfi;
    rows.push({ k, monthLabel: getMonthLabel(sy, sm0, k), balStart, amort, interest, aj: pmt, mip, dfi, parcelaTotal, balEnd });
    totInt += interest;
    totMIP += mip;
    totDFI += dfi;
    if (k === 1) first = parcelaTotal;
    if (k === n || balEnd < 0.01) { last = parcelaTotal; break; }
  }
  const totalPaid = pmt * n + totMIP + totDFI;
  return { monthlyRate: i, firstInstallment: first, lastInstallment: last, totalInterest: totInt, totalPaid, totalMIP: totMIP, totalDFI: totDFI, pmt, rows };
}

/* ─────────────────────────────────────────────────────────────────
   EXTRA — SAC
───────────────────────────────────────────────────────────────── */
function calcExtraSAC(
  base: BaseResult, n: number, i: number, em: number, ev: number
): ExtraResult | null {
  if (em < 1 || em >= n || ev <= 0) return null;
  const row = base.rows[em - 1];
  if (!row) return null;
  const sacA = base.pmt;
  const balAfter = row.balEnd;
  const sdNovo = Math.max(0, balAfter - ev);
  const rem = n - em;
  const newMonthsA = Math.ceil(sdNovo / sacA);
  const nextInstA = sacA + sdNovo * i;
  const newSacA = rem > 0 ? sdNovo / rem : 0;
  const nextInstB = newSacA + sdNovo * i;
  const reduction = nextInstA - nextInstB;

  let intOrig = 0, bO = balAfter;
  for (let k = 0; k < rem && bO > 0.01; k++) { intOrig += bO * i; bO -= Math.min(sacA, bO); }
  let intA = 0, bA = sdNovo;
  for (let k = 0; k < newMonthsA && bA > 0.01; k++) { intA += bA * i; bA -= Math.min(sacA, bA); }
  let intB = 0, bB = sdNovo;
  for (let k = 0; k < rem && bB > 0.01; k++) { intB += bB * i; bB -= Math.min(newSacA, bB); }

  return {
    extraMonth: em, balanceAfterExtra: sdNovo, pmtBefore: row.parcelaTotal, remainingBefore: rem,
    optA: { newMonths: newMonthsA, savedMonths: rem - newMonthsA, savedYears: parseFloat(((rem - newMonthsA) / 12).toFixed(1)), totalInterestSaved: intOrig - intA },
    optB: { newPmt: nextInstB, reduction, totalInterestSaved: intOrig - intB },
  };
}

/* ─────────────────────────────────────────────────────────────────
   EXTRA — PRICE FGTS
───────────────────────────────────────────────────────────────── */
function calcExtraFGTS(
  base: BaseResult, n: number, i: number, em: number, ev: number
): ExtraResult | null {
  if (em < 1 || em >= n || ev <= 0) return null;
  const row = base.rows[em - 1];
  if (!row) return null;
  const pmt = base.pmt;
  const balAfter = row.balEnd;
  const sdNovo = Math.max(0, balAfter - ev);
  const rem = n - em;

  // Opt A: manter PMT, reduzir prazo
  const newMonthsA = Math.ceil(Math.log(pmt / (pmt - sdNovo * i)) / Math.log(1 + i));
  const savedMonths = rem - newMonthsA;

  let intOrig = 0, bO = balAfter;
  for (let k = 0; k < rem && bO > 0.01; k++) { const j = bO * i; intOrig += j; bO = Math.max(0, bO - (pmt - j)); }
  let intA = 0, bA = sdNovo;
  for (let k = 0; k < newMonthsA && bA > 0.01; k++) { const j = bA * i; intA += j; bA = Math.max(0, bA - (pmt - j)); }

  // Opt B: manter prazo, reduzir PMT
  const newPmt = rem > 0
    ? sdNovo * (i * Math.pow(1 + i, rem)) / (Math.pow(1 + i, rem) - 1)
    : 0;
  const reduction = pmt - newPmt;
  let intB = 0, bB = sdNovo;
  for (let k = 0; k < rem && bB > 0.01; k++) { const j = bB * i; intB += j; bB = Math.max(0, bB - (newPmt - j)); }

  return {
    extraMonth: em, balanceAfterExtra: sdNovo, pmtBefore: pmt, remainingBefore: rem,
    optA: { newMonths: newMonthsA, savedMonths, savedYears: parseFloat((savedMonths / 12).toFixed(1)), totalInterestSaved: intOrig - intA },
    optB: { newPmt, reduction, totalInterestSaved: intOrig - intB },
  };
}

/* ─────────────────────────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────────────────────────── */
function MetricCard({ label, value, sub, highlight, warn, green, caixa }: {
  label: string; value: string; sub?: string;
  highlight?: boolean; warn?: boolean; green?: boolean; caixa?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 border ${
      caixa    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30'
      : highlight ? 'bg-gold-50 dark:bg-gold-900/20 border-gold-200 dark:border-gold-800/30'
      : warn    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20'
      : green   ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20'
      : 'bg-surface-100 border-surface-200'
    }`}>
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <p className={`text-sm font-bold ${
        caixa    ? 'text-blue-700 dark:text-blue-300'
        : highlight ? 'text-gold-700 dark:text-gold-400'
        : warn    ? 'text-red-600 dark:text-red-400'
        : green   ? 'text-green-700 dark:text-green-400'
        : 'text-text-primary'
      }`}>{value}</p>
      {sub && <p className="text-xs text-text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────────── */
export default function Amortization() {
  // ── Sistema
  const [system, setSystem] = useState<System>('PRICE');

  // ── Inputs comuns
  const [annualRateStr, setAnnualRateStr] = useState('5.00');
  const [monthsStr, setMonthsStr]         = useState('420');
  const [rdRaw, setRdRaw]                 = useState('500000');   // R$ 5.000
  const [extraMonthStr, setExtraMonthStr] = useState('24');
  const [extraValRaw, setExtraValRaw]     = useState('500000');   // R$ 5.000

  // ── Inputs SAC
  const [pvRaw, setPvRaw]       = useState('30000000'); // Valor do imóvel R$ 300.000
  const [pvFinRaw, setPvFinRaw] = useState('24000000'); // Valor financiado R$ 240.000

  // ── Inputs PRICE FGTS
  const [avalRaw, setAvalRaw]       = useState('14080000'); // R$ 140.800
  const [compraRaw, setCompraRaw]   = useState('14080000');
  const [subsidioRaw, setSubsidioRaw] = useState('000');
  const [fgtsFinRaw, setFgtsFinRaw] = useState('14080000'); // Valor financiado FGTS
  const [dobStr, setDobStr]         = useState('1990-01-01'); // data nascimento
  const [startDateStr, setStartDateStr] = useState('2025-01'); // início parcelas (YYYY-MM)

  // ── UI
  const [showTable, setShowTable] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const PAGE = 24;

  // Formatted display values
  const pvDisplay       = useMemo(() => formatInput(pvRaw),        [pvRaw]);
  const pvFinDisplay    = useMemo(() => formatInput(pvFinRaw),     [pvFinRaw]);
  const rdDisplay       = useMemo(() => formatInput(rdRaw),        [rdRaw]);
  const extraDisplay    = useMemo(() => formatInput(extraValRaw),  [extraValRaw]);
  const avalDisplay     = useMemo(() => formatInput(avalRaw),      [avalRaw]);
  const compraDisplay   = useMemo(() => formatInput(compraRaw),    [compraRaw]);
  const subsidioDisplay = useMemo(() => formatInput(subsidioRaw),  [subsidioRaw]);
  const fgtsFinDisplay  = useMemo(() => formatInput(fgtsFinRaw),   [fgtsFinRaw]);

  const handleCurrency = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string>>) =>
      (e: React.ChangeEvent<HTMLInputElement>) => setter(e.target.value.replace(/\D/g, '')),
    []
  );

  // Quando valor do imóvel SAC muda, sugere 80%
  useEffect(() => {
    const pVal = parseNum(pvDisplay);
    if (pVal > 0) setPvFinRaw(String(Math.round(pVal * 0.8 * 100)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvRaw]);

  // Quando sistema muda, ajusta taxa padrão e prazo
  useEffect(() => {
    if (system === 'PRICE') {
      setAnnualRateStr('5.00');
      setMonthsStr('420');
    } else {
      setAnnualRateStr('11.71');
      setMonthsStr('360');
    }
  }, [system]);

  // ── Derived
  const annualRate  = useMemo(() => parseFloat(annualRateStr) || 0, [annualRateStr]);
  const n           = useMemo(() => Math.max(12, Math.min(420, parseInt(monthsStr) || 360)), [monthsStr]);
  const extraMonth  = useMemo(() => parseInt(extraMonthStr) || 0, [extraMonthStr]);
  const extraValue  = useMemo(() => parseNum(extraDisplay), [extraDisplay]);
  const renda       = useMemo(() => parseNum(rdDisplay), [rdDisplay]);
  const maxInstallment = useMemo(() => renda * 0.3, [renda]);

  // SAC derived
  const propertyValue = useMemo(() => parseNum(pvDisplay),    [pvDisplay]);
  const pvSAC         = useMemo(() => parseNum(pvFinDisplay), [pvFinDisplay]);
  const downPaymentSAC = useMemo(() => Math.max(0, propertyValue - pvSAC), [propertyValue, pvSAC]);

  // PRICE FGTS derived
  const aval         = useMemo(() => parseNum(avalDisplay),     [avalDisplay]);
  const compra       = useMemo(() => parseNum(compraDisplay),   [compraDisplay]);
  const subsidio     = useMemo(() => parseNum(subsidioDisplay), [subsidioDisplay]);
  const pvFGTS       = useMemo(() => parseNum(fgtsFinDisplay),  [fgtsFinDisplay]);
  const baseImovel   = useMemo(() => Math.min(aval > 0 ? aval : compra, compra > 0 ? compra : aval), [aval, compra]);
  const recursosFGTS = useMemo(() => Math.max(0, baseImovel - pvFGTS - subsidio), [baseImovel, pvFGTS, subsidio]);

  // Age & start date (PRICE FGTS)
  const { baseAge, startYear, startMonth0 } = useMemo(() => {
    let sy = 2025, sm0 = 0, age = 35;
    try {
      const [yr, mo] = (startDateStr || '2025-01').split('-').map(Number);
      sy = yr; sm0 = (mo || 1) - 1;
      if (dobStr) {
        const dob = new Date(dobStr);
        const start = new Date(yr, sm0, 1);
        age = calcAge(dob, start);
      }
    } catch { /* keep defaults */ }
    return { baseAge: age, startYear: sy, startMonth0: sm0 };
  }, [dobStr, startDateStr]);

  const pv = system === 'PRICE' ? pvFGTS : pvSAC;

  // ── Base simulation
  const base = useMemo(() => {
    if (pv < 1000 || annualRate < 0.1 || n < 1) return null;
    if (system === 'PRICE') {
      return calcPriceFGTS(pv, annualRate, n, baseAge, startYear, startMonth0);
    } else {
      return calcSAC(pv, annualRate, n, startYear, startMonth0);
    }
  }, [pv, annualRate, n, system, baseAge, startYear, startMonth0]);

  // ── Extra simulation
  const extra = useMemo(() => {
    if (!base || extraMonth < 1 || extraValue <= 0) return null;
    const i = base.monthlyRate;
    if (system === 'PRICE') return calcExtraFGTS(base, n, i, extraMonth, extraValue);
    return calcExtraSAC(base, n, i, extraMonth, extraValue);
  }, [base, n, system, extraMonth, extraValue]);

  const incomeOk = base
    ? (system === 'PRICE' ? base.pmt : base.firstInstallment) <= maxInstallment
    : null;

  // Warnings
  const limitWarnings: string[] = [];
  if (pv > 0 && pv < 80_000)
    limitWarnings.push(`Valor financiado mínimo: R$ 80.000,00 (atual: ${fmtBRL(pv)})`);
  if (system === 'PRICE' && pv > 350_000)
    limitWarnings.push(`Limite FGTS/MCMV: ${fmtBRL(pv)} pode exceder o teto do programa.`);
  if (system === 'SAC' && pv > 1_500_000)
    limitWarnings.push(`Valor financiado máximo (SBPE): R$ 1.500.000,00 (atual: ${fmtBRL(pv)})`);
  if (annualRate > 0 && annualRate < 3.0)
    limitWarnings.push(`Taxa muito baixa: ${annualRate}% a.a. Verifique o valor informado.`);

  useEffect(() => setTablePage(0), [base]);

  const tableRows = useMemo(() => {
    if (!base) return [];
    return base.rows.map(r => ({ ...r, isExtra: r.k === extraMonth && extraValue > 0 }));
  }, [base, extraMonth, extraValue]);

  const pagedRows  = tableRows.slice(tablePage * PAGE, (tablePage + 1) * PAGE);
  const totalPages = Math.ceil(tableRows.length / PAGE);

  const ic = "w-full p-3 bg-surface-50 dark:bg-surface-100 rounded-xl border border-surface-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-text-primary text-sm transition-all";
  const lc = "text-xs font-medium text-text-secondary flex items-center gap-1.5 mb-1";
  const isCaixa = system === 'PRICE';

  return (
    <div className="p-4 md:p-6 pb-28 min-h-screen bg-surface-50 print:p-2 print:pb-2">
      <SectionHeader
        title="Simulador Caixa"
        subtitle={isCaixa ? 'PRICE FGTS — Minha Casa Minha Vida' : 'SAC — Financiamento Imobiliário'}
      />

      <div className="space-y-5">
        {/* ── SISTEMA TOGGLE ── */}
        <PremiumCard className="p-4">
          <label className={lc}><Calculator size={13} className="text-blue-500" /> Sistema de Amortização</label>
          <div className="flex gap-2">
            {(['PRICE', 'SAC'] as System[]).map(s => (
              <button
                key={s}
                onClick={() => setSystem(s)}
                className={`flex-1 p-3 rounded-xl text-sm font-semibold border transition-all ${system === s
                  ? s === 'PRICE'
                    ? 'bg-[#005CA9] text-white border-[#005CA9] shadow-md shadow-blue-500/20'
                    : 'bg-gold-400 text-white border-gold-400 shadow-md shadow-gold-400/20'
                  : 'bg-surface-50 dark:bg-surface-100 border-surface-200 text-text-secondary hover:border-blue-300'
                }`}
              >
                {s === 'PRICE' ? 'PRICE FGTS' : 'SAC'}
                <span className="block text-xs font-normal opacity-80 mt-0.5">
                  {s === 'PRICE' ? 'Parcelas fixas · Caixa MCMV' : 'Parcelas decrescentes · SBPE'}
                </span>
              </button>
            ))}
          </div>
        </PremiumCard>

        {/* ── FORM ── */}
        <PremiumCard className="p-5 space-y-5">

          {/* ── PRICE FGTS: Dados do Imóvel ── */}
          {isCaixa && (
            <div>
              <h3 className="font-bold text-text-primary flex items-center gap-2 mb-3 text-sm">
                <Home size={16} className="text-[#005CA9]" /> Dados do Imóvel — FGTS / MCMV
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lc}><DollarSign size={13} className="text-[#005CA9]" /> Valor de Avaliação (R$)</label>
                  <input className={ic} value={avalDisplay} onChange={handleCurrency(setAvalRaw)} placeholder="140.800,00" />
                </div>
                <div>
                  <label className={lc}><DollarSign size={13} className="text-[#005CA9]" /> Valor de Compra/Venda (R$)</label>
                  <input className={ic} value={compraDisplay} onChange={handleCurrency(setCompraRaw)} placeholder="140.800,00" />
                  <p className="text-xs text-text-secondary mt-0.5">Caixa usa o menor dos dois valores como base</p>
                </div>
                <div>
                  <label className={lc}><DollarSign size={13} className="text-[#F47920]" /> Subsídio FGTS (R$)</label>
                  <input className={ic} value={subsidioDisplay} onChange={handleCurrency(setSubsidioRaw)} placeholder="0,00" />
                  <p className="text-xs text-text-secondary mt-0.5">Informativo — não afeta o cálculo da amortização</p>
                </div>
                <div>
                  <label className={lc}><DollarSign size={13} className="text-[#005CA9]" /> Valor Financiado (R$)</label>
                  <input className={ic} value={fgtsFinDisplay} onChange={handleCurrency(setFgtsFinRaw)} placeholder="140.800,00" />
                </div>

                {/* Recursos Próprios calculado */}
                <div className="rounded-xl border border-surface-200 bg-surface-100 p-3 sm:col-span-2">
                  <p className="text-xs text-text-secondary font-medium mb-1">Recursos Próprios (Entrada)</p>
                  <p className="font-bold text-text-primary text-sm">{recursosFGTS > 0 ? fmtBRL(recursosFGTS) : '—'}</p>
                  {baseImovel > 0 && pvFGTS > 0 && (
                    <p className="text-xs text-text-secondary mt-0.5">
                      min(Aval, Compra) {fmtBRL(baseImovel)} − Financiado {fmtBRL(pvFGTS)}{subsidio > 0 ? ` − Subsídio ${fmtBRL(subsidio)}` : ''} = {fmtBRL(recursosFGTS)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── SAC: Dados do Imóvel ── */}
          {!isCaixa && (
            <div>
              <h3 className="font-bold text-text-primary flex items-center gap-2 mb-3 text-sm">
                <Home size={16} className="text-gold-500" /> Dados do Imóvel — SAC / SBPE
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lc}><DollarSign size={13} className="text-gold-500" /> Valor do Imóvel (R$)</label>
                  <input className={ic} value={pvDisplay} onChange={handleCurrency(setPvRaw)} placeholder="300.000,00" />
                </div>
                <div>
                  <label className={lc}><DollarSign size={13} className="text-gold-500" /> Valor Financiado (R$)</label>
                  <input className={ic} value={pvFinDisplay} onChange={handleCurrency(setPvFinRaw)} placeholder="240.000,00" />
                  <p className="text-xs text-text-secondary mt-0.5">Sugerido: 80% do imóvel. Edite se necessário.</p>
                </div>
                <div className="rounded-xl border border-surface-200 bg-surface-100 p-3 sm:col-span-2">
                  <p className="text-xs text-text-secondary font-medium mb-1">Recursos Próprios (Entrada)</p>
                  <p className="font-bold text-text-primary text-sm">{downPaymentSAC > 0 ? fmtBRL(downPaymentSAC) : '—'}</p>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-surface-200" />

          {/* ── Mutuário & Renda ── */}
          <div>
            <h3 className="font-bold text-text-primary flex items-center gap-2 mb-3 text-sm">
              <User size={16} className={isCaixa ? 'text-[#005CA9]' : 'text-gold-500'} /> Mutuário e Renda
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lc}><Wallet size={13} className={isCaixa ? 'text-[#005CA9]' : 'text-gold-500'} /> Renda Bruta Mensal (R$)</label>
                <input className={ic} value={rdDisplay} onChange={handleCurrency(setRdRaw)} placeholder="5.000,00" />
              </div>

              {isCaixa && (
                <>
                  <div>
                    <label className={lc}><User size={13} className="text-[#005CA9]" /> Data de Nascimento</label>
                    <input
                      type="date"
                      className={ic}
                      value={dobStr}
                      onChange={e => setDobStr(e.target.value)}
                    />
                    <p className="text-xs text-text-secondary mt-0.5">
                      Idade atual: {baseAge > 0 ? `${Math.floor(baseAge)} anos` : '—'} · usado no cálculo do MIP
                    </p>
                  </div>
                  <div>
                    <label className={lc}><Calendar size={13} className="text-[#005CA9]" /> Início das Parcelas</label>
                    <input
                      type="month"
                      className={ic}
                      value={startDateStr}
                      onChange={e => setStartDateStr(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Income check */}
              <div className={`rounded-xl border p-3 sm:col-span-2 flex items-center justify-between ${
                base && incomeOk === false
                  ? 'bg-red-50 dark:bg-red-900/10 border-red-200'
                  : base && incomeOk
                    ? 'bg-green-50 dark:bg-green-900/10 border-green-200'
                    : 'bg-surface-100 border-surface-200'
              }`}>
                <div>
                  <p className="text-xs text-text-secondary font-medium mb-0.5">Parcela Máxima (30% da renda)</p>
                  <p className="font-bold text-text-primary text-sm">{maxInstallment > 0 ? fmtBRL(maxInstallment) : '—'}</p>
                  {isCaixa && base && (
                    <p className="text-xs text-text-secondary mt-0.5">Referência: PMT (a+j) = {fmtBRL(base.pmt)}</p>
                  )}
                </div>
                {base && (
                  <div className="flex items-center gap-2">
                    {incomeOk
                      ? <><CheckCircle2 size={18} className="text-green-500" /><span className="text-xs text-green-700 dark:text-green-400 font-semibold">Renda adequada ✅</span></>
                      : <><AlertTriangle size={18} className="text-red-500" /><span className="text-xs text-red-700 dark:text-red-400 font-semibold">Renda insuficiente ⚠️</span></>
                    }
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-surface-200" />

          {/* ── Condições do Financiamento ── */}
          <div>
            <h3 className="font-bold text-text-primary flex items-center gap-2 mb-3 text-sm">
              <Calculator size={16} className={isCaixa ? 'text-[#005CA9]' : 'text-gold-500'} /> Condições do Financiamento
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lc}><Percent size={13} className={isCaixa ? 'text-[#005CA9]' : 'text-gold-500'} /> Taxa Nominal (% a.a.)</label>
                <input
                  type="number" step="0.01" className={ic}
                  value={annualRateStr}
                  onChange={e => setAnnualRateStr(e.target.value)}
                />
                {isCaixa && (
                  <p className="text-xs text-text-secondary mt-0.5">
                    i mensal = {annualRate > 0 ? fmtPct(annualRate / 12 / 100, 6) : '—'} (proporcional)
                  </p>
                )}
              </div>
              <div>
                <label className={lc}><Clock size={13} className={isCaixa ? 'text-[#005CA9]' : 'text-gold-500'} /> Prazo (meses)</label>
                <input
                  type="number" min={12} max={420} className={ic}
                  value={monthsStr}
                  onChange={e => setMonthsStr(e.target.value)}
                />
                {n > 0 && <p className="text-xs text-text-secondary mt-0.5">{Math.floor(n / 12)} anos e {n % 12} meses</p>}
              </div>
            </div>
          </div>

          <div className="border-t border-surface-200" />

          {/* ── Amortização Extra ── */}
          <div>
            <h3 className="font-bold text-text-primary flex items-center gap-2 mb-3 text-sm">
              <TrendingDown size={16} className={isCaixa ? 'text-[#F47920]' : 'text-gold-500'} /> Amortização Extra (opcional)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lc}><Clock size={13} className="text-text-secondary" /> Após qual parcela?</label>
                <input type="number" min={1} max={n - 1} className={ic} value={extraMonthStr} onChange={e => setExtraMonthStr(e.target.value)} />
              </div>
              <div>
                <label className={lc}><DollarSign size={13} className="text-text-secondary" /> Valor Extra (R$)</label>
                <input className={ic} value={extraDisplay} onChange={handleCurrency(setExtraValRaw)} placeholder="5.000,00" />
              </div>
            </div>
          </div>
        </PremiumCard>

        {/* ── RESULTS ── */}
        <AnimatePresence>
          {base && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              {/* Caixa FGTS badge */}
              {isCaixa && (
                <div className="rounded-xl p-3 border border-[#005CA9]/30 bg-blue-50 dark:bg-blue-900/20 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: '#005CA9' }}>
                    <span className="text-white text-xs font-black">CEF</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#003D6E] dark:text-blue-300">Sistema PRICE FGTS — Caixa Econômica Federal</p>
                    <p className="text-xs text-text-secondary">Taxa proporcional · MIP + DFI · Fórmula SD fechada</p>
                  </div>
                </div>
              )}

              {/* Summary Cards */}
              <PremiumCard className="p-5">
                <h3 className="font-bold text-text-primary flex items-center gap-2 mb-4 text-sm">
                  <CheckCircle2 size={16} className={isCaixa ? 'text-[#005CA9]' : 'text-gold-500'} /> Resumo do Financiamento
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <MetricCard label="Valor Financiado" value={fmtBRL(pv)} caixa={isCaixa} highlight={!isCaixa} />
                  <MetricCard label="Recursos Próprios" value={fmtBRL(isCaixa ? recursosFGTS : downPaymentSAC)} />
                  {isCaixa && subsidio > 0 && (
                    <MetricCard label="Subsídio FGTS" value={fmtBRL(subsidio)} green />
                  )}
                  <MetricCard
                    label="Taxa Mensal (i)"
                    value={fmtPct(base.monthlyRate, 6)}
                    sub={isCaixa ? 'proporcional' : 'efetiva composta'}
                  />

                  {isCaixa ? (
                    <>
                      <MetricCard
                        label="PMT (Amort+Juros)"
                        value={fmtBRL(base.pmt)}
                        sub="constante durante todo o contrato"
                        caixa
                      />
                      <MetricCard
                        label="1ª Parcela Total"
                        value={fmtBRL(base.firstInstallment)}
                        sub={`PMT + MIP + DFI (mês 1)`}
                        warn={incomeOk === false}
                        green={incomeOk === true}
                      />
                      <MetricCard label="Total de Juros" value={fmtBRL(base.totalInterest)} warn />
                      <MetricCard label="Total MIP" value={fmtBRL(base.totalMIP)} sub="Seguro de vida/invalidez" />
                      <MetricCard label="Total DFI" value={fmtBRL(base.totalDFI)} sub="Seguro de danos físicos" />
                      <MetricCard
                        label="Total Pago"
                        value={fmtBRL(base.totalPaid)}
                        sub={`em ${base.rows.length} parcelas`}
                      />
                    </>
                  ) : (
                    <>
                      <MetricCard
                        label="1ª Parcela"
                        value={fmtBRL(base.firstInstallment)}
                        sub={`Taxa mensal: ${fmtPct(base.monthlyRate)}`}
                        highlight={incomeOk === true}
                        warn={incomeOk === false}
                      />
                      <MetricCard label="Última Parcela" value={fmtBRL(base.lastInstallment)} />
                      <MetricCard label="Total de Juros" value={fmtBRL(base.totalInterest)} warn />
                      <MetricCard label="Total Pago" value={fmtBRL(base.totalPaid)} sub={`em ${base.rows.length} parcelas`} />
                    </>
                  )}
                </div>

                {/* Warnings */}
                {limitWarnings.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {limitWarnings.map((w, i) => (
                      <div key={i} className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 p-3 flex items-start gap-2">
                        <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Composição 1ª parcela */}
                {base.rows.length > 0 && (() => {
                  const r = base.rows[0];
                  const total = r.parcelaTotal;
                  const pctAmort = (r.amort / total) * 100;
                  const pctJuros = (r.interest / total) * 100;
                  const pctMIP   = (r.mip  / total) * 100;
                  const pctDFI   = (r.dfi  / total) * 100;
                  return (
                    <div className="mt-3 rounded-xl bg-surface-100 border border-surface-200 p-3">
                      <p className="text-xs font-semibold text-text-secondary mb-2">Composição da 1ª Parcela Total ({fmtBRL(total)})</p>
                      <div className="flex gap-0 rounded-lg overflow-hidden h-3 mb-2">
                        <div className="bg-green-500 transition-all" style={{ width: `${pctAmort}%` }} />
                        <div className="bg-red-400 transition-all" style={{ width: `${pctJuros}%` }} />
                        {isCaixa && <div className="bg-blue-400 transition-all" style={{ width: `${pctMIP}%` }} />}
                        {isCaixa && <div className="bg-purple-400 transition-all" style={{ width: `${pctDFI}%` }} />}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
                          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                          Amortização {pctAmort.toFixed(1)}%
                        </span>
                        <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                          Juros {pctJuros.toFixed(1)}%
                        </span>
                        {isCaixa && (
                          <>
                            <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                              MIP {pctMIP.toFixed(2)}%
                            </span>
                            <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                              <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
                              DFI {pctDFI.toFixed(2)}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Tabela MIP por faixa (PRICE FGTS) */}
                {isCaixa && (
                  <details className="mt-3">
                    <summary className="text-xs text-[#005CA9] cursor-pointer font-semibold flex items-center gap-1">
                      <Shield size={12} /> Ver tabela MIP/DFI por faixa etária
                    </summary>
                    <div className="mt-2 overflow-x-auto rounded-xl border border-surface-200">
                      <table className="w-full text-xs">
                        <thead className="bg-[#005CA9] text-white">
                          <tr>
                            <th className="px-3 py-2 text-left">Faixa etária</th>
                            <th className="px-3 py-2 text-right">MIP (% ao mês)</th>
                            <th className="px-3 py-2 text-right">DFI (% ao mês)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MIP_BRACKETS.map((b, idx) => {
                            const prevAge = idx === 0 ? 0 : MIP_BRACKETS[idx - 1].maxAge + 1;
                            return (
                              <tr key={b.maxAge} className="border-b border-surface-100 hover:bg-surface-100">
                                <td className="px-3 py-1.5">{prevAge}–{b.maxAge} anos</td>
                                <td className="px-3 py-1.5 text-right">{(b.rate * 100).toFixed(5)}%</td>
                                <td className="px-3 py-1.5 text-right text-purple-600">{(DFI_RATE * 100).toFixed(5)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                {/* Income alert */}
                {incomeOk === false && (
                  <div className="mt-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 p-3 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-400">
                      {isCaixa
                        ? <>O PMT de <strong>{fmtBRL(base.pmt)}</strong> ultrapassa o limite de 30% da renda ({fmtBRL(maxInstallment)}). A Caixa pode reprovar o financiamento.</>
                        : <>A 1ª parcela de <strong>{fmtBRL(base.firstInstallment)}</strong> ultrapassa o limite de 30% da renda ({fmtBRL(maxInstallment)}).</>
                      }
                    </p>
                  </div>
                )}
              </PremiumCard>

              {/* ── Extra Amortization ── */}
              {extra && (
                <div className="space-y-3">
                  <div className="px-1">
                    <h3 className="font-bold text-text-primary flex items-center gap-2 text-sm">
                      <TrendingDown size={16} className={isCaixa ? 'text-[#F47920]' : 'text-gold-500'} />
                      Análise da Amortização Extra — {fmtBRL(extraValue)} após a parcela {extra.extraMonth}
                    </h3>
                    <p className="text-xs text-text-secondary mt-0.5">
                      SD antes do extra: <strong className="text-text-primary">{fmtBRL(extra.balanceAfterExtra + extraValue)}</strong>
                      {' '}· SD após extra: <strong className="text-text-primary">{fmtBRL(extra.balanceAfterExtra)}</strong>
                      {' '}· Parcelas restantes originais: <strong className="text-text-primary">{extra.remainingBefore}</strong>
                    </p>
                  </div>

                  {/* Regra de Ouro — SAC */}
                  {!isCaixa && (
                    <div className="rounded-xl bg-gold-50 dark:bg-gold-900/20 border border-gold-200 p-3 flex items-start gap-2">
                      <span className="text-gold-500 text-base flex-shrink-0">★</span>
                      <p className="text-xs text-gold-700 dark:text-gold-400">
                        <strong>Regra de Ouro:</strong> A cada{' '}
                        <strong>{fmtBRL(base.pmt)}</strong> de amortização extra, uma parcela é
                        eliminada do contrato — sem pagar os juros correspondentes.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Opção A — Reduzir Prazo */}
                    <PremiumCard className="p-4 border-blue-200 dark:border-blue-800/30 bg-blue-50 dark:bg-blue-900/10">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full bg-[#005CA9] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">A</div>
                        <div>
                          <p className="font-bold text-blue-800 dark:text-blue-300 text-sm">Reduzir o Prazo</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400">
                            {isCaixa ? 'Mantém o PMT original' : 'Mantém a amortização mensal'}
                          </p>
                        </div>
                      </div>
                      <div className="text-center my-4">
                        <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Parcelas economizadas</p>
                        <p className="text-4xl font-black text-blue-700 dark:text-blue-300">{extra.optA.savedMonths}</p>
                        <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold">
                          parcelas ({extra.optA.savedYears} anos a menos)
                        </p>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-blue-600 dark:text-blue-400 text-xs">Parcelas restantes originais</span>
                          <span className="font-medium text-text-primary">{extra.remainingBefore}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-600 dark:text-blue-400 text-xs">Novas parcelas restantes</span>
                          <span className="font-bold text-blue-700 dark:text-blue-300">{extra.optA.newMonths}</span>
                        </div>
                        {isCaixa && (
                          <div className="flex justify-between">
                            <span className="text-blue-600 dark:text-blue-400 text-xs">PMT mantido</span>
                            <span className="font-medium text-text-primary">{fmtBRL(base.pmt)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-blue-200 dark:border-blue-800/30 pt-2 mt-2">
                          <span className="text-blue-600 dark:text-blue-400 text-xs font-semibold">Economia em juros</span>
                          <span className="font-bold text-green-600 dark:text-green-400">{fmtBRL(extra.optA.totalInterestSaved)}</span>
                        </div>
                      </div>
                    </PremiumCard>

                    {/* Opção B — Reduzir Parcela */}
                    <PremiumCard className="p-4 border-orange-200 dark:border-orange-800/30 bg-orange-50 dark:bg-orange-900/10">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full bg-[#F47920] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">B</div>
                        <div>
                          <p className="font-bold text-orange-800 dark:text-orange-300 text-sm">Reduzir a Parcela</p>
                          <p className="text-xs text-orange-600 dark:text-orange-400">Mantém o prazo original ({extra.remainingBefore} meses)</p>
                        </div>
                      </div>
                      <div className="text-center my-4">
                        <p className="text-xs text-orange-600 dark:text-orange-400 mb-1">
                          {isCaixa ? 'Novo PMT (a+j)' : 'Nova parcela mensal'}
                        </p>
                        <p className="text-3xl font-black text-orange-700 dark:text-orange-300">
                          {fmtBRL(extra.optB.newPmt)}
                        </p>
                        <div className="inline-flex items-center gap-1 mt-1 bg-orange-100 dark:bg-orange-900/30 rounded-full px-3 py-0.5">
                          <ArrowRight size={12} className="text-orange-500 rotate-180" />
                          <span className="text-xs font-bold text-orange-700 dark:text-orange-400">
                            -{fmtBRL(extra.optB.reduction)}/mês
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-orange-600 dark:text-orange-400 text-xs">
                            {isCaixa ? 'PMT original' : 'Parcela antes da amortização'}
                          </span>
                          <span className="font-medium text-text-primary">{fmtBRL(isCaixa ? base.pmt : extra.pmtBefore)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-orange-600 dark:text-orange-400 text-xs">
                            {isCaixa ? 'Novo PMT' : 'Nova parcela'}
                          </span>
                          <span className="font-bold text-orange-700 dark:text-orange-300">{fmtBRL(extra.optB.newPmt)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-orange-600 dark:text-orange-400 text-xs">Redução mensal</span>
                          <span className="font-bold text-green-600 dark:text-green-400">{fmtBRL(extra.optB.reduction)}</span>
                        </div>
                        <div className="flex justify-between border-t border-orange-200 dark:border-orange-800/30 pt-2 mt-2">
                          <span className="text-orange-600 dark:text-orange-400 text-xs font-semibold">Economia em juros</span>
                          <span className="font-bold text-green-600 dark:text-green-400">{fmtBRL(extra.optB.totalInterestSaved)}</span>
                        </div>
                      </div>
                    </PremiumCard>
                  </div>
                </div>
              )}

              {/* ── Amortization Table ── */}
              <PremiumCard className="overflow-hidden">
                <div className="p-4 flex items-center justify-between flex-wrap gap-2">
                  <button
                    onClick={() => setShowTable(v => !v)}
                    className="flex items-center gap-2 font-semibold text-text-primary text-sm"
                  >
                    <span className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center text-text-secondary">
                      {showTable ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </span>
                    Plano de Amortização Completo
                    <span className="text-xs text-text-secondary font-normal">({base.rows.length} parcelas)</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-surface-200 hover:bg-surface-100 transition-colors text-text-secondary"
                  >
                    <Printer size={13} /> Imprimir / PDF
                  </button>
                </div>

                <AnimatePresence>
                  {showTable && (
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="overflow-x-auto">
                        {isCaixa ? (
                          /* PRICE FGTS table */
                          <table className="w-full text-xs text-left min-w-[900px]">
                            <thead className="text-xs uppercase" style={{ background: '#005CA9', color: 'white' }}>
                              <tr>
                                {['Nº', 'Mês/Ano', 'SD Inicial', 'Amortização', 'Juros', '(a+j)', 'MIP', 'DFI', 'Parcela Total', 'SD Final'].map(h => (
                                  <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pagedRows.map(row => (
                                <tr
                                  key={row.k}
                                  className={`border-b border-surface-100 dark:border-surface-200 last:border-0 text-right ${
                                    row.isExtra ? 'bg-amber-50 dark:bg-amber-900/20'
                                    : row.k === 1 || row.k === base.rows.length ? 'bg-blue-50 dark:bg-blue-900/10'
                                    : row.k % 12 === 0 ? 'bg-surface-100 dark:bg-surface-200'
                                    : 'hover:bg-surface-50 dark:hover:bg-surface-100'
                                  }`}
                                >
                                  <td className="px-2 py-1.5 font-medium text-left">{row.isExtra ? '★ ' : ''}{row.k}</td>
                                  <td className="px-2 py-1.5 text-left whitespace-nowrap">{row.monthLabel}</td>
                                  <td className="px-2 py-1.5">{fmtBRL(row.balStart)}</td>
                                  <td className="px-2 py-1.5 text-green-600 dark:text-green-400">{fmtBRL(row.amort)}</td>
                                  <td className="px-2 py-1.5 text-red-500">{fmtBRL(row.interest)}</td>
                                  <td className="px-2 py-1.5 font-semibold">{fmtBRL(row.aj)}</td>
                                  <td className="px-2 py-1.5 text-blue-600 dark:text-blue-400">{fmtBRL(row.mip)}</td>
                                  <td className="px-2 py-1.5 text-purple-600 dark:text-purple-400">{fmtBRL(row.dfi)}</td>
                                  <td className="px-2 py-1.5 font-bold">{fmtBRL(row.parcelaTotal)}</td>
                                  <td className="px-2 py-1.5">{fmtBRL(row.balEnd)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          /* SAC table */
                          <table className="w-full text-xs text-left min-w-[640px]">
                            <thead className="text-xs uppercase bg-surface-100 dark:bg-surface-200 text-text-secondary">
                              <tr>
                                {['Nº', 'Mês/Ano', 'SD Inicial', 'Amortização', 'Juros', 'Prestação', 'SD Final'].map(h => (
                                  <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pagedRows.map(row => (
                                <tr
                                  key={row.k}
                                  className={`border-b border-surface-100 dark:border-surface-200 last:border-0 ${
                                    row.isExtra ? 'bg-amber-50 dark:bg-amber-900/20'
                                    : row.k === 1 || row.k === base.rows.length ? 'bg-gold-50 dark:bg-gold-900/10'
                                    : row.k % 12 === 0 ? 'bg-blue-50 dark:bg-blue-900/10'
                                    : 'hover:bg-surface-100 dark:hover:bg-surface-200'
                                  }`}
                                >
                                  <td className="px-3 py-2 font-medium">{row.isExtra ? '★ ' : ''}{row.k}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">{row.monthLabel}</td>
                                  <td className="px-3 py-2">{fmtBRL(row.balStart)}</td>
                                  <td className="px-3 py-2 text-green-600 dark:text-green-400">{fmtBRL(row.amort)}</td>
                                  <td className="px-3 py-2 text-red-500">{fmtBRL(row.interest)}</td>
                                  <td className="px-3 py-2 font-semibold">{fmtBRL(row.parcelaTotal)}</td>
                                  <td className="px-3 py-2">{fmtBRL(row.balEnd)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200 text-xs">
                          <span className="text-text-secondary">
                            Parcelas {tablePage * PAGE + 1}–{Math.min((tablePage + 1) * PAGE, base.rows.length)} de {base.rows.length}
                          </span>
                          <div className="flex gap-2">
                            <button disabled={tablePage === 0} onClick={() => setTablePage(p => p - 1)}
                              className="px-3 py-1 rounded-lg border border-surface-200 disabled:opacity-40 hover:bg-surface-100 transition-colors">← Anterior</button>
                            <span className="px-2 py-1 text-text-secondary">{tablePage + 1}/{totalPages}</span>
                            <button disabled={tablePage === totalPages - 1} onClick={() => setTablePage(p => p + 1)}
                              className="px-3 py-1 rounded-lg border border-surface-200 disabled:opacity-40 hover:bg-surface-100 transition-colors">Próxima →</button>
                          </div>
                        </div>
                      )}

                      {isCaixa && (
                        <p className="text-xs text-center text-text-secondary py-2 italic border-t border-surface-200">
                          (a+j) é constante em todo o contrato · MIP e DFI decrescem com o saldo devedor
                          {extraValue > 0 && ` · ★ Parcela ${extraMonth} = mês da amortização extra`}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </PremiumCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:p-2, .print\\:p-2 * { visibility: visible; }
          @page { margin: 1cm; }
        }
      `}</style>
    </div>
  );
}
