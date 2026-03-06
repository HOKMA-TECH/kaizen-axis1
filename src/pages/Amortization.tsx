import { useState, useEffect, useMemo, useCallback } from 'react';
import { SectionHeader, PremiumCard } from '@/components/ui/PremiumComponents';
import {
  Calculator, DollarSign, Percent, Clock, TrendingDown,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Printer,
  ArrowRight, Home, Wallet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

/* ─────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────── */
type System = 'SAC' | 'PRICE';

interface TableRow {
  k: number;
  balStart: number;
  amort: number;
  interest: number;
  installment: number;
  balEnd: number;
  isExtra?: boolean;
}

interface BaseResult {
  monthlyRate: number;
  firstInstallment: number;
  lastInstallment: number;
  totalInterest: number;
  totalPaid: number;
  rows: TableRow[];
  pmt: number; // for PRICE: fixed PMT; for SAC: fixed amortization value (A)
}

interface ExtraResult {
  extraMonth: number;
  balanceAfterExtra: number;
  installmentBeforeExtra: number;
  remainingBefore: number;
  // Option A — reduce term
  optA: {
    newMonths: number;
    savedMonths: number;
    savedYears: number;
    nextInstallment: number;
    totalInterestSaved: number;
  };
  // Option B — reduce installment
  optB: {
    newInstallment: number;
    reduction: number;
    totalInterestSaved: number;
    newMonthlyAmort?: number; // SAC only
    newPmt?: number;          // PRICE only
  };
}

/* ─────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────── */
const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const parseNum = (s: string): number => {
  const cleaned = s.replace(/[^\d,]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

const formatInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const monthlyRate = (annualPct: number) =>
  Math.pow(1 + annualPct / 100, 1 / 12) - 1;

/* ─────────────────────────────────────────────────────────────────
   CORE CALCULATION
───────────────────────────────────────────────────────────────── */
function calcBase(pv: number, rate: number, n: number, sys: System): BaseResult {
  const i = monthlyRate(rate);
  const sacA = pv / n;
  const pricePmt =
    sys === 'PRICE'
      ? pv * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1)
      : 0;

  const rows: TableRow[] = [];
  let balance = pv;
  let totalInterest = 0;
  let totalPaid = 0;
  let firstInst = 0;
  let lastInst = 0;

  for (let k = 1; k <= n; k++) {
    const balStart = balance;
    const interest = balStart * i;
    let amort: number, installment: number;

    if (sys === 'SAC') {
      amort = Math.min(sacA, balStart);
      installment = amort + interest;
    } else {
      installment = pricePmt;
      amort = installment - interest;
      if (amort > balStart) { amort = balStart; installment = amort + interest; }
    }

    const balEnd = Math.max(0, balStart - amort);
    rows.push({ k, balStart, amort, interest, installment, balEnd });
    totalInterest += interest;
    totalPaid += installment;
    if (k === 1) firstInst = installment;
    if (k === n || balEnd < 0.01) { lastInst = installment; break; }
    balance = balEnd;
  }

  return {
    monthlyRate: i,
    firstInstallment: firstInst,
    lastInstallment: lastInst,
    totalInterest,
    totalPaid,
    rows,
    pmt: sys === 'PRICE' ? pricePmt : sacA,
  };
}

function calcExtra(
  base: BaseResult,
  n: number,
  sys: System,
  extraMonth: number,
  extraValue: number,
  i: number,
  maxInstForPrice = 0
): ExtraResult | null {
  if (extraMonth < 1 || extraMonth >= n || extraValue <= 0) return null;
  const row = base.rows[extraMonth - 1];
  if (!row) return null;

  const balAfterParcela = row.balEnd;
  const balanceAfterExtra = Math.max(0, balAfterParcela - extraValue);
  const remainingBefore = n - extraMonth;
  // SAC: actual installment at month M (decreasing over time)
  // PRICE: use client's max capacity (renda×30%) as the "before" reference for Card B display
  const installmentBeforeExtra =
    sys === 'PRICE' && maxInstForPrice > 0 ? maxInstForPrice : row.installment;

  let optA: ExtraResult['optA'];
  let optB: ExtraResult['optB'];

  if (sys === 'SAC') {
    const sacA = base.pmt; // constant amortization

    // Option A — keep installment ~same (same A), reduce term
    const newMonthsA = Math.ceil(balanceAfterExtra / sacA);
    const savedMonths = remainingBefore - newMonthsA;
    const nextInstA = sacA + balanceAfterExtra * i;

    // Total interest A
    let intA = 0;
    let b = balanceAfterExtra;
    for (let k = 0; k < newMonthsA && b > 0.01; k++) {
      intA += b * i;
      b -= Math.min(sacA, b);
    }
    // Total interest B (remaining with original term)
    let intOrigRem = 0;
    let bOrig = balAfterParcela;
    for (let k = 0; k < remainingBefore && bOrig > 0.01; k++) {
      intOrigRem += bOrig * i;
      bOrig -= Math.min(sacA, bOrig);
    }
    const savedIntA = intOrigRem - intA;

    optA = {
      newMonths: newMonthsA,
      savedMonths,
      savedYears: parseFloat((savedMonths / 12).toFixed(1)),
      nextInstallment: nextInstA,
      totalInterestSaved: savedIntA,
    };

    // Option B — keep term, reduce installment
    const newSacA = balanceAfterExtra / remainingBefore;
    const nextInstB = newSacA + balanceAfterExtra * i;
    // Redução medida contra Opt A (parcela do próximo mês caso escolha Opt A)
    const reduction = nextInstA - nextInstB;

    let intB = 0;
    let bB = balanceAfterExtra;
    for (let k = 0; k < remainingBefore && bB > 0.01; k++) {
      intB += bB * i;
      bB -= Math.min(newSacA, bB);
    }

    optB = {
      newInstallment: nextInstB,
      reduction,
      totalInterestSaved: intOrigRem - intB,
      newMonthlyAmort: newSacA,
    };
  } else {
    // PRICE — installment is fixed throughout = base.pmt (the computed PMT).
    // This is the reference for both options.
    const pmt = base.pmt;

    // Option A — keep paying same PMT, finish earlier
    const newMonthsA = Math.ceil(
      Math.log(pmt / (pmt - balanceAfterExtra * i)) / Math.log(1 + i)
    );
    const savedMonths = remainingBefore - newMonthsA;

    let intA = 0;
    let bA = balanceAfterExtra;
    for (let k = 0; k < newMonthsA && bA > 0.01; k++) {
      const jk = bA * i;
      intA += jk;
      bA -= Math.min(pmt - jk, bA);
    }
    let intOrigRem = 0;
    let bOrig = balAfterParcela;
    for (let k = 0; k < remainingBefore && bOrig > 0.01; k++) {
      const jk = bOrig * i;
      intOrigRem += jk;
      bOrig -= Math.min(pmt - jk, bOrig);
    }

    optA = {
      newMonths: newMonthsA,
      savedMonths,
      savedYears: parseFloat((savedMonths / 12).toFixed(1)),
      nextInstallment: pmt,
      totalInterestSaved: intOrigRem - intA,
    };

    // Option B — same term, lower PMT
    const newPmt =
      balanceAfterExtra *
      (i * Math.pow(1 + i, remainingBefore)) /
      (Math.pow(1 + i, remainingBefore) - 1);
    // Reduction: client was budgeting up to maxInstForPrice; new PMT is the savings
    const priceRef = maxInstForPrice > 0 ? maxInstForPrice : pmt;
    const reduction = priceRef - newPmt;

    let intB = 0;
    let bB = balanceAfterExtra;
    for (let k = 0; k < remainingBefore && bB > 0.01; k++) {
      const jk = bB * i;
      intB += jk;
      bB -= Math.min(newPmt - jk, bB);
    }

    optB = {
      newInstallment: newPmt,
      reduction,
      totalInterestSaved: intOrigRem - intB,
      newPmt,
    };
  }

  return {
    extraMonth,
    balanceAfterExtra,
    installmentBeforeExtra,
    remainingBefore,
    optA,
    optB,
  };
}

/* ─────────────────────────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────────────────────────── */
function MetricCard({
  label, value, sub, highlight, warn, green,
}: {
  label: string; value: string; sub?: string;
  highlight?: boolean; warn?: boolean; green?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 border ${highlight ? 'bg-gold-50 dark:bg-gold-900/20 border-gold-200 dark:border-gold-800/30'
      : warn ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20'
        : green ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20'
          : 'bg-surface-100 border-surface-200'
      }`}>
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-gold-700 dark:text-gold-400'
        : warn ? 'text-red-600 dark:text-red-400'
          : green ? 'text-green-700 dark:text-green-400'
            : 'text-text-primary'
        }`}>{value}</p>
      {sub && <p className="text-xs text-text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}

function InputField({
  label, icon: Icon, value, onChange, placeholder, hint, suffix, readOnly, highlight,
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  hint?: string;
  suffix?: string;
  readOnly?: boolean;
  highlight?: boolean;
}) {
  const inputClass = `w-full p-3 rounded-xl border ${readOnly
    ? 'bg-surface-100 dark:bg-surface-200 border-surface-200 font-semibold text-text-primary cursor-default'
    : highlight
      ? 'bg-gold-50 dark:bg-gold-900/10 border-gold-300 dark:border-gold-700 focus:ring-2 focus:ring-gold-400 outline-none'
      : 'bg-surface-50 dark:bg-surface-100 border-surface-200 focus:ring-2 focus:ring-gold-400 focus:border-transparent outline-none'
    } text-text-primary transition-all text-sm`;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
        <Icon size={13} className="text-gold-500" /> {label}
      </label>
      <div className="relative">
        <input
          className={inputClass}
          value={value}
          readOnly={readOnly}
          placeholder={placeholder}
          onChange={e => onChange?.(e.target.value)}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-xs text-text-secondary">{hint}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────────── */
export default function Amortization() {
  // ── Raw inputs (currency mask)
  const [pvRaw, setPvRaw] = useState('30000000'); // R$ 300.000,00 = 30000000 cents
  const [pvFinRaw, setPvFinRaw] = useState('24000000'); // Valor financiado (default 80%)
  const [rdRaw, setRdRaw] = useState('800000');   // R$ 8.000,00
  const [annualRateStr, setAnnualRateStr] = useState('11.71');
  const [monthsStr, setMonthsStr] = useState('360');
  const [system, setSystem] = useState<System>('SAC');
  const [extraMonthStr, setExtraMonthStr] = useState('24');
  const [extraValRaw, setExtraValRaw] = useState('1000000'); // R$ 10.000,00

  // ── UI
  const [showTable, setShowTable] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const PAGE = 24;

  // Formatted display values (two-decimal masked)
  const pvDisplay    = useMemo(() => formatInput(pvRaw),    [pvRaw]);
  const pvFinDisplay = useMemo(() => formatInput(pvFinRaw), [pvFinRaw]);
  const rdDisplay    = useMemo(() => formatInput(rdRaw),    [rdRaw]);
  const extraDisplay = useMemo(() => formatInput(extraValRaw), [extraValRaw]);

  // Quando o valor do imóvel muda, sugere automaticamente 80% como financiado
  useEffect(() => {
    const propVal = parseNum(pvDisplay);
    if (propVal > 0) setPvFinRaw(String(Math.round(propVal * 0.8 * 100)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvRaw]);

  const handleCurrencyChange = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string>>) =>
      (v: string) => setter(v.replace(/\D/g, '')),
    []
  );

  // ── Derived auto-calculated values
  const propertyValue = useMemo(() => parseNum(pvDisplay),    [pvDisplay]);
  const pv            = useMemo(() => parseNum(pvFinDisplay), [pvFinDisplay]); // valor financiado
  const downPayment   = useMemo(() => Math.max(0, propertyValue - pv), [propertyValue, pv]); // recursos próprios
  const renda = useMemo(() => parseNum(rdDisplay), [rdDisplay]);
  const maxInstallment = useMemo(() => renda * 0.3, [renda]);
  const annualRate = useMemo(() => parseFloat(annualRateStr) || 0, [annualRateStr]);
  const n = useMemo(() => Math.max(60, Math.min(420, parseInt(monthsStr) || 360)), [monthsStr]);
  const extraMonth = useMemo(() => parseInt(extraMonthStr) || 0, [extraMonthStr]);
  const extraValue = useMemo(() => parseNum(extraDisplay), [extraDisplay]);

  // ── Base simulation
  const base = useMemo(() => {
    if (pv < 1000 || annualRate < 1 || n < 1) return null;
    return calcBase(pv, annualRate, n, system);
  }, [pv, annualRate, n, system]);

  // ── Extra simulation
  const extra = useMemo(() => {
    if (!base || extraMonth < 1 || extraValue <= 0) return null;
    return calcExtra(base, n, system, extraMonth, extraValue, base.monthlyRate, maxInstallment);
  }, [base, n, system, extraMonth, extraValue, maxInstallment]);

  const incomeOk = base ? base.firstInstallment <= maxInstallment : null;

  // ── Limites operacionais da Caixa (SBPE 2025) ─────────────────────────────
  const limitWarnings: string[] = [];
  if (pv > 0 && pv < 80_000)
    limitWarnings.push(`Valor financiado mínimo: R$ 80.000,00 (atual: ${fmtBRL(pv)})`);
  if (pv > 1_500_000)
    limitWarnings.push(`Valor financiado máximo (SBPE): R$ 1.500.000,00 (atual: ${fmtBRL(pv)})`);
  if (annualRate > 0 && annualRate < 3.0)
    limitWarnings.push(`Taxa muito baixa: ${annualRate}% a.a. Verifique o valor informado.`);

  // Reset table page on new simulation
  useEffect(() => setTablePage(0), [base]);

  // Table with extra row highlighted
  const tableRows = useMemo(() => {
    if (!base) return [];
    return base.rows.map(r => ({ ...r, isExtra: r.k === extraMonth && extraValue > 0 }));
  }, [base, extraMonth, extraValue]);

  const pagedRows = tableRows.slice(tablePage * PAGE, (tablePage + 1) * PAGE);
  const totalPages = Math.ceil(tableRows.length / PAGE);

  const inputClass = "w-full p-3 bg-surface-50 dark:bg-surface-100 rounded-xl border border-surface-200 focus:ring-2 focus:ring-gold-400 focus:border-transparent outline-none text-text-primary text-sm transition-all";
  const labelClass = "text-xs font-medium text-text-secondary flex items-center gap-1.5 mb-1";

  return (
    <div className="p-4 md:p-6 pb-28 min-h-screen bg-surface-50 print:p-2 print:pb-2">
      <SectionHeader
        title="Simulador Caixa"
        subtitle="Financiamento Imobiliário — SAC & PRICE"
      />

      <div className="space-y-5">
        {/* ── FORM ── */}
        <PremiumCard className="p-5 space-y-5">
          {/* Dados do Imóvel */}
          <div>
            <h3 className="font-bold text-text-primary flex items-center gap-2 mb-3 text-sm">
              <Home size={16} className="text-gold-500" /> Dados do Imóvel e Renda
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Valor do Imóvel */}
              <div>
                <label className={labelClass}><DollarSign size={13} className="text-gold-500" /> Valor do Imóvel (R$)</label>
                <input
                  className={inputClass}
                  value={pvDisplay}
                  onChange={e => handleCurrencyChange(setPvRaw)(e.target.value)}
                  placeholder="300.000,00"
                />
              </div>

              {/* Renda */}
              <div>
                <label className={labelClass}><Wallet size={13} className="text-gold-500" /> Renda Bruta Mensal (R$)</label>
                <input
                  className={inputClass}
                  value={rdDisplay}
                  onChange={e => handleCurrencyChange(setRdRaw)(e.target.value)}
                  placeholder="8.000,00"
                />
              </div>

              {/* Valor Financiado — editável */}
              <div>
                <label className={labelClass}><DollarSign size={13} className="text-gold-500" /> Valor Financiado (R$)</label>
                <input
                  className={inputClass}
                  value={pvFinDisplay}
                  onChange={e => handleCurrencyChange(setPvFinRaw)(e.target.value)}
                  placeholder="240.000,00"
                />
                <p className="text-xs text-text-secondary mt-0.5">Sugerido: 80% do imóvel. Edite se necessário.</p>
              </div>

              {/* Recursos Próprios — calculado */}
              <div className="rounded-xl border border-surface-200 bg-surface-100 p-3">
                <p className="text-xs text-text-secondary font-medium mb-1">Recursos Próprios (Entrada)</p>
                <p className="font-bold text-text-primary">{downPayment > 0 ? fmtBRL(downPayment) : '—'}</p>
                {propertyValue > 0 && pv > 0 && (
                  <p className="text-xs text-text-secondary mt-0.5">
                    {fmtBRL(propertyValue)} − {fmtBRL(pv)} = {fmtBRL(downPayment)}
                  </p>
                )}
              </div>

              <div className={`rounded-xl border p-3 sm:col-span-2 flex items-center justify-between ${base && incomeOk === false
                ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30'
                : base && incomeOk
                  ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30'
                  : 'bg-surface-100 border-surface-200'
                }`}>
                <div>
                  <p className="text-xs text-text-secondary font-medium mb-0.5">Parcela Máxima (30% da renda)</p>
                  <p className="font-bold text-text-primary">{maxInstallment > 0 ? fmtBRL(maxInstallment) : '—'}</p>
                </div>
                {base && (
                  <div className="flex items-center gap-2">
                    {incomeOk ? (
                      <><CheckCircle2 size={18} className="text-green-500" /><span className="text-xs text-green-700 dark:text-green-400 font-semibold">Renda adequada ✅</span></>
                    ) : (
                      <><AlertTriangle size={18} className="text-red-500" /><span className="text-xs text-red-700 dark:text-red-400 font-semibold">Renda insuficiente ⚠️</span></>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-surface-200" />

          {/* Condições */}
          <div>
            <h3 className="font-bold text-text-primary flex items-center gap-2 mb-3 text-sm">
              <Calculator size={16} className="text-gold-500" /> Condições do Financiamento
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelClass}><Percent size={13} className="text-gold-500" /> Taxa (% a.a.)</label>
                <input
                  type="number" step="0.01" className={inputClass}
                  value={annualRateStr}
                  onChange={e => setAnnualRateStr(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}><Clock size={13} className="text-gold-500" /> Prazo (meses)</label>
                <input
                  type="number" min={60} max={420} className={inputClass}
                  value={monthsStr}
                  onChange={e => setMonthsStr(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className={labelClass}><Calculator size={13} className="text-gold-500" /> Sistema de Amortização</label>
                <div className="flex gap-2">
                  {(['SAC', 'PRICE'] as System[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setSystem(s)}
                      className={`flex-1 p-2.5 rounded-xl text-sm font-semibold border transition-all ${system === s
                        ? 'bg-gold-400 text-white border-gold-400 shadow-md shadow-gold-400/20'
                        : 'bg-surface-50 dark:bg-surface-100 border-surface-200 text-text-secondary hover:border-gold-300'
                        }`}
                    >
                      {s}
                      <span className="block text-xs font-normal opacity-75">
                        {s === 'SAC' ? 'Parcelas decr.' : 'Parcelas fixas'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-surface-200" />

          {/* Amortização Extra */}
          <div>
            <h3 className="font-bold text-text-primary flex items-center gap-2 mb-3 text-sm">
              <TrendingDown size={16} className="text-gold-500" /> Amortização Extra (opcional)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}><Clock size={13} className="text-gold-500" /> Após qual parcela?</label>
                <input
                  type="number" min={1} max={n - 1} className={inputClass}
                  value={extraMonthStr}
                  onChange={e => setExtraMonthStr(e.target.value)}
                  placeholder="24"
                />
                <p className="text-xs text-text-secondary mt-0.5">Mês em que o pagamento extra ocorre</p>
              </div>
              <div>
                <label className={labelClass}><DollarSign size={13} className="text-gold-500" /> Valor Extra (R$)</label>
                <input
                  className={inputClass}
                  value={extraDisplay}
                  onChange={e => handleCurrencyChange(setExtraValRaw)(e.target.value)}
                  placeholder="10.000,00"
                />
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
              {/* Summary Cards */}
              <PremiumCard className="p-5">
                <h3 className="font-bold text-text-primary flex items-center gap-2 mb-4 text-sm">
                  <CheckCircle2 size={16} className="text-gold-500" /> Resumo do Financiamento
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <MetricCard label="Valor do Imóvel" value={fmtBRL(propertyValue)} />
                  <MetricCard label="Recursos Próprios" value={fmtBRL(downPayment)} />
                  <MetricCard label="Valor Financiado" value={fmtBRL(pv)} highlight />
                  <MetricCard
                    label="Parcela Máxima (30% renda)"
                    value={maxInstallment > 0 ? fmtBRL(maxInstallment) : '—'}
                  />
                  <MetricCard
                    label="1ª Parcela"
                    value={fmtBRL(base.firstInstallment)}
                    sub={`Taxa mensal: ${(base.monthlyRate * 100).toFixed(4)}%`}
                    highlight={incomeOk === true}
                    warn={incomeOk === false}
                  />
                  <MetricCard label="Última Parcela" value={fmtBRL(base.lastInstallment)} />
                  <MetricCard label="Total de Juros" value={fmtBRL(base.totalInterest)} warn />
                  <MetricCard
                    label="Total Pago"
                    value={fmtBRL(base.totalPaid)}
                    sub={`em ${base.rows.length} parcelas`}
                  />
                </div>

                {/* Operational limits alerts */}
                {limitWarnings.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {limitWarnings.map((w, i) => (
                      <div key={i} className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 p-3 flex items-start gap-2">
                        <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Composição da 1ª parcela */}
                {base && base.rows.length > 0 && (() => {
                  const r = base.rows[0];
                  const pctAmort = (r.amort / r.installment) * 100;
                  const pctJuros = (r.interest / r.installment) * 100;
                  return (
                    <div className="mt-3 rounded-xl bg-surface-100 border border-surface-200 p-3">
                      <p className="text-xs font-semibold text-text-secondary mb-2">Composição da 1ª Parcela</p>
                      <div className="flex gap-0 rounded-lg overflow-hidden h-3 mb-2">
                        <div className="bg-green-500 transition-all" style={{ width: `${pctAmort}%` }} />
                        <div className="bg-red-400 transition-all" style={{ width: `${pctJuros}%` }} />
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
                          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                          Amortização {pctAmort.toFixed(1)}% ({fmtBRL(r.amort)})
                        </span>
                        <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                          Juros {pctJuros.toFixed(1)}% ({fmtBRL(r.interest)})
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Income alert */}
                {incomeOk === false && (
                  <div className="mt-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 p-3 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-400">
                      A 1ª parcela de <strong>{fmtBRL(base.firstInstallment)}</strong> ultrapassa o limite máximo de 30% da renda
                      ({fmtBRL(maxInstallment)}). A Caixa pode reprovar o financiamento. Considere aumentar a renda, reduzir o valor ou estender o prazo.
                    </p>
                  </div>
                )}
              </PremiumCard>

              {/* ── Extra Amortization Options ── */}
              {extra && (
                <div className="space-y-3">
                  <div className="px-1">
                    <h3 className="font-bold text-text-primary flex items-center gap-2 text-sm">
                      <TrendingDown size={16} className="text-gold-500" />
                      Análise da Amortização Extra — {fmtBRL(extraValue)} após a parcela {extra.extraMonth}
                    </h3>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Saldo devedor após amortização: <strong className="text-text-primary">{fmtBRL(extra.balanceAfterExtra)}</strong>
                      {' '}· Parcelas restantes originais: <strong className="text-text-primary">{extra.remainingBefore}</strong>
                    </p>
                  </div>

                  {/* Regra de Ouro — SAC only */}
                  {system === 'SAC' && (
                    <div className="mx-0 rounded-xl bg-gold-50 dark:bg-gold-900/20 border border-gold-200 dark:border-gold-800/30 p-3 flex items-start gap-2">
                      <span className="text-gold-500 text-base flex-shrink-0">★</span>
                      <p className="text-xs text-gold-700 dark:text-gold-400">
                        <strong>Regra de Ouro:</strong> A cada{' '}
                        <strong>{fmtBRL(base!.pmt)}</strong> de amortização extra, uma parcela é
                        eliminada do contrato — sem pagar os juros correspondentes.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Opção A */}
                    <PremiumCard className="p-4 border-blue-200 dark:border-blue-800/30 bg-blue-50 dark:bg-blue-900/10">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">A</div>
                        <div>
                          <p className="font-bold text-blue-800 dark:text-blue-300 text-sm">Reduzir o Prazo</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400">Mantém o valor da parcela atual</p>
                        </div>
                      </div>

                      <div className="text-center my-4">
                        <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Parcelas economizadas</p>
                        <p className="text-4xl font-black text-blue-700 dark:text-blue-300">
                          {extra.optA.savedMonths}
                        </p>
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
                        <div className="flex justify-between">
                          <span className="text-blue-600 dark:text-blue-400 text-xs">Próxima parcela</span>
                          <span className="font-medium text-text-primary">{fmtBRL(extra.optA.nextInstallment)}</span>
                        </div>
                        <div className="flex justify-between border-t border-blue-200 dark:border-blue-800/30 pt-2 mt-2">
                          <span className="text-blue-600 dark:text-blue-400 text-xs font-semibold">Economia em juros</span>
                          <span className="font-bold text-green-600 dark:text-green-400">{fmtBRL(extra.optA.totalInterestSaved)}</span>
                        </div>
                      </div>
                    </PremiumCard>

                    {/* Opção B */}
                    <PremiumCard className="p-4 border-orange-200 dark:border-orange-800/30 bg-orange-50 dark:bg-orange-900/10">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">B</div>
                        <div>
                          <p className="font-bold text-orange-800 dark:text-orange-300 text-sm">Reduzir a Parcela</p>
                          <p className="text-xs text-orange-600 dark:text-orange-400">Mantém o prazo original ({extra.remainingBefore} meses)</p>
                        </div>
                      </div>

                      <div className="text-center my-4">
                        <p className="text-xs text-orange-600 dark:text-orange-400 mb-1">Nova parcela mensal</p>
                        <p className="text-3xl font-black text-orange-700 dark:text-orange-300">
                          {fmtBRL(extra.optB.newInstallment)}
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
                          <span className="text-orange-600 dark:text-orange-400 text-xs">Parcela antes da amortização</span>
                          <span className="font-medium text-text-primary">{fmtBRL(extra.installmentBeforeExtra)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-orange-600 dark:text-orange-400 text-xs">Nova parcela</span>
                          <span className="font-bold text-orange-700 dark:text-orange-300">{fmtBRL(extra.optB.newInstallment)}</span>
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
                    <span className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center text-gold-500">
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
                        <table className="w-full text-xs text-left min-w-[640px]">
                          <thead className="text-xs text-text-secondary uppercase bg-surface-100 dark:bg-surface-200">
                            <tr>
                              {['Nº', 'Saldo Inicial', 'Amortização', 'Juros', 'Prestação', 'Saldo Final'].map(h => (
                                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pagedRows.map(row => {
                              const isFirstLast = row.k === 1 || row.k === base.rows.length;
                              const isYearMark = row.k % 12 === 0;
                              return (
                                <tr
                                  key={row.k}
                                  className={`border-b border-surface-100 dark:border-surface-200 last:border-0 ${row.isExtra
                                    ? 'bg-amber-50 dark:bg-amber-900/20'
                                    : isFirstLast
                                      ? 'bg-gold-50 dark:bg-gold-900/10'
                                      : isYearMark
                                        ? 'bg-blue-50 dark:bg-blue-900/10'
                                        : 'hover:bg-surface-100 dark:hover:bg-surface-200'
                                    }`}
                                >
                                  <td className="px-3 py-2 font-medium">
                                    {row.isExtra ? '★ ' : ''}{row.k}
                                  </td>
                                  <td className="px-3 py-2">{fmtBRL(row.balStart)}</td>
                                  <td className="px-3 py-2 text-green-600 dark:text-green-400">{fmtBRL(row.amort)}</td>
                                  <td className="px-3 py-2 text-red-500">{fmtBRL(row.interest)}</td>
                                  <td className="px-3 py-2 font-semibold">{fmtBRL(row.installment)}</td>
                                  <td className="px-3 py-2">{fmtBRL(row.balEnd)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200 text-xs">
                          <span className="text-text-secondary">
                            Parcelas {tablePage * PAGE + 1}–{Math.min((tablePage + 1) * PAGE, base.rows.length)} de {base.rows.length}
                          </span>
                          <div className="flex gap-2">
                            <button
                              disabled={tablePage === 0}
                              onClick={() => setTablePage(p => p - 1)}
                              className="px-3 py-1 rounded-lg border border-surface-200 disabled:opacity-40 hover:bg-surface-100 transition-colors"
                            >← Anterior</button>
                            <span className="px-2 py-1 text-text-secondary">{tablePage + 1}/{totalPages}</span>
                            <button
                              disabled={tablePage === totalPages - 1}
                              onClick={() => setTablePage(p => p + 1)}
                              className="px-3 py-1 rounded-lg border border-surface-200 disabled:opacity-40 hover:bg-surface-100 transition-colors"
                            >Próxima →</button>
                          </div>
                        </div>
                      )}

                      {extraValue > 0 && (
                        <p className="text-xs text-center text-text-secondary py-2 italic border-t border-surface-200">
                          ★ Parcela {extraMonth} — mês da amortização extra de {fmtBRL(extraValue)}
                          {' '}· 🟡 Marcos anuais · 🟡 1ª e última parcela
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

      {/* Print styles */}
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
