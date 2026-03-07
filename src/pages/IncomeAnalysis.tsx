import { useState, useRef, useMemo, useCallback } from 'react';
import { PremiumCard, RoundedButton, SectionHeader } from '@/components/ui/PremiumComponents';
import {
  UploadCloud, CheckCircle2, AlertTriangle, FileText,
  RefreshCw, Download, ChevronRight, Loader2, XCircle,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { Modal } from '@/components/ui/Modal';
import { useApp } from '@/context/AppContext';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ClassTag = 'aposta' | 'washtrading' | 'renda_familiar' | 'customizado' | null;

interface TransacaoDetalhada {
  id: string;
  data: string;
  mes: string;
  descricao: string;
  valor: number;  // centavos
  classificacao: string;
  is_validated: boolean;
  custom_tag: ClassTag;
  motivoExclusao?: string;
}

interface ResultadoApuracao {
  algoritmoVersao: string;
  totalApurado: number;
  mediaMensalReal: number;
  divisao6Meses: number;
  divisao12Meses: number;
  maiorMes: number;
  menorMes: number;
  mesesConsiderados: number;
  totalPorMes: Record<string, number>;
  transacoesConsideradas: number;
  transacoesIgnoradas: number;
  transacoesDetalhadas: TransacaoDetalhada[];
  criteriosAplicados: {
    excluiuAutoTransferencia: boolean;
    excluiuTransferenciaPais: boolean;
    excluiuApostas: boolean;
    excluiuWashTrading: boolean;
    modoConservadorInteligente: boolean;
    customKeywordsUsadas: string[];
  };
  auditoria: { hashPdf: string; timestamp: string };
  avisos: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const brl = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100);

const API_URL = '/api/apuracao';
const MAX_WORKERS = 4;

// Badge config por tag
const TAG_CONFIG: Record<NonNullable<ClassTag>, { label: string; color: string; icon: string }> = {
  aposta: { label: '🚫 Aposta', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: '🚫' },
  washtrading: { label: '🔄 Passagem', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: '🔄' },
  renda_familiar: { label: '⚠️ Renda Familiar', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: '⚠️' },
  customizado: { label: '✅ Keyword Custom', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: '✅' },
};

// ─── OCR Paralelo com Web Workers ─────────────────────────────────────────────

async function ocrParalelo(
  pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>,
  onProgress: (msg: string) => void,
): Promise<string> {
  onProgress(`PDF escaneado — iniciando OCR paralelo (${pdf.numPages} pág.)…`);

  // Renderiza todas as páginas como ImageData (main thread, pdfjs precisa do DOM)
  const pageDataList: { imageData: ImageData; width: number; height: number; pageNum: number }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress(`Renderizando página ${i}/${pdf.numPages}…`);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    pageDataList.push({
      imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
      width: canvas.width, height: canvas.height, pageNum: i,
    });
  }

  // Processa até MAX_WORKERS páginas em paralelo
  const resultados: Record<number, string> = {};
  onProgress(`OCR em progresso (${Math.min(pdf.numPages, MAX_WORKERS)} workers paralelos)…`);

  // Processa em lotes de MAX_WORKERS
  for (let base = 0; base < pageDataList.length; base += MAX_WORKERS) {
    const lote = pageDataList.slice(base, base + MAX_WORKERS);
    await Promise.all(lote.map(({ imageData, width, height, pageNum }) =>
      new Promise<void>((resolve) => {
        // Importa o worker via URL estática — compatível com Vite bundler
        const worker = new Worker(
          new URL('../workers/tesseractWorker.ts', import.meta.url),
          { type: 'module' }
        );
        worker.onmessage = (e: MessageEvent<{ pageNum: number; text: string }>) => {
          resultados[e.data.pageNum] = e.data.text;
          worker.terminate();
          resolve();
        };
        worker.onerror = () => { resultados[pageNum] = ''; worker.terminate(); resolve(); };
        worker.postMessage({ imageData, width, height, pageNum }, [imageData.data.buffer]);
      })
    ));
    onProgress(`OCR: ${Math.min(base + MAX_WORKERS, pdf.numPages)}/${pdf.numPages} páginas concluídas…`);
  }

  return Object.keys(resultados)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => resultados[Number(k)])
    .join('\n');
}

