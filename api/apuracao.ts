// ─── Vercel Serverless Function: POST /api/apuracao ──────────────────────────
// Motor determinístico de apuração de renda — Kaizen Axis
// Versão: 2.0.0-modo-conservador-inteligente
// Zero IA · Zero heurística probabilística · 100% auditável
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { IncomingForm, Fields, Files } from 'formidable';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import pdfParse from 'pdf-parse';

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

type ClassificacaoTransacao =
    | 'credito_valido'
    | 'debito'
    | 'ignorar_estorno'
    | 'ignorar_sem_keyword'
    | 'ignorar_autotransferencia'
    | 'ignorar_transferencia_pai'
    | 'ignorar_transferencia_mae'
    | 'possivel_vinculo_familiar';

interface Transacao {
    data: string;
    mes: string;
    descricao: string;
    valor: number; // centavos
    classificacao: ClassificacaoTransacao;
    motivoExclusao?: string;
}

interface ContextoNomes {
    nomeCliente: string;
    cpf?: string;
    nomePai?: string;
    nomeMae?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS — MOEDA (centavos para evitar float drift)
// ═══════════════════════════════════════════════════════════════════════════════

function parseMoeda(raw: string): number {
    const limpo = raw.trim();
    if (limpo.includes(',')) {
        const v = parseFloat(limpo.replace(/\./g, '').replace(',', '.'));
        return isNaN(v) ? 0 : Math.round(v * 100);
    }
    const v = parseFloat(limpo.replace(/\./g, ''));
    return isNaN(v) ? 0 : Math.round(v * 100);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS — NORMALIZAÇÃO (determinística)
// ═══════════════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']);

function removerAcentos(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizar(s: string): string {
    return removerAcentos(s)
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizar(s: string): string[] {
    return normalizar(s)
        .split(' ')
        .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MATCHING — Determinístico por contagem de tokens (SEM IA, SEM fuzzy)
// ═══════════════════════════════════════════════════════════════════════════════

type ResultadoMatch = 'forte' | 'fraco' | 'sem_match';

function calcularMatch(nome: string, descricao: string, cpf?: string): ResultadoMatch {
    if (!nome || nome.trim().length === 0) return 'sem_match';

    const descNorm = normalizar(descricao);

    // Regra especial: "MESMA TITULARIDADE" → match forte imediato
    if (descNorm.includes('MESMA TITULARIDADE')) return 'forte';

    // CPF parcial na descrição → match forte imediato
    if (cpf) {
        const digits = cpf.replace(/[^\d]/g, '');
        if (digits.length >= 9) {
            const cpfRegex = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
            const found = descNorm.match(cpfRegex);
            if (found?.some(m => m.replace(/[^\d]/g, '').includes(digits.slice(0, 9)))) {
                return 'forte';
            }
        }
    }

    const tokensNome = tokenizar(nome);
    if (tokensNome.length === 0) return 'sem_match';

    // Interseção de tokens com boundary de palavra
    const encontrados = tokensNome.filter(t =>
        new RegExp(`(?:^|\\s)${t}(?:\\s|$)`).test(descNorm)
    );

    const percentual = Math.round((encontrados.length / tokensNome.length) * 100);

    // Match forte: ≥70% dos tokens OU ≥3 tokens
    if (percentual >= 70 || encontrados.length >= 3) return 'forte';
    // Match fraco: 1 ou 2 tokens
    if (encontrados.length >= 1) return 'fraco';

    return 'sem_match';
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIFICAÇÃO — 8 regras em ordem obrigatória do spec
// ═══════════════════════════════════════════════════════════════════════════════

const KEYWORDS_CREDITO = [
    'PIX RECEBIDO', 'TED RECEBIDA', 'DOC RECEBIDO', 'DEPOSITO', 'CREDITO',
];

const KEYWORDS_IGNORAR = [
    'ESTORNO', 'DEVOLUCAO', 'ENTRE CONTAS', 'TRANSFERENCIA ENTRE CONTAS',
];

function normalizarData(dataRaw: string): { data: string; mes: string } {
    const [dia, mes, ano = String(new Date().getFullYear())] = dataRaw.split('/');
    return {
        data: `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`,
        mes: `${ano}-${mes.padStart(2, '0')}`,
    };
}

function classificar(
    dataRaw: string,
    descricaoRaw: string,
    valorRaw: string,
    ctx: ContextoNomes
): Transacao {
    const { data, mes } = normalizarData(dataRaw);
    const valor = parseMoeda(valorRaw);
    const descNorm = normalizar(descricaoRaw);

    // 1. Débito
    if (valor <= 0) return { data, mes, descricao: descricaoRaw, valor, classificacao: 'debito' };

    // 2. Estorno
    if (KEYWORDS_IGNORAR.some(k => descNorm.includes(k))) {
        return { data, mes, descricao: descricaoRaw, valor, classificacao: 'ignorar_estorno', motivoExclusao: 'Estorno/devolução' };
    }

    // 3. Sem keyword de crédito
    if (!KEYWORDS_CREDITO.some(k => descNorm.includes(k))) {
        return { data, mes, descricao: descricaoRaw, valor, classificacao: 'ignorar_sem_keyword', motivoExclusao: 'Sem keyword de crédito' };
    }

    // 4. Autotransferência (match forte cliente)
    if (calcularMatch(ctx.nomeCliente, descricaoRaw, ctx.cpf) === 'forte') {
        return { data, mes, descricao: descricaoRaw, valor, classificacao: 'ignorar_autotransferencia', motivoExclusao: 'Autotransferência' };
    }

    // 5. Match forte pai
    if (ctx.nomePai && calcularMatch(ctx.nomePai, descricaoRaw) === 'forte') {
        return { data, mes, descricao: descricaoRaw, valor, classificacao: 'ignorar_transferencia_pai', motivoExclusao: 'Transferência do pai' };
    }

    // 6. Match forte mãe
    if (ctx.nomeMae && calcularMatch(ctx.nomeMae, descricaoRaw) === 'forte') {
        return { data, mes, descricao: descricaoRaw, valor, classificacao: 'ignorar_transferencia_mae', motivoExclusao: 'Transferência da mãe' };
    }

    // 7. Match fraco → sinalizar, NÃO excluir
    const fracoPai = ctx.nomePai ? calcularMatch(ctx.nomePai, descricaoRaw) === 'fraco' : false;
    const fracoMae = ctx.nomeMae ? calcularMatch(ctx.nomeMae, descricaoRaw) === 'fraco' : false;
    const fracoCliente = calcularMatch(ctx.nomeCliente, descricaoRaw, ctx.cpf) === 'fraco';
    if (fracoCliente || fracoPai || fracoMae) {
        return { data, mes, descricao: descricaoRaw, valor, classificacao: 'possivel_vinculo_familiar', motivoExclusao: 'Match fraco — revisão manual' };
    }

    // 8. Crédito válido
    return { data, mes, descricao: descricaoRaw, valor, classificacao: 'credito_valido' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSER — Extração de transações via regex (multi-estratégia)
// ═══════════════════════════════════════════════════════════════════════════════

// Padrão monetário: aceita 250,00 | 1.250,00 | 10.000,00 | 1.250.000,00
const VALOR_RE = /(-?\d{1,3}(?:\.\d{3})*,\d{2})/;
// Data no formato DD/MM ou DD/MM/YYYY ou DD/MM/YY
const DATA_RE = /(\d{2}\/\d{2}(?:\/\d{2,4})?)/;

/**
 * Estratégia 1 (mais comum): linha com data + texto + valor no final
 * Ex: "15/03 PIX RECEBIDO PESSOA FISICA       1.250,00"
 */
const REGEX_DATA_DESC_VALOR = new RegExp(
    DATA_RE.source + '\\s+' + '(.+?)' + '\\s+' + VALOR_RE.source + '\\s*$',
    'gm'
);

/**
 * Estratégia 2: linha com data + valor + texto (Bradesco, Itaú alguns layouts)
 * Ex: "15/03       1.250,00  PIX RECEBIDO PESSOA"
 */
const REGEX_DATA_VALOR_DESC = new RegExp(
    DATA_RE.source + '\\s+' + VALOR_RE.source + '\\s+' + '(.+)',
    'gm'
);

/**
 * Estratégia 3: valor isolado após label em linha anterior
 * Captura pares de linhas onde uma tem data+desc e a seguinte tem valor
 * Ex:
 *   "15/03 PIX RECEBIDO JOAO SILVA"
 *   "                      1.250,00 C"
 */
function parsearMultiLinha(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const resultado: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    for (let i = 0; i < linhas.length - 1; i++) {
        const linhaAtual = linhas[i];
        const linhaProx = linhas[i + 1];

        const dataMatch = linhaAtual.match(/^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+)/);
        if (!dataMatch) continue;

        // Verifica se a linha atual tem valor no final
        const valorNaLinha = linhaAtual.match(VALOR_RE);
        if (valorNaLinha) continue; // Estratégia 1 já vai pegar

        // Verifica se a próxima linha tem apenas um valor (credito/débito)
        const valorProximo = linhaProx.match(/^(-?\d{1,3}(?:\.\d{3})*,\d{2})/)
            ?? linhaProx.match(new RegExp(VALOR_RE.source + '\\s+[CD]$'));
        if (!valorProximo) continue;

        resultado.push({
            dataRaw: dataMatch[1],
            descricaoRaw: dataMatch[2].trim(),
            valorRaw: valorProximo[1].trim(),
        });
    }
    return resultado;
}

function extrair(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const limpo = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    function add(dataRaw: string, descricaoRaw: string, valorRaw: string) {
        const chave = `${dataRaw}|${descricaoRaw.trim()}|${valorRaw}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw: dataRaw.trim(), descricaoRaw: descricaoRaw.trim(), valorRaw: valorRaw.trim() });
        }
    }

    // Estratégia 1: data + desc + valor no final
    REGEX_DATA_DESC_VALOR.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = REGEX_DATA_DESC_VALOR.exec(limpo)) !== null) {
        const desc = m[2].trim();
        // Rejeitar descrições muito curtas ou que sejam apenas um número
        if (desc.length >= 3 && !/^-?[\d.,]+$/.test(desc)) add(m[1], desc, m[3]);
    }

    // Estratégia 2: data + valor + desc (Bradesco, outros)
    REGEX_DATA_VALOR_DESC.lastIndex = 0;
    while ((m = REGEX_DATA_VALOR_DESC.exec(limpo)) !== null) {
        const desc = m[3].trim();
        if (desc.length >= 3 && !/^-?[\d.,]+$/.test(desc)) add(m[1], desc, m[2]);
    }

    // Estratégia 3: data + desc em uma linha, valor na próxima
    const multiLinha = parsearMultiLinha(limpo);
    for (const t of multiLinha) add(t.dataRaw, t.descricaoRaw, t.valorRaw);

    return todos;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ erro: 'Método não permitido. Use POST.' }); return; }

    const timestamp = new Date().toISOString();

    try {
        // ── Parse multipart/form-data ──────────────────────────────────────────
        const { fields, pdfBuffer } = await parseForm(req);

        const nomeCliente = String(Array.isArray(fields.nomeCliente) ? fields.nomeCliente[0] : fields.nomeCliente ?? '').trim();
        if (!nomeCliente) { res.status(400).json({ erro: 'Campo "nomeCliente" é obrigatório.' }); return; }

        const ctx: ContextoNomes = {
            nomeCliente,
            cpf: getString(fields, 'cpf'),
            nomePai: getString(fields, 'nomePai'),
            nomeMae: getString(fields, 'nomeMae'),
        };

        // ── Validar PDF ────────────────────────────────────────────────────────
        if (!pdfBuffer || pdfBuffer.length < 100) { res.status(400).json({ erro: 'PDF inválido ou não enviado.' }); return; }
        if (!pdfBuffer.slice(0, 4).toString('ascii').startsWith('%PDF')) {
            res.status(400).json({ erro: 'O arquivo não é um PDF válido.' }); return;
        }

        const hashPdf = createHash('sha256').update(pdfBuffer).digest('hex');

        // ── Extrair texto do PDF ────────────────────────────────────────────────
        let textoPdf: string;
        try {
            const parsed = await pdfParse(pdfBuffer);
            textoPdf = parsed.text;
        } catch {
            res.status(422).json({ erro: 'Falha ao ler o PDF. Pode estar corrompido ou protegido por senha.' }); return;
        }

        // ── Parsear e classificar transações ───────────────────────────────────
        const brutas = extrair(textoPdf);
        if (brutas.length === 0) {
            // Return a sample of the extracted text to help diagnose unsupported formats
            const amostra = textoPdf.slice(0, 500).replace(/\n+/g, ' | ');
            res.status(422).json({
                erro: 'Nenhuma transação reconhecida. O formato do banco pode não ser suportado.',
                debug_texto_extraido: amostra,
            }); return;
        }

        const transacoes: Transacao[] = brutas.map(b => classificar(b.dataRaw, b.descricaoRaw, b.valorRaw, ctx));

        // ── Agrupar créditos válidos por mês ────────────────────────────────────
        const creditos = transacoes.filter(t => t.classificacao === 'credito_valido');
        const sinalizadas = transacoes.filter(t => t.classificacao === 'possivel_vinculo_familiar');
        const ignoradas = transacoes.filter(t =>
            !['credito_valido', 'possivel_vinculo_familiar', 'debito'].includes(t.classificacao)
        );

        const totalPorMes: Record<string, number> = {};
        for (const c of creditos) {
            totalPorMes[c.mes] = (totalPorMes[c.mes] ?? 0) + c.valor;
        }

        const avisos: string[] = [];
        const mesesConsiderados = Object.keys(totalPorMes).length;
        if (mesesConsiderados < 2 && creditos.length > 0) {
            avisos.push(`Apenas ${mesesConsiderados} mês(es) com créditos válidos. Resultado pode não ser representativo.`);
        }

        // ── Calcular métricas (tudo em centavos) ────────────────────────────────
        const valores = Object.values(totalPorMes);
        const totalApurado = valores.reduce((a, b) => a + b, 0);
        const mediaMensalReal = mesesConsiderados > 0 ? Math.round(totalApurado / mesesConsiderados) : 0;
        const divisao6Meses = Math.round(totalApurado / 6);
        const divisao12Meses = Math.round(totalApurado / 12);
        const maiorMes = valores.length > 0 ? Math.max(...valores) : 0;
        const menorMes = valores.length > 0 ? Math.min(...valores) : 0;

        const excluiuAutoTransferencia = transacoes.some(t => t.classificacao === 'ignorar_autotransferencia');
        const excluiuTransferenciaPais = transacoes.some(t =>
            ['ignorar_transferencia_pai', 'ignorar_transferencia_mae'].includes(t.classificacao)
        );

        res.status(200).json({
            algoritmoVersao: '2.0.0-modo-conservador-inteligente',
            totalApurado,
            mediaMensalReal,
            divisao6Meses,
            divisao12Meses,
            maiorMes,
            menorMes,
            mesesConsiderados,
            totalPorMes,
            transacoesConsideradas: creditos.length,
            transacoesIgnoradas: ignoradas.length,
            transacoesSinalizadas: sinalizadas.map(t => ({
                descricao: t.descricao,
                valor: t.valor,
                mes: t.mes,
                motivo: 'possivel_vinculo_familiar',
            })),
            criteriosAplicados: {
                excluiuAutoTransferencia,
                excluiuTransferenciaPais,
                modoConservadorInteligente: true,
            },
            auditoria: {
                hashPdf,
                timestamp,
                algoritmoVersao: '2.0.0-modo-conservador-inteligente',
                totalTransacoesBrutas: brutas.length,
                transacoesRaw: transacoes,
            },
            avisos,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro interno.';
        res.status(500).json({ erro: msg });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getString(fields: Fields, key: string): string | undefined {
    const v = fields[key];
    const s = (Array.isArray(v) ? v[0] : v ?? '').trim();
    return s || undefined;
}

async function parseForm(req: VercelRequest): Promise<{ fields: Fields; pdfBuffer: Buffer | null }> {
    return new Promise((resolve, reject) => {
        const form = new IncomingForm({ maxFileSize: 20 * 1024 * 1024 });
        form.parse(req as any, (err, fields, files: Files) => {
            if (err) return reject(err);

            const fileField = files['pdf'];
            const file = Array.isArray(fileField) ? fileField[0] : fileField;

            if (!file) return resolve({ fields, pdfBuffer: null });

            try {
                const buffer = readFileSync(file.filepath);
                resolve({ fields, pdfBuffer: buffer });
            } catch {
                reject(new Error('Falha ao ler o arquivo enviado.'));
            }
        });
    });
}
