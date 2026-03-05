import { useState, useRef } from 'react';
import { PremiumCard, RoundedButton, SectionHeader } from '@/components/ui/PremiumComponents';
import {
  UploadCloud, CheckCircle2, AlertTriangle, FileText,
  RefreshCw, Download, ChevronRight, Loader2, XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';

// Worker do pdfjs — usa unpkg (reflete o registro npm exatamente) para evitar 404
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ─── Tipos do resultado ────────────────────────────────────────────────────────
interface TransacaoSinalizada {
  descricao: string;
  valor: number;
  mes: string;
  motivo: 'possivel_vinculo_familiar';
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
  transacoesSinalizadas: TransacaoSinalizada[];
  criteriosAplicados: {
    excluiuAutoTransferencia: boolean;
    excluiuTransferenciaPais: boolean;
    modoConservadorInteligente: boolean;
  };
  auditoria: { hashPdf: string; timestamp: string };
  avisos: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const brl = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);

const API_URL = '/api/apuracao';

/**
 * OCR fallback — usa Tesseract.js para extrair texto de PDFs escaneados.
 * Cada página é renderizada como canvas (escala 2×) e passada ao Tesseract.
 * Carregado dinamicamente para não aumentar o bundle inicial.
 */
async function ocrPdf(
  pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>,
  onProgress: (msg: string) => void,
): Promise<string> {
  onProgress(`PDF escaneado — carregando OCR (${pdf.numPages} página(s))...`);

  // Import dinâmico: só carrega o WASM do Tesseract quando necessário
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('por', 1, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: (_: any) => {}, // suprime logs verbosos
  });

  const paginas: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress(`OCR: página ${i} de ${pdf.numPages} (pode demorar)...`);

    const pagina = await pdf.getPage(i);
    const viewport = pagina.getViewport({ scale: 2.0 }); // 2× para melhor precisão

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    await pagina.render({ canvas, canvasContext: ctx, viewport }).promise;

    const { data: { text } } = await worker.recognize(canvas);
    paginas.push(text);
  }

  await worker.terminate();
  return paginas.join('\n');
}

/**
 * Extrai texto de um PDF no browser usando pdfjs-dist.
 * Fallback automático para OCR (Tesseract.js) se o PDF for escaneado.
 */
