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
    'PIX RECEBIDO DE', 'PIXRECEBIDO', 'PIX', 'TRANSFERENCIA PIX', 'TRANSF', 'TRANSF SALDO',
    'PIXRECEBIDO', 'PIX', 'TRANSFERENCIA PIX', 'TRANSF', 'TRANSF SALDO',
    'CRED PIX', 'CR PIX', 'REM', 'REM.', 'REM:', 'DES:',
    'TED RECEBIDA', 'TED CREDITO', 'DOC RECEBIDO', 'DOC CREDITO', 'TEV RECEBIDA',
    'TED', 'DOC', 'TEV', 'LIQUIDACAO',
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
    // SUMMARIES: Linhas de soma do banco (ex: Santander)
    'TOTAL DE CREDITOS', 'TOTAL DE DEBITOS', 'DEPOSITOS / TRANSFERENCIAS', 'SAQUES / TRANSFERENCIAS', 'SOMA', 'SUBTOTAL',
    'OUTROS CREDITOS', 'PAGAMENTOS / TRANSFERENCIAS',
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
        let anoRaw = parts[2] || '';
        let ano = anoRaw.length === 2 ? `20${anoRaw}` : anoRaw;

        // Validação de sanidade: extratos bancários são 2020–2030.
        // Protege contra C6 Bank (duas colunas de data: "31/05 02/06"
        // onde "02" seria tratado como year=2002 sem esta validação).
        const anoNum = parseInt(ano, 10);
        if (!ano || isNaN(anoNum) || anoNum < 2020 || anoNum > 2030) {
            ano = String(new Date().getFullYear());
        }

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

    // 3. Sem keyword de crédito
    const temCredito = KEYWORDS_CREDITO.some(k => descNorm.includes(k));
    if (!temCredito) {
        return { ...base, classificacao: 'ignorar_sem_keyword', motivoExclusao: 'Sem keyword de crédito', is_validated: false, custom_tag: null };
    }

    // Proteção: renda laboral comprovada → pula verificação de nome/CPF
    const ehRendaLaboral = [...INCOME_KEYWORDS_NOMES].some(k => descNorm.includes(k));

    if (!ehRendaLaboral) {
        // 4. Autotransferência (match forte cliente)
        if (calcularMatch(ctx.nomeCliente, descricaoRaw, ctx.cpf) === 'forte') {
            return { ...base, classificacao: 'ignorar_autotransferencia', motivoExclusao: 'Autotransferência', is_validated: false, custom_tag: null };
        }

        // 5. Match fraco cliente → sinalizar ('possivel_vinculo_familiar'), incluído por padrão
        const fracoCliente = calcularMatch(ctx.nomeCliente, descricaoRaw, ctx.cpf) === 'fraco';
        if (fracoCliente) {
            return { ...base, classificacao: 'possivel_vinculo_familiar', motivoExclusao: 'Match fraco — revisão manual', is_validated: true, custom_tag: 'renda_familiar' };
        }
    }

    // 8. Crédito válido
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
            // Keep in UI by classifying it as something the UI displays (e.g., possivel_vinculo_familiar)
            // but default to unchecked (is_validated: false)
            return { ...t, classificacao: 'possivel_vinculo_familiar' as ClassificacaoTransacao, motivoExclusao: 'Wash trading (in-and-out)', is_validated: false, custom_tag: 'washtrading' as CustomTag };
        }
        return t;
    });
}

// (Removido: Terceiros recorrentes / Renda familiar a pedido do usuário)

// ═══════════════════════════════════════════════════════════════════════════════
// PARSER — Extração de transações via regex (multi-estratégia) — inalterado v2
// ═══════════════════════════════════════════════════════════════════════════════

const VALOR_RE = /([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})\s*([CD]|\(\+\)|\(-\)|\+|-)?(?=\s|$|\|)/i;
// DATA_RE: ano numérico exige exatamente 4 dígitos para evitar que o DIA
// da coluna seguinte (formato C6 Bank: "24/05 26/05") seja confundido com ano.
const DATA_RE = /^(\d{2}[\/\-\.\s]\d{2}(?:[\/\-\.\s]\d{4})?|\d{2}[\/\-\.\s]+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\.\s]?(?:\d{2,4})?)/i;

