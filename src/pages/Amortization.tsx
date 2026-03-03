import { useState, useCallback } from 'react';
import { SectionHeader, PremiumCard, RoundedButton } from '@/components/ui/PremiumComponents';
import {
  Calculator, Calendar, DollarSign, Percent, Clock, ArrowRight,
  TrendingDown, CheckCircle2, FileText, ChevronDown, ChevronUp,
  AlertTriangle, Download, BarChart2, Home, Shield, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

/* ─────────────────────────── TYPES ─────────────────────────── */
interface TableRow {
  month: number;
  date: Date;
  balanceStart: number;
  amortization: number;
  interest: number;
  mip: number;
  dfi: number;
  adminFee: number;
  totalInstallment: number;
  balanceEnd: number;
}

interface SimResult {
  loanAmount: number;
  monthlyRate: number;
  nominalAnnualRate: number;
  effectiveAnnualRate: number;
  cetAnual: number;
  firstInstallment: number;
  lastInstallment: number;
  totalPaid: number;
  totalInterest: number;
  totalInsurance: number;
  incomeCommitment: number;
  rows: TableRow[];
  comparePrice: { totalPaid: number; totalInterest: number; firstInstallment: number } | null;
  compareSac: { totalPaid: number; totalInterest: number; firstInstallment: number } | null;
}

/* ─────────────────────────── HELPERS ─────────────────────────── */
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '%';

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function monthlyFromAnnual(annualRate: number) {
  return Math.pow(1 + annualRate / 100, 1 / 12) - 1;
}

/** Compute CET monthly via Newton-Raphson on NPV=0 */
function computeCET(pv: number, cashflows: number[]): number {
  let r = 0.01;
  for (let iter = 0; iter < 200; iter++) {
    let npv = -pv;
    let dnpv = 0;
    for (let k = 1; k <= cashflows.length; k++) {
      const denom = Math.pow(1 + r, k);
      npv += cashflows[k - 1] / denom;
      dnpv -= k * cashflows[k - 1] / Math.pow(1 + r, k + 1);
    }
    const newR = r - npv / dnpv;
    if (Math.abs(newR - r) < 1e-10) { r = newR; break; }
    r = newR;
  }
  return Math.max(0, r);
}

function buildSchedule(
  loanAmount: number,
  monthlyRate: number,
  months: number,
  system: 'SAC' | 'PRICE',
  startDate: Date,
  mipRate: number,
  dfiRate: number,
  propertyValue: number,
  adminFee: number,
  trMonthly: number,
): TableRow[] {
  const rows: TableRow[] = [];
  let balance = loanAmount;

  const sacAmort = loanAmount / months;
  const pricePmt = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);

  for (let k = 1; k <= months; k++) {
    const balanceStart = balance;

    // Apply TR correction to balance
    const correctedBalance = balanceStart * (1 + trMonthly);

    const interest = correctedBalance * monthlyRate;
    let amortization: number;
    let installment: number;

    if (system === 'SAC') {
      amortization = sacAmort;
      installment = amortization + interest;
    } else {
      // PRICE: fixed installment (recalculated if TR > 0 it applies to balance)
      installment = pricePmt;
      amortization = installment - interest;
      if (amortization > correctedBalance) {
        amortization = correctedBalance;
        installment = amortization + interest;
      }
    }

    const mip = correctedBalance * mipRate;
    const dfi = propertyValue * dfiRate;
    const total = installment + mip + dfi + adminFee;

    const balanceEnd = Math.max(0, correctedBalance - amortization);
    balance = balanceEnd;

    const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + k, 1);
    rows.push({
      month: k,
      date: monthDate,
      balanceStart,
      amortization,
      interest,
      mip,
      dfi,
      adminFee,
      totalInstallment: total,
      balanceEnd,
    });

    if (balance <= 0.01) break;
  }
  return rows;
}