// ─── Extração de Texto com Detecção de Colunas ───────────────────────────────

async function extrairTextoPdf(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<{ texto: string; hashPdf: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashPdf = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`;
  const STANDARD_FONT_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`;

  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer, cMapUrl: CMAP_URL, cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_URL, useSystemFonts: true,
  }).promise;

  const paginas: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    const content = await pagina.getTextContent();
    const viewport = pagina.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width;

    // ── Detecção de colunas via histograma X ──────────────────────────────────
    // Agrupa items por X para detectar se há bimodalidade (2 colunas)
    const xBuckets: Record<number, number> = {};
    for (const item of content.items) {
      const x = Math.round((item as any).transform[4] / (pageWidth / 10)) * (pageWidth / 10);
      xBuckets[x] = (xBuckets[x] ?? 0) + 1;
    }
    const xVals = Object.keys(xBuckets).map(Number).sort((a, b) => a - b);
    // Detecta gap > 30% da largura da página → layout de 2 colunas
    let splitX = -1;
    for (let j = 1; j < xVals.length; j++) {
      if (xVals[j] - xVals[j - 1] > pageWidth * 0.30) {
        splitX = (xVals[j - 1] + xVals[j]) / 2;
        break;
      }
    }

    // ── Reconstrução de linhas com tolerância Y adaptativa ────────────────────
    // Tolerância maior (5px) para layouts densos; fallback a 2px se linha resultar sem valor
    const Y_TOLERANCE = 5;

    function reconstruirLinhas(items: typeof content.items): string[] {
      let ultimoY: number | null = null;
      let linhaAtual = '';
      const linhas: string[] = [];
      for (const item of items) {
        const textItem = item as { str: string; transform: number[] };
        const y = Math.round(textItem.transform[5]);
        if (ultimoY !== null && Math.abs(y - ultimoY) > Y_TOLERANCE) {
          if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
          linhaAtual = textItem.str;
        } else {
          linhaAtual += (linhaAtual && textItem.str ? ' ' : '') + textItem.str;
        }
        ultimoY = y;
      }
      if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
      return linhas;
    }

    let linhas: string[];
    if (splitX > 0) {
      // Processa cada coluna separadamente e concatena
      const col1 = content.items.filter(it => (it as any).transform[4] <= splitX);
      const col2 = content.items.filter(it => (it as any).transform[4] > splitX);
      linhas = [...reconstruirLinhas(col1), ...reconstruirLinhas(col2)];
    } else {
      linhas = reconstruirLinhas(content.items);
    }

    paginas.push(linhas.join('\n'));
  }

  let texto = paginas.join('\n');

  // OCR paralelo se o PDF for escaneado
  if (!texto.trim() && onProgress) {
    texto = await ocrParalelo(pdf, onProgress);
  }

  return { texto, hashPdf };
}

// ─── Componente AccordionMes ──────────────────────────────────────────────────