const MESES_EXTENSO_API: Record<string, string> = {
    janeiro: 'JAN', fevereiro: 'FEV', marco: 'MAR', abril: 'ABR',
    maio: 'MAI', junho: 'JUN', julho: 'JUL', agosto: 'AGO',
    setembro: 'SET', outubro: 'OUT', novembro: 'NOV', dezembro: 'DEZ',
};


// ─── NEON BANK: formato específico ───────────────────────────────────────────
// Formato: "DESCRIÇÃO   DD/MM/YYYY   HH:MM   [±]R$ VALOR   R$ SALDO   -"
// O campo DESCRIÇÃO vem antes da data, ao contrário de todos os outros bancos.
// Grupos: [1] descrição [2] data [3] caracteres antes do valor [4] valor
// A hora agora é `\d{2}.?\d{2}` porque `:` muitas vezes vira `\u0000` ou é omitido.
const NEON_LINHA_RE = /^(.{5,100?}?)\s{1,}(\d{2}\/\d{2}\/\d{4})\s+\d{2}.?\d{2}([^\d]*)(\d[\d.]*,\d{2})/;

function isNeonBank(texto: string): boolean {
    // Tenta detectar pelo cabeçalho ou nome da instituição
    const txt = texto.toLowerCase();
    return txt.includes('neon pagamentos') || 
           txt.includes('timeneon') || 
           (txt.includes('extrato por') && txt.includes('período') && txt.includes('conta digital'));
}