function runSimulation(params: {
  propertyValue: number;
  downPayment: number;
  months: number;
  annualRate: number;
  system: 'SAC' | 'PRICE';
  startDate: Date;
  trMonthly: number;
  mipRate: number;
  dfiRate: number;
  adminFee: number;
  familyIncome: number;
  compareMode: boolean;
}): SimResult | null {
  const {
    propertyValue, downPayment, months, annualRate,
    system, startDate, trMonthly, mipRate, dfiRate, adminFee, familyIncome, compareMode
  } = params;

  const loanAmount = propertyValue - downPayment;
  const monthlyRate = monthlyFromAnnual(annualRate);
  const nominalAnnualRate = annualRate;
  const effectiveAnnualRate = (Math.pow(1 + monthlyRate, 12) - 1) * 100;

  const rows = buildSchedule(
    loanAmount, monthlyRate, months, system, startDate,
    mipRate / 100, dfiRate / 100, propertyValue, adminFee, trMonthly / 100
  );

  if (rows.length === 0) return null;

  const firstInstallment = rows[0].totalInstallment;
  const lastInstallment = rows[rows.length - 1].totalInstallment;
  const totalPaid = rows.reduce((s, r) => s + r.totalInstallment, 0);
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  const totalInsurance = rows.reduce((s, r) => s + r.mip + r.dfi, 0);
  const incomeCommitment = familyIncome > 0 ? (firstInstallment / familyIncome) * 100 : 0;

  // CET
  const cashflows = rows.map(r => r.totalInstallment);
  const cetMonthly = computeCET(loanAmount, cashflows);
  const cetAnual = (Math.pow(1 + cetMonthly, 12) - 1) * 100;

  // Compare with other system for compare mode
  let comparePrice: SimResult['comparePrice'] = null;
  let compareSac: SimResult['compareSac'] = null;

  if (compareMode) {
    const otherSystem = system === 'SAC' ? 'PRICE' : 'SAC';
    const otherRows = buildSchedule(
      loanAmount, monthlyRate, months, otherSystem, startDate,
      mipRate / 100, dfiRate / 100, propertyValue, adminFee, trMonthly / 100
    );
    const otherTotal = otherRows.reduce((s, r) => s + r.totalInstallment, 0);
    const otherInterest = otherRows.reduce((s, r) => s + r.interest, 0);
    const otherFirst = otherRows[0]?.totalInstallment ?? 0;

    if (system === 'SAC') {
      comparePrice = { totalPaid: otherTotal, totalInterest: otherInterest, firstInstallment: otherFirst };
    } else {
      compareSac = { totalPaid: otherTotal, totalInterest: otherInterest, firstInstallment: otherFirst };
    }
  }

  return {
    loanAmount,
    monthlyRate,
    nominalAnnualRate,
    effectiveAnnualRate,
    cetAnual,
    firstInstallment,
    lastInstallment,
    totalPaid,
    totalInterest,
    totalInsurance,
    incomeCommitment,
    rows,
    comparePrice,
    compareSac,
  };
}

