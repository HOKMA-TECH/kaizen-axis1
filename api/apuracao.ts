// ─── Vercel Serverless Function: POST /api/apuracao ──────────────────────────
// Motor determinístico de apuração de renda — Kaizen Axis
// Versão: 3.0.0-interactive
// Zero IA · Zero heurística probabilística · 100% auditável
// Novidades v3: apostas, wash-trading, RENDIMENTO contextual, customKeywords
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';

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
    | 'ignorar_aposta'
    | 'ignorar_washtrading'
    | 'possivel_vinculo_familiar'
    | 'possivel_renda_familiar';

type CustomTag =
    | 'aposta'
    | 'washtrading'
    | 'renda_familiar'
    | 'customizado'
    | null;

interface Transacao {
    id: string;           // unique id para toggle de UI
    data: string;
    mes: string;
    descricao: string;
    valor: number;        // centavos
    classificacao: ClassificacaoTransacao;
    motivoExclusao?: string;
    is_validated: boolean; // pode ser alterado pelo usuário
    custom_tag: CustomTag;
}

interface ContextoNomes {
    nomeCliente: string;
    cpf?: string;
    nomePai?: string;
    nomeMae?: string;
    customKeywords?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS — MOEDA
// ═══════════════════════════════════════════════════════════════════════════════

function parseMoeda(raw: string): number {
    const limpo = raw.trim().replace(/^R\$\s*/i, '').replace(/^-R\$\s*/i, '-').trim();
    if (limpo.includes(',')) {
        const v = parseFloat(limpo.replace(/\./g, '').replace(',', '.'));
        return isNaN(v) ? 0 : Math.round(v * 100);
    }
    const v = parseFloat(limpo.replace(/\./g, ''));
    return isNaN(v) ? 0 : Math.round(v * 100);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS — NORMALIZAÇÃO
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
// MATCHING
// ═══════════════════════════════════════════════════════════════════════════════

type ResultadoMatch = 'forte' | 'fraco' | 'sem_match';

function calcularMatch(nome: string, descricao: string, cpf?: string): ResultadoMatch {
    if (!nome || nome.trim().length === 0) return 'sem_match';

    const descNorm = normalizar(descricao);

    if (descNorm.includes('MESMA TITULARIDADE')) return 'forte';

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

    const encontrados = tokensNome.filter(t =>
        new RegExp(`(?:^|\\s)${t}(?:\\s|$)`).test(descNorm)
    );

    const percentual = Math.round((encontrados.length / tokensNome.length) * 100);

    if (percentual >= 70 || encontrados.length >= 3) return 'forte';
    if (encontrados.length >= 1) return 'fraco';

    return 'sem_match';
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIFICAÇÃO — 10 regras em ordem obrigatória (v3)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Keywords de crédito (whitelist) ──────────────────────────────────────────
const KEYWORDS_CREDITO = [
    'PIX RECEBIDO', 'RECEBIMENTO PIX', 'RECEBIMENTO DE PIX', 'TRANSFERENCIA PIX RECEBIDA',
    'PIXRECEBIDO',
    'CRED PIX', 'CR PIX',
    'TED RECEBIDA', 'TED CREDITO', 'DOC RECEBIDO', 'DOC CREDITO', 'TEV RECEBIDA',
    'CRED TED', 'CR TED', 'CRED DOC', 'CR DOC',
    'DEPOSITO', 'DEPOSITO IDENTIFICADO', 'DEPOSITO BANCARIO', 'DEPOSITO EM CONTA', 'DEP IDENT',
    'CREDITO', 'CREDITO EM CONTA',
    'CRED SAL', 'CRED FGTS', 'CRED INSS',
    'TRANSFERENCIA RECEBIDA', 'TRANSFERENCIA CREDITADA', 'RECEBIMENTO', 'RECEBIMENTO DE TRANSFERENCIA', 'PAGAMENTO RECEBIDO',
    'TR RECEB', 'PAG RECEB',
    'SALARIO', 'REMUNERACAO', 'VENCIMENTO', 'HONORARIO', 'COMISSAO', 'PROVENTO',
    'PREMIO', 'BONIFICACAO', 'GRATIFICACAO', 'ADIANTAMENTO SALARIAL', 'FERIAS', 'DECIMO TERCEIRO', '13 SALARIO',
    'BENEFICIO', 'AUXILIO', 'INDENIZACAO', 'RESCISAO', 'FGTS',
    'RECEBIMENTO DE PAGAMENTO',
    'LIBERACAO DE DINHEIRO',
    'PAGAMENTO COM CODIGO QR',
    'VENDA',
];

// ── Keywords de exclusão (blacklist) ─────────────────────────────────────────
const KEYWORDS_IGNORAR = [
    'ESTORNO', 'DEVOLUCAO', 'DEVOLUCAO PIX', 'ESTORNO PIX', 'CANCELAMENTO',
    'ENTRE CONTAS', 'TRANSFERENCIA ENTRE CONTAS', 'MESMA TITULARIDADE', 'CONTA PROPRIA',
    'PIXENVIADO', 'PIX ENVIADO',
    // RENDIMENTO: v3 refina este bloco com verificação contextual antes de usar
    'RENDIMENTO POUPANCA', 'RENDIMENTO CDB', 'RENDIMENTO FUNDO',
    'RESGATE', 'RESGATE CDB', 'RESGATE POUPANCA', 'RESGATE FUNDO',
    'APLICACAO', 'APLICACAO AUTOMATICA', 'POUPANCA', 'CDB', 'CDI', 'IOF',
    'CORRECAO MONETARIA', 'CORR MONETARIA',
    'EMPRESTIMO', 'ANTECIPACAO', 'CREDITO CONSIGNADO', 'LIBERACAO EMPRESTIMO',
    'SALDO', 'SALDO ANTERIOR', 'TARIFA', 'TAXA', 'JUROS', 'MULTA', 'COBRANCA', 'ANUIDADE',
];

// ── v3: Keywords de apostas/jogos (nova regra 2a) ────────────────────────────
const KEYWORDS_APOSTAS = [
    'BET', 'BETNACIONAL', 'BETANO', 'SPORTINGBET', 'BRAZINO', 'PIXBET',
    'ESPORTE DA SORTE', 'SUPERBET', 'NOVIBET',
    'CASINO', 'CASSINO', 'APOSTA', 'APOSTAS', 'LOTERIA', 'LOTERICA',
    'JOGO', 'JOGOS', 'SLOTS', 'ROLETA', 'POKER',
    'BLAZE', 'FORTUNE TIGER', 'FORTUNE', 'TIGRINHO',
];

// ── v3: Renda laboral — pula verificação de autotransferência ────────────────
const INCOME_KEYWORDS_NOMES = new Set([
    'SALARIO', 'VENCIMENTO', 'REMUNERACAO', 'HONORARIO', 'COMISSAO',
    'PROVENTO', 'BONIFICACAO', 'GRATIFICACAO', 'INDENIZACAO', 'RESCISAO',
    'FGTS', 'BENEFICIO', 'AUXILIO', 'FERIAS', 'DECIMO TERCEIRO',
    '13 SALARIO', 'ADIANTAMENTO SALARIAL', 'CRED SAL', 'CRED FGTS',
]);

// ── v3: RENDIMENTO contextual — só ignora com CDB/POUPANCA/FUNDO ─────────────
const RENDIMENTO_EXCLUSAO_CONTEXTO = ['CDB', 'POUPANCA', 'FUNDO', 'RESGATE'];
const RENDIMENTO_INCLUSAO_CONTEXTO = ['GRATIFICACAO', 'SALARIO', 'PREMIO', 'TRABALHO'];

function deveIgnorarRendimento(descNorm: string): boolean {
    if (!descNorm.includes('RENDIMENTO')) return false;
    // Se combinado com inclusão → não ignora (renda laboral)
    if (RENDIMENTO_INCLUSAO_CONTEXTO.some(k => descNorm.includes(k))) return false;
    // Se combinado com exclusão → ignora (investimento)
    return RENDIMENTO_EXCLUSAO_CONTEXTO.some(k => descNorm.includes(k));
}

function normalizarData(dataRaw: string): { data: string; mes: string } {
    let limpo = dataRaw.trim().toUpperCase();
    limpo = limpo.replace(/-/g, ' ').replace(/\//g, ' ').replace(/\s+/g, ' ');

    const MESES: Record<string, string> = {
        JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
        JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
        JANEIRO: '01', FEVEREIRO: '02', MARCO: '03', ABRIL: '04',
        MAIO: '05', JUNHO: '06', JULHO: '07', AGOSTO: '08',
        SETEMBRO: '09', OUTUBRO: '10', NOVEMBRO: '11', DEZEMBRO: '12',
    };

    const parts = limpo.split(' ');
    if (parts.length >= 2) {
        const dia = parts[0].padStart(2, '0');
        let mesStr = parts[1];
        let mes = '01';
        if (/^\d+$/.test(mesStr)) {
            mes = mesStr.padStart(2, '0');
        } else {
            mes = MESES[mesStr] || MESES[mesStr.substring(0, 3)] || '01';
        }
        let anoRaw = parts[2] || String(new Date().getFullYear());
        const ano = anoRaw.length === 2 ? `20${anoRaw}` : anoRaw;
        return { data: `${ano}-${mes}-${dia}`, mes: `${ano}-${mes}` };
    }

    const fallback = new Date().toISOString().split('T')[0];
    return { data: fallback, mes: fallback.substring(0, 7) };
}

let _idCounter = 0;
function nextId() { return `t_${++_idCounter}`; }

function classificar(
    dataRaw: string,
    descricaoRaw: string,
    valorRaw: string,
    ctx: ContextoNomes
): Transacao {
    const { data, mes } = normalizarData(dataRaw);
    const valor = parseMoeda(valorRaw);
    const descNorm = normalizar(descricaoRaw);

    const base: Omit<Transacao, 'classificacao' | 'motivoExclusao' | 'is_validated' | 'custom_tag'> = {
        id: nextId(), data, mes, descricao: descricaoRaw, valor,
    };

    // 1. Débito
    if (valor <= 0) return { ...base, classificacao: 'debito', is_validated: false, custom_tag: null };

    // 2a. v3: Apostas / jogos (NOVA — verificada antes da blacklist geral)
    if (KEYWORDS_APOSTAS.some(k => descNorm.includes(k))) {
        return { ...base, classificacao: 'ignorar_aposta', motivoExclusao: 'Aposta/jogo', is_validated: false, custom_tag: 'aposta' };
    }

    // 2b. Estorno + v3: RENDIMENTO contextual
    const temIgnorar = KEYWORDS_IGNORAR.some(k => descNorm.includes(k));
    const temRendimento = deveIgnorarRendimento(descNorm);
    if (temIgnorar || temRendimento) {
        return { ...base, classificacao: 'ignorar_estorno', motivoExclusao: 'Estorno/investimento', is_validated: false, custom_tag: null };
    }

    // 3. Sem keyword de crédito — EXCETO se tem keyword customizada
    const temCredito = KEYWORDS_CREDITO.some(k => descNorm.includes(k));
    const temCustom = ctx.customKeywords?.some(k => descNorm.includes(normalizar(k))) ?? false;
    if (!temCredito && !temCustom) {
        return { ...base, classificacao: 'ignorar_sem_keyword', motivoExclusao: 'Sem keyword de crédito', is_validated: false, custom_tag: null };
    }

    // Proteção: renda laboral comprovada → pula verificação de nome/CPF
    const ehRendaLaboral = [...INCOME_KEYWORDS_NOMES].some(k => descNorm.includes(k));

    if (!ehRendaLaboral) {
        // 4. Autotransferência (match forte cliente)
        if (calcularMatch(ctx.nomeCliente, descricaoRaw, ctx.cpf) === 'forte') {
            return { ...base, classificacao: 'ignorar_autotransferencia', motivoExclusao: 'Autotransferência', is_validated: false, custom_tag: null };
        }

        // 5. Match forte pai
        if (ctx.nomePai && calcularMatch(ctx.nomePai, descricaoRaw) === 'forte') {
            return { ...base, classificacao: 'ignorar_transferencia_pai', motivoExclusao: 'Transferência do pai', is_validated: false, custom_tag: null };
        }

        // 6. Match forte mãe
        if (ctx.nomeMae && calcularMatch(ctx.nomeMae, descricaoRaw) === 'forte') {
            return { ...base, classificacao: 'ignorar_transferencia_mae', motivoExclusao: 'Transferência da mãe', is_validated: false, custom_tag: null };
        }

        // 7. Match fraco → sinalizar ('possivel_vinculo_familiar'), incluído por padrão
        const fracoPai = ctx.nomePai ? calcularMatch(ctx.nomePai, descricaoRaw) === 'fraco' : false;
        const fracoMae = ctx.nomeMae ? calcularMatch(ctx.nomeMae, descricaoRaw) === 'fraco' : false;
        const fracoCliente = calcularMatch(ctx.nomeCliente, descricaoRaw, ctx.cpf) === 'fraco';
        if (fracoCliente || fracoPai || fracoMae) {
            return { ...base, classificacao: 'possivel_vinculo_familiar', motivoExclusao: 'Match fraco — revisão manual', is_validated: true, custom_tag: 'renda_familiar' };
        }
    }

    // 8. Crédito customizado
    if (temCustom && !temCredito) {
        return { ...base, classificacao: 'credito_valido', is_validated: true, custom_tag: 'customizado' };
    }

    // 9. Crédito válido
    return { ...base, classificacao: 'credito_valido', is_validated: true, custom_tag: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// v3: PÓS-PROCESSAMENTO — Wash Trading (Crédito + Débito mesmo dia, mesmo valor)
// ═══════════════════════════════════════════════════════════════════════════════

function detectarWashTrading(transacoes: Transacao[]): Transacao[] {
    // Indexar débitos por data+valor
    const debitos = new Map<string, number>();
    for (const t of transacoes) {
        if (t.classificacao === 'debito') {
            const chave = `${t.data}|${Math.abs(t.valor)}`;
            debitos.set(chave, (debitos.get(chave) ?? 0) + 1);
        }
    }

    return transacoes.map(t => {
        if (t.classificacao !== 'credito_valido' && t.classificacao !== 'possivel_vinculo_familiar') return t;
        const chave = `${t.data}|${t.valor}`;
        if (debitos.has(chave)) {
            return { ...t, classificacao: 'ignorar_washtrading' as ClassificacaoTransacao, motivoExclusao: 'Wash trading (in-and-out)', is_validated: false, custom_tag: 'washtrading' as CustomTag };
        }
        return t;
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// v3: PÓS-PROCESSAMENTO — Terceiros recorrentes (≥3× mesmo CPF/nome externo)
// ═══════════════════════════════════════════════════════════════════════════════

function sinalizarTerceirosRecorrentes(transacoes: Transacao[]): Transacao[] {
    // Extrai "remetente" da descrição: aprox. tudo após "PIX RECEBIDO " ou "TED RECEBIDA "
    const PREFIXOS_REMETENTE = ['PIX RECEBIDO', 'RECEBIMENTO PIX', 'TED RECEBIDA', 'TED CREDITO', 'TRANSFERENCIA RECEBIDA'];
    const freq = new Map<string, number>();

    const remetentes: (string | null)[] = transacoes.map(t => {
        if (t.classificacao !== 'credito_valido') return null;
        const descNorm = normalizar(t.descricao);
        for (const pfx of PREFIXOS_REMETENTE) {
            const idx = descNorm.indexOf(pfx);
            if (idx >= 0) {
                const resto = descNorm.substring(idx + pfx.length).trim();
                if (resto.length >= 5) {
                    const tokens = resto.split(' ').slice(0, 3).join(' ');
                    freq.set(tokens, (freq.get(tokens) ?? 0) + 1);
                    return tokens;
                }
            }
        }
        return null;
    });

    const recorrentes = new Set([...freq.entries()].filter(([, n]) => n >= 3).map(([k]) => k));

    return transacoes.map((t, i) => {
        const rem = remetentes[i];
        if (rem && recorrentes.has(rem) && t.custom_tag === null) {
            return { ...t, custom_tag: 'renda_familiar' as CustomTag, classificacao: 'possivel_renda_familiar' as ClassificacaoTransacao };
        }
        return t;
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSER — Extração de transações via regex (multi-estratégia) — inalterado v2
// ═══════════════════════════════════════════════════════════════════════════════

const VALOR_RE = /([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})(\s*[CD])?(?=\s|$|\|)/i;
const DATA_RE = /^(\d{2}[\/\-\.\s]\d{2}(?:[\/\-\.\s]\d{2,4})?|\d{2}[\/\-\.\s]+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\.\s]?(?:\d{2,4})?)/i;

const MESES_EXTENSO_API: Record<string, string> = {
    janeiro: 'JAN', fevereiro: 'FEV', marco: 'MAR', abril: 'ABR',
    maio: 'MAI', junho: 'JUN', julho: 'JUL', agosto: 'AGO',
    setembro: 'SET', outubro: 'OUT', novembro: 'NOV', dezembro: 'DEZ',
};

function extrair(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const normalizado = texto
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .replace(
            /(\d{1,2})\s+de\s+(janeiro|fevereiro|mar(?:ç|c)o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/gi,
            (_, d, m, a) => {
                const key = m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                return `${d.padStart(2, '0')}/${MESES_EXTENSO_API[key] ?? 'JAN'}/${a}`;
            }
        )
        .replace(
            /\b(janeiro|fevereiro|mar(?:ç|c)o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)[\s\/]+(?:de\s+)?(\d{4})\b/gi,
            (_, m, a) => {
                const key = m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                return `01/${MESES_EXTENSO_API[key] ?? 'JAN'}/${a}`;
            }
        );

    const limpo = normalizado.trim();
    const linhas = limpo.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    function add(dataRaw: string, descricaoRaw: string, valorRaw: string) {
        let v = valorRaw.replace(/\s+/g, '').replace(/^R\$/i, '').replace(/^-R\$/i, '-');
        if (v.startsWith('+')) v = v.substring(1);
        const mDC = v.match(/^(-?[\d.]+,\d{2})([CD])$/i);
        if (mDC) {
            v = mDC[2].toUpperCase() === 'D' ? `-${mDC[1].replace(/^-/, '')}` : mDC[1];
        }
        const desc = descricaoRaw.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
        if (desc.length < 3) return;
        const chave = `${dataRaw}|${desc}|${v}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw, descricaoRaw: desc, valorRaw: v });
        }
    }

    let dataContextual = '';
    const mAnoInicial = limpo.match(/\b(20\d{2})\b/);
    let anoContextual = mAnoInicial ? mAnoInicial[1] : String(new Date().getFullYear());

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        const mData = linha.match(DATA_RE);
        if (mData) {
            let dataCandidata = mData[1];
            const mAno = dataCandidata.match(/\b(20\d{2})\b/);
            if (mAno) { anoContextual = mAno[1]; }
            else { dataCandidata = `${dataCandidata}/${anoContextual}`; }
            dataContextual = dataCandidata;

            const descSemData = linha.substring(mData[0].length).trim();
            if (/^saldo\s+do\s+dia/i.test(descSemData)) continue;

            const linhaTemValor = descSemData.match(VALOR_RE);
            if (linhaTemValor) {
                const dc = linhaTemValor[2]?.trim() ?? '';
                const valorComDC = linhaTemValor[1] + dc;
                const descPura = descSemData.replace(linhaTemValor[0], '').trim();
                if (descPura.length > 0 && !/^\d+$/.test(descPura)) {
                    add(dataContextual, descPura, valorComDC);
                }
                continue;
            }

            const proxLinha = i + 1 < linhas.length ? linhas[i + 1] : '';
            const mValorProximo = proxLinha.match(/^(?:R\$\s*)?([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})\s*([CD])?$/i);
            if (mValorProximo && descSemData.length > 0) {
                const dc = mValorProximo[2]?.trim() ?? '';
                add(dataContextual, descSemData, mValorProximo[1] + dc);
                i++;
                continue;
            }

            if (descSemData.length === 0 || descSemData.toLowerCase().includes('total de')) continue;
        } else if (dataContextual) {
            if (
                linha.startsWith('Saldo final do período') ||
                linha.startsWith('Saldo inicial') ||
                linha.includes('Rendimento líquido') ||
                /^saldo\s+do\s+dia/i.test(linha)
            ) continue;

            const valoresMatches = Array.from(linha.matchAll(/(?:^|\s|\|)([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})(?:\s|\||$)/g));
            if (valoresMatches.length > 0) {
                const valorTarget = valoresMatches.find(m => m[1] !== '0,00') || valoresMatches[0];
                const valorReal = valorTarget[1];
                const descParts = linha.split(valorReal);
                const descPura = descParts[0].trim();
                if (descPura.length > 0 && !/^\d+$/.test(descPura)) {
                    add(dataContextual, descPura, valorReal);
                }
            }
        }
    }

    return todos;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ erro: 'Método não permitido.' }); return; }

    const timestamp = new Date().toISOString();
    _idCounter = 0; // Reset id counter per request

    try {
        let body = req.body;
        if (!body || Object.keys(body).length === 0 || Buffer.isBuffer(body)) {
            const rawBody = Buffer.isBuffer(body) ? body.toString('utf8') : await new Promise<string>((resolve, reject) => {
                let str = '';
                req.on('data', chunk => str += chunk.toString('utf8'));
                req.on('end', () => resolve(str));
                req.on('error', reject);
            }).catch(() => '');
            if (rawBody.trim()) { try { body = JSON.parse(rawBody); } catch { } }
        }
        body = body || {};

        const { textoExtrato, hashPdf, nomeCliente, cpf, nomePai, nomeMae, customKeywords } = body;

        if (!nomeCliente?.trim()) { res.status(400).json({ erro: 'Campo "nomeCliente" é obrigatório.' }); return; }
        if (!textoExtrato?.trim()) { res.status(400).json({ erro: 'Texto do extrato é obrigatório.' }); return; }

        // Sanitizar customKeywords: max 10, max 50 chars cada
        const kw: string[] = (Array.isArray(customKeywords) ? customKeywords : [])
            .slice(0, 10)
            .map((k: string) => String(k).slice(0, 50).trim())
            .filter((k: string) => k.length >= 3);

        const ctx: ContextoNomes = {
            nomeCliente: nomeCliente.trim(),
            cpf: cpf?.trim(),
            nomePai: nomePai?.trim(),
            nomeMae: nomeMae?.trim(),
            customKeywords: kw,
        };

        // ── Parsear e classificar ──────────────────────────────────────────────
        const brutas = extrair(textoExtrato);
        if (brutas.length === 0) {
            const amostra = textoExtrato.slice(0, 2500).replace(/\n+/g, ' | ');
            res.status(422).json({ erro: 'Nenhuma transação reconhecida.', debug_texto_extraido: amostra });
            return;
        }

        let transacoes: Transacao[] = brutas.map(b => classificar(b.dataRaw, b.descricaoRaw, b.valorRaw, ctx));

        // v3: pós-processamentos determinísticos
        transacoes = detectarWashTrading(transacoes);
        transacoes = sinalizarTerceirosRecorrentes(transacoes);

        // ── Agrupar créditos por mês ───────────────────────────────────────────
        const creditosValidos = transacoes.filter(t =>
            (t.classificacao === 'credito_valido' || t.classificacao === 'possivel_vinculo_familiar' || t.classificacao === 'possivel_renda_familiar') && t.is_validated
        );
        const sinalizadas = transacoes.filter(t => t.custom_tag !== null && t.is_validated);
        const ignoradas = transacoes.filter(t =>
            !['credito_valido', 'possivel_vinculo_familiar', 'possivel_renda_familiar', 'debito'].includes(t.classificacao)
        );

        const totalPorMes: Record<string, number> = {};
        for (const c of creditosValidos) {
            totalPorMes[c.mes] = (totalPorMes[c.mes] ?? 0) + c.valor;
        }

        const avisos: string[] = [];
        const mesesConsiderados = Object.keys(totalPorMes).length;

        if (mesesConsiderados === 0) {
            const amostraDebug = transacoes.slice(0, 20).map(t => ({
                descricao: t.descricao, valor: t.valor, classificacao: t.classificacao, motivo: t.motivoExclusao,
            }));
            res.status(422).json({
                erro: 'Nenhum crédito válido identificado. Verifique se o nome do cliente está correto.',
                totalTransacoesBrutas: brutas.length,
                transacoesIgnoradas: ignoradas.length,
                debug_amostra_transacoes: amostraDebug,
            });
            return;
        }

        if (mesesConsiderados < 2) {
            avisos.push(`Apenas ${mesesConsiderados} mês(es) com créditos válidos. Resultado pode não ser representativo.`);
        }
        const qtdApostas = transacoes.filter(t => t.classificacao === 'ignorar_aposta').length;
        if (qtdApostas > 0) {
            avisos.push(`${qtdApostas} transação(ões) de apostas/jogos foram excluídas.`);
        }
        const qtdWash = transacoes.filter(t => t.classificacao === 'ignorar_washtrading').length;
        if (qtdWash > 0) {
            avisos.push(`${qtdWash} transação(ões) identificadas como wash trading (in-and-out) foram excluídas.`);
        }

        // ── Métricas ──────────────────────────────────────────────────────────
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
            algoritmoVersao: '3.0.0-interactive',
            totalApurado,
            mediaMensalReal,
            divisao6Meses,
            divisao12Meses,
            maiorMes,
            menorMes,
            mesesConsiderados,
            totalPorMes,
            transacoesConsideradas: creditosValidos.length,
            transacoesIgnoradas: ignoradas.length,
            transacoesSinalizadas: sinalizadas.map(t => ({
                id: t.id, descricao: t.descricao, valor: t.valor, mes: t.mes,
                motivo: t.custom_tag, is_validated: t.is_validated,
            })),
            // Full transaction list (with is_validated) for interactive UI
            transacoesDetalhadas: transacoes.map(t => ({
                id: t.id, data: t.data, mes: t.mes, descricao: t.descricao,
                valor: t.valor, classificacao: t.classificacao,
                is_validated: t.is_validated, custom_tag: t.custom_tag,
                motivoExclusao: t.motivoExclusao,
            })),
            criteriosAplicados: {
                excluiuAutoTransferencia,
                excluiuTransferenciaPais,
                excluiuApostas: qtdApostas > 0,
                excluiuWashTrading: qtdWash > 0,
                modoConservadorInteligente: true,
                customKeywordsUsadas: kw,
            },
            auditoria: {
                hashPdf,
                timestamp,
                algoritmoVersao: '3.0.0-interactive',
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