async function extrairTextoPdf(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<{ texto: string; hashPdf: string }> {
  const arrayBuffer = await file.arrayBuffer();

  // Calcular hash SHA-256 do arquivo original (auditoria)
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashPdf = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Necessário para PDFs de bancos (Bradesco, Caixa, etc.) que usam fontes CID e fontes base14
  const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`;
  const STANDARD_FONT_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`;

  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_URL,
    useSystemFonts: true,
  }).promise;
  const paginas: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    const content = await pagina.getTextContent();

    let ultimoY: number | null = null;
    let linhaAtual = '';
    const linhas: string[] = [];

    for (const item of content.items) {
      const textItem = item as { str: string; transform: number[] };
      const y = Math.round(textItem.transform[5]);

      if (ultimoY !== null && Math.abs(y - ultimoY) > 2) {
        if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
        linhaAtual = textItem.str;
      } else {
        linhaAtual += (linhaAtual && textItem.str ? ' ' : '') + textItem.str;
      }
      ultimoY = y;
    }
    if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
    paginas.push(linhas.join('\n'));
  }

  let texto = paginas.join('\n');

  // ── OCR fallback para PDFs escaneados ──────────────────────────────────────
  if (!texto.trim() && onProgress) {
    texto = await ocrPdf(pdf, onProgress);
  }

  return { texto, hashPdf };
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function IncomeAnalysis() {
  // Form state
  const [nomeCliente, setNomeCliente] = useState('');
  const [cpf, setCpf] = useState('');
  const [nomeMae, setNomeMae] = useState('');
  const [nomePai, setNomePai] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);

  // UX state
  const [step, setStep] = useState<1 | 2>(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoApuracao | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // CPF mask
  const handleCpf = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    const masked = d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
    setCpf(masked);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') { setArquivo(f); setErro(null); }
    else { setArquivo(null); setErro('Apenas arquivos PDF são aceitos.'); }
  };

  const handleAnalyze = async () => {
    if (!nomeCliente.trim()) { setErro('Informe o nome completo do cliente.'); return; }
    if (!arquivo) { setErro('Selecione um arquivo PDF de extrato bancário.'); return; }

    setErro(null);
    setIsAnalyzing(true);
    setStatusMsg('');

    try {
      setStatusMsg('Lendo PDF...');
      const { texto, hashPdf } = await extrairTextoPdf(arquivo, setStatusMsg);
      if (!texto.trim()) {
        throw new Error('Não foi possível extrair texto do PDF mesmo com OCR. O arquivo pode estar corrompido ou protegido.');
      }

      setStatusMsg('Analisando transações...');
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textoExtrato: texto,
          hashPdf,
          nomeCliente,
          cpf: cpf || undefined,
          nomePai: nomePai || undefined,
          nomeMae: nomeMae || undefined,
        }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        setErro(json.erro ?? `Erro ${resp.status}`);
        if (json.debug_texto_extraido) {
          console.warn('[Apuração] Amostra do texto extraído:', json.debug_texto_extraido);
        }
        if (json.debug_amostra_transacoes) {
          console.warn(
            `[Apuração] ${json.totalTransacoesBrutas} transações brutas | ${json.transacoesIgnoradas} ignoradas | ${json.transacoesSinalizadas} sinalizadas`,
            '\nAmostra classificada:', json.debug_amostra_transacoes
          );
        }
        return;
      }
      setResultado(json as ResultadoApuracao);
      // Diagnóstico: agrupa transações por mês e classificação no console
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audit = (json as any).auditoria;
      if (audit?.transacoesRaw) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const porMes: Record<string, Record<string, number>> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const t of audit.transacoesRaw as any[]) {
          if (!porMes[t.mes]) porMes[t.mes] = {};
          porMes[t.mes][t.classificacao] = (porMes[t.mes][t.classificacao] ?? 0) + 1;
        }
        console.log(`[Apuração] ${audit.totalTransacoesBrutas} transações | ${json.mesesConsiderados} meses com crédito`);
        console.table(porMes);
      }
      setStep(2);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(`Falha ao processar: ${msg}`);
    } finally {
      setIsAnalyzing(false);
      setStatusMsg('');
    }
  };

  const handleNovaAnalise = () => {
    setStep(1);
    setResultado(null);
    setErro(null);
    setArquivo(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleExportJson = () => {
    if (!resultado) return;
    const blob = new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apuracao_${nomeCliente.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 pb-24 min-h-screen bg-surface-50">
      <SectionHeader
        title="Apuração de Renda"
        subtitle="Motor determinístico — extratos bancários em PDF"
      />

      <AnimatePresence mode="wait">
        {/* ─── STEP 1: Formulário ─────────────────────────────────────────── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            {/* Dados do cliente */}
            <PremiumCard className="space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">Dados do Cliente</h3>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Nome Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nomeCliente}
                  onChange={e => setNomeCliente(e.target.value)}
                  className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary placeholder:text-text-secondary text-sm"
                  placeholder="Ex: João Carlos da Silva"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">CPF
                  <span className="text-text-secondary font-normal ml-1">(opcional — melhora detecção)</span>
                </label>
                <input
                  type="text"
                  value={cpf}
                  onChange={e => handleCpf(e.target.value)}
                  className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary placeholder:text-text-secondary text-sm"
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Nome da Mãe</label>
                  <input
                    type="text"
                    value={nomeMae}
                    onChange={e => setNomeMae(e.target.value)}
                    className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary placeholder:text-text-secondary text-sm"
                    placeholder="Ex: Maria da Silva"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Nome do Pai</label>
                  <input
                    type="text"
                    value={nomePai}
                    onChange={e => setNomePai(e.target.value)}
                    className="w-full p-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-200 dark:focus:ring-gold-800 text-text-primary placeholder:text-text-secondary text-sm"
                    placeholder="Ex: José da Silva"
                  />
                </div>
              </div>
            </PremiumCard>

            {/* Upload PDF */}
            <PremiumCard
              className="border-dashed border-2 border-surface-300 flex flex-col items-center py-8 text-center cursor-pointer hover:border-gold-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="w-14 h-14 bg-card-bg rounded-full flex items-center justify-center shadow-sm mb-3">
                {arquivo
                  ? <FileText className="text-green-500" size={28} />
                  : <UploadCloud className="text-gold-500" size={28} />
                }
              </div>
              {arquivo ? (
                <div>
                  <p className="font-medium text-green-600 text-sm">{arquivo.name}</p>
                  <p className="text-xs text-text-secondary mt-1">
                    {(arquivo.size / 1024).toFixed(0)} KB • clique para trocar
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="font-medium text-text-primary text-sm">Upload de Extrato (PDF)</h3>
                  <p className="text-xs text-text-secondary mt-1 max-w-[200px]">
                    Itaú, Bradesco, Nubank, Inter, Mercado Pago, Caixa e similares
                  </p>
                </div>
              )}
            </PremiumCard>

            {/* Erro */}
            {erro && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
                <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>
              </div>
            )}

            <RoundedButton fullWidth onClick={handleAnalyze} disabled={isAnalyzing} className="mt-2">
              {isAnalyzing
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Processando Extrato…</span>
                : <span className="flex items-center justify-center gap-2">Iniciar Apuração <ChevronRight size={16} /></span>
              }
            </RoundedButton>

            {isAnalyzing && statusMsg && (
              <p className="text-center text-[11px] text-text-secondary animate-pulse">{statusMsg}</p>
            )}

            <p className="text-center text-[10px] text-text-secondary">
              Algoritmo determinístico · Zero IA · Auditável · OCR para PDFs escaneados
            </p>
          </motion.div>
        )}

        {/* ─── STEP 2: Resultado ─────────────────────────────────────────── */}
        {step === 2 && resultado && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            {/* Avisos */}
            {resultado.avisos.length > 0 && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl flex items-start gap-2">
                <AlertTriangle size={15} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-yellow-700 dark:text-yellow-300">{resultado.avisos.join(' ')}</p>
              </div>
            )}

            {/* Card destaque: média */}
            <PremiumCard highlight className="text-center py-6">
              <p className="text-xs text-gold-700 dark:text-gold-400 font-medium uppercase tracking-wider">
                Renda Média Mensal Apurada
              </p>
              <h2 className="text-4xl font-bold text-text-primary mt-2">
                {brl(resultado.mediaMensalReal)}
              </h2>
              <div className="flex items-center justify-center gap-2 mt-2 text-green-600 dark:text-green-400 text-xs font-medium">
                <CheckCircle2 size={14} />
                {resultado.mesesConsiderados} meses considerados
              </div>
            </PremiumCard>

            {/* Métricas secundárias */}
            <div className="grid grid-cols-2 gap-3">
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Total Apurado</p>
                <p className="text-base font-bold text-text-primary mt-1">{brl(resultado.totalApurado)}</p>
              </PremiumCard>
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Créditos Válidos</p>
                <p className="text-base font-bold text-green-600 mt-1">{resultado.transacoesConsideradas}</p>
              </PremiumCard>
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Divisão ÷ 6 meses</p>
                <p className="text-base font-bold text-text-primary mt-1">{brl(resultado.divisao6Meses)}</p>
              </PremiumCard>
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Divisão ÷ 12 meses</p>
                <p className="text-base font-bold text-text-primary mt-1">{brl(resultado.divisao12Meses)}</p>
              </PremiumCard>
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Maior Mês</p>
                <p className="text-base font-bold text-green-600 mt-1">{brl(resultado.maiorMes)}</p>
              </PremiumCard>
              <PremiumCard className="text-center">
                <p className="text-xs text-text-secondary">Menor Mês</p>
                <p className="text-base font-bold text-red-500 mt-1">{brl(resultado.menorMes)}</p>
              </PremiumCard>
            </div>

            {/* Detalhamento mensal */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary px-1 mb-2">Detalhamento Mensal</h3>
              <div className="space-y-2">
                {Object.entries(resultado.totalPorMes)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([mes, valor]) => (
                    <PremiumCard key={mes} className="flex justify-between items-center py-3 px-4">
                      <div className="flex items-center gap-3">
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin mx-auto text-white" />
                            <span className="ml-2 font-medium">{statusMsg || 'Processando...'}</span>
                          </>
                        ) : (<p className="font-medium text-text-primary text-sm">{mes}</p>
                        )}
                      </div>
                      <span className="font-mono font-medium text-text-primary text-sm">{brl(valor)}</span>
                    </PremiumCard>
                  ))}
              </div>
            </div>

            {/* Transações sinalizadas */}
            {resultado.transacoesSinalizadas.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 px-1 mb-2 flex items-center gap-1">
                  <AlertTriangle size={14} />
                  Revisão Manual ({resultado.transacoesSinalizadas.length})
                </h3>
                <div className="space-y-2">
                  {resultado.transacoesSinalizadas.map((t, i) => (
                    <PremiumCard key={i} className="flex justify-between items-center py-3 px-4 border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={13} className="text-yellow-500 flex-shrink-0" />
                        <p className="text-xs text-text-secondary truncate max-w-[170px]">{t.descricao}</p>
                      </div>
                      <span className="text-xs font-mono text-yellow-700 dark:text-yellow-400">{brl(t.valor)}</span>
                    </PremiumCard>
                  ))}
                </div>
                <p className="text-[10px] text-text-secondary mt-1 px-1">
                  ⚠ Não excluídas automaticamente — requerem análise humana.
                </p>
              </div>
            )}

            {/* Critérios + auditoria */}
            <PremiumCard className="space-y-2">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Critérios Aplicados</h3>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className={resultado.criteriosAplicados.excluiuAutoTransferencia ? 'text-green-500' : 'text-surface-300'} />
                  <span className="text-xs text-text-secondary">Excluiu autotransferências</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className={resultado.criteriosAplicados.excluiuTransferenciaPais ? 'text-green-500' : 'text-surface-300'} />
                  <span className="text-xs text-text-secondary">Excluiu transferências de pais</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-green-500" />
                  <span className="text-xs text-text-secondary">Modo conservador inteligente</span>
                </div>
              </div>
              <p className="text-[10px] text-text-secondary pt-1 border-t border-surface-100">
                Hash PDF: <span className="font-mono">{resultado.auditoria.hashPdf.slice(0, 16)}…</span>
                &nbsp;·&nbsp;{new Date(resultado.auditoria.timestamp).toLocaleString('pt-BR')}
                &nbsp;·&nbsp;v{resultado.algoritmoVersao}
              </p>
            </PremiumCard>

            {/* Ações */}
            <div className="flex gap-3">
              <RoundedButton variant="outline" fullWidth onClick={handleNovaAnalise}>
                <RefreshCw size={14} className="mr-1" /> Nova Análise
              </RoundedButton>
              <RoundedButton fullWidth onClick={handleExportJson}>
                <Download size={14} className="mr-1" /> Exportar JSON
              </RoundedButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