/* ─────────────────────────── CHART COMPONENT ─────────────────────────── */
function MiniChart({ rows }: { rows: TableRow[] }) {
  if (rows.length === 0) return null;

  const W = 600, H = 180;
  const pad = { top: 10, right: 10, bottom: 30, left: 60 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;

  const maxBalance = rows[0].balanceStart;

  // Sample max 60 points for performance
  const stride = Math.max(1, Math.floor(rows.length / 60));
  const sampled = rows.filter((_, i) => i % stride === 0 || i === rows.length - 1);

  const px = (i: number) => pad.left + (i / (sampled.length - 1)) * cw;
  const py = (v: number) => pad.top + ch - (v / maxBalance) * ch;

  const balancePath = sampled.map((r, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(r.balanceEnd).toFixed(1)}`).join(' ');
  const areaPath = `${balancePath} L${px(sampled.length - 1).toFixed(1)},${(pad.top + ch).toFixed(1)} L${pad.left.toFixed(1)},${(pad.top + ch).toFixed(1)} Z`;

  // Interest area
  const maxInstallment = rows[0].totalInstallment;
  const interestH = H * 0.6;
  const interestPy = (v: number) => H - 5 - (v / maxInstallment) * interestH;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 280 }} aria-label="Evolução do saldo devedor">
        <defs>
          <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Y grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = pad.top + ch * (1 - f);
          return (
            <g key={f}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4 4" />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#9CA3AF">{fmt(maxBalance * f).replace('R$\u00a0', '')}</text>
            </g>
          );
        })}
        {/* Balance area */}
        <path d={areaPath} fill="url(#balanceGrad)" />
        <path d={balancePath} fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" />
        {/* X labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const idx = Math.round(f * (sampled.length - 1));
          const r = sampled[idx];
          if (!r) return null;
          const x = px(idx);
          return <text key={f} x={x} y={H - 5} textAnchor="middle" fontSize="9" fill="#9CA3AF">Mês {r.month}</text>;
        })}
        <text x={pad.left - 55} y={pad.top + ch / 2} textAnchor="middle" fontSize="9" fill="#9CA3AF" transform={`rotate(-90, ${pad.left - 55}, ${pad.top + ch / 2})`}>Saldo (R$)</text>
      </svg>
    </div>
  );
}

/* ─────────────────────────── STACK CHART ─────────────────────────── */
function StackChart({ rows }: { rows: TableRow[] }) {
  if (rows.length === 0) return null;

  const W = 600, H = 160;
  const pad = { top: 10, right: 10, bottom: 30, left: 60 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;

  const stride = Math.max(1, Math.floor(rows.length / 60));
  const sampled = rows.filter((_, i) => i % stride === 0 || i === rows.length - 1);

  const maxTotal = Math.max(...sampled.map(r => r.totalInstallment));
  const px = (i: number) => pad.left + (i / (sampled.length - 1)) * cw;

  const pyVal = (v: number) => pad.top + ch - (v / maxTotal) * ch;

  const amortPath = sampled.map((r, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${pyVal(r.amortization).toFixed(1)}`).join(' ');
  const interestPath = sampled.map((r, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${pyVal(r.interest).toFixed(1)}`).join(' ');

  const baseY = pad.top + ch;
  const amortArea = `${amortPath} L${px(sampled.length - 1).toFixed(1)},${baseY} L${pad.left},${baseY} Z`;
  const interestArea = `${interestPath} L${px(sampled.length - 1).toFixed(1)},${baseY} L${pad.left},${baseY} Z`;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 280 }} aria-label="Composição da parcela">
        <defs>
          <linearGradient id="amortGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="interestGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EF4444" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#EF4444" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map(f => {
          const y = pad.top + ch * (1 - f);
          return <line key={f} x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4 4" />;
        })}
        <path d={interestArea} fill="url(#interestGrad)" />
        <path d={interestPath} fill="none" stroke="#EF4444" strokeWidth="1.5" />
        <path d={amortArea} fill="url(#amortGrad)" />
        <path d={amortPath} fill="none" stroke="#22C55E" strokeWidth="1.5" />
        {/* Legend */}
        <rect x={pad.left} y={pad.top} width={10} height={10} fill="#22C55E" rx="2" />
        <text x={pad.left + 14} y={pad.top + 9} fontSize="9" fill="#9CA3AF">Amortização</text>
        <rect x={pad.left + 80} y={pad.top} width={10} height={10} fill="#EF4444" rx="2" />
        <text x={pad.left + 94} y={pad.top + 9} fontSize="9" fill="#9CA3AF">Juros</text>
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const idx = Math.round(f * (sampled.length - 1));
          const r = sampled[idx];
          if (!r) return null;
          return <text key={f} x={px(idx)} y={H - 5} textAnchor="middle" fontSize="9" fill="#9CA3AF">Mês {r.month}</text>;
        })}
      </svg>
    </div>
  );
}

/* ─────────────────────────── MAIN COMPONENT ─────────────────────────── */
export default function Amortization() {
  // ── Inputs
  const [propertyValueStr, setPropertyValueStr] = useState('500000');
  const [downPaymentStr, setDownPaymentStr] = useState('100000');
  const [months, setMonths] = useState('360');
  const [annualRateStr, setAnnualRateStr] = useState('10.99');
  const [system, setSystem] = useState<'SAC' | 'PRICE'>('SAC');
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`;
  });
  const [trStr, setTrStr] = useState('0');
  const [mipRateStr, setMipRateStr] = useState('0.036');
  const [dfiRateStr, setDfiRateStr] = useState('0.025');
  const [adminFeeStr, setAdminFeeStr] = useState('25');
  const [familyIncomeStr, setFamilyIncomeStr] = useState('15000');
  const [compareMode, setCompareMode] = useState(false);

  // ── UI State
  const [result, setResult] = useState<SimResult | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const PAGE_SIZE = 24;

  const validate = useCallback((): string[] => {
    const errs: string[] = [];
    const pv = parseNum(propertyValueStr);
    const dp = parseNum(downPaymentStr);
    const loan = pv - dp;
    const n = parseInt(months);
    const rate = parseNum(annualRateStr);

    if (dp <= 0) errs.push('Entrada deve ser maior que zero.');
    if (pv <= 0) errs.push('Valor do imóvel deve ser maior que zero.');
    if (dp >= pv) errs.push('Entrada deve ser menor que o valor do imóvel.');
    if (dp < pv * 0.20) errs.push(`Entrada mínima é de 20% do valor do imóvel (${fmt(pv * 0.20)}).`);
    if (loan < 80000) errs.push(`Valor financiado mínimo é R$ 80.000. Atual: ${fmt(loan)}.`);
    if (loan > 1500000) errs.push(`Valor financiado máximo é R$ 1.500.000. Atual: ${fmt(loan)}.`);
    if (n < 60) errs.push('Prazo mínimo: 60 meses.');
    if (n > 420) errs.push('Prazo máximo: 420 meses.');
    if (rate < 5) errs.push('Taxa de juros mínima: 5% a.a.');
    if (rate > 30) errs.push('Taxa de juros parece muito alta. Verifique.');

    return errs;
  }, [propertyValueStr, downPaymentStr, months, annualRateStr]);

  const handleSimulate = () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) return;

    const pv = parseNum(propertyValueStr);
    const dp = parseNum(downPaymentStr);
    const res = runSimulation({
      propertyValue: pv,
      downPayment: dp,
      months: parseInt(months),
      annualRate: parseNum(annualRateStr),
      system,
      startDate: new Date(startDate + 'T00:00:00'),
      trMonthly: parseNum(trStr),
      mipRate: parseNum(mipRateStr),
      dfiRate: parseNum(dfiRateStr),
      adminFee: parseNum(adminFeeStr),
      familyIncome: parseNum(familyIncomeStr),
      compareMode,
    });
    setResult(res);
    setShowTable(false);
    setShowCharts(false);
    setTablePage(0);
  };

  const handleClear = () => {
    setResult(null);
    setErrors([]);
    setShowTable(false);
    setShowCharts(false);
  };

  // ── Export to CSV (Excel-compatible)
  const exportCSV = () => {
    if (!result) return;
    const header = 'Nº Parcela;Data;Saldo Devedor Inicial;Amortização;Juros;MIP;DFI;Taxa Admin;Parcela Total;Saldo Devedor Final\n';
    const body = result.rows.map(r =>
      [
        r.month,
        r.date.toLocaleDateString('pt-BR'),
        r.balanceStart.toFixed(2),
        r.amortization.toFixed(2),
        r.interest.toFixed(2),
        r.mip.toFixed(2),
        r.dfi.toFixed(2),
        r.adminFee.toFixed(2),
        r.totalInstallment.toFixed(2),
        r.balanceEnd.toFixed(2),
      ].join(';')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amortizacao_${system}_${months}meses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Export PDF via print
  const exportPDF = () => {
    window.print();
  };

  const incomeWarning = result && result.incomeCommitment > 30;
  const incomeDanger = result && result.incomeCommitment > 35;

  const loanAmount = Math.max(0, parseNum(propertyValueStr) - parseNum(downPaymentStr));

  const pagedRows = result ? result.rows.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE) : [];
  const totalPages = result ? Math.ceil(result.rows.length / PAGE_SIZE) : 0;

  const inputClass = "w-full p-3 bg-surface-50 dark:bg-surface-100 rounded-xl border border-surface-200 dark:border-surface-200 focus:ring-2 focus:ring-gold-400 dark:focus:ring-gold-600 focus:border-transparent outline-none text-text-primary transition-all";
  const labelClass = "text-sm font-medium text-text-secondary flex items-center gap-2";

  return (
    <div className="p-4 md:p-6 pb-24 min-h-screen bg-surface-50">
      <SectionHeader
        title="Simulador de Financiamento"
        subtitle="Caixa Econômica Federal — SAC & PRICE"
      />

      <div className="space-y-5">
        {/* ── Form Card ── */}
        <PremiumCard className="p-5 space-y-6">
          {/* Section: Dados do Imóvel */}
          <div>
            <h3 className="font-bold text-text-primary flex items-center gap-2 mb-4">
              <Home size={18} className="text-gold-500" /> Dados do Imóvel
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><DollarSign size={15} className="text-gold-500" /> Valor do Imóvel (R$)</label>
                <input type="number" value={propertyValueStr} onChange={e => setPropertyValueStr(e.target.value)} className={inputClass} placeholder="500000" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><DollarSign size={15} className="text-gold-500" /> Entrada / Recursos Próprios (R$)</label>
                <input type="number" value={downPaymentStr} onChange={e => setDownPaymentStr(e.target.value)} className={inputClass} placeholder="100000" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><DollarSign size={15} className="text-gold-500" /> Valor Financiado (R$)</label>
                <div className="w-full p-3 bg-surface-100 dark:bg-surface-200 rounded-xl border border-surface-200 text-text-primary font-semibold">
                  {loanAmount > 0 ? fmt(loanAmount) : '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-surface-200" />

          {/* Section: Condições do Financiamento */}
          <div>
            <h3 className="font-bold text-text-primary flex items-center gap-2 mb-4">
              <Calculator size={18} className="text-gold-500" /> Condições do Financiamento
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><Clock size={15} className="text-gold-500" /> Prazo (meses, máx 420)</label>
                <input type="number" value={months} onChange={e => setMonths(e.target.value)} min={60} max={420} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><Percent size={15} className="text-gold-500" /> Taxa de Juros Nominal (% a.a.)</label>
                <input type="number" value={annualRateStr} onChange={e => setAnnualRateStr(e.target.value)} step="0.01" className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><Calendar size={15} className="text-gold-500" /> Data da 1ª Parcela</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><Calculator size={15} className="text-gold-500" /> Sistema de Amortização</label>
                <select value={system} onChange={e => setSystem(e.target.value as 'SAC' | 'PRICE')} className={inputClass + ' appearance-none'}>
                  <option value="SAC">SAC — Parcelas Decrescentes</option>
                  <option value="PRICE">PRICE — Parcelas Fixas</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><TrendingDown size={15} className="text-gold-500" /> TR Estimada (% a.m.)</label>
                <input type="number" value={trStr} onChange={e => setTrStr(e.target.value)} step="0.01" className={inputClass} placeholder="0.00" />
                <p className="text-xs text-text-secondary">0% = cenário conservador</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><DollarSign size={15} className="text-gold-500" /> Renda Familiar Bruta (R$)</label>
                <input type="number" value={familyIncomeStr} onChange={e => setFamilyIncomeStr(e.target.value)} className={inputClass} placeholder="15000" />
              </div>
            </div>
          </div>

          <div className="border-t border-surface-200" />

          {/* Section: Seguros e Taxas */}
          <div>
            <h3 className="font-bold text-text-primary flex items-center gap-2 mb-4">
              <Shield size={18} className="text-gold-500" /> Seguros e Taxas Obrigatórias
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><Shield size={15} className="text-gold-500" /> MIP (% a.m. sobre saldo devedor)</label>
                <input type="number" value={mipRateStr} onChange={e => setMipRateStr(e.target.value)} step="0.001" className={inputClass} />
                <p className="text-xs text-text-secondary">Ex: 0.036 = 0,036% a.m.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><Shield size={15} className="text-gold-500" /> DFI (% a.m. sobre valor do imóvel)</label>
                <input type="number" value={dfiRateStr} onChange={e => setDfiRateStr(e.target.value)} step="0.001" className={inputClass} />
                <p className="text-xs text-text-secondary">Ex: 0.025 = 0,025% a.m.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}><DollarSign size={15} className="text-gold-500" /> Taxa de Administração (R$/mês)</label>
                <input type="number" value={adminFeeStr} onChange={e => setAdminFeeStr(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Compare mode toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCompareMode(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${compareMode ? 'bg-gold-400' : 'bg-surface-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${compareMode ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-text-secondary">Comparar com o outro sistema ({system === 'SAC' ? 'PRICE' : 'SAC'})</span>
          </div>

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 p-4 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <RoundedButton onClick={handleSimulate} className="flex-1 flex items-center justify-center gap-2">
              Simular <ArrowRight size={18} />
            </RoundedButton>
            <RoundedButton variant="secondary" onClick={handleClear} className="sm:w-auto flex items-center gap-2">
              <RefreshCw size={16} /> Limpar
            </RoundedButton>
          </div>
        </PremiumCard>

        {/* ── Results ── */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              {/* Income warning */}
              {result.incomeCommitment > 0 && (
                <div className={`rounded-xl border p-4 flex items-start gap-3 ${incomeDanger
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30'
                  : incomeWarning
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30'
                  }`}>
                  <AlertTriangle size={18} className={incomeDanger ? 'text-red-500 mt-0.5' : incomeWarning ? 'text-amber-500 mt-0.5' : 'text-green-500 mt-0.5'} />
                  <div>
                    <p className={`text-sm font-semibold ${incomeDanger ? 'text-red-700 dark:text-red-400' : incomeWarning ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                      Comprometimento de renda: {result.incomeCommitment.toFixed(1)}%
                    </p>
                    <p className="text-xs mt-0.5 text-text-secondary">
                      {incomeDanger
                        ? 'Acima do limite máximo de 35%. Financiamento pode ser recusado pela Caixa.'
                        : incomeWarning
                          ? 'Acima de 30%. Caixa pode exigir renda familiar acima de R$ 12.000.'
                          : 'Dentro dos limites da Caixa (máx 30% ou 35%).'}
                    </p>
                  </div>
                </div>
              )}

              {/* Summary Cards */}
              <PremiumCard className="p-5">
                <h3 className="font-bold text-text-primary flex items-center gap-2 mb-4">
                  <CheckCircle2 size={18} className="text-gold-500" /> Resumo do Financiamento
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Valor Financiado', value: fmt(result.loanAmount) },
                    { label: 'Taxa Mensal (efetiva)', value: fmtPct(result.monthlyRate * 100) },
                    { label: 'Taxa Anual Efetiva', value: fmtPct(result.effectiveAnnualRate) },
                    { label: 'CET Estimado (a.a.)', value: fmtPct(result.cetAnual) },
                    { label: '1ª Parcela Total', value: fmt(result.firstInstallment), highlight: true },
                    { label: 'Última Parcela', value: fmt(result.lastInstallment) },
                    { label: 'Total Pago', value: fmt(result.totalPaid) },
                    { label: 'Total de Juros', value: fmt(result.totalInterest), warn: true },
                    { label: 'Total de Seguros', value: fmt(result.totalInsurance) },
                    { label: 'Comprometimento de Renda', value: result.incomeCommitment > 0 ? `${result.incomeCommitment.toFixed(1)}%` : '—' },
                    { label: 'Número de Parcelas', value: `${result.rows.length} meses` },
                    { label: 'Sistema', value: system },
                  ].map(({ label, value, highlight, warn }) => (
                    <div key={label} className={`rounded-xl p-3 border ${highlight ? 'bg-gold-50 dark:bg-gold-900/20 border-gold-200 dark:border-gold-800/30' : warn ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20' : 'bg-surface-100 dark:bg-surface-100 border-surface-200'}`}>
                      <p className="text-xs text-text-secondary mb-1">{label}</p>
                      <p className={`text-sm font-bold ${highlight ? 'text-gold-700 dark:text-gold-400' : warn ? 'text-red-600 dark:text-red-400' : 'text-text-primary'}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </PremiumCard>

              {/* Compare */}
              {compareMode && (result.comparePrice || result.compareSac) && (
                <PremiumCard className="p-5">
                  <h3 className="font-bold text-text-primary flex items-center gap-2 mb-4">
                    <BarChart2 size={18} className="text-gold-500" /> Comparativo SAC × PRICE
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    {/* Headers */}
                    <div />
                    <div className="font-semibold text-center text-text-secondary bg-surface-100 rounded-lg p-2">
                      {system} (selecionado)
                    </div>
                    <div className="font-semibold text-center text-text-secondary bg-surface-100 rounded-lg p-2">
                      {system === 'SAC' ? 'PRICE' : 'SAC'}
                    </div>

                    {[
                      ['1ª Parcela', fmt(result.firstInstallment), fmt((result.comparePrice || result.compareSac)!.firstInstallment)],
                      ['Total Pago', fmt(result.totalPaid), fmt((result.comparePrice || result.compareSac)!.totalPaid)],
                      ['Total Juros', fmt(result.totalInterest), fmt((result.comparePrice || result.compareSac)!.totalInterest)],
                    ].map(([lbl, v1, v2]) => (
                      <>
                        <div key={lbl + 'l'} className="font-medium text-text-secondary flex items-center">{lbl}</div>
                        <div key={lbl + 'v1'} className="text-center font-bold text-text-primary bg-gold-50 dark:bg-gold-900/10 rounded-lg p-2">{v1}</div>
                        <div key={lbl + 'v2'} className="text-center font-bold text-text-primary bg-surface-100 rounded-lg p-2">{v2}</div>
                      </>
                    ))}
                  </div>
                </PremiumCard>
              )}

              {/* Charts */}
              <PremiumCard className="overflow-hidden">
                <button
                  onClick={() => setShowCharts(v => !v)}
                  className="w-full p-4 flex items-center justify-between hover:bg-surface-100 dark:hover:bg-surface-200 transition-colors"
                >
                  <div className="flex items-center gap-2 font-semibold text-text-primary">
                    <BarChart2 size={18} className="text-gold-500" /> Gráficos
                  </div>
                  {showCharts ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <AnimatePresence>
                  {showCharts && (
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-5 space-y-6">
                        <div>
                          <p className="text-sm font-semibold text-text-secondary mb-2">Evolução do Saldo Devedor</p>
                          <MiniChart rows={result.rows} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text-secondary mb-2">Composição da Parcela (Juros vs Amortização)</p>
                          <StackChart rows={result.rows} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </PremiumCard>

              {/* Table */}
              <PremiumCard className="overflow-hidden">
                <div className="p-4 flex items-center justify-between flex-wrap gap-2">
                  <button
                    onClick={() => setShowTable(v => !v)}
                    className="flex items-center gap-2 font-semibold text-text-primary"
                  >
                    <FileText size={18} className="text-gold-500" /> Tabela de Amortização ({result.rows.length} parcelas)
                    {showTable ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={exportCSV}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/30 hover:bg-green-100 transition-colors"
                    >
                      <Download size={14} /> Excel (CSV)
                    </button>
                    <button
                      onClick={exportPDF}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/30 hover:bg-red-100 transition-colors"
                    >
                      <Download size={14} /> PDF
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {showTable && (
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left min-w-[860px]">
                          <thead className="text-xs text-text-secondary uppercase bg-surface-100 dark:bg-surface-200 sticky top-0">
                            <tr>
                              <th className="px-3 py-2">Nº</th>
                              <th className="px-3 py-2">Data</th>
                              <th className="px-3 py-2">Saldo Inicial</th>
                              <th className="px-3 py-2 text-green-600 dark:text-green-400">Amortização</th>
                              <th className="px-3 py-2 text-red-500">Juros</th>
                              <th className="px-3 py-2">MIP</th>
                              <th className="px-3 py-2">DFI</th>
                              <th className="px-3 py-2">Tx. Admin</th>
                              <th className="px-3 py-2 font-bold">Parcela Total</th>
                              <th className="px-3 py-2">Saldo Final</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedRows.map((row, idx) => {
                              const absIdx = tablePage * PAGE_SIZE + idx;
                              const isFirst = absIdx === 0;
                              const isLast = absIdx === result.rows.length - 1;
                              const isYearMark = row.month % 12 === 0;
                              return (
                                <tr
                                  key={row.month}
                                  className={`border-b border-surface-100 dark:border-surface-200 last:border-0 ${isFirst || isLast ? 'bg-gold-50 dark:bg-gold-900/10' : isYearMark ? 'bg-blue-50 dark:bg-blue-900/10' : 'hover:bg-surface-100 dark:hover:bg-surface-200'}`}
                                >
                                  <td className="px-3 py-2 font-medium">{row.month}</td>
                                  <td className="px-3 py-2">{row.date.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}</td>
                                  <td className="px-3 py-2">{fmt(row.balanceStart)}</td>
                                  <td className="px-3 py-2 text-green-600 dark:text-green-400">{fmt(row.amortization)}</td>
                                  <td className="px-3 py-2 text-red-500">{fmt(row.interest)}</td>
                                  <td className="px-3 py-2 text-orange-500">{fmt(row.mip)}</td>
                                  <td className="px-3 py-2 text-orange-400">{fmt(row.dfi)}</td>
                                  <td className="px-3 py-2">{fmt(row.adminFee)}</td>
                                  <td className="px-3 py-2 font-bold">{fmt(row.totalInstallment)}</td>
                                  <td className="px-3 py-2">{fmt(row.balanceEnd)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200">
                          <p className="text-xs text-text-secondary">
                            Mostrando parcelas {tablePage * PAGE_SIZE + 1}–{Math.min((tablePage + 1) * PAGE_SIZE, result.rows.length)} de {result.rows.length}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setTablePage(p => Math.max(0, p - 1))}
                              disabled={tablePage === 0}
                              className="px-3 py-1 text-xs rounded-lg border border-surface-200 disabled:opacity-40 hover:bg-surface-100 transition-colors"
                            >
                              ← Anterior
                            </button>
                            <span className="px-3 py-1 text-xs text-text-secondary">
                              {tablePage + 1} / {totalPages}
                            </span>
                            <button
                              onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))}
                              disabled={tablePage === totalPages - 1}
                              className="px-3 py-1 text-xs rounded-lg border border-surface-200 disabled:opacity-40 hover:bg-surface-100 transition-colors"
                            >
                              Próxima →
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </PremiumCard>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