function extrairNeon(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    // A primeira página quebra as linhas da tabela via "|" dependendo do PDF parser
    // As demais páginas quebram via "\n". Então vamos separar por qualquer um dos dois.
    const linhasBrutas = texto.split(/[\n|]/);
    const linhas = linhasBrutas.map(l => l.trim()).filter(l => l.length > 0);
    
    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    for (const linha of linhas) {
        // Regex super permissiva pro Neon Bank 
        // Exemplo da linha: "PIX recebido de FULANO 22/07/2025 17\u000045 R$ 50,00 R$ 50,00 -"
        // Usando (.{5,120}?) em vez de (.+?) para impedir que o cabeçalho inteiro seja sugado como se fosse a primeira descrição
        const m = linha.match(/(.{5,120}?)\s+(\d{2}\/\d{2}\/\d{4})\s+\d{2}.?\d{2}([^\d]*?)(\d[\d.]*,\d{2})/i);
        if (!m) continue;
        
        let desc = m[1].replace(/\u0000/g, '').trim();
        // Se a descrição puxou lixo do cabeçalho antes (ex: "Extrato por período... PIX recebido")
        // Vamos forçar um corte pra pegar apenas a última parte relevante (as keywords de banco)
        if (desc.length > 50 && desc.toUpperCase().includes('PIX')) {
            desc = desc.substring(desc.toUpperCase().lastIndexOf('PIX')).trim();
        } else if (desc.length > 50 && desc.toUpperCase().includes('RECARGA')) {
            desc = desc.substring(desc.toUpperCase().lastIndexOf('RECARGA')).trim();
        }
        const dataRaw = m[2];
        const preValor = m[3] || '';
        let valorRaw = m[4];

        // Se tiver "PIX" no final da string mas a regex quebrou errado, limpa
        if (desc.length < 3) continue;

        // Recuperando sinal de débito (o pdf-parse as vezes esconde como \u0000 antes do valor)
        // Neon também as vezes coloca "\u0000 R$" para negativo ou apenas omite se for enviado
        if (preValor.includes('-') || preValor.includes('\u0000') || desc.toUpperCase().includes('ENVIADO')) {
            valorRaw = '-' + valorRaw;
        }

        const chave = `${dataRaw}|${desc}|${valorRaw}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw, descricaoRaw: desc, valorRaw });
        }
    }
    return todos;
}

function extrair(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const normalizado = texto
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .replace(
            /(\d{1,2})\s+de\s+(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)\s+de\s+(\d{4})/gi,
            (_, d, m, a) => {
                const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
                return `${d.padStart(2, '0')}/${MESES_EXTENSO_API[key]}/${a}`;
            }
        )
        .replace(
            /\b(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)[\s\/]+(?:de\s+)?(\d{4})\b/gi,
            (_, m, a) => {
                const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
                return `01/${MESES_EXTENSO_API[key]}/${a}`;
            }
        );

    const limpo = normalizado.trim();
    const linhas = limpo.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    // Tracker para inferir sinal do Bradesco (matemática de Saldo)
    let saldoAnteriorTracker: number | null = null;

    function add(dataRaw: string, descricaoRaw: string, valorStr: string, isCreditInferred?: boolean) {
        let v = valorStr.replace(/\s+/g, '').replace(/^R\$/i, '').replace(/^-R\$/i, '-');
        if (v.startsWith('+')) v = v.substring(1);

        // Suportar (D), (C), (+), (-) ou explicitos
        const mDC = v.match(/^(-?[\d.]+,\d{2})([CD]|\(\+\)|\(-\)|\+|-)?$/i);
        if (mDC) {
            const numPart = mDC[1].replace(/^-/, '');
            const suf = (mDC[2] ?? '').toUpperCase();

            // Se já tem sinal negativo explícito no começo
            if (mDC[1].startsWith('-')) {
                v = `-${numPart}`;
            } else if (suf === 'D' || suf === '(-)' || suf === '-') {
                v = `-${numPart}`;
            } else if (suf === 'C' || suf === '(+)' || suf === '+') {
                v = numPart;
            } else if (isCreditInferred === false) {
                v = `-${numPart}`;
            } else {
                v = numPart;
            }
        } else if (isCreditInferred === false) {
            v = `-${v}`;
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

    // Regex para detectar cabeçalho de mês do C6 Bank: "Maio 2025", "Agosto 2025"
    const C6_MES_RE = /^(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(20\d{2})/i;
    let descAcumulada = ''; // Buffer para acumular descrições multi-linha (ex: Bradesco)

    // Regex para ignorar cabeçalhos de página sem zerar o buffer (apenas pula a linha)
    const CABECALHOS_IGNORE = /^(extrato de|bradesco|banco do brasil|lançamentos|histórico|docto|crédito|débito|saldo|data:|cliente:|agência:|conta:|^[\d/]+$)/i;

    // Máquina de estados para ignorar sessões inteiras (ex: Santander "Comprovantes de Pagamento")
    // Para o Santander, iniciamos ignorando tudo até achar a seção correta ("Conta Corrente"), 
    // pois o extrato consolidado contém resumos e comprovantes que geram falsos positivos.
    const isSantander = /santander/i.test(limpo.substring(0, 1500));
    let isIgnoredSection = isSantander;

    const SECTIONS_IGNORE = /^(comprovantes? de|pacote de servi[çc]os|[íi]ndices econ[óo]micos|resumo (do|de|consolidado)|demonstrativo de|posi[çc][ãa]o de|investimentos|t[íi]tulos? de capitaliza[çc][ãa]o|fundos? de investimento|cr[ée]dito pessoal|poupan[çc]a|cart[ãa]o de cr[ée]dito|seguros|prote[çc][ãa]o)/i;
    // Remove the ^ anchor for CONTA CORRENTE because it can be indented or have dashes attached 
    const SECTIONS_VALID = /(conta corrente|movimenta[çc][ãa]o|lan[çc]amentos|hist[óo]rico(?! de))/i;

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];

        // Verifica mudança de sessão (apenas se a linha for curta para evitar falsos positivos no meio de descrições)
        if (linha.length < 80) {
            if (SECTIONS_IGNORE.test(linha)) {
                isIgnoredSection = true;
                continue;
            } else if (SECTIONS_VALID.test(linha)) {
                isIgnoredSection = false;
                continue;
            }
        }

        // Se estivermos dentro de uma sessão ignorada (como Comprovantes de Pix), pulamos o processamento da linha
        if (isIgnoredSection) continue;

        // C6 Bank: cabeçalho de mês ("Maio 2025", "Agosto 2025") — atualiza anoContextual
        const mC6Mes = linha.match(C6_MES_RE);
        if (mC6Mes) { anoContextual = mC6Mes[2]; continue; }

        // C6 Bank: skip linha com duas datas DD/MM consecutivas sem hora (coluna Data Contábil)
        // Exemplo: "24/05 26/05 Entrada PIX" — descarta a 2ª data antes de processar
        const mDuplaDatas = linha.match(/^(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(.+)/);
        const linhaProcessada = mDuplaDatas ? `${mDuplaDatas[1]} ${mDuplaDatas[3]}` : linha;

        const mData = linhaProcessada.match(DATA_RE);

        if (mData) {
            let dataCandidata = mData[1];
            const mAno = dataCandidata.match(/\b(20\d{2})\b/);
            if (mAno) { anoContextual = mAno[1]; }
            else { dataCandidata = `${dataCandidata}/${anoContextual}`; }
            dataContextual = dataCandidata;

            let descSemData = linha.substring(mData[0].length).trim();
            if (/^saldo\s+(do\s+dia|anterior|final|bloqueado)/i.test(descSemData)) {
                // Atualiza o saldo se houver
                const mSaldo = descSemData.match(VALOR_RE);
                if (mSaldo) saldoAnteriorTracker = parseMoeda(mSaldo[1]);
                descAcumulada = ''; // quebrou a continuidade
                continue;
            }

            // Capturar todos os números no final da string para identificar Valor e Saldo 
            // Suporta formatação BR (1.000,00) e US/Revolut (1,000.00)
            const valoresLine = Array.from(descSemData.matchAll(/([+-]?\s*(?:[A-Z]{0,3}\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Z])/ig));

            if (valoresLine.length > 0) {
                // Remove o bloco de números do final para sobrar a descrição
                let descPura = descSemData;
                valoresLine.forEach(m => {
                    descPura = descPura.replace(m[0], '');
                });
                descPura = `${descAcumulada} ${descPura}`.trim();
                descAcumulada = ''; // limpa o buffer após uso

                if (descPura.length === 0 || /^\d+$/.test(descPura)) continue;

                // Se houver mais de um número e for o layout Bradesco (Valor + Saldo no final)
                if (valoresLine.length >= 2) {
                    const ult = valoresLine[valoresLine.length - 1];
                    const penult = valoresLine[valoresLine.length - 2];
                    const saldoAtual = parseMoeda(ult[1]);
                    const valorTransacaoNum = parseMoeda(penult[1]);

                    const strMod = penult[2] ?? '';

                    let isCreditInferred: boolean | undefined = undefined;

                    // Se não tiver sinal explícito (D/C/+/-), tentar matemática
                    if (!strMod.match(/[CD\+\-]/i) && saldoAnteriorTracker !== null) {
                        if (Math.abs((saldoAnteriorTracker + valorTransacaoNum) - saldoAtual) < 5) {
                            isCreditInferred = true;
                        } else if (Math.abs((saldoAnteriorTracker - valorTransacaoNum) - saldoAtual) < 5) {
                            isCreditInferred = false;
                        }
                    }

                    add(dataContextual, descPura, penult[1] + strMod, isCreditInferred);
                    saldoAnteriorTracker = saldoAtual;
                } else {
                    // Apenas 1 valor na linha (ex: BB com (+), Nubank, Inter)
                    const vMatch = valoresLine[0];
                    const vNumStr = vMatch[1];
                    const suf = vMatch[2] ?? '';
                    add(dataContextual, descPura, vNumStr + suf);
                }
                continue;
            }

            // Tratamento Fallback (descrição em uma linha, valor na próxima)
            const proxLinha = i + 1 < linhas.length ? linhas[i + 1] : '';
            const mValorProximo = proxLinha.match(/^(?:[A-Z]{0,3}\$?\s*)?([+-]?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*([CD]|\(\+\)|\(-\)|\+|-)?$/i);
            if (mValorProximo && descSemData.length > 0 && !/^saldo\s+/i.test(descSemData)) {
                const dc = mValorProximo[2]?.trim() ?? '';
                let descPura = `${descAcumulada} ${descSemData}`.trim();
                add(dataContextual, descPura, mValorProximo[1] + dc);
                descAcumulada = '';
                i++;
                continue;
            }

            if (descSemData.length === 0 || descSemData.toLowerCase().includes('total de')) continue;

            // Linha com DATA, mas SEM VALOR. Ex: "03/01/2025 TRANSFERENCIA PIX". Acumula.
            descAcumulada = `${descAcumulada} ${descSemData}`.trim();

        } else if (dataContextual) {
            if (
                linha.startsWith('Saldo final do período') ||
                linha.startsWith('Saldo inicial') ||
                linha.includes('Rendimento líquido') ||
                /^saldo\s+(do\s+dia|anterior|final|bloqueado)/i.test(linha)
            ) {
                const mSaldo = linha.match(VALOR_RE);
                if (mSaldo) saldoAnteriorTracker = parseMoeda(mSaldo[1]);
                descAcumulada = '';
                continue;
            }

            // Ignorar cabeçalhos no meio do texto para não poluir o descAcumulada
            if (CABECALHOS_IGNORE.test(linha)) {
                continue;
            }

            const valoresMatches = Array.from(linha.matchAll(/([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Z])/ig));
            if (valoresMatches.length > 0) {
                // Assume o penúltimo como o valor se tiver múltiplos (lógica Bradesco) e o último como saldo
                let targetMatch = valoresMatches[0];
                let isCreditInferred: boolean | undefined = undefined;

                if (valoresMatches.length >= 2) {
                    const ult = valoresMatches[valoresMatches.length - 1];
                    targetMatch = valoresMatches[valoresMatches.length - 2];

                    const saldoAtual = parseMoeda(ult[1]);
                    const valorNum = parseMoeda(targetMatch[1]);

                    if (!(targetMatch[2] ?? '').match(/[CD\+\-]/i) && saldoAnteriorTracker !== null) {
                        if (Math.abs((saldoAnteriorTracker + valorNum) - saldoAtual) < 5) isCreditInferred = true;
                        else if (Math.abs((saldoAnteriorTracker - valorNum) - saldoAtual) < 5) isCreditInferred = false;
                    }
                    saldoAnteriorTracker = saldoAtual;
                }

                const valorRealNum = targetMatch[1];
                const suf = targetMatch[2] ?? '';

                const descParts = linha.split(valorRealNum);
                let descPura = descParts[0].trim();
                descPura = `${descAcumulada} ${descPura}`.trim();
                descAcumulada = '';

                if (descPura.length > 0 && !/^\d+$/.test(descPura)) {
                    add(dataContextual, descPura, valorRealNum + suf, isCreditInferred);
                }
            } else {
                // Linha sem valor financeiro e não é cabeçalho ou saldo.
                // É continuação de descrição! Ex: "REM: Matheus Rodrigues 03/01"
                descAcumulada = `${descAcumulada} ${linha}`.trim();
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

        const { textoExtrato, hashPdf, nomeCliente, cpf } = body;

        if (!nomeCliente?.trim()) { res.status(400).json({ erro: 'Campo "nomeCliente" é obrigatório.' }); return; }
        if (!textoExtrato?.trim()) { res.status(400).json({ erro: 'Texto do extrato é obrigatório.' }); return; }

        const ctx: ContextoNomes = {
            nomeCliente: nomeCliente.trim(),
            cpf: cpf?.trim(),
        };

        // ── Parsear e classificar ──────────────────────────────────────────────
        const ehNeon = isNeonBank(textoExtrato);
        const brutas = ehNeon ? extrairNeon(textoExtrato) : extrair(textoExtrato);

        if (brutas.length === 0) {
            const amostra = textoExtrato.slice(0, 2500).replace(/\n+/g, ' | ');
            res.status(422).json({ erro: 'Nenhuma transação reconhecida.', debug_texto_extraido: amostra, debug_eh_neon: ehNeon });
            return;
        }

        let transacoes: Transacao[] = brutas.map(b => classificar(b.dataRaw, b.descricaoRaw, b.valorRaw, ctx));

        // v3: Defesa extra - Deduplicação Exata (Data + Valor + Descrição normalizada)
        // Evita que anexos de "Comprovantes" (ex: Santander) que vazem pelo filtro de seção 
        // dobrem a renda ao registrar o mesmo PIX duas vezes.
        const transacoesUnicas: Transacao[] = [];
        const assinaturas = new Set<string>();

        for (const t of transacoes) {
            // Cria uma assinatura ignorando espaços extras, mantendo apenas alfanuméricos curtos para tolerância
            const descCurta = t.descricao.replace(/[^A-Z0-9]/ig, '').substring(0, 15).toUpperCase();
            const assinatura = `${t.data}_${t.valor}_${descCurta}`;

            if (!assinaturas.has(assinatura)) {
                assinaturas.add(assinatura);
                transacoesUnicas.push(t);
            }
        }
        transacoes = transacoesUnicas;

        // v3: pós-processamentos determinísticos
        transacoes = detectarWashTrading(transacoes);

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
        const qtdWash = transacoes.filter(t => t.custom_tag === 'washtrading').length;
        if (qtdWash > 0) {
            avisos.push(`${qtdWash} transação(ões) de wash trading (in-and-out) foram sinalizadas para sua revisão e excluídas do cálculo padrão.`);
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
                excluiuApostas: qtdApostas > 0,
                excluiuWashTrading: qtdWash > 0,
                modoConservadorInteligente: true,
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