function AccordionMes({
  mes, total, transacoes, validadas, onToggle,
}: {
  mes: string;
  total: number;
  transacoes: TransacaoDetalhada[];
  validadas: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const alertCount = transacoes.filter(t => t.custom_tag).length;
  const totalAtivo = transacoes
    .filter(t => validadas.has(t.id))
    .reduce((acc, t) => acc + t.valor, 0);

  return (
    <div className="rounded-2xl overflow-hidden border border-surface-100 bg-white dark:bg-surface-100 shadow-sm">
      {/* Header */}
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center justify-between p-4 hover:bg-surface-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-text-primary text-sm">{mes}</span>
          {alertCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">
              {alertCount} alerta{alertCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-text-primary text-sm">{brl(totalAtivo)}</span>
          {aberto ? <ChevronUp size={16} className="text-text-secondary" /> : <ChevronDown size={16} className="text-text-secondary" />}
        </div>
      </button>

      {/* Body */}
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-surface-100">
              {transacoes.map(t => {
                const ativa = validadas.has(t.id);
                const tagCfg = t.custom_tag ? TAG_CONFIG[t.custom_tag] : null;
                return (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between px-4 py-2.5 border-b border-surface-50 last:border-0 transition-colors ${ativa ? 'bg-white dark:bg-surface-100' : 'bg-surface-50 dark:bg-surface-200 opacity-50'
                      }`}
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <button
                        onClick={() => onToggle(t.id)}
                        className="flex-shrink-0 text-gold-500 hover:text-gold-700 transition-colors"
                        title={ativa ? 'Excluir do cálculo' : 'Incluir no cálculo'}
                      >
                        {ativa
                          ? <ToggleRight size={22} className="text-green-500" />
                          : <ToggleLeft size={22} className="text-surface-400" />}
                      </button>
                      <div className="min-w-0">
                        <p className="text-xs text-text-primary truncate max-w-[180px]">{t.descricao}</p>
                        <p className="text-[10px] text-text-secondary">{t.data}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {tagCfg && (
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${tagCfg.color}`}>
                          {tagCfg.label}
                        </span>
                      )}
                      <span className={`font-mono text-xs font-medium ${ativa ? 'text-green-600' : 'text-surface-400'}`}>
                        {brl(t.valor)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function IncomeAnalysis() {
  const { clients, updateClient, user } = useApp();

  // Form state
  const [nomeCliente, setNomeCliente] = useState('');
  const [cpf, setCpf] = useState('');
  const [nomeMae, setNomeMae] = useState('');
  const [nomePai, setNomePai] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [customKeywordsRaw, setCustomKeywordsRaw] = useState('');
  const [clienteVinculado, setClienteVinculado] = useState<string>('');

  // UX state
  const [step, setStep] = useState<1 | 2>(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoApuracao | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showFinalModal, setShowFinalModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Estado de validação reativo ────────────────────────────────────────────
  const [validadas, setValidadas] = useState<Set<string>>(new Set());

  const toggleValidada = useCallback((id: string) => {
    setValidadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Recálculo reativo baseado nos toggles ──────────────────────────────────
  const { totalPorMesAtivo, totalApuradoAtivo, mediaMensalAtiva, maiorMesAtivo, menorMesAtivo, mesesAtivos } = useMemo(() => {
    if (!resultado) return { totalPorMesAtivo: {}, totalApuradoAtivo: 0, mediaMensalAtiva: 0, maiorMesAtivo: 0, menorMesAtivo: 0, mesesAtivos: 0 };
    const porMes: Record<string, number> = {};
    for (const t of resultado.transacoesDetalhadas) {
      if (validadas.has(t.id)) {
        porMes[t.mes] = (porMes[t.mes] ?? 0) + t.valor;
      }
    }
    const vals = Object.values(porMes);
    const total = vals.reduce((a, b) => a + b, 0);
    const meses = vals.length;
    return {
      totalPorMesAtivo: porMes,
      totalApuradoAtivo: total,
      mediaMensalAtiva: meses > 0 ? Math.round(total / meses) : 0,
      maiorMesAtivo: vals.length ? Math.max(...vals) : 0,
      menorMesAtivo: vals.length ? Math.min(...vals) : 0,
      mesesAtivos: meses,
    };
  }, [resultado, validadas]);

  // ── Agrupa transações válidas por mês para o Accordion ────────────────────
  const transacoesPorMes = useMemo(() => {
    if (!resultado) return {};
    const grupos: Record<string, TransacaoDetalhada[]> = {};
    for (const t of resultado.transacoesDetalhadas) {
      const isAtivavel = ['credito_valido', 'possivel_vinculo_familiar', 'possivel_renda_familiar'].includes(t.classificacao);
      if (!isAtivavel) continue;
      if (!grupos[t.mes]) grupos[t.mes] = [];
      grupos[t.mes].push(t);
    }
    return grupos;
  }, [resultado]);

  // ── CPF mask ──────────────────────────────────────────────────────────────
  const handleCpf = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    const masked = d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
    setCpf(masked);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => f.type === 'application/pdf');
    if (files.length === 0) { setErro('Apenas arquivos PDF são aceitos.'); }
    else { setArquivos(files); setErro(null); }
  };

  const handleAnalyze = async () => {
    if (!nomeCliente.trim()) { setErro('Informe o nome completo do cliente.'); return; }
    if (arquivos.length === 0) { setErro('Selecione pelo menos um arquivo PDF.'); return; }

    setErro(null);
    setIsAnalyzing(true);
    setStatusMsg('');

    try {
      // Extrai e unifica texto de todos os PDFs
      let textoUnificado = '';
      let hashPdfPrimeiro = '';
      for (let i = 0; i < arquivos.length; i++) {
        const arq = arquivos[i];
        setStatusMsg(`Lendo PDF ${i + 1}/${arquivos.length}: ${arq.name}…`);
        const { texto, hashPdf } = await extrairTextoPdf(arq, setStatusMsg);
        if (!texto.trim()) throw new Error(`Não foi possível extrair texto de "${arq.name}". Pode estar corrompido ou protegido.`);
        textoUnificado += '\n' + texto;
        if (i === 0) hashPdfPrimeiro = hashPdf;
      }

      setStatusMsg('Analisando transações…');
      const customKeywords = customKeywordsRaw
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length >= 3);

      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textoExtrato: textoUnificado.trim(),
          hashPdf: hashPdfPrimeiro,
          nomeCliente, cpf: cpf || undefined,
          nomePai: nomePai || undefined, nomeMae: nomeMae || undefined,
          customKeywords: customKeywords.length ? customKeywords : undefined,
        }),
      });

      const json = await resp.json();
      if (!resp.ok) { setErro(json.erro ?? `Erro ${resp.status}`); return; }

      const res = json as ResultadoApuracao;
      setResultado(res);

      // Inicializa toggles: valida automaticamente os créditos válidos
      const initValidadas = new Set<string>(
        res.transacoesDetalhadas.filter(t => t.is_validated).map(t => t.id)
      );
      setValidadas(initValidadas);
      setStep(2);
    } catch (e) {
      setErro(`Falha ao processar: ${e instanceof Error ? e.message : 'Erro desconhecido'}`);
    } finally {
      setIsAnalyzing(false);
      setStatusMsg('');
    }
  };

  const handleNovaAnalise = () => {
    setStep(1); setResultado(null); setErro(null);
    setArquivos([]); setValidadas(new Set());
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFinalizar = async () => {
    if (!resultado) return;
    setIsSaving(true);
    try {
      // Persistência no Supabase via link direto (sem edge function)
      const { supabase } = await import('@/lib/supabase');
      const auditPayload = {
        client_id: clienteVinculado || null,
        created_by: user?.id,
        algoritmo_versao: resultado.algoritmoVersao,
        hash_pdf: resultado.auditoria.hashPdf,
        media_mensal_real: mediaMensalAtiva,
        total_apurado: totalApuradoAtivo,
        meses_considerados: mesesAtivos,
        renda_multiplo: null as number | null,
        resultado_json: {
          ...resultado,
          totalPorMesAtivo,
          mediaMensalAtiva,
          validadas: [...validadas],
        },
        validado_em: new Date().toISOString(),
      };

      // Calcular múltiplo se cliente vinculado
      if (clienteVinculado) {
        const cliente = clients.find(c => c.id === clienteVinculado);
        if (cliente?.intendedValue) {
          const valorPretendido = parseFloat(
            cliente.intendedValue.replace(/[^\d,]/g, '').replace(',', '.')
          ) * 100;
          const parcelaEstimada = valorPretendido / 240; // 20 anos
          if (parcelaEstimada > 0) {
            auditPayload.renda_multiplo = Math.round((mediaMensalAtiva / parcelaEstimada) * 10) / 10;
          }
        }
      }

      await supabase.from('income_audits').insert([auditPayload]);

      // Automação de funil
      if (clienteVinculado) {
        const cliente = clients.find(c => c.id === clienteVinculado);
        if (cliente?.intendedValue) {
          const valorPretendido = parseFloat(
            cliente.intendedValue.replace(/[^\d,]/g, '').replace(',', '.')
          ) * 100;
          const parcelaEstimada = valorPretendido / 240;
          const multiplo = parcelaEstimada > 0 ? mediaMensalAtiva / parcelaEstimada : 0;
          if (multiplo >= 3) {
            await updateClient(clienteVinculado, { stage: 'Aprovado' });
          } else if (multiplo >= 1.5) {
            await updateClient(clienteVinculado, { stage: 'Em Tratativa' });
          }
        }
      }

      setShowFinalModal(false);
      alert('✅ Apuração finalizada e salva com sucesso!');
    } catch (e) {
      alert(`Erro ao salvar: ${e instanceof Error ? e.message : 'Erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCsv = () => {
    if (!resultado) return;
    const fmt = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sep = ';';
    const linhas: string[] = [];
    linhas.push('APURAÇÃO DE RENDA - KAIZEN AXIS');
    linhas.push(`Cliente${sep}${nomeCliente}`);
    linhas.push(`Gerado em${sep}${new Date().toLocaleString('pt-BR')}`);
    linhas.push(`Versão${sep}${resultado.algoritmoVersao}`);
    linhas.push('');
    linhas.push('RESUMO (APÓS REVISÃO MANUAL)');
    linhas.push(`Renda Média Mensal${sep}R$ ${fmt(mediaMensalAtiva)}`);
    linhas.push(`Total Apurado${sep}R$ ${fmt(totalApuradoAtivo)}`);
    linhas.push(`Divisão ÷ 6${sep}R$ ${fmt(Math.round(totalApuradoAtivo / 6))}`);
    linhas.push(`Divisão ÷ 12${sep}R$ ${fmt(Math.round(totalApuradoAtivo / 12))}`);
    linhas.push(`Meses Considerados${sep}${mesesAtivos}`);
    linhas.push('');
    linhas.push('DETALHAMENTO MENSAL');
    linhas.push(`Mês${sep}Total Validado`);
    Object.entries(totalPorMesAtivo)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([mes, valor]) => linhas.push(`${mes}${sep}R$ ${fmt(valor)}`));
    linhas.push('');
    linhas.push('AUDITORIA');
    linhas.push(`Hash PDF${sep}${resultado.auditoria.hashPdf}`);
    linhas.push(`Timestamp${sep}${new Date(resultado.auditoria.timestamp).toLocaleString('pt-BR')}`);
    const csv = '\uFEFF' + linhas.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apuracao_${nomeCliente.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 pb-28 min-h-screen bg-surface-50">
      <SectionHeader title="Apuração de Renda" subtitle="Motor determinístico v3 · Interactive Review" />

      <AnimatePresence mode="wait">
        {/* ─── STEP 1: Formulário ─── */}
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">

            {/* Dados do cliente */}
            <PremiumCard className="space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">Dados do Cliente</h3>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Nome Completo <span className="text-red-500">*</span></label>
                <input type="text" value={nomeCliente} onChange={e => setNomeCliente(e.target.value)}
                  className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary text-sm"
                  placeholder="Ex: João Carlos da Silva" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">CPF <span className="text-text-secondary font-normal ml-1">(opcional — melhora detecção)</span></label>
                <input type="text" value={cpf} onChange={e => handleCpf(e.target.value)}
                  className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary text-sm"
                  placeholder="000.000.000-00" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Nome da Mãe</label>
                  <input type="text" value={nomeMae} onChange={e => setNomeMae(e.target.value)}
                    className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary text-sm"
                    placeholder="Maria da Silva" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Nome do Pai</label>
                  <input type="text" value={nomePai} onChange={e => setNomePai(e.target.value)}
                    className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary text-sm"
                    placeholder="José da Silva" />
                </div>
              </div>

              {/* Keywords customizadas */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Keywords de Aprovação <span className="text-text-secondary font-normal ml-1">(freelancers — separe por vírgula)</span>
                </label>
                <input type="text" value={customKeywordsRaw} onChange={e => setCustomKeywordsRaw(e.target.value)}
                  className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary text-sm"
                  placeholder="Ex: FREELA, PROJETO, CONSULTORIA" />
              </div>

              {/* Vincular cliente */}
              {clients.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Vincular ao Cliente <span className="text-text-secondary font-normal ml-1">(opcional — para salvar e automatizar funil)</span></label>
                  <select value={clienteVinculado} onChange={e => setClienteVinculado(e.target.value)}
                    className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 text-text-primary text-sm">
                    <option value="">Selecionar cliente…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.stage}</option>)}
                  </select>
                </div>
              )}
            </PremiumCard>

            {/* Upload Multi-PDF */}
            <PremiumCard
              className="border-dashed border-2 border-surface-300 flex flex-col items-center py-8 text-center cursor-pointer hover:border-gold-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={handleFileChange} />
              <div className="w-14 h-14 bg-card-bg rounded-full flex items-center justify-center shadow-sm mb-3">
                {arquivos.length > 0 ? <FileText className="text-green-500" size={28} /> : <UploadCloud className="text-gold-500" size={28} />}
              </div>
              {arquivos.length > 0 ? (
                <div>
                  <p className="font-medium text-green-600 text-sm">{arquivos.length} PDF{arquivos.length > 1 ? 's' : ''} selecionado{arquivos.length > 1 ? 's' : ''}</p>
                  <p className="text-xs text-text-secondary mt-1">{arquivos.map(f => f.name).join(', ').slice(0, 60)}… • clique para trocar</p>
                </div>
              ) : (
                <div>
                  <h3 className="font-medium text-text-primary text-sm">Upload de Extrato(s) (PDF)</h3>
                  <p className="text-xs text-text-secondary mt-1 max-w-[220px]">Múltiplos PDFs suportados • Itaú, Bradesco, Nubank, Inter, Mercado Pago, Caixa, BB</p>
                </div>
              )}
            </PremiumCard>

            {erro && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
                <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-600">{erro}</p>
              </div>
            )}

            <RoundedButton fullWidth onClick={handleAnalyze} disabled={isAnalyzing} className="mt-2">
              {isAnalyzing
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Processando…</span>
                : <span className="flex items-center justify-center gap-2">Iniciar Apuração <ChevronRight size={16} /></span>}
            </RoundedButton>

            {isAnalyzing && statusMsg && (
              <p className="text-center text-[11px] text-text-secondary animate-pulse">{statusMsg}</p>
            )}

            <p className="text-center text-[10px] text-text-secondary">
              Algoritmo v3 · Zero IA · OCR multi-thread · Detecção de apostas e wash trading
            </p>
          </motion.div>
        )}

        {/* ─── STEP 2: Resultado com revisão interativa ─── */}
        {step === 2 && resultado && (
          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">

            {/* Avisos */}
            {resultado.avisos.length > 0 && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl flex items-start gap-2">
                <AlertTriangle size={15} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-yellow-700 dark:text-yellow-300">{resultado.avisos.join(' ')}</p>
              </div>
            )}

            {/* Card de destaque — Média REATIVA */}
            <PremiumCard highlight className="text-center py-6">
              <p className="text-xs text-gold-700 dark:text-gold-400 font-medium uppercase tracking-wider">Renda Média Mensal (Revisada)</p>
              <h2 className="text-4xl font-bold text-text-primary mt-2">{brl(mediaMensalAtiva)}</h2>
              <div className="flex items-center justify-center gap-2 mt-2 text-green-600 text-xs font-medium">
                <CheckCircle2 size={14} />
                {mesesAtivos} meses · {[...validadas].length} créditos validados
              </div>
            </PremiumCard>

            {/* Grid de métricas reativas */}
            <div className="grid grid-cols-2 gap-3">
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Total Apurado</p>
                <p className="text-base font-bold text-text-primary mt-1">{brl(totalApuradoAtivo)}</p>
              </PremiumCard>
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Créditos Ativos</p>
                <p className="text-base font-bold text-green-600 mt-1">{[...validadas].length}</p>
              </PremiumCard>
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Divisão ÷ 6</p>
                <p className="text-base font-bold text-text-primary mt-1">{brl(Math.round(totalApuradoAtivo / 6))}</p>
              </PremiumCard>
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Divisão ÷ 12</p>
                <p className="text-base font-bold text-text-primary mt-1">{brl(Math.round(totalApuradoAtivo / 12))}</p>
              </PremiumCard>
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Maior Mês</p>
                <p className="text-base font-bold text-green-600 mt-1">{brl(maiorMesAtivo)}</p>
              </PremiumCard>
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Menor Mês</p>
                <p className="text-base font-bold text-red-500 mt-1">{brl(menorMesAtivo)}</p>
              </PremiumCard>
            </div>

            {/* Accordion por mês */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary px-1 mb-3">
                Revisão por Mês
                <span className="text-xs text-text-secondary font-normal ml-2">— ative/desative cada crédito</span>
              </h3>
              <div className="space-y-2">
                {Object.entries(transacoesPorMes)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([mes, transacoes]) => (
                    <AccordionMes
                      key={mes}
                      mes={mes}
                      total={totalPorMesAtivo[mes] ?? 0}
                      transacoes={transacoes}
                      validadas={validadas}
                      onToggle={toggleValidada}
                    />
                  ))}
              </div>
            </div>

            {/* Critérios */}
            <PremiumCard className="space-y-2">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Critérios Aplicados v3</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  ['Autotransferências excluídas', resultado.criteriosAplicados.excluiuAutoTransferencia],
                  ['Transferências de pais excluídas', resultado.criteriosAplicados.excluiuTransferenciaPais],
                  ['Apostas/jogos excluídos', resultado.criteriosAplicados.excluiuApostas],
                  ['Wash trading detectado', resultado.criteriosAplicados.excluiuWashTrading],
                  ['Modo conservador inteligente', resultado.criteriosAplicados.modoConservadorInteligente],
                  ['Keywords customizadas', (resultado.criteriosAplicados.customKeywordsUsadas?.length ?? 0) > 0],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className={val ? 'text-green-500' : 'text-surface-300'} />
                    <span className="text-[10px] text-text-secondary">{label as string}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-text-secondary pt-1 border-t border-surface-100">
                Hash: <span className="font-mono">{resultado.auditoria.hashPdf.slice(0, 16)}…</span>
                &nbsp;·&nbsp;{new Date(resultado.auditoria.timestamp).toLocaleString('pt-BR')}
                &nbsp;·&nbsp;v{resultado.algoritmoVersao}
              </p>
            </PremiumCard>

            {/* Ações */}
            <div className="grid grid-cols-3 gap-2">
              <RoundedButton variant="outline" onClick={handleNovaAnalise}>
                <RefreshCw size={13} className="mr-1" /> Nova
              </RoundedButton>
              <RoundedButton variant="outline" onClick={handleExportCsv}>
                <Download size={13} className="mr-1" /> CSV
              </RoundedButton>
              <RoundedButton onClick={() => setShowFinalModal(true)}>
                <Save size={13} className="mr-1" /> Finalizar
              </RoundedButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Finalização */}
      <Modal isOpen={showFinalModal} onClose={() => setShowFinalModal(false)} title="Finalizar Apuração">
        <div className="space-y-4">
          <div className="p-4 bg-surface-50 rounded-xl text-center">
            <p className="text-xs text-text-secondary mb-1">Renda Média Mensal Validada</p>
            <p className="text-2xl font-bold text-text-primary">{brl(mediaMensalAtiva)}</p>
            <p className="text-xs text-text-secondary mt-1">{mesesAtivos} meses · {[...validadas].length} créditos</p>
          </div>

          {clienteVinculado && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                ⚡ O stage do cliente será atualizado automaticamente com base no múltiplo de renda.
              </p>
            </div>
          )}

          {!clienteVinculado && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Vincular ao cliente (opcional)</label>
              <select value={clienteVinculado} onChange={e => setClienteVinculado(e.target.value)}
                className="w-full p-3 bg-surface-50 rounded-xl border-none text-text-primary text-sm">
                <option value="">Nenhum</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <RoundedButton fullWidth onClick={handleFinalizar} disabled={isSaving}>
            {isSaving ? <span className="flex items-center gap-2 justify-center"><Loader2 size={14} className="animate-spin" />Salvando…</span> : '✓ Confirmar e Salvar'}
          </RoundedButton>
        </div>
      </Modal>
    </div>
  );
}
