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

type BancoDetectado = 'generic' | 'nubank' | 'inter' | 'neon' | 'bradesco' | 'mercadopago' | 'itau_mensal' | 'santander' | 'pagbank' | 'next';

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
    // SUMMARIES: Linhas de soma do banco (ex: Santander, Itaú mensal)
    'TOTAL DE CREDITOS', 'TOTAL DE DEBITOS', 'DEPOSITOS / TRANSFERENCIAS', 'SAQUES / TRANSFERENCIAS', 'SOMA', 'SUBTOTAL',
    'OUTROS CREDITOS', 'PAGAMENTOS / TRANSFERENCIAS',
    // Itaú "Movimentação Bancária" — sumários da capa que não são transações reais
    'TOTAL ENTRADAS', 'TOTAL SAIDAS', 'TOTAL ENTRADAS TOTAL SAIDAS',
    'TRANSFERENCIAS DOCS E TEDS', 'TRANSFERENCIAS DOCS TEDS',
    'DEPOSITOS E RECEBIMENTOS', 'OUTRAS ENTRADAS', 'OUTRAS SAIDAS',
    'APLIC AUT MAIS', 'APLIC MAIS', 'SALDO APLIC', 'RES APLIC AUT', 'SALDO APLIC AUT MAIS',
    'MINHA CONTA', 'MINHA AGENCIA',
    // Nubank — linhas de resumo diário ("01 JAN 2026 Total de saídas - 10,00")
    'TOTAL DE SAIDAS', 'TOTAL DE ENTRADAS',
    // Nubank — transações de saída (valor aparece positivo na linha individual)
    'TRANSFERENCIA ENVIADA', 'ENVIADA PELO PIX',
    // Nubank — compras no débito e pagamentos (nunca são renda)
    'COMPRA NO DEBITO', 'COMPRA DEBITO', 'COMPRA NO DEB', 'COMPRA COM CARTAO DE DEBITO',
    'COMPRA COM CARTAO', 'PAGAMENTO NO DEBITO', 'PAGAMENTO DEBITO',
    'PAGAMENTO DE FATURA', 'PAGAMENTO FATURA',
    'SAQUE', 'SAQUE ATM', 'SAQUE 24H', 'SAQUE CAIXA',
];

// ── v3: Keywords de apostas/jogos (nova regra 2a) ────────────────────────────
// Keywords específicas (marcas longas) — verificadas com includes() simples
const KEYWORDS_APOSTAS_EXATAS = [
    // Marcas brasileiras conhecidas
    'BETNACIONAL', 'BETANO', 'SPORTINGBET', 'BRAZINO', 'PIXBET',
    'ESPORTE DA SORTE', 'SUPERBET', 'NOVIBET', 'BLAZE',
    'FORTUNE TIGER', 'TIGRINHO',
    'BETFAIR', 'BET365', 'BETWAY', 'BETBOO', 'BETSUL', 'BETSSON', 'BETMOTION',
    'GALERA BET', 'ESTRELA BET', 'VAIDEBET', 'APOSTA GANHA', 'PARIMATCH',
    '1XBET', 'KTO', 'F12 BET', 'F12.BET', 'BRAZINO777',
    'ESPORTES GAMING', 'GAMING BRASIL', 'SORTE ONLINE', 'CASA DE APOSTAS',
    'SPORTSBETTING', 'JOGO DO BICHO',
];
// Keywords curtas/ambíguas — verificadas com word-boundary para não pegar substrings de nomes
// Ex: "BET" não deve casar com "Elizabete", "JOGO" não deve casar com "Jogo de cintura"
const KEYWORDS_APOSTAS_PALAVRA = [
    'BET', 'BETS', 'CASINO', 'CASSINO', 'APOSTA', 'APOSTAS', 'LOTERIA', 'LOTERICA',
    'JOGO', 'JOGOS', 'SLOTS', 'ROLETA', 'POKER', 'FORTUNE',
    'GAMING', 'GAMBLING', 'AZAR', 'ODDS', 'STAKE',
    'SPORTSBOOK', 'BOOKMAKER', 'BOOKIE',
];
// \b (word boundary) garante que "BET" não case dentro de "ELIZABETE" ou "ROBERTA"
const APOSTAS_PALAVRA_RE = new RegExp(
    '\\b(' + KEYWORDS_APOSTAS_PALAVRA.join('|') + ')\\b',
    'i'
);

// ── v3: Renda laboral — pula verificação de autotransferência ────────────────
const INCOME_KEYWORDS_NOMES = new Set([
    'SALARIO', 'VENCIMENTO', 'REMUNERACAO', 'HONORARIO', 'COMISSAO',
    'PROVENTO', 'BONIFICACAO', 'GRATIFICACAO', 'INDENIZACAO', 'RESCISAO',
    'FGTS', 'BENEFICIO', 'AUXILIO', 'FERIAS', 'DECIMO TERCEIRO',
    '13 SALARIO', 'ADIANTAMENTO SALARIAL', 'CRED SAL', 'CRED FGTS',
]);

const KEYWORDS_CREDITO_NORM = Array.from(new Set(KEYWORDS_CREDITO.map(normalizar)));
const KEYWORDS_IGNORAR_NORM = Array.from(new Set(KEYWORDS_IGNORAR.map(normalizar)));
const INCOME_KEYWORDS_NOMES_NORM = Array.from(new Set([...INCOME_KEYWORDS_NOMES].map(normalizar)));

const MERCADO_PAGO_KEYWORDS_CREDITO_NORM = [
    'DINHEIRO RECEBIDO',
    'PAGAMENTO RECEBIDO',
    'PIX RECEBIDO',
    'PIX RECEBIDA',
    'TRANSFERENCIA RECEBIDA',
    'TRANSFERENCIA PIX RECEBIDA',
    'TRANSFERENCIA RECEBIDA VIA PIX',
    'RECEBIMENTO',
    'REEMBOLSO RECEBIDO',
    'ESTORNO RECEBIDO',
    'VENDA',
    'QR RECEBIDO',
].map(normalizar);

const MERCADO_PAGO_KEYWORDS_IGNORAR_NORM = [
    'SEU DINHEIRO RENDEU',
    'RENDIMENTO',
    'RENDIMENTOS',
    'RESGATE',
    'INVESTIMENTO',
    'APLICACAO',
    'PAGAMENTO APROVADO',
    'PAGAMENTO ENVIADO',
].map(normalizar);

function isMercadoPagoCredito(descNorm: string): boolean {
    return MERCADO_PAGO_KEYWORDS_CREDITO_NORM.some(k => k && descNorm.includes(k));
}

const BRADESCO_DESC_LIXO_GLOBAL_RE = /\btransf(?:er[eê]ncia)?\s+saldo\s+c\s*\/\s*sal\s+p\s*\/?\s*c{2}\b/i;
const BRADESCO_CAUSA_MESCLA_GLOBAL_RE = /\b(transfer[êe]ncia\s+pix|pix\s+qr\s+code\s+din[âa]mico|pix\s+qr\s+code\s+est[áa]tico|pix\s+qr\s+code)\b/i;

function isBradescoHeuristico(texto: string): boolean {
    const cab = removerAcentos(texto).toUpperCase().substring(0, 12000);
    return /BRADESCO\s+CELULAR|TRANSF\s+SALDO\s+C\s*\/\s*SAL\s+P\s*\/?\s*CC|PIX\s+QR\s+CODE\s+(DINAMICO|ESTATICO)|CARTAO\s+VISA\s+ELECTRON/.test(cab);
}

function isItauMensalBank(texto: string): boolean {
    const cab = removerAcentos(texto)
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .substring(0, 7000);

    const all = removerAcentos(texto)
        .toUpperCase()
        .replace(/\s+/g, ' ');

    const hasItauBrand = /\bITAU\b|\bITAU\s+UNIBANCO\b/.test(cab);
    const itauNoiseFingerprintHits = [
        /\bMINHA\s+CONTA\b/,
        /\bMINHA\s+AGENCIA\b/,
        /\bPARA\s+DEMAIS\s+SIGLAS\b/,
        /\bTRANSFERENCIAS\s*,?\s*DOCS\s+E\s+TEDS\b/,
        /\bDEPOSITOS\s+E\s+RECEBIMENTOS\b/,
        /\bOUTRAS\s+ENTRADAS\b/,
        /\bOUTRAS\s+SAIDAS\b/,
        /\bPELA\s+BOLSA\s+DE\s+VALORES\b/,
        /\b[A-Z]\s*=\s+/,
    ].reduce((acc, re) => acc + (re.test(all) ? 1 : 0), 0);

    const hasMensalMarkers =
        /\bEXTRATO\s+MENSAL\b/.test(cab)
        || (/\bENTRADAS\b/.test(cab) && /\bCREDITOS\b/.test(cab) && /\bSAIDAS\b/.test(cab) && /\bDEBITOS\b/.test(cab))
        || /\bDATA\s+DESCRICAO\s+ENTRADAS\b/.test(cab);

    return (hasItauBrand && hasMensalMarkers) || itauNoiseFingerprintHits >= 3;
}

function isSantanderBank(texto: string): boolean {
    const cab = removerAcentos(texto)
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .substring(0, 12000);

    const hasBrand = /\bSANTANDER\b/.test(cab);
    const hasContaCorrenteMov = /\bCONTA\s+CORRENTE\b/.test(cab) && /\bMOVIMENTACAO\b|\bMOVIMENTACOES\b/.test(cab);
    const hasTabela = /\bDATA\b\s+\bDESCRICAO\b/.test(cab) && /\bSALDO\b/.test(cab);

    return hasBrand && (hasContaCorrenteMov || hasTabela);
}

function isPagBankBank(texto: string): boolean {
    const cab = removerAcentos(texto)
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .substring(0, 12000);

    const hasBrand = /\bPAGBANK\b|\bPAGSEGURO\b/.test(cab);
    const hasExtrato = /\bEXTRATO\s+DA\s+CONTA\b/.test(cab);
    const hasPeriodo = /\bPERIODO\b\s*[:\-]?\s*\d{2}[\/-]\d{2}[\/-]\d{4}\s*(?:A|ATE|-)\s*\d{2}[\/-]\d{2}[\/-]\d{4}/.test(cab);
    const hasTabela = /\bDATA\b\s+\bDESCRICAO\b\s+\bVALOR\b/.test(cab);

    return hasBrand && (hasExtrato || hasTabela || hasPeriodo);
}

function isNextBank(texto: string): boolean {
    const cab = removerAcentos(texto)
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .substring(0, 15000);

    const hasNextBrand = /\bNEXT\b/.test(cab);
    const hasExtratoConta = /\bEXTRATO\s+DE\s+CONTA\s+CORRENTE\b/.test(cab);
    const hasMovRange = /\bMOVIMENTACAO\s+ENTRE\s*:\s*\d{2}[\/-]\d{2}[\/-]\d{4}\s*(?:A|ATE|-)\s*\d{2}[\/-]\d{2}[\/-]\d{4}/.test(cab);
    const hasTable = /\bDATA\b\s+\bHISTORICO\b\s+\bDOCTO\b\s+\bCREDITO\b\s*\(\s*R\$\s*\)\s+\bDEBITO\b\s*\(\s*R\$\s*\)/.test(cab);

    return hasNextBrand && (hasExtratoConta || hasMovRange || hasTable);
}

function sanitizarDescricaoBradesco(descricao: string): string {
    let desc = descricao.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();

    const idxLixo = desc.search(BRADESCO_DESC_LIXO_GLOBAL_RE);
    if (idxLixo === 0) return '';
    if (idxLixo > 0) desc = desc.slice(0, idxLixo).trim();

    const mMescla = desc.match(BRADESCO_CAUSA_MESCLA_GLOBAL_RE);
    if (mMescla && typeof mMescla.index === 'number' && mMescla.index > 0) {
        const prefixo = desc.slice(0, mMescla.index).trim();
        if (prefixo.length >= 3) desc = prefixo;
    }

    return desc;
}

function isMercadoPagoIgnorar(descNorm: string): boolean {
    return MERCADO_PAGO_KEYWORDS_IGNORAR_NORM.some(k => k && descNorm.includes(k));
}

const DESC_GENERICAS_SEM_ORIGEM = [
    /^PIX$/, /^(?:\d{1,2}\s+\d{2}\s+)?PIX RECEBIDO(?:\s+\d+)?$/, /^RECEBIMENTO(?: DE)? PIX$/, /^TRANSFERENCIA PIX RECEBIDA$/,
    /^MOVIMENTACAO PIX RECEBIDO$/,
    /^PAGAMENTOS TRANSFERENCIAS$/, /^DEPOSITOS TRANSFERENCIAS$/, /^SAQUES TRANSFERENCIAS$/,
    /^TRANSFERENCIA RECEBIDA$/, /^RECEBIMENTO$/, /^CREDITO(?: EM CONTA)?$/,
    /^SALARIO E PROVENTOS$/, /^SALARIO MINIMO$/,
    /^TRANSFERENCIA PIX\s+\d+$/,
    /^PAGAMENTO DE BENEFICIOS(?:\s+\d+)?$/,
];

const DESC_RUIDO_EXTRATO_RE = /\b(PAGINA\s*\d+\/?\d*|EXTRATO[_\s-]?PF|BRADESCARD|EXTRATO\s+CONSOLIDADO\s+INTELIGENTE)\b/;

function ehDescricaoGenericaOuRuido(descNorm: string): boolean {
    if (DESC_RUIDO_EXTRATO_RE.test(descNorm)) return true;
    return DESC_GENERICAS_SEM_ORIGEM.some(re => re.test(descNorm));
}

function ehLinhaResumoMensal(descNorm: string): boolean {
    return /^(TOTAL|SUBTOTAL)\b/.test(descNorm)
        || /\bMOVIMENTACAO(?:ES)?\s+DO\s+MES\b/.test(descNorm)
        || /\bTOTAL\s+MOVIMENTACAO(?:ES)?\b/.test(descNorm);
}

function ehRuidoItauMensal(linha: string): boolean {
    const raw = removerAcentos(linha)
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
    const n = normalizar(linha);
    if (!n) return false;

    // Legenda de siglas do Itaú mensal (ex.: "B = ...", "C = ...", "D = ...", "G = ...", "P = ...")
    // Importante: o normalizar() remove "=", então validamos no texto bruto também.
    if (/^[A-Z]\s*(?:=|:|-)?\s*/.test(raw) && /^(?:[BCDGP])\b/.test(raw)) return true;

    // Casos específicos de legenda que costumam vazar como transação por OCR.
    if (/^[BCDGP]\s*(?:=|:|-)?\s*(ACOES\s+MOVIMENTADAS|CREDITO\s+A\s+COMPENSAR|DEBITO\s+A\s+COMPENSAR|APLICACAO\s+PROGRAMADA|POUPANCA\s+AUTOMATICA)\b/.test(raw)) return true;

    // Blocos de resumo/rodape que aparecem na capa e no corpo do PDF
    if (/\bMINHA\s+CONTA\b/.test(n) || /\bMINHA\s+AGENCIA\b/.test(n)) return true;
    if (/\bPARA\s+DEMAIS\s+SIGLAS\b/.test(n) || /\bCONSULTE\s+AS\s+NOTAS\b/.test(n)) return true;
    if (/\bTRANSFERENCIAS\s*,?\s*DOCS\s+E\s+TEDS\b/.test(n)) return true;
    if (/\bDEPOSITOS\s+E\s+RECEBIMENTOS\b/.test(n) || /\bOUTRAS\s+ENTRADAS\b/.test(n) || /\bOUTRAS\s+SAIDAS\b/.test(n)) return true;
    if (/\bPELA\s+BOLSA\s+DE\s+VALORES\b/.test(n)) return true;

    // Linhas percentuais da visão-resumo ("... 39%", "... 55%")
    if (/\b\d{1,3}%\b/.test(n) && !/\bPIX\b|\bTED\b|\bDOC\b|\bTRANSFERENCIA\b|\bDEPOSITO\b/.test(n)) return true;

    return false;
}

function ehDebitoPorContextoDescricao(descNorm: string): boolean {
    // Não pode tratar "PAGAMENTO RECEBIDO" como débito (regressão global).
    if (/\bPAGAMENTO\s+RECEBID[OA]\b/.test(descNorm)) return false;

    // Débitos textualmente inequívocos.
    if (/\bCOMPRA\b|\bSAQUE\b/.test(descNorm)) return true;
    if (/\b(PIX|TRANSFERENCIA|TED|DOC|TEV)\s+ENVIAD[OA]\b/.test(descNorm)) return true;

    // "PAGAMENTO" é ambíguo em muitos bancos (ex.: "pagamento recebido").
    // Para manter o comportamento conservador anterior, só marcamos débito quando houver
    // contexto explícito de saída/pagamento efetuado.
    if (/\b(PAGAMENTO\s+EFETUADO|PAGTO\s+EFETUADO|PAGAMENTO\s+DE\s+FATURA|FATURA\s+CARTAO|BOLETO\s+PAGO)\b/.test(descNorm)) return true;

    // Bradesco: marcador "DES" (destinatário) combinado com método de transferência.
    if (/\bDES\b/.test(descNorm) && /\b(PIX|TRANSFERENCIA|TED|DOC|TEV)\b/.test(descNorm)) return true;
    return false;
}

function ehEntradaValidaBradesco(descNorm: string): boolean {
    // 1) Depósitos em conta (ATM/caixa/envelope)
    if (/\bDEP\b|\bDEPOSITO\b/.test(descNorm)) return true;

    // 2) PIX recebido (Bradesco usa muito "REM:" para remetente)
    const temPix = /\bPIX\b|\bTRANSFERENCIA\s+PIX\b/.test(descNorm);
    const temIndicadorRecebimento = /\bREM\b|\bRECEB\b|\bRECEBIDO\b|\bCREDITO\b/.test(descNorm);
    const temIndicadorSaida = /\bDES\b|\bENVIADO\b/.test(descNorm);
    if (temPix && temIndicadorRecebimento && !temIndicadorSaida) return true;

    // 3) TED/DOC/TEV recebida
    const temTedDocTev = /\bTED\b|\bDOC\b|\bTEV\b/.test(descNorm);
    if (temTedDocTev && /\bRECEB\b|\bRECEBIDA\b|\bCREDITO\b/.test(descNorm) && !temIndicadorSaida) return true;

    return false;
}

function ehEntradaValidaItauMensal(descNorm: string): boolean {
    // 1) Depósitos em conta (inclui variações como "DEP DINHEIRO ATM")
    if (/\bDEPOSITO\b|\bDEP\s+DINHEIRO\b|\bDEP\b/.test(descNorm)) return true;

    // 2) PIX recebido (Itaú costuma trazer "PIX", "RECEBIDO", "CREDITO")
    const temPix = /\bPIX\b|\bTRANSFERENCIA\s+PIX\b/.test(descNorm);
    const temIndicadorRecebimento = /\bRECEB\b|\bRECEBIDO\b|\bCREDITO\b|\bREM\b/.test(descNorm);
    const temIndicadorSaida = /\bENVIAD\b|\bDES\b/.test(descNorm);
    if (temPix && temIndicadorRecebimento && !temIndicadorSaida) return true;

    // 3) TED/DOC/TEV recebida
    const temTedDocTev = /\bTED\b|\bDOC\b|\bTEV\b/.test(descNorm);
    if (temTedDocTev && /\bRECEB\b|\bRECEBIDA\b|\bCREDITO\b|\bREM\b/.test(descNorm) && !temIndicadorSaida) return true;

    return false;
}

function ehEntradaValidaSantander(descNorm: string): boolean {
    if (/\bDEPOSITO\b|\bDEP\b/.test(descNorm)) return true;

    const temPix = /\bPIX\b|\bPIXRECEBIDO\b|\bPIXENVIADO\b|\bPIX\s+REC[A-Z]*\b|\bPIX\s+EN[A-Z]*ADO\b|\bTRANSFERENCIA\s+PIX\b|\bTRANSF\s+PIX\b/.test(descNorm);
    const temTedDoc = /\bTED\b|\bDOC\b|\bTEV\b/.test(descNorm);
    const temRecebimento = /\bRECEB\b|\bRECEBIDO\b|\bPIXRECEBIDO\b|\bPIX\s+REC[A-Z]*\b|\bTRANSFERENCIA\s+RECEBIDA\b|\bCREDITO\b|\bENTRADA\b/.test(descNorm);
    const temSaida = /\bENVIAD\b|\bDEBITO\b|\bSAIDA\b/.test(descNorm);

    if ((temPix || temTedDoc) && temRecebimento && !temSaida) return true;
    return false;
}

function ehLinhaNaoExibirSantander(descNorm: string): boolean {
    if (/\bSALDO\b|\bSALDO\s+ANTERIOR\b|\bSALDO\s+FINAL\b|\bSALDO\s+PARCIAL\b/.test(descNorm)) return true;
    if (/\bRESUMO\b|\bTOTAL\b|\bSUBTOTAL\b|\bMOVIMENTACAO\s+DO\s+MES\b/.test(descNorm)) return true;
    if (/\bCOMPROVANTE\b|\bPACOTE\s+DE\s+SERVICOS\b|\bINDICES\s+ECONOMICOS\b|\bTARIFA\b|\bJUROS\b|\bANUIDADE\b/.test(descNorm)) return true;
    if (/\bINVESTIMENTO\b|\bPOUPANCA\b|\bCDB\b|\bRENDA\s+VARIAVEL\b|\bFUNDOS?\b|\bSEGUROS\b/.test(descNorm)) return true;
    return false;
}

function ehMovimentoExibirSantander(descNorm: string): boolean {
    if (ehEntradaValidaSantander(descNorm)) return true;
    if (/\b(PIX|TRANSFERENCIA|TRANSF|TED|DOC|TEV)\b/.test(descNorm)) return true;
    if (/\bPIX(?:\s*|_?)(RECEBIDO|ENVIADO)\b/.test(descNorm) || /\bPIX(RECEBIDO|ENVIADO)\b/.test(descNorm)) return true;
    if (/\bPIX\s+REC[A-Z]*\b|\bPIX\s+EN[A-Z]*ADO\b/.test(descNorm)) return true;
    return false;
}

function ehLinhaNaoExibirItauMensal(descNorm: string): boolean {
    // Linhas de investimento/saldo e textos administrativos que nao devem aparecer na apuracao.
    if (/\b(RENDIMENTO|RENDIMENTOS|CDB|CDI|RENDA\s+VARIAVEL|FUNDO|FUNDOS|POUPANCA|APLIC\s+AUT\s+MAIS|APLIC\s+AUTOMATICA|APLICACAO|RESGATE|SALDO\s+PARCIAL|SALDO\s+TOTAL|SALDO\s+ANTERIOR|SALDO\s+FINAL|TOTALIZADOR)\b/.test(descNorm)) return true;

    // Blocos de limite/credito e termos de contrato do LIS.
    if (/\b(LIMITE\s+CONTRATADO|LIMITE\s+VARIAVEL|LIS\s+ADICIONAL|DATA\s+DA\s+PROXIMA\s+RENOVACAO\s+DO\s+CONTRATO|TAXA\s+DE\s+JUROS\s+EFETIVA|ENCARGOS\s+ATRASO|JUROS\s+MORATORIOS|CUSTO\s+EFETIVO\s+TOTAL|\bCET\b|\bIOF\b)\b/.test(descNorm)) return true;

    // Mensagens institucionais e linhas de rodape/resumo operacional.
    if (/\b(SERVICOS\s+ESSENCIAIS|CONSULTE\s+OUTRAS\s+OPCOES|QUALQUER\s+CANAL|FOLHA\s+CHEQUE|TOTAL\s+R|TRANSACAO\s+R|PRINCIPAL)\b/.test(descNorm)) return true;

    // Resumos operacionais de transferencia que nao sao lancamentos reais.
    if (/\b(?:TRANSFERENCIA|TRANSF)\s+DE\s+RECURSO\b/.test(descNorm) && /\bEXCETO\s+DOC(?:\s*\/\s*|\s+E\s+|\s+)TED\b/.test(descNorm)) return true;

    return false;
}

function ehMovimentoExibirItauMensal(descNorm: string): boolean {
    // Entradas validas sempre entram na listagem.
    if (ehEntradaValidaItauMensal(descNorm)) return true;

    // Transferencias feitas/recebidas devem aparecer na UI (mesmo quando nao entram no calculo).
    if (/\b(PIX|TRANSFERENCIA|TRANSF|TED|DOC|TEV)\b/.test(descNorm)) return true;

    return false;
}

function ehInicioNovoLancamento(linha: string): boolean {
    const up = normalizar(linha);
    return /^(TRANSFERENCIA\s+PIX|PIX\s+QR\s+CODE|PIX\s+QR\s+CODE\s+DINAMICO|PIX\s+QR\s+CODE\s+ESTATICO|COMPRA\b|DEP\b|DEPOSITO\b|PAGTO\b|PAGAMENTO\b|TED\b|DOC\b|TEV\b|RENTAB\b)/.test(up);
}

function ehAutotransferenciaProvavelPorNome(nomeCliente: string, descNorm: string): boolean {
    if (!/(PIX RECEBIDO|PIXRECEBIDO|RECEBIMENTO PIX|TRANSFERENCIA RECEBIDA)/.test(descNorm)) return false;

    const tokens = tokenizar(nomeCliente);
    if (tokens.length < 2) return false;

    const encontrados = tokens.filter(t => {
        if (t.length <= 4) {
            return new RegExp(`(?:^|\\s)${t}(?:\\s|$)`).test(descNorm);
        }
        const base = t.slice(0, -1);
        return new RegExp(`(?:^|\\s)(?:${t}|${base})(?:\\s|$)`).test(descNorm);
    }).length;

    return encontrados >= 2;
}

// ── v3: RENDIMENTO contextual — só ignora com CDB/POUPANCA/FUNDO ─────────────
const RENDIMENTO_EXCLUSAO_CONTEXTO = ['CDB', 'POUPANCA', 'POUP', 'FUNDO', 'RESGATE', 'INVEST', 'FACILCRED', 'RENTAB'];
const RENDIMENTO_INCLUSAO_CONTEXTO = ['GRATIFICACAO', 'SALARIO', 'PREMIO', 'TRABALHO'];

function deveIgnorarRendimento(descNorm: string): boolean {
    const temRendimento = descNorm.includes('RENDIMENTO') || descNorm.includes('RENDIMENTOS') || descNorm.includes('RENTAB');
    if (!temRendimento) return false;
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

        const diaNum = parseInt(dia, 10);
        const mesNum = parseInt(mes, 10);
        if (isNaN(diaNum) || isNaN(mesNum) || diaNum < 1 || diaNum > 31 || mesNum < 1 || mesNum > 12) {
            return { data: '', mes: '' };
        }

        return { data: `${ano}-${mes}-${dia}`, mes: `${ano}-${mes}` };
    }

    return { data: '', mes: '' };
}

let _idCounter = 0;
function nextId() { return `t_${++_idCounter}`; }

function classificar(
    dataRaw: string,
    descricaoRaw: string,
    valorRaw: string,
    ctx: ContextoNomes,
    bankDetected: BancoDetectado = 'generic'
): Transacao {
    const { data, mes } = normalizarData(dataRaw);
    const valor = parseMoeda(valorRaw);
    const descNorm = normalizar(descricaoRaw);

    if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(data) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
        return {
            id: nextId(), data: '', mes: '', descricao: descricaoRaw, valor,
            classificacao: 'ignorar_sem_keyword', motivoExclusao: 'Data inválida ou não reconhecida', is_validated: false, custom_tag: null,
        };
    }

    const base: Omit<Transacao, 'classificacao' | 'motivoExclusao' | 'is_validated' | 'custom_tag'> = {
        id: nextId(), data, mes, descricao: descricaoRaw, valor,
    };

    if (bankDetected === 'itau_mensal' && ehRuidoItauMensal(descricaoRaw)) {
        return { ...base, classificacao: 'ignorar_sem_keyword', motivoExclusao: 'Ruido do extrato Itau mensal', is_validated: false, custom_tag: null };
    }

    // 1. Débito
    if (valor <= 0) return { ...base, classificacao: 'debito', is_validated: false, custom_tag: null };

    // 2a. v3: Apostas / jogos (NOVA — verificada antes da blacklist geral)
    // Usa dois critérios: marcas longas com includes(), e palavras curtas com word-boundary regex
    const temAposta =
        KEYWORDS_APOSTAS_EXATAS.some(k => descNorm.includes(k)) ||
        APOSTAS_PALAVRA_RE.test(descNorm);
    if (temAposta) {
        return { ...base, classificacao: 'ignorar_aposta', motivoExclusao: 'Aposta/jogo', is_validated: false, custom_tag: 'aposta' };
    }

    // 2b. Estorno + v3: RENDIMENTO contextual
    const temIgnorar = bankDetected === 'mercadopago'
        ? isMercadoPagoIgnorar(descNorm)
        : KEYWORDS_IGNORAR_NORM.some(k => k && descNorm.includes(k));
    const temRendimento = deveIgnorarRendimento(descNorm);
    if (temIgnorar || temRendimento) {
        return { ...base, classificacao: 'ignorar_estorno', motivoExclusao: 'Estorno/investimento', is_validated: false, custom_tag: null };
    }

    // 2c. Linhas genéricas/resumo (sem contraparte identificável) e ruído de cabeçalho
    if (ehDescricaoGenericaOuRuido(descNorm)) {
        return { ...base, classificacao: 'ignorar_sem_keyword', motivoExclusao: 'Linha genérica ou ruído de extrato', is_validated: false, custom_tag: null };
    }

    // 2d. Resumos mensais e totais agregados do banco
    if (ehLinhaResumoMensal(descNorm)) {
        return { ...base, classificacao: 'ignorar_estorno', motivoExclusao: 'Resumo/totais do extrato', is_validated: false, custom_tag: null };
    }

    // 2e. Débito inferido por contexto textual (especialmente Bradesco com "DES")
    if (ehDebitoPorContextoDescricao(descNorm)) {
        return { ...base, classificacao: 'debito', motivoExclusao: 'Contexto textual de débito', is_validated: false, custom_tag: null };
    }

    // 3. Sem keyword de crédito
    const temCredito = bankDetected === 'mercadopago'
        ? isMercadoPagoCredito(descNorm)
        : (bankDetected === 'santander' && ehEntradaValidaSantander(descNorm))
            ? true
        : (bankDetected === 'itau_mensal' && ehEntradaValidaItauMensal(descNorm))
            ? true
        : KEYWORDS_CREDITO_NORM.some(k => k && descNorm.includes(k));
    if (!temCredito) {
        return { ...base, classificacao: 'ignorar_sem_keyword', motivoExclusao: 'Sem keyword de crédito', is_validated: false, custom_tag: null };
    }

    // Proteção: renda laboral comprovada → pula verificação de nome/CPF
    const ehRendaLaboral = INCOME_KEYWORDS_NOMES_NORM.some(k => k && descNorm.includes(k));
    const pularAutoTransferMercadoPago =
        bankDetected === 'mercadopago' &&
        /TRANSFERENCIA\s+PIX\s+RECEBIDA|DINHEIRO\s+RECEBIDO|PAGAMENTO\s+RECEBIDO|QR\s+RECEBIDO/.test(descNorm);

    const pularAutoTransferSantanderRecebido =
        bankDetected === 'santander' &&
        /PIX\s+RECEBIDO|TRANSFERENCIA\s+RECEBIDA|TED\s+RECEBIDA|DOC\s+RECEBIDO|TEV\s+RECEBIDA/.test(descNorm) &&
        !/MESMA\s+TITULARIDADE|CONTA\s+PROPRIA|ENTRE\s+CONTAS/.test(descNorm);

    const pularAutoTransferNextRecebido =
        bankDetected === 'next' &&
        /\bREM\s*:|PIX\s+RECEBIDO|TRANSFERENCIA\s+PIX\b/.test(descNorm) &&
        !/MESMA\s+TITULARIDADE|CONTA\s+PROPRIA|ENTRE\s+CONTAS/.test(descNorm);

    if (!ehRendaLaboral && !pularAutoTransferMercadoPago && !pularAutoTransferSantanderRecebido && !pularAutoTransferNextRecebido) {
        // 4. Autotransferência (match forte cliente)
        const matchCliente = calcularMatch(ctx.nomeCliente, descricaoRaw, ctx.cpf);
        if (matchCliente === 'forte' || ehAutotransferenciaProvavelPorNome(ctx.nomeCliente, descNorm)) {
            return { ...base, classificacao: 'ignorar_autotransferencia', motivoExclusao: 'Autotransferência', is_validated: false, custom_tag: null };
        }

        // 5. Match fraco cliente → sinalizar ('possivel_vinculo_familiar'), incluído por padrão
        const fracoCliente = matchCliente === 'fraco';
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

const MES_ABREV_NUM: Record<string, string> = {
    JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
    JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
};

function parseDataBR(data: string): Date | null {
    const m = data.match(/^(\d{2})\s*[\/.-]\s*(\d{2})\s*[\/.-]\s*(\d{4})$/);
    if (!m) return null;
    const dia = parseInt(m[1], 10);
    const mes = parseInt(m[2], 10);
    const ano = parseInt(m[3], 10);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 2020 || ano > 2035) return null;
    return new Date(Date.UTC(ano, mes - 1, dia));
}

function normalizarAnoOCR(anoToken: string): string {
    // OCR de PDF pode trocar 0/1 por O/I/L.
    return anoToken
        .replace(/[Oo]/g, '0')
        .replace(/[Il]/g, '1');
}

function parseDataBROCR(data: string): Date | null {
    const m = data.match(/^(\d{2})\s*[\/.-]\s*(\d{2})\s*[\/.-]\s*([0-9OILoil]{4})$/);
    if (!m) return null;
    const dia = parseInt(m[1], 10);
    const mes = parseInt(m[2], 10);
    const ano = parseInt(normalizarAnoOCR(m[3]), 10);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 2020 || ano > 2035) return null;
    return new Date(Date.UTC(ano, mes - 1, dia));
}

function gerarMesesNoIntervalo(inicio: Date, fim: Date): Set<string> {
    const meses = new Set<string>();
    const cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
    const limite = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));

    // Limite de segurança para evitar loops em entrada corrompida.
    let guard = 0;
    while (cursor <= limite && guard < 60) {
        const ano = cursor.getUTCFullYear();
        const mes = String(cursor.getUTCMonth() + 1).padStart(2, '0');
        meses.add(`${ano}-${mes}`);
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        guard++;
    }
    return meses;
}

function obterMesNumerico(dataRaw: string): number | null {
    const raw = dataRaw.trim().toUpperCase();
    const mNum = raw.match(/^\d{2}[\/\-\.\s](\d{2})/);
    if (mNum) {
        const n = parseInt(mNum[1], 10);
        return n >= 1 && n <= 12 ? n : null;
    }
    const mTxt = raw.match(/^\d{2}[\/\-\.\s]+([A-Z]{3,9})/);
    if (!mTxt) return null;
    const key = normalizar(mTxt[1]).substring(0, 3);
    const mes = MES_ABREV_NUM[key];
    return mes ? parseInt(mes, 10) : null;
}

function extrairMesesReferencia(texto: string): Set<string> {
    const meses = new Set<string>();

    const limpo = removerAcentos(texto).toUpperCase();

    // Inter e bancos similares podem ter vários blocos "PERIODO" no mesmo PDF mesclado.
    // Extraímos por linha e exigimos ano com 4 dígitos para evitar truncamentos como "31/12/20".
    const linhas = limpo.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const PERIOD_LINE_RE = /\bPERIODO\b[^0-9]{0,60}(\d{2}\s*[\/.-]\s*\d{2}\s*[\/.-]\s*[0-9OILoil]{4})\s*(?:A|ATE|\s-\s)\s*(\d{2}\s*[\/.-]\s*\d{2}\s*[\/.-]\s*[0-9OILoil]{4})/i;

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        if (!linha.includes('PERIODO')) continue;

        // Alguns PDFs quebram o período em mais de uma linha.
        const candidato = `${linha} ${linhas[i + 1] ?? ''} ${linhas[i + 2] ?? ''}`.replace(/\s+/g, ' ').trim();
        const m = candidato.match(PERIOD_LINE_RE);
        if (!m) continue;

        const d1 = parseDataBROCR(m[1]);
        const d2 = parseDataBROCR(m[2]);
        if (!d1 || !d2) continue;

        const inicio = d1 <= d2 ? d1 : d2;
        const fim = d1 <= d2 ? d2 : d1;
        const mesesDoPeriodo = gerarMesesNoIntervalo(inicio, fim);
        for (const mes of mesesDoPeriodo) meses.add(mes);
    }

    if (meses.size >= 2) {
        return meses;
    }

    const reMesTexto = /(JAN(?:EIRO)?|FEV(?:EREIRO)?|MAR(?:CO)?|ABR(?:IL)?|MAI(?:O)?|JUN(?:HO)?|JUL(?:HO)?|AGO(?:STO)?|SET(?:EMBRO)?|OUT(?:UBRO)?|NOV(?:EMBRO)?|DEZ(?:EMBRO)?)\s*\/?\s*(20\d{2})/g;
    let mt: RegExpExecArray | null;
    while ((mt = reMesTexto.exec(limpo)) !== null) {
        const abrev = mt[1].substring(0, 3);
        const ano = mt[2];
        const mes = MES_ABREV_NUM[abrev];
        if (mes) meses.add(`${ano}-${mes}`);
    }

    const reMesNum = /\b(0[1-9]|1[0-2])\s*\/\s*(20\d{2})\b/g;
    let mn: RegExpExecArray | null;
    while ((mn = reMesNum.exec(limpo)) !== null) {
        const mes = mn[1];
        const ano = mn[2];
        meses.add(`${ano}-${mes}`);
    }

    return meses;
}

function extrairMesesReferenciaSantanderEstrito(texto: string): Set<string> {
    const meses = new Set<string>();
    const limpo = removerAcentos(texto).toUpperCase();
    const linhas = limpo.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const toDate = (raw: string): Date | null => {
        const m = raw.match(/^(\d{2})\s*[\/.-]\s*(\d{2})\s*[\/.-]\s*([0-9OILoil]{2,4})$/);
        if (!m) return null;
        const dia = parseInt(m[1], 10);
        const mes = parseInt(m[2], 10);
        let anoToken = normalizarAnoOCR(m[3]);
        if (anoToken.length === 2) anoToken = `20${anoToken}`;
        const ano = parseInt(anoToken, 10);
        if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 2020 || ano > 2035) return null;
        return new Date(Date.UTC(ano, mes - 1, dia));
    };

    const RE_PERIODO = /\bPERIODO\b[^0-9]{0,80}(\d{2}\s*[\/.-]\s*\d{2}\s*[\/.-]\s*[0-9OILoil]{2,4})\s*(?:A|ATE|\s-\s)\s*(\d{2}\s*[\/.-]\s*\d{2}\s*[\/.-]\s*[0-9OILoil]{2,4})/i;

    for (let i = 0; i < linhas.length; i++) {
        if (!linhas[i].includes('PERIODO')) continue;
        const candidato = `${linhas[i]} ${linhas[i + 1] ?? ''} ${linhas[i + 2] ?? ''}`.replace(/\s+/g, ' ').trim();
        const m = candidato.match(RE_PERIODO);
        if (!m) continue;
        const d1 = toDate(m[1]);
        const d2 = toDate(m[2]);
        if (!d1 || !d2) continue;
        const inicio = d1 <= d2 ? d1 : d2;
        const fim = d1 <= d2 ? d2 : d1;
        for (const mes of gerarMesesNoIntervalo(inicio, fim)) meses.add(mes);
    }

    return meses;
}

function extrairMesesReferenciaSantanderPorSaldo(texto: string): Set<string> {
    const meses = new Set<string>();
    const limpo = removerAcentos(texto).toUpperCase();

    const anosNoTexto = Array.from(limpo.matchAll(/\b(20\d{2})\b/g))
        .map(m => parseInt(m[1], 10))
        .filter(n => !isNaN(n) && n >= 2020 && n <= 2035)
        .sort((a, b) => a - b);
    let ano = anosNoTexto.length > 0 ? anosNoTexto[0] : new Date().getFullYear();

    const mesesSequenciais: number[] = [];
    const reSaldo = /SALDO\s+DE\s+CONTA\s+CORRENTE\s+EM\s+(\d{2})\s*[\/-]\s*(\d{2})/g;
    let m: RegExpExecArray | null;
    while ((m = reSaldo.exec(limpo)) !== null) {
        const mes = parseInt(m[2], 10);
        if (mes >= 1 && mes <= 12) mesesSequenciais.push(mes);
    }

    if (mesesSequenciais.length < 2) return meses;

    let ultimoMes = mesesSequenciais[0];
    meses.add(`${ano}-${String(ultimoMes).padStart(2, '0')}`);
    for (let i = 1; i < mesesSequenciais.length; i++) {
        const atual = mesesSequenciais[i];
        if (atual < ultimoMes - 1) ano += 1;
        meses.add(`${ano}-${String(atual).padStart(2, '0')}`);
        ultimoMes = atual;
    }

    return meses;
}


// ─── NEON BANK: formato específico ───────────────────────────────────────────
// Formato: "DESCRIÇÃO   DD/MM/YYYY   HH:MM   [±]R$ VALOR   R$ SALDO   -"
// O campo DESCRIÇÃO vem antes da data, ao contrário de todos os outros bancos.
// Grupos: [1] descrição [2] data [3] caracteres antes do valor [4] valor
// A hora agora é `\d{2}.?\d{2}` porque `:` muitas vezes vira `\u0000` ou é omitido.
const NEON_LINHA_RE = /^(.{5,100?}?)\s{1,}(\d{2}\/\d{2}\/\d{4})\s+\d{2}.?\d{2}([^\d]*)(\d[\d.]*,\d{2})/;

function isNeonBank(texto: string): boolean {
    // 'neon pagamentos' é checado APENAS no cabeçalho (primeiros 400 chars).
    // Extratos do Nubank mencionam "NEON PAGAMENTOS S.A." como banco destinatário
    // em transações, o que causava falso-positivo ao checar o texto completo.
    const cabecalho = texto.substring(0, 400).toLowerCase();
    const txt = texto.toLowerCase();
    return cabecalho.includes('neon pagamentos') ||
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

function ajustarAnoMesSantanderPorPeriodo(transacoes: Transacao[], mesesReferencia: Set<string>): Transacao[] {
    if (mesesReferencia.size === 0) return transacoes;

    const refsOrdenadas = Array.from(mesesReferencia)
        .filter(m => /^(20\d{2})-(0[1-9]|1[0-2])$/.test(m))
        .sort();
    const refIdx = refsOrdenadas.map((m) => {
        const [a, mm] = m.split('-');
        return { mes: m, idx: parseInt(a, 10) * 12 + parseInt(mm, 10) };
    });
    const refsSet = new Set(refsOrdenadas);

    if (refIdx.length === 0) return transacoes;

    const anosPorMes = new Map<string, number[]>();
    for (const mesRef of mesesReferencia) {
        const m = mesRef.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
        if (!m) continue;
        const ano = parseInt(m[1], 10);
        const mes = m[2];
        const arr = anosPorMes.get(mes) ?? [];
        if (!arr.includes(ano)) arr.push(ano);
        anosPorMes.set(mes, arr);
    }

    return transacoes.map((t) => {
        const md = t.data.match(/^(20\d{2})-(0[1-9]|1[0-2])-(\d{2})$/);
        if (!md) return t;

        const anoAtual = parseInt(md[1], 10);
        const mes = md[2];
        const dia = md[3];
        const mesAtualStr = `${md[1]}-${mes}`;

        // Se o mês já está dentro da janela oficial do período, preserva.
        if (refsSet.has(mesAtualStr)) return t;

        // OCR de Santander pode deslocar mês/ano (ex.: 2024-11, 2025-09) fora da janela real.
        // Realinhamos para o mês de referência mais próximo.
        const idxAtual = anoAtual * 12 + parseInt(mes, 10);
        const maisProximo = refIdx.reduce((best, cur) =>
            Math.abs(cur.idx - idxAtual) < Math.abs(best.idx - idxAtual) ? cur : best,
        refIdx[0]);

        const [anoRealinhado, mesRealinhado] = maisProximo.mes.split('-');

        const anos = (anosPorMes.get(mesRealinhado) ?? []).slice().sort((a, b) => a - b);
        const anoEscolhido = anos.length > 0
            ? anos.reduce((best, a) => (Math.abs(a - parseInt(anoRealinhado, 10)) < Math.abs(best - parseInt(anoRealinhado, 10)) ? a : best), anos[0])
            : parseInt(anoRealinhado, 10);

        return {
            ...t,
            data: `${anoEscolhido}-${mesRealinhado}-${dia}`,
            mes: `${anoEscolhido}-${mesRealinhado}`,
        };
    });
}

function gerarFaixaMeses(inicio: string, fim: string): string[] {
    const mi = inicio.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
    const mf = fim.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
    if (!mi || !mf) return [];

    let ano = parseInt(mi[1], 10);
    let mes = parseInt(mi[2], 10);
    const anoFim = parseInt(mf[1], 10);
    const mesFim = parseInt(mf[2], 10);

    const out: string[] = [];
    let guard = 0;
    while ((ano < anoFim || (ano === anoFim && mes <= mesFim)) && guard < 36) {
        out.push(`${ano}-${String(mes).padStart(2, '0')}`);
        mes += 1;
        if (mes > 12) { mes = 1; ano += 1; }
        guard += 1;
    }
    return out;
}

function selecionarJanelaMesesSantander(transacoes: Transacao[], mesesReferencia: Set<string>): Set<string> {
    const mesesComQtd = new Map<string, number>();
    for (const t of transacoes) {
        if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(t.mes)) continue;
        mesesComQtd.set(t.mes, (mesesComQtd.get(t.mes) ?? 0) + 1);
    }

    const mesesDetectados = Array.from(mesesComQtd.keys()).sort();
    if (mesesDetectados.length === 0) return new Set<string>();
    if (mesesDetectados.length === 1) return new Set<string>(mesesDetectados);

    const paraIdx = (m: string) => {
        const [a, mm] = m.split('-');
        return parseInt(a, 10) * 12 + parseInt(mm, 10);
    };

    const clusters: string[][] = [];
    let atual: string[] = [mesesDetectados[0]];
    for (let i = 1; i < mesesDetectados.length; i++) {
        const prev = mesesDetectados[i - 1];
        const cur = mesesDetectados[i];
        if (paraIdx(cur) - paraIdx(prev) <= 1) {
            atual.push(cur);
        } else {
            clusters.push(atual);
            atual = [cur];
        }
    }
    clusters.push(atual);

    const melhor = clusters.reduce((best, c) => {
        const score = c.reduce((s, m) => s + (mesesComQtd.get(m) ?? 0), 0);
        const bestScore = best.reduce((s, m) => s + (mesesComQtd.get(m) ?? 0), 0);
        if (score !== bestScore) return score > bestScore ? c : best;
        return c.length > best.length ? c : best;
    }, clusters[0]);

    const inicio = melhor[0];
    const fim = melhor[melhor.length - 1];
    const baseFaixa = new Set<string>(gerarFaixaMeses(inicio, fim));

    for (const mr of mesesReferencia) {
        if (mr >= inicio && mr <= fim) baseFaixa.add(mr);
    }

    return baseFaixa;
}

function isMercadoPagoBank(texto: string): boolean {
    const norm = removerAcentos(texto).toUpperCase();
    const cabecalho = norm.substring(0, 12000);

    const temMarcaMercadoPago = /MERCADO\s+PAGO|MERCADOPAGO|MERCADO\s*LIVRE\s+PAGOS/.test(cabecalho);
    const temContextoExtrato = /EXTRATO|ATIVIDADE|MOVIMENTACAO|MOVIMENTACOES|DINHEIRO\s+EM\s+CONTA|DINHEIRO\s+RECEBIDO/.test(norm);
    const temPadraoForteMercadoPago = /DINHEIRO\s+RECEBIDO|SEU\s+DINHEIRO\s+RENDEU|PAGAMENTO\s+RECEBIDO|QR\s+RECEBIDO|DETALHE\s+DOS\s+MOVIMENTOS/.test(norm);

    return (temMarcaMercadoPago && temContextoExtrato) || (temMarcaMercadoPago && temPadraoForteMercadoPago);
}

function extrairMercadoPagoPorBloco(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const compact = removerAcentos(texto)
        .replace(/[–—−]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    // Captura linhas de tabela mesmo quando o PDF/OCR colapsa quebras de linha/colunas.
    // Exemplo esperado:
    // 17-04-2025 Transferencia Pix recebida ... 108728... R$ 35,00 R$ 35,00
    const rowRe = /(\d{2}[\/-]\d{2}[\/-]\d{4})\s+(.{3,240}?)\s+(?:\d{8,20}\s+)?(?:R\$\s*)?([+-]?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s+(?:R\$\s*)?([+-]?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?=\s+\d{2}[\/-]\d{2}[\/-]\d{4}|$)/gi;

    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(compact)) !== null) {
        const dataRaw = m[1].replace(/-/g, '/');
        const descricaoRaw = m[2].replace(/\s+/g, ' ').trim();
        let valorRaw = m[3].replace(/\s+/g, '');

        if (!descricaoRaw || descricaoRaw.length < 3) continue;

        const descNorm = normalizar(descricaoRaw);
        if (!valorRaw.startsWith('-') && /PAGAMENTO\s+ENVIADO|TRANSFERENCIA\s+ENVIADA|PIX\s+ENVIADO|COMPRA|SAQUE|RETIRADA/.test(descNorm)) {
            valorRaw = `-${valorRaw}`;
        }

        const chave = `${dataRaw}|${descricaoRaw}|${valorRaw}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw, descricaoRaw, valorRaw });
        }
    }

    return todos;
}

function extrairMercadoPagoUltraFallback(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const linhas = removerAcentos(texto)
        .replace(/[–—−]/g, '-')
        .split(/\r?\n/)
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    const DATA_RE_MP = /^(\d{2})[\/-](\d{2})[\/-](\d{4})\b/;
    const VALOR_RE_MP = /R\$\s*[+-]?\d{1,3}(?:\.\d{3})*,\d{2}|[+-]?\d{1,3}(?:\.\d{3})*,\d{2}/g;

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        const mData = linha.match(DATA_RE_MP);
        if (!mData) continue;

        const dataRaw = `${mData[1]}/${mData[2]}/${mData[3]}`;

        const janela = [linhas[i - 2] || '', linhas[i - 1] || '', linhas[i], linhas[i + 1] || '', linhas[i + 2] || '']
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        const janelaNorm = normalizar(janela);

        const linhaValores = (linha.match(VALOR_RE_MP) || []).map(v => v.replace(/\s+/g, ''));
        const proxValores = (linhas[i + 1]?.match(VALOR_RE_MP) || []).map(v => v.replace(/\s+/g, ''));
        const valores = [...linhaValores, ...proxValores];
        if (valores.length === 0) continue;

        let valorRaw = valores[0].replace(/^R\$/i, '');

        let descricaoRaw = janela
            .replace(DATA_RE_MP, ' ')
            .replace(/\b\d{8,20}\b/g, ' ')
            .replace(/R\$\s*[+-]?\d{1,3}(?:\.\d{3})*,\d{2}/g, ' ')
            .replace(/[+-]?\d{1,3}(?:\.\d{3})*,\d{2}/g, ' ')
            .replace(/\b(DATA|DESCRICAO|ID\s+DA\s+OPERACAO|VALOR|SALDO|DETALHE\s+DOS\s+MOVIMENTOS)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (/TRANSFERENCIA\s+PIX\s+RECEBIDA/.test(janelaNorm) && !/TRANSFERENCIA\s+PIX\s+RECEBIDA/.test(normalizar(descricaoRaw))) {
            descricaoRaw = `Transferencia Pix recebida ${descricaoRaw}`.trim();
        } else if (/DINHEIRO\s+RECEBIDO/.test(janelaNorm) && !/DINHEIRO\s+RECEBIDO/.test(normalizar(descricaoRaw))) {
            descricaoRaw = `Dinheiro recebido ${descricaoRaw}`.trim();
        } else if (/TRANSFERENCIA\s+PIX\s+ENVIADA/.test(janelaNorm) && !/TRANSFERENCIA\s+PIX\s+ENVIADA/.test(normalizar(descricaoRaw))) {
            descricaoRaw = `Transferencia Pix enviada ${descricaoRaw}`.trim();
        }

        if (!descricaoRaw || descricaoRaw.length < 3) {
            descricaoRaw = 'Movimentacao Mercado Pago';
        }

        const descNorm = normalizar(descricaoRaw);
        if (!valorRaw.startsWith('-') && /PAGAMENTO\s+ENVIADO|TRANSFERENCIA\s+ENVIADA|PIX\s+ENVIADO|COMPRA|SAQUE|RETIRADA/.test(descNorm)) {
            valorRaw = `-${valorRaw}`;
        }

        const chave = `${dataRaw}|${descricaoRaw}|${valorRaw}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw, descricaoRaw, valorRaw });
        }
    }

    return todos;
}

function extrairMercadoPago(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const linhas = texto
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[\x00-\x08\x0B-\x1F]/g, ' ')
        .split(/[\n|]/)
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    const anoFromPeriodo = (() => {
        const periodo = removerAcentos(texto).toUpperCase().match(/\b(20\d{2})\b/g);
        if (!periodo || periodo.length === 0) return String(new Date().getFullYear());
        return periodo[periodo.length - 1];
    })();

    let anoContextual = anoFromPeriodo;
    let dataContextual = '';

    const dataApenasRe = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/;
    const dataNoInicioRe = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+)$/;
    const linhaCompletaRe = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})$/i;
    const valorInlineRe = /([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})(?!.*\d{1,3}(?:\.\d{3})*,\d{2})/i;
    const dataPtBrExtensoRe = /(\d{1,2})\s+(?:DE\s+)?(JAN(?:EIRO)?|FEV(?:EREIRO)?|MAR(?:CO)?|ABR(?:IL)?|MAI(?:O)?|JUN(?:HO)?|JUL(?:HO)?|AGO(?:STO)?|SET(?:EMBRO)?|OUT(?:UBRO)?|NOV(?:EMBRO)?|DEZ(?:EMBRO)?)(?:\s+(?:DE\s+)?)?(20\d{2})?/i;

    const MESES_MP: Record<string, string> = {
        JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
        JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
    };

    const withContextYear = (raw: string): string => {
        const m = raw.match(/^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/);
        if (!m) return raw;
        const dia = m[1];
        const mes = m[2];
        let ano = m[3] || anoContextual;
        if (ano.length === 2) ano = `20${ano}`;
        return `${dia}/${mes}/${ano}`;
    };

    const parseDataExtenso = (raw: string): string | null => {
        const m = removerAcentos(raw).toUpperCase().match(dataPtBrExtensoRe);
        if (!m) return null;
        const dia = String(parseInt(m[1], 10)).padStart(2, '0');
        const mesKey = m[2].substring(0, 3);
        const mes = MESES_MP[mesKey];
        if (!mes) return null;
        let ano = m[3] || anoContextual;
        if (ano.length === 2) ano = `20${ano}`;
        return `${dia}/${mes}/${ano}`;
    };

    const isDebitoMercadoPago = (descNorm: string): boolean => {
        return /PAGAMENTO\s+ENVIADO|TRANSFERENCIA\s+ENVIADA|PIX\s+ENVIADO|COMPRA|SAQUE|RETIRADA/.test(descNorm);
    };

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];

        const mDataApenas = linha.match(dataApenasRe);
        if (mDataApenas) {
            dataContextual = withContextYear(linha);
            const ano = dataContextual.split('/')[2];
            if (ano) anoContextual = ano;
            continue;
        }

        const dataExtenso = parseDataExtenso(linha);
        if (dataExtenso && linha.trim().length <= 28) {
            dataContextual = dataExtenso;
            const ano = dataContextual.split('/')[2];
            if (ano) anoContextual = ano;
            continue;
        }

        const mLinhaCompleta = linha.match(linhaCompletaRe);
        if (mLinhaCompleta) {
            const dataRaw = withContextYear(mLinhaCompleta[1]);
            const descricaoRaw = mLinhaCompleta[2].trim();
            let valorRaw = mLinhaCompleta[3].replace(/\s+/g, '');

            const ano = dataRaw.split('/')[2];
            if (ano) anoContextual = ano;

            const descNorm = normalizar(descricaoRaw);
            if (!valorRaw.startsWith('-') && isDebitoMercadoPago(descNorm)) {
                valorRaw = `-${valorRaw}`;
            }

            const chave = `${dataRaw}|${descricaoRaw}|${valorRaw}`;
            if (!vistas.has(chave)) {
                vistas.add(chave);
                todos.push({ dataRaw, descricaoRaw, valorRaw });
            }
            continue;
        }

        const mDataInicio = linha.match(dataNoInicioRe);
        if (mDataInicio) {
            dataContextual = withContextYear(mDataInicio[1]);
            const ano = dataContextual.split('/')[2];
            if (ano) anoContextual = ano;

            const restoLinha = mDataInicio[2].trim();
            const mValorResto = restoLinha.match(valorInlineRe);
            if (!mValorResto) continue;

            let valorRaw = mValorResto[1].replace(/\s+/g, '');
            const descricaoRaw = restoLinha.replace(mValorResto[1], ' ').replace(/\s+/g, ' ').trim();
            if (!descricaoRaw || descricaoRaw.length < 3) continue;

            const descNorm = normalizar(descricaoRaw);
            if (!valorRaw.startsWith('-') && isDebitoMercadoPago(descNorm)) {
                valorRaw = `-${valorRaw}`;
            }

            const chave = `${dataContextual}|${descricaoRaw}|${valorRaw}`;
            if (!vistas.has(chave)) {
                vistas.add(chave);
                todos.push({ dataRaw: dataContextual, descricaoRaw, valorRaw });
            }
            continue;
        }

        // Padrão comum de OCR no Mercado Pago:
        // linha A: "12/03" (ou "12 MAR 2025")
        // linha B: "Dinheiro recebido"
        // linha C: "R$ 1.250,00"
        const dataLinhaAtual = parseDataExtenso(linha) || (linha.match(dataApenasRe) ? withContextYear(linha) : '');
        if (dataLinhaAtual) {
            const prox1 = linhas[i + 1] || '';
            const prox2 = linhas[i + 2] || '';
            const val1 = prox1.match(valorInlineRe);
            const val2 = prox2.match(valorInlineRe);
            const valorEscolhido = val1 ? val1[1] : (val2 ? val2[1] : '');
            const descEscolhida = val1 ? prox2 : prox1;

            if (valorEscolhido && descEscolhida && descEscolhida.length >= 3) {
                let valorRaw = valorEscolhido.replace(/\s+/g, '');
                const descricaoRaw = descEscolhida.replace(/\s+/g, ' ').trim();
                const descNorm = normalizar(descricaoRaw);
                if (!valorRaw.startsWith('-') && isDebitoMercadoPago(descNorm)) {
                    valorRaw = `-${valorRaw}`;
                }

                const chave = `${dataLinhaAtual}|${descricaoRaw}|${valorRaw}`;
                if (!vistas.has(chave)) {
                    vistas.add(chave);
                    todos.push({ dataRaw: dataLinhaAtual, descricaoRaw, valorRaw });
                }
            }
        }

        if (!dataContextual) continue;

        const mValorInline = linha.match(valorInlineRe);
        if (!mValorInline) continue;

        let valorRaw = mValorInline[1].replace(/\s+/g, '');
        const descricaoRaw = linha.replace(mValorInline[1], ' ').replace(/\s+/g, ' ').trim();
        if (!descricaoRaw || descricaoRaw.length < 3) continue;

        const descNorm = normalizar(descricaoRaw);
        if (!valorRaw.startsWith('-') && isDebitoMercadoPago(descNorm)) {
            valorRaw = `-${valorRaw}`;
        }

        const chave = `${dataContextual}|${descricaoRaw}|${valorRaw}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw: dataContextual, descricaoRaw, valorRaw });
        }
    }

    if (todos.length === 0) {
        const byBlock = extrairMercadoPagoPorBloco(texto);
        if (byBlock.length > 0) return byBlock;
        return extrairMercadoPagoUltraFallback(texto);
    }

    return todos;
}

function isNubankBank(texto: string): boolean {
    const norm = removerAcentos(texto)
        .replace(/[\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .toUpperCase();
    const cabecalho = norm.substring(0, 12000);

    const temNuPagamentos = /NU\s*PAGAMENTOS\s*-\s*IP\s*\(0260\)/.test(norm);
    const temOuvidoriaNubank = /NUBANK\.COM\.BR\/CONTATOS#OUVIDORIA/.test(norm) || /EXTRATO\s+GERADO\s+DIA/.test(norm);
    const temPadraoLinhaNubank = /TRANSFERENCIA\s+RECEBIDA|TRANSFERENCIA\s+ENVIADA\s+PELO\s+PIX|MOVIMENTACOES\s+\d{2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)/.test(norm);

    return (temNuPagamentos && temPadraoLinhaNubank)
        || (temOuvidoriaNubank && temPadraoLinhaNubank)
        || (/\bNUBANK\b/.test(cabecalho) && temPadraoLinhaNubank);
}

function extrairNubank(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const linhas = texto
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[\x00-\x09\x0B-\x1F]/g, ' ')
        .split(/[\n|]/)
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const mesesAbrev: Record<string, string> = {
        JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
        JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
    };

    const dateRe = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(20\d{2})/i;
    const valorRe = /^([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})$/i;
    const valorInlineRe = /([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})(?!.*\d{1,3}(?:\.\d{3})*,\d{2})/i;
    const totalResumoRe = /\bTOTAL\s+DE\s+(ENTRADAS|SAIDAS)\b/i;
    const inicioTransacaoRe = /(TRANSFERENCIA\s+RECEBIDA|TRANSFERENCIA\s+ENVIADA\s+PELO\s+PIX|TRANSFERENCIA\s+ENVIADA|PIX\s+RECEBIDO|PIX\s+ENVIADO|COMPRA\s+NO\s+DEBITO|PAGAMENTO\b)/i;

    const isNubankBoilerplate = (s: string): boolean => {
        const n = normalizar(s);
        return /TEM ALGUMA DUVIDA|ATENDIMENTO 24H|OUVIDORIA|EXTRATO GERADO DIA|NUBANK COM BR CONTATOS|VALORES EM R|CPFAGENCIA|SALDO FINAL DO PERIODO|SALDO INICIAL/.test(n)
            || /^\d+\s+DE\s+\d+$/.test(n);
    };

    const stripNubankBoilerplate = (s: string): string => {
        return s
            .replace(/(Tem alguma d[uú]vida\?.*)$/i, '')
            .replace(/(Ouvidoria:.*)$/i, '')
            .replace(/(Extrato gerado dia.*)$/i, '')
            .replace(/(VALORES\s+EM\s+R\$.*)$/i, '')
            .replace(/(CPF\s*Ag[êe]ncia.*)$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    let dataContextual = '';
    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        const linhaNorm = normalizar(linha);

        const md = linhaNorm.match(dateRe);
        if (md) {
            const dia = md[1];
            const mes = mesesAbrev[md[2].toUpperCase()];
            const ano = md[3];
            if (mes) dataContextual = `${dia}/${mes}/${ano}`;
        }

        if (!dataContextual) continue;
        if (totalResumoRe.test(linhaNorm)) continue;
        const mIni = linhaNorm.match(inicioTransacaoRe);
        if (!mIni) continue;

        let descricao = linha;
        const key = mIni[1];
        const linhaBusca = removerAcentos(linha).toUpperCase();
        const idxReal = linhaBusca.indexOf(key);
        if (idxReal >= 0) descricao = linha.substring(idxReal).trim();
        if (/RECEBIDA[A-Z]/i.test(descricao)) {
            descricao = descricao.replace(/RECEBIDA(?=[A-Z])/i, 'RECEBIDA ');
        }
        if (/PIX[A-Z]/i.test(descricao)) {
            descricao = descricao.replace(/PIX(?=[A-Z])/i, 'PIX ');
        }
        descricao = stripNubankBoilerplate(descricao);

        let valorRaw = '';

        // 1) tenta capturar valor na própria linha da transação
        const selfValor = descricao.match(valorInlineRe);
        if (selfValor) {
            valorRaw = selfValor[1].replace(/\s+/g, '');
            descricao = descricao.replace(selfValor[1], ' ').replace(/\s+/g, ' ').trim();
        }

        // 2) se não encontrou, busca nas próximas linhas (conta/agência/etc + valor)
        for (let j = i + 1; !valorRaw && j < Math.min(i + 14, linhas.length); j++) {
            const cand = linhas[j];
            if (dateRe.test(normalizar(cand))) break;
            if (totalResumoRe.test(normalizar(cand))) break;
            if (isNubankBoilerplate(cand)) break;
            const mv = cand.match(valorRe);
            if (mv) {
                valorRaw = mv[1].replace(/\s+/g, '');
                i = j;
                break;
            }

            const mvInline = cand.match(valorInlineRe);
            if (mvInline) {
                valorRaw = mvInline[1].replace(/\s+/g, '');
                i = j;
                break;
            }

            if (cand.length > 2 && !/AGENCIA|CONTA|NU PAGAMENTOS|BANCO|BCO/i.test(cand)) {
                descricao = `${descricao} ${cand}`.replace(/\s+/g, ' ').trim();
                descricao = stripNubankBoilerplate(descricao);
            }
        }

        if (!valorRaw) continue;
        if (!descricao || descricao.length < 3 || isNubankBoilerplate(descricao)) continue;

        const descNorm = normalizar(descricao);
        const entradaExplicita = /TRANSFERENCIA RECEBIDA|PIX RECEBIDO/.test(descNorm);
        const saidaExplicita = /TRANSFERENCIA ENVIADA|PIX ENVIADO|COMPRA NO DEBITO|PAGAMENTO/.test(descNorm);

        if (entradaExplicita) valorRaw = valorRaw.replace(/^-/, '');
        if (saidaExplicita) valorRaw = '-' + valorRaw.replace(/^-/, '');

        const chave = `${dataContextual}|${descricao}|${valorRaw}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw: dataContextual, descricaoRaw: descricao, valorRaw });
        }
    }

    return todos;
}

function isInterBank(texto: string): boolean {
    const norm = removerAcentos(texto).toUpperCase();
    const cabecalho = norm.substring(0, 20000);
    const temMarcaInter = /BANCO\s+INTER|INTER\s+S\.?A\.?|CONTA\s+DIGITAL\s+INTER|BANCOINTER/.test(cabecalho);

    if (/BANCO\s+INTER/.test(cabecalho) && /SALDO\s+DO\s+DIA|SALDO\s+POR\s+TRANSACAO|PIX\s+RECEBIDO\s*:\s*"/.test(norm)) return true;

    // Heurísticas estruturais do extrato Inter (inclusive PDFs divididos sem capa).
    const temPeriodoInter = /PERIODO\s*:\s*\d{2}\/\d{2}\/\d{4}\s*A\s*\d{2}\/\d{2}\/\d{4}/.test(cabecalho);
    const temSaldoDoDia = /SALDO\s+DO\s+DIA/.test(norm);
    const temSaldoPorTransacao = /SALDO\s+POR\s+TRANSACAO/.test(norm);
    const temRodapeInter = /SAC\s*:\s*0800\s*940\s*9999/.test(norm) || /OUVIDORIA\s*:\s*0800\s*940\s*7772/.test(norm);
    const temFormatoPixInter = /PIX\s+(RECEBIDO|ENVIADO)\s*:\s*"/.test(norm);

    return (temMarcaInter && temPeriodoInter && (temSaldoDoDia || temSaldoPorTransacao))
        || (temRodapeInter && temSaldoDoDia)
        || (temFormatoPixInter && temSaldoPorTransacao);
}

function extrairInter(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const linhas = texto
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

    const mesesExtensoNum: Record<string, string> = {
        JANEIRO: '01', FEVEREIRO: '02', MARCO: '03', ABRIL: '04', MAIO: '05', JUNHO: '06',
        JULHO: '07', AGOSTO: '08', SETEMBRO: '09', OUTUBRO: '10', NOVEMBRO: '11', DEZEMBRO: '12',
    };

    const transacaoInicioRe = /(PIX\s+RECEBIDO|PIX\s+ENVIADO\s+DEVOLVIDO|PIX\s+ENVIADO|TRANSFERENCIA\s+RECEBIDA|TRANSFERENCIA\s+ENVIADA|COMPRA\s+NO\s+DEBITO|COMPRA\s+SEGURO|SEGURO\s*:|RECARGA\s*:|PAGAMENTO\s+EFETUADO|ESTORNO\s*:|DEB\s+CARTAO)/i;
    const valorRe = /[-+]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}/g;

    let dataContextual = '';
    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    for (const linhaOriginal of linhas) {
        const linhaSemAcento = removerAcentos(linhaOriginal).toUpperCase();

        // Atualiza data contextual a partir dos cabeçalhos de dia do Inter.
        const mDia = linhaSemAcento.match(/^(\d{1,2})\s+DE\s+(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(20\d{2})\b/);
        if (mDia) {
            const dia = mDia[1].padStart(2, '0');
            const mes = mesesExtensoNum[mDia[2]];
            const ano = mDia[3];
            dataContextual = `${dia}/${mes}/${ano}`;
        }

        if (!dataContextual) continue;

        // Remove boilerplate de rodapé/cabeçalhos sem transação.
        if (/^(FALE\s+COM\s+A\s+GENTE|SAC\s*:|OUVIDORIA\s*:|DEFICIENCIA\s+DE\s+FALA)/.test(linhaSemAcento)) {
            continue;
        }

        // Alguns PDFs colam rodapé + transação na mesma linha: cortamos a partir da 1a transação.
        const idxTransacao = linhaSemAcento.search(transacaoInicioRe);
        if (idxTransacao < 0) continue;
        let linha = linhaOriginal.substring(idxTransacao).trim();
        if (!linha) continue;

        const valores = linha.match(valorRe);
        if (!valores || valores.length === 0) continue;

        // Valor da transação = primeiro valor; demais costumam ser saldo por transação.
        const valorPrincipal = valores[0].replace(/\s+/g, '');
        const posValor = linha.search(valorRe);
        const descricao = (posValor >= 0 ? linha.substring(0, posValor) : linha)
            .replace(/\s+/g, ' ')
            .trim();
        if (descricao.length < 3) continue;

        const descNorm = normalizar(descricao);
        const ehCreditoExplicito = /(PIX RECEBIDO|TRANSFERENCIA RECEBIDA|PIX ENVIADO DEVOLVIDO|ESTORNO)/.test(descNorm);
        const ehDebitoExplicito = /(PIX ENVIADO|TRANSFERENCIA ENVIADA|COMPRA NO DEBITO|COMPRA SEGURO|SEGURO|RECARGA|PAGAMENTO EFETUADO|DEB CARTAO)/.test(descNorm);

        let valorRaw = valorPrincipal.replace(/^R\$/i, '');
        if (ehCreditoExplicito) {
            valorRaw = valorRaw.replace(/^-/, '');
        } else if (ehDebitoExplicito) {
            valorRaw = '-' + valorRaw.replace(/^-/, '');
        }

        const chave = `${dataContextual}|${descricao}|${valorRaw}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw: dataContextual, descricaoRaw: descricao, valorRaw });
        }
    }

    return todos;
}

function extrairMesesCabecalhoInter(texto: string): Set<string> {
    const norm = removerAcentos(texto).toUpperCase();
    const linhas = norm.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const meses = new Set<string>();
    const mesesExtensoNum: Record<string, string> = {
        JANEIRO: '01', FEVEREIRO: '02', MARCO: '03', ABRIL: '04', MAIO: '05', JUNHO: '06',
        JULHO: '07', AGOSTO: '08', SETEMBRO: '09', OUTUBRO: '10', NOVEMBRO: '11', DEZEMBRO: '12',
    };

    const reCab = /^(\d{1,2})\s+DE\s+(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(20\d{2})\b/;
    for (const linha of linhas) {
        if (!/SALDO\s+DO\s+DIA/.test(linha)) continue;
        const m = linha.match(reCab);
        if (!m) continue;
        const mes = mesesExtensoNum[m[2]];
        if (mes) meses.add(`${m[3]}-${mes}`);
    }

    return meses;
}

function isBradescoBank(texto: string): boolean {
    const norm = removerAcentos(texto).toUpperCase();
    const cab = norm.substring(0, 8000);
    const temMarcaBradesco = /BANCO\s+BRADESCO|EXTRATO\s+BRADESCO|BRADESCO\s+S\.?A\.?/.test(cab);
    const temEstruturaConta = /AGENCIA|CONTA|SALDO\s+(ANTERIOR|DO\s+DIA|FINAL)/.test(cab);
    return temMarcaBradesco && temEstruturaConta;
}

function extrairPagBank(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const limpo = texto
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[–—−]/g, '-')
        .trim();

    const linhas = limpo
        .split(/[\n|]/)
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    const RE_LINHA = /^(\d{2}[\/-]\d{2}[\/-]\d{4})\s+(.+?)\s+(-?\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}|R\$\s*-?\s*\d{1,3}(?:\.\d{3})*,\d{2}|[+-]?\d{1,3}(?:\.\d{3})*,\d{2}\s*[+-]?)$/i;
    const RE_DATA = /^(\d{2}[\/-]\d{2}[\/-]\d{4})\s*(.*)$/;
    const RE_VALOR_SO = /^(?:-?\s*R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\s*[+-]?$/i;

    let dataAtual = '';
    let descBuffer = '';

    const pushTx = (dataRaw: string, descricaoRaw: string, valorRawIn: string) => {
        if (!dataRaw) return;
        const desc = descricaoRaw.replace(/\s+/g, ' ').trim();
        if (desc.length < 3) return;
        if (/^SALDO\s+DO\s+DIA|^SALDO\s+ANTERIOR|^SALDO\s+FINAL/i.test(desc)) return;

        let valorRaw = valorRawIn.replace(/\s+/g, '');
        valorRaw = valorRaw.replace(/^R\$-/i, '-').replace(/^R\$/i, '');
        if (/^[\d.]+,\d{2}-$/.test(valorRaw)) valorRaw = `-${valorRaw.slice(0, -1)}`;
        else if (/^[\d.]+,\d{2}\+$/.test(valorRaw)) valorRaw = valorRaw.slice(0, -1);

        const descNorm = normalizar(desc);
        if (!valorRaw.startsWith('-') && /\b(PIX\s+ENVIADO|QR\s+CODE\s+PIX\s+ENVIADO|PAGAMENTO\s+DE\s+CONTA|SAQUE|TARIFA|DEBITO)\b/.test(descNorm)) {
            valorRaw = `-${valorRaw}`;
        }
        if (valorRaw.startsWith('-') && /\b(PIX\s+RECEBIDO|TRANSFERENCIA\s+RECEBIDA|TED\s+RECEBIDA|DOC\s+RECEBIDO|DEPOSITO)\b/.test(descNorm)) {
            valorRaw = valorRaw.slice(1);
        }

        const chave = `${dataRaw}|${desc}|${valorRaw}`;
        if (vistas.has(chave)) return;
        vistas.add(chave);
        todos.push({ dataRaw, descricaoRaw: desc, valorRaw });
    };

    for (const linha of linhas) {
        const mLinha = linha.match(RE_LINHA);
        if (mLinha) {
            dataAtual = mLinha[1].replace(/-/g, '/');
            descBuffer = '';
            pushTx(dataAtual, mLinha[2], mLinha[3]);
            continue;
        }

        const mData = linha.match(RE_DATA);
        if (mData) {
            dataAtual = mData[1].replace(/-/g, '/');
            const resto = (mData[2] ?? '').trim();
            if (!resto) { descBuffer = ''; continue; }

            const idxValor = resto.search(/-?\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}|[+-]?\d{1,3}(?:\.\d{3})*,\d{2}\s*[+-]?$/i);
            if (idxValor >= 0) {
                const desc = resto.slice(0, idxValor).trim();
                const val = resto.slice(idxValor).trim();
                pushTx(dataAtual, desc, val);
                descBuffer = '';
            } else {
                descBuffer = resto;
            }
            continue;
        }

        if (!dataAtual) continue;

        if (RE_VALOR_SO.test(linha) && descBuffer) {
            pushTx(dataAtual, descBuffer, linha);
            descBuffer = '';
            continue;
        }

        if (!RE_VALOR_SO.test(linha)) {
            descBuffer = `${descBuffer} ${linha}`.trim();
        }
    }

    return todos;
}

function extrairNext(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const limpo = texto
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[–—−]/g, '-')
        .trim();

    const linhas = limpo
        .split(/[\n|]/)
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    const RE_DATA = /^(\d{2}[\/-]\d{2}[\/-]\d{4})\s*(.*)$/;
    const RE_VALOR = /R\$\s*-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
    const RE_CONTINUACAO = /^(REM\s*:|DES\s*:|FAV\s*:|ORIGEM\s*:|DESTINO\s*:)/i;
    const RE_HISTORICO_NEXT = /^\d{2,4}\s*-\s*[A-Z0-9]/i;

    let dataAtual = '';
    let ultimoIdx = -1;
    let historicoPendente = '';

    const pushTx = (dataRaw: string, descricaoRaw: string, valorRawIn: string) => {
        const desc = descricaoRaw.replace(/\s+/g, ' ').trim();
        if (!dataRaw || desc.length < 3) return;
        if (/^SALDO\s+DO\s+DIA|^SALDO\s+ANTERIOR|^SALDO\s+FINAL/i.test(desc)) return;

        let valorRaw = valorRawIn.replace(/\s+/g, '').replace(/^R\$/i, '');
        if (/^[\d.]+,\d{2}-$/.test(valorRaw)) valorRaw = `-${valorRaw.slice(0, -1)}`;
        if (/^[\d.]+,\d{2}\+$/.test(valorRaw)) valorRaw = valorRaw.slice(0, -1);

        const key = `${dataRaw}|${desc}|${valorRaw}`;
        if (vistas.has(key)) return;
        vistas.add(key);
        todos.push({ dataRaw, descricaoRaw: desc, valorRaw });
        ultimoIdx = todos.length - 1;
    };

    for (const linha of linhas) {
        if (RE_HISTORICO_NEXT.test(linha) && !/^\d{2}[\/-]\d{2}[\/-]\d{4}\b/.test(linha)) {
            historicoPendente = linha.replace(/\s+/g, ' ').trim();
            continue;
        }

        const mData = linha.match(RE_DATA);

        if (mData) {
            dataAtual = mData[1].replace(/-/g, '/');
            let resto = (mData[2] ?? '').trim();
            if (!resto) continue;

            if (/^(SALDO\s+ANTERIOR|SALDO\s+DO\s+DIA|SALDO\s+FINAL)/i.test(resto)) {
                continue;
            }

            const vals = Array.from(resto.matchAll(RE_VALOR));
            if (vals.length === 0) continue;

            const primeiroValor = vals[0][0];
            const idx = resto.indexOf(primeiroValor);
            if (idx < 0) continue;

            let desc = resto.slice(0, idx).trim();
            desc = desc.replace(/\b\d{5,}\b\s*$/, '').trim(); // remove Docto ao final da descrição
            if (!/[A-Z]/i.test(desc) && historicoPendente) {
                desc = historicoPendente;
            }
            if (desc.length < 2) continue;

            let valor = primeiroValor;
            const descNorm = normalizar(desc);
            if (!valor.includes('-') && /\b(DES\s*:|PIX\s+QR\s+CODE\s+DINAMICO|TRANSFERENCIA\s+PIX\b|CARTAO|SAQUE|PAGAMENTO)\b/.test(descNorm) && !/\bREM\s*:/.test(descNorm)) {
                valor = `-${valor}`;
            }

            pushTx(dataAtual, desc, valor);
            continue;
        }

        if (!dataAtual || ultimoIdx < 0) continue;
        if (!RE_CONTINUACAO.test(linha)) continue;

        const tx = todos[ultimoIdx];
        if (!tx || tx.dataRaw !== dataAtual) continue;

        const cont = linha.replace(/\s+/g, ' ').trim();
        tx.descricao = `${tx.descricao} ${cont}`.replace(/\s+/g, ' ').trim();

        const contNorm = normalizar(cont);
        if (/^DES\s*:/.test(contNorm) && !tx.valorRaw.startsWith('-')) {
            tx.valorRaw = `-${tx.valorRaw}`;
        }
        if (/^REM\s*:/.test(contNorm) && tx.valorRaw.startsWith('-')) {
            tx.valorRaw = tx.valorRaw.replace(/^-/, '');
        }

        historicoPendente = '';
    }

    return todos;
}

function extrairSantander(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const limpo = texto
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[–—−]/g, '-')
        .trim();

    const refsEstritas = extrairMesesReferenciaSantanderEstrito(limpo);
    const refsSaldo = extrairMesesReferenciaSantanderPorSaldo(limpo);
    const refsGerais = extrairMesesReferencia(limpo);
    const refs = refsEstritas.size >= 2 ? refsEstritas : (refsSaldo.size >= 2 ? refsSaldo : refsGerais);

    const anosPorMes = new Map<string, number[]>();
    for (const m of refs) {
        const mm = m.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
        if (!mm) continue;
        const ano = parseInt(mm[1], 10);
        const mes = mm[2];
        const arr = anosPorMes.get(mes) ?? [];
        if (!arr.includes(ano)) arr.push(ano);
        anosPorMes.set(mes, arr);
    }

    const anosNoTexto = Array.from(removerAcentos(limpo).toUpperCase().matchAll(/\b(20\d{2})\b/g))
        .map(m => parseInt(m[1], 10))
        .filter(n => !isNaN(n) && n >= 2020 && n <= 2035)
        .sort((a, b) => a - b);

    let anoContextual = anosNoTexto.length > 0
        ? anosNoTexto[0]
        : (Array.from(refs).map(m => parseInt(m.slice(0, 4), 10)).sort((a, b) => a - b)[0] || new Date().getFullYear());
    let ultimoMes: number | null = null;

    const linhasBase = limpo
        .split(/[\n|]/)
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const linhas = linhasBase.flatMap((l) => {
        const partes = l
            .split(/(?=\b\d{2}[\/-]\d{2}(?:[\/-]\d{2,4})?\b)/g)
            .map(p => p.trim())
            .filter(Boolean);
        return partes.length > 1 ? partes : [l];
    });

    const RE_VALOR = /([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2}\s*[+-]?)/g;
    const RE_CABECALHO = /\b(CONTA\s+CORRENTE|MOVIMENTACAO|DATA\s+DESCRICAO|N\s*DOCUMENTO|MOVIMENTO|SALDO|BANCO\s+SANTANDER|TOTAL\s+DE|SALDO\s+DE\s+CONTA\s+CORRENTE\s+EM)\b/;
    const RE_CHAVE_MOV = /\b(PIX|TED|DOC|TEV|DEPOSITO|DEP|TRANSFERENCIA|TRANSF)\b/;

    const resolveData = (token: string): string => {
        const m = token.match(/^(\d{2})[\/-](\d{2})(?:[\/-](\d{2,4}))?$/);
        if (!m) return '';
        const dia = m[1];
        const mes = m[2];
        const mesNum = parseInt(mes, 10);
        if (mesNum < 1 || mesNum > 12) return '';

        if (m[3]) {
            const ano = m[3].length === 2 ? parseInt(`20${m[3]}`, 10) : parseInt(m[3], 10);
            if (!isNaN(ano)) {
                anoContextual = ano;
                ultimoMes = mesNum;
                return `${dia}/${mes}/${ano}`;
            }
        }

        const anosMes = (anosPorMes.get(mes) ?? []).slice().sort((a, b) => a - b);
        if (anosMes.length === 1) {
            anoContextual = anosMes[0];
        } else if (ultimoMes !== null) {
            if (mesNum < ultimoMes - 6) anoContextual += 1;
            else if (mesNum > ultimoMes + 6) anoContextual -= 1;
        }

        ultimoMes = mesNum;
        return `${dia}/${mes}/${anoContextual}`;
    };

    const sinalPorDescricao = (descNorm: string): -1 | 0 | 1 => {
        if (/\bPIX\s+REC|\bPIXRECEBIDO\b|\bTRANSFERENCIA\s+RECEBIDA\b|\bTED\s+RECEBIDA\b|\bDOC\s+RECEBIDO\b|\bTEV\s+RECEBIDA\b|\bDEPOSITO\b|\bDEP\b/.test(descNorm)) return 1;
        if (/\bPIX\s+EN|\bPIXENVIADO\b|\bTRANSFERENCIA\s+ENVIADA\b|\bPAGAMENTO\b|\bSAQUE\b|\bDEBITO\b/.test(descNorm)) return -1;
        return 0;
    };

    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    let dataContextual = '';
    let descPendente = '';

    const addSafe = (dataRaw: string, descricaoRaw: string, valorRaw: string) => {
        const desc = descricaoRaw
            .replace(/\bPIXRECEBIDO\b/gi, 'PIX RECEBIDO')
            .replace(/\bPIXENVIADO\b/gi, 'PIX ENVIADO')
            .replace(/\bPIXREC[A-Z]*\b/gi, 'PIX RECEBIDO')
            .replace(/\bPIXE[A-Z]*ADO\b/gi, 'PIX ENVIADO')
            .replace(/\s+/g, ' ')
            .trim();
        if (desc.length < 3) return;
        const key = `${dataRaw}|${desc}|${valorRaw}`;
        if (vistas.has(key)) return;
        vistas.add(key);
        todos.push({ dataRaw, descricaoRaw: desc, valorRaw });
    };

    for (const linhaOriginal of linhas) {
        let linha = linhaOriginal.replace(/\s+/g, ' ').trim();
        if (!linha) continue;

        const linhaNorm = normalizar(linha);
        if (RE_CABECALHO.test(linhaNorm)) continue;

        const mData = linha.match(/^(\d{2}[\/-]\d{2}(?:[\/-]\d{2,4})?)\s*(.*)$/);
        if (mData) {
            const d = resolveData(mData[1]);
            if (d) dataContextual = d;
            descPendente = '';
            linha = (mData[2] ?? '').trim();
        }

        if (!dataContextual || !linha) continue;

        const valores = Array.from(linha.matchAll(RE_VALOR));
        const linhaNormAtual = normalizar(linha);
        const temChave = RE_CHAVE_MOV.test(linhaNormAtual);

        if (valores.length === 0) {
            if (temChave || descPendente) descPendente = `${descPendente} ${linha}`.trim();
            continue;
        }

        const v0 = valores[0][1];
        const idx = linha.indexOf(v0);
        let desc = (idx >= 0 ? linha.slice(0, idx) : linha).trim();
        if (descPendente) desc = `${descPendente} ${desc}`.trim();
        descPendente = '';

        const descNorm = normalizar(desc);
        if (!RE_CHAVE_MOV.test(descNorm)) continue;

        let valorRaw = v0.replace(/\s+/g, '');
        if (/^[\d.]+,\d{2}-$/.test(valorRaw)) valorRaw = `-${valorRaw.slice(0, -1)}`;
        else if (/^[\d.]+,\d{2}\+$/.test(valorRaw)) valorRaw = valorRaw.slice(0, -1);
        else {
            const s = sinalPorDescricao(descNorm);
            if (s < 0 && !valorRaw.startsWith('-')) valorRaw = `-${valorRaw}`;
            if (s > 0) valorRaw = valorRaw.replace(/^-/, '');
        }

        addSafe(dataContextual, desc, valorRaw);
    }

    return todos;
}

function extrair(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    const normalizado = texto
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .replace(/[–—−]/g, '-') // Normaliza en-dash, em-dash, e sinal de menos matemático para hífen simples
        .replace(
            /(\d{1,2})\s+(?:de\s+)?(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)\s+(?:de\s+)?(\d{4})/gi,
            (_, d, m, a) => {
                const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
                return `${d.padStart(2, '0')}/${MESES_EXTENSO_API[key]}/${a}`;
            }
        )
        .replace(
            // Negative lookbehind: não capturar mês que já é parte de DD/MES/AAAA (resultado da primeira regex)
            /(?<![\/\d])(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)[\s\/]+(?:de\s+)?(\d{4})\b/gi,
            (_, m, a) => {
                const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
                return `01/${MESES_EXTENSO_API[key]}/${a}`;
            }
        );

    const limpo = normalizado.trim();
    
    // Revolut/Santander: alguns PDFs chegam com colunas separadas por pipe (|)
    // ou com várias linhas da tabela colapsadas em uma única linha OCR.
    const isRevolut = /revolut/i.test(limpo.substring(0, 1500));
    const isSantanderHint = /santander/i.test(limpo.substring(0, 2000));
    const isBradesco = isBradescoBank(limpo) || isBradescoHeuristico(limpo);
    const linhasBase = (isRevolut || isSantanderHint)
        ? limpo.split(/[\n|]/).map(l => l.trim()).filter(l => l.length > 0)
        : limpo.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const linhas = isSantanderHint
        ? linhasBase.flatMap((l) => {
            const compacta = l.replace(/\s+/g, ' ').trim();
            if (!compacta) return [];
            const partes = compacta
                .split(/(?=\b\d{2}[\/-]\d{2}(?:[\/-]\d{2,4})?\b)/g)
                .map(p => p.trim())
                .filter(Boolean);
            return partes.length > 1 ? partes : [compacta];
        })
        : linhasBase;

    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    // Tracker para inferir sinal do Bradesco (matemática de Saldo)
    let saldoAnteriorTracker: number | null = null;

    // Nubank: descrições que indicam débito mesmo quando valor vem positivo no PDF
    const NUBANK_DEBIT_DESCS = [
        'COMPRA NO DEBITO', 'COMPRA DEBITO', 'COMPRA NO DEB',
        'COMPRA COM CARTAO', 'PAGAMENTO NO DEBITO', 'PAGAMENTO DEBITO',
        'PAGAMENTO DE FATURA', 'PAGAMENTO FATURA',
        'TRANSFERENCIA ENVIADA', 'PIX ENVIADO', 'ENVIADO PELO PIX',
        'SAQUE',
    ];

    const BRADESCO_NOVA_TRANSACAO_RE = /^(transfer[êe]ncia\s+pix|pix(?:\s+qr\s+code)?\b|cart[ãa]o\b|ted\b|doc\b|tev\b|dep[oó]sito\b|saque\b|pagamento\b|compra\b|transf\b)/i;
    const BRADESCO_CONTINUACAO_RE = /^(rem\.?\s*:|des\.?\s*:|fav(?:orecido)?\b|origem\b|destino\b|cpf\b|cnpj\b|ag[êe]ncia\b|conta\b)/i;

    function combinarDescricao(buffer: string, atual: string): string {
        const atualTrim = atual.trim();
        if (!buffer) return atualTrim;
        if (!atualTrim) return buffer.trim();

        if (!isBradesco) {
            return `${buffer} ${atualTrim}`.trim();
        }

        const bufferTrim = buffer.trim();
        const atualIniciaNova = BRADESCO_NOVA_TRANSACAO_RE.test(atualTrim) || ehInicioNovoLancamento(atualTrim);
        const atualEhContinuacao = BRADESCO_CONTINUACAO_RE.test(atualTrim);
        const bufferPedeContinuacao = /:\s*$/.test(bufferTrim);

        if (atualIniciaNova && !atualEhContinuacao && !bufferPedeContinuacao) {
            return atualTrim;
        }

        return `${bufferTrim} ${atualTrim}`.trim();
    }

    function add(dataRaw: string, descricaoRaw: string, valorStr: string, isCreditInferred?: boolean) {
        let v = valorStr.replace(/\s+/g, '').replace(/^R\$/i, '').replace(/^-R\$/i, '-');
        if (v.startsWith('+')) v = v.substring(1);

        // Nubank: se a descrição indica débito e o valor veio positivo, negativa
        if (isCreditInferred === undefined && !v.startsWith('-')) {
            const descUp = normalizar(descricaoRaw);
            if (NUBANK_DEBIT_DESCS.some(k => descUp.includes(k))) {
                v = `-${v}`;
            }
        }

        // Nubank PIX recebido: "Transferência recebida pelo Pix NOME - CPF - 7,00"
        // O " - " antes do valor é SEPARADOR de campo (não sinal negativo).
        // O valoresLine regex captura "- 7,00" como negativo → corrigir aqui.
        if (v.startsWith('-')) {
            const descUp = normalizar(descricaoRaw);
            const NUBANK_INCOME_DESCS = [
                'TRANSFERENCIA RECEBIDA', 'RECEBIDO PELO PIX', 'PIX RECEBIDO',
                'RECEBIMENTO PIX', 'TED RECEBIDA', 'DOC RECEBIDO', 'TEV RECEBIDA',
                'DEPOSITO RECEBIDO', 'CREDITO EM CONTA', 'VALOR ADICIONADO',
            ];
            if (NUBANK_INCOME_DESCS.some(k => descUp.includes(k))) {
                v = v.substring(1); // "-7,00" → "7,00"
            }
        }

        // Suportar (D), (C), (+), (-) ou explicitos (com centavos decimais em vírgula ou ponto)
        const mDC = v.match(/^(-?[\d.,]+[.,]\d{2})([CD]|\(\+\)|\(-\)|\+|-)?$/i);
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

        const descBase = descricaoRaw.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
        const desc = isBradesco
            ? sanitizarDescricaoBradesco(descBase)
            : (isSantander
                ? descBase
                    .replace(/\bPIXRECEBIDO\b/gi, 'PIX RECEBIDO')
                    .replace(/\bPIXENVIADO\b/gi, 'PIX ENVIADO')
                    .replace(/\bPIXREC[A-Z]*\b/gi, 'PIX RECEBIDO')
                    .replace(/\bPIXE[A-Z]*ADO\b/gi, 'PIX ENVIADO')
                    .replace(/\bTRANSFERENCIARECEBIDA\b/gi, 'TRANSFERENCIA RECEBIDA')
                    .replace(/\bTRANSFERENCIAENVIADA\b/gi, 'TRANSFERENCIA ENVIADA')
                    .replace(/\s+/g, ' ')
                    .trim()
                : descBase);
        if (desc.length < 3) return;
        const chave = `${dataRaw}|${desc}|${v}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw, descricaoRaw: desc, valorRaw: v });
        }
    }

    let dataContextual = '';
    const mAnoInicial = limpo.match(/\b(20\d{2})\b/);
    const anosNoTexto = Array.from(limpo.matchAll(/\b(20\d{2})\b/g))
        .map(m => parseInt(m[1], 10))
        .filter(n => !isNaN(n));
    const anoInicialSantander = (isSantanderHint && anosNoTexto.length > 0)
        ? String(Math.min(...anosNoTexto))
        : null;
    let anoContextual = anoInicialSantander ?? (mAnoInicial ? mAnoInicial[1] : String(new Date().getFullYear()));
    let ultimoMesContextual: number | null = null;

    // Regex para detectar cabeçalho de mês do C6 Bank: "Maio 2025", "Agosto 2025"
    const C6_MES_RE = /^(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(20\d{2})/i;
    let descAcumulada = ''; // Buffer para acumular descrições multi-linha (ex: Bradesco)

    // Regex para ignorar cabeçalhos de página sem zerar o buffer (apenas pula a linha)
    const CABECALHOS_IGNORE = /^(extrato de|bradesco|banco do brasil|santander|nu pagamentos|nubank|lançamentos|histórico|docto|crédito|débito|saldo|data:|cliente:|agência:|conta:|^[\d/]+$|saldo ao final do dias?[:,]?|documento emitido em|hora\s+tipo|origem.*destino|forma de pagamento|entradas\s*(\(cr[eé]ditos?\))?$|sa[ií]das\s*(\(d[eé]bitos?\))?$|outras entradas|dep[oó]sitos e recebimentos|este material est[aá] dispon|res aplic aut mais|saldo aplic aut mais|tem alguma d[uú]vida|atendimento 24h|ouvidoria)/i;

    // Máquina de estados para ignorar sessões inteiras (ex: Santander "Comprovantes de Pagamento")
    // Para o Santander, iniciamos ignorando tudo até achar a seção correta ("Conta Corrente"), 
    // pois o extrato consolidado contém resumos e comprovantes que geram falsos positivos.
    const isSantander = isSantanderHint;
    let isIgnoredSection = isSantander;
    const mesesRefSantander = isSantander ? Array.from(extrairMesesReferencia(limpo)).sort() : [];
    const anosRefSantander = isSantander
        ? Array.from(new Set(mesesRefSantander.map(m => m.slice(0, 4)))).sort()
        : [];

    // Itaú Movimentação Bancária — seção de resumo de entradas/saídas no início do extrato.
    // O cabeçalho "01. Conta Corrente e Aplicações Automáticas" desliga esse modo quando encontrado na listagem detalhada.
    const isItauMensal = isItauMensalBank(limpo);
    if (isItauMensal) isIgnoredSection = true; // Começa ignorando até a seção de transações

    const SECTIONS_IGNORE = /^(comprovantes? de|pacote de servi[çc]os|[íi]ndices econ[óo]micos|resumo consolidado|resumo\s*[-:]|fale conosco|demonstrativo de|posi[çc][ãa]o de|investimentos|t[íi]tulos? de capitaliza[çc][ãa]o|fundos? de investimento|cr[ée]dito pessoal|poupan[çc]a|cart[ãa]o de cr[ée]dito|seguros|prote[çc][ãa]o|extrato consolidado inteligente)/i;
    // Remove the ^ anchor for CONTA CORRENTE because it can be indented or have dashes attached 
    const SECTIONS_VALID = /(conta corrente|movimenta[çc]|lan[çc]amentos|hist[óo]rico(?! de)|transa[çc][ão][ãe]es da conta|extrato( de( conta| transa))?|data\s+descri[çc][ãa]o)/i;
    const SANTANDER_SECTIONS_VALID = /(conta corrente|movimenta[çc][õo]es? de conta|lan[çc]amentos da conta|extrato\s+de\s+conta\s+corrente|data\s+descri[çc][ãa]o)/i;

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        const linhaNorm = normalizar(linha);

        // Verifica mudança de sessão (para Santander permitimos linha mais longa,
        // pois OCR costuma colapsar "Conta Corrente + Movimentacao + Data/Descricao" em uma linha extensa).
        if (linha.length < (isSantander ? 260 : 120)) {
            if (SECTIONS_IGNORE.test(linha)) {
                isIgnoredSection = true;
                continue;
            }

            if (isSantander) {
                if (SANTANDER_SECTIONS_VALID.test(linha) || /\bCONTA\s+CORRENTE\b/.test(linhaNorm) || /\b(?:MOVIMENTACAO|MOVIMENTACOES)\b/.test(linhaNorm) || /\bDATA\s+DESCRICAO\b/.test(linhaNorm)) {
                    isIgnoredSection = false;
                    continue;
                }
            } else if (SECTIONS_VALID.test(linha)) {
                isIgnoredSection = false;
                continue;
            }
        }

        // Santander: fallback definitivo para nao perder meses/paginas.
        // Se entrarmos direto em linhas de tabela (DD/MM ...), destrava a seção automaticamente.
        if (isSantander && isIgnoredSection && /^\d{2}[\/-]\d{2}\b/.test(linha.trim())) {
            isIgnoredSection = false;
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
            // Nova linha com data = início de novo lançamento.
            // Zera buffer para não misturar descrição da movimentação anterior.
            descAcumulada = '';

            let dataCandidata = mData[1];
            const mAno = dataCandidata.match(/\b(20\d{2})\b/);
            if (mAno) { anoContextual = mAno[1]; }
            else {
                const mesAtual = obterMesNumerico(dataCandidata);
                if (isSantander && mesAtual !== null) {
                    const mesPad = String(mesAtual).padStart(2, '0');
                    const anosCandidatos = anosRefSantander.filter(a => mesesRefSantander.includes(`${a}-${mesPad}`));

                    if (anosCandidatos.length === 1) {
                        anoContextual = anosCandidatos[0];
                    } else if (mesAtual !== null && ultimoMesContextual !== null) {
                        if (mesAtual < (ultimoMesContextual - 6)) {
                            anoContextual = String(parseInt(anoContextual, 10) + 1);
                        } else if (mesAtual > (ultimoMesContextual + 6)) {
                            anoContextual = String(parseInt(anoContextual, 10) - 1);
                        }
                    }
                } else if (mesAtual !== null && ultimoMesContextual !== null && mesAtual < (ultimoMesContextual - 6)) {
                    anoContextual = String(parseInt(anoContextual, 10) + 1);
                }
                dataCandidata = `${dataCandidata}/${anoContextual}`;
            }
            dataContextual = dataCandidata;

            const mesCtx = obterMesNumerico(dataContextual);
            if (mesCtx !== null) ultimoMesContextual = mesCtx;

            let descSemData = linha.substring(mData[0].length).trim();
            if (isItauMensal && ehRuidoItauMensal(descSemData)) {
                descAcumulada = '';
                continue;
            }
            if (/^saldo\s+(do\s+dia|anterior|final|bloqueado)/i.test(descSemData)) {
                // Atualiza o saldo se houver
                const mSaldo = descSemData.match(VALOR_RE);
                if (mSaldo) saldoAnteriorTracker = parseMoeda(mSaldo[1]);
                descAcumulada = ''; // quebrou a continuidade
                continue;
            }

            // Capturar todos os números no final da string para identificar Valor e Saldo 
            // Suporta formatação BR (1.000,00) e US/Revolut (1,000.00)
            const valoresLine = Array.from(descSemData.matchAll(/([+-]?\s*(?:R\$?\s*|\b(?:USD|EUR|GBP|BRL|CHF|CAD|JPY|AUD|ARS)\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Za-z])/ig));

            if (valoresLine.length > 0) {
                // Remove o bloco de números do final para sobrar a descrição
                let descPura = descSemData;
                valoresLine.forEach(m => {
                    descPura = descPura.replace(m[0], '');
                });
                descPura = descPura.trim();

                // Nubank: pdfjs pode mesclar "Total de entradas/saídas +X,XX" com a linha real
                // da transação. Quando detectado, stripamos o resumo e usamos o ÚLTIMO valor
                // (montante da transação) em vez do penúltimo (total do dia).
                const NUBANK_RESUMO_RE = /^Total\s+de\s+(?:entradas?|sa[ií]das?)\s*/i;
                let useLastValue = false;
                if (NUBANK_RESUMO_RE.test(descPura)) {
                    descPura = descPura.replace(NUBANK_RESUMO_RE, '').trim();
                    useLastValue = true;
                }

                if (descPura.length === 0 || /^\d+$/.test(descPura)) continue;

                // Se houver mais de um número e for o layout Bradesco (Valor + Saldo no final)
                if (valoresLine.length >= 2) {
                    if (useLastValue) {
                        // Nubank merged-line: o último valor é o montante real da transação
                        const ult = valoresLine[valoresLine.length - 1];
                        add(dataContextual, descPura, ult[1] + (ult[2] ?? ''));
                        saldoAnteriorTracker = parseMoeda(ult[1]);
                    } else if (isSantander) {
                        // Santander (Conta Corrente/Movimentacao): a tabela é Movimento, depois Saldo.
                        // Portanto, o valor da transação é o PRIMEIRO valor da linha.
                        const first = valoresLine[0];
                        add(dataContextual, descPura, first[1] + (first[2] ?? ''));

                        const ult = valoresLine[valoresLine.length - 1];
                        if (ult !== first) saldoAnteriorTracker = parseMoeda(ult[1]);
                    } else {
                        const ult = valoresLine[valoresLine.length - 1];
                        const penult = valoresLine[valoresLine.length - 2];
                        const saldoAtual = parseMoeda(ult[1]);
                        const valorTransacaoNum = parseMoeda(penult[1]);

                        const rawMod = (penult[2] ?? '').toUpperCase();
                        // Quando há valor+saldo na mesma linha (muito comum no Inter),
                        // ignoramos sufixo +/− do penúltimo valor para não herdar o sinal
                        // do saldo seguinte (ex.: "R$ 200,00 -R$ 0,00").
                        const strMod = (rawMod === 'C' || rawMod === 'D' || rawMod === '(+)' || rawMod === '(-)') ? rawMod : '';

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
                    }
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
            const mValorProximo = proxLinha.match(/^(?:R\$?\s*|[A-Z]{0,3}\$?\s*)?([+-]?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*([CD]|\(\+\)|\(-\)|\+|-)?$/i);
            if (mValorProximo && descSemData.length > 0 && !/^saldo\s+/i.test(descSemData)) {
                const dc = mValorProximo[2]?.trim() ?? '';
                let descPura = descSemData.trim();
                add(dataContextual, descPura, mValorProximo[1] + dc);
                descAcumulada = '';
                i++;
                continue;
            }

            if (descSemData.length === 0 || descSemData.toLowerCase().includes('total de')) continue;

            // Linha com DATA, mas SEM VALOR. Ex: "03/01/2025 TRANSFERENCIA PIX". Acumula.
            // Limite de segurança: se o buffer ficar enorme, é lixo de cabeçalho — descarta o lixo e mantém só o trecho atual
            const novaAcumuladaData = descSemData.trim();
            descAcumulada = novaAcumuladaData.length > 300 ? '' : novaAcumuladaData;

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

            if (isItauMensal && ehRuidoItauMensal(linha)) {
                descAcumulada = '';
                continue;
            }

            const valoresMatches = Array.from(linha.matchAll(/([+-]?\s*(?:R\$?\s*|\b(?:USD|EUR|GBP|BRL|CHF|CAD|JPY|AUD|ARS)\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Za-z])/ig));
            if (valoresMatches.length > 0) {
                // Assume o penúltimo como o valor se tiver múltiplos (lógica Bradesco) e o último como saldo
                let targetMatch = valoresMatches[0];
                let isCreditInferred: boolean | undefined = undefined;
                let useLastValueNubank = false;

                if (valoresMatches.length >= 2) {
                    const ult = valoresMatches[valoresMatches.length - 1];
                    targetMatch = isSantander ? valoresMatches[0] : valoresMatches[valoresMatches.length - 2];

                    const saldoAtual = parseMoeda(ult[1]);
                    const valorNum = parseMoeda(targetMatch[1]);

                    if (!(targetMatch[2] ?? '').match(/[CD\+\-]/i) && saldoAnteriorTracker !== null) {
                        if (Math.abs((saldoAnteriorTracker + valorNum) - saldoAtual) < 5) isCreditInferred = true;
                        else if (Math.abs((saldoAnteriorTracker - valorNum) - saldoAtual) < 5) isCreditInferred = false;
                    }
                    saldoAnteriorTracker = saldoAtual;
                }

                const valorRealNum = targetMatch[1];
                const rawSuf = (targetMatch[2] ?? '').toUpperCase();
                const suf = (valoresMatches.length >= 2)
                    ? ((rawSuf === 'C' || rawSuf === 'D' || rawSuf === '(+)' || rawSuf === '(-)') ? rawSuf : '')
                    : (targetMatch[2] ?? '');

                const descParts = linha.split(valorRealNum);
                let descPura = descParts[0].trim();
                descPura = combinarDescricao(descAcumulada, descPura);
                descAcumulada = '';

                // Nubank: strip "Total de entradas/saídas" prefix merged by pdfjs
                const NUBANK_RESUMO_RE2 = /^Total\s+de\s+(?:entradas?|sa[ií]das?)\s*/i;
                if (NUBANK_RESUMO_RE2.test(descPura)) {
                    descPura = descPura.replace(NUBANK_RESUMO_RE2, '').trim();
                    useLastValueNubank = true;
                }

                const valorFinal = useLastValueNubank
                    ? valoresMatches[valoresMatches.length - 1][1] + (valoresMatches[valoresMatches.length - 1][2] ?? '')
                    : valorRealNum + suf;

                if (descPura.length > 0 && !/^\d+$/.test(descPura)) {
                    add(dataContextual, descPura, valorFinal, useLastValueNubank ? undefined : isCreditInferred);
                }
            } else {
                // Linha sem valor financeiro e não é cabeçalho ou saldo.
                // É continuação de descrição! Ex: "REM: Matheus Rodrigues 03/01"
                // Limite de segurança: buffer enorme = lixo de cabeçalho (ex: disclaimer Santander/Nubank) — zera
                const linhaTrim = linha.trim();
                const deveReiniciar =
                    ehInicioNovoLancamento(linhaTrim) ||
                    (/\b(REM|DES)\b/.test(normalizar(descAcumulada)) && ehInicioNovoLancamento(linhaTrim));

                if (deveReiniciar) {
                    descAcumulada = linhaTrim;
                } else {
                    const novaAcumuladaElse = combinarDescricao(descAcumulada, linhaTrim);
                    descAcumulada = novaAcumuladaElse.length > 300 ? '' : novaAcumuladaElse;
                }
            }
        }
    }

    if (isSantander) {
        let anoFallback = anoContextual;
        let dataFallback = '';

        for (const linhaOriginal of linhas) {
            const linha = linhaOriginal.replace(/\s+/g, ' ').trim();
            if (!linha) continue;

            const mDataInicio = linha.match(/^(\d{2}[\/-]\d{2})(?:[\/-](\d{2,4}))?\s*(.*)$/);
            let corpo = linha;
            if (mDataInicio) {
                const ddmm = mDataInicio[1].replace(/-/g, '/');
                const anoExpl = mDataInicio[2];

                if (anoExpl) {
                    anoFallback = anoExpl.length === 2 ? `20${anoExpl}` : anoExpl;
                } else {
                    const mesAtual = obterMesNumerico(ddmm);
                    if (mesAtual !== null) {
                        const mesPad = String(mesAtual).padStart(2, '0');
                        const anosCandidatos = anosRefSantander.filter(a => mesesRefSantander.includes(`${a}-${mesPad}`));
                        if (anosCandidatos.length >= 1) anoFallback = anosCandidatos[0];
                    }
                }

                dataFallback = `${ddmm}/${anoFallback}`;
                corpo = (mDataInicio[3] ?? '').trim();
            }

            if (!dataFallback) continue;
            if (!/\b(PIX|PIXRECEBIDO|PIXENVIADO|TRANSFERENCIA|TRANSF|TED|DOC|TEV|DEPOSITO|DEP)\b/i.test(corpo)) continue;

            const valores = Array.from(corpo.matchAll(/([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2}\s*[+-]?)/g));
            if (valores.length === 0) continue;

            const primeiroValor = valores[0][1];
            const idxValor = corpo.indexOf(primeiroValor);
            if (idxValor < 0) continue;

            const desc = corpo.substring(0, idxValor).trim();
            if (desc.length < 3) continue;

            let valorRaw = primeiroValor.replace(/\s+/g, '');
            if (/^[\d.,]+-$/.test(valorRaw)) valorRaw = `-${valorRaw.slice(0, -1)}`;
            if (/^[\d.,]+\+$/.test(valorRaw)) valorRaw = valorRaw.slice(0, -1);

            add(dataFallback, desc, valorRaw);
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
        const mesesReferencia = extrairMesesReferencia(textoExtrato);

        // ── Parsear e classificar ──────────────────────────────────────────────
        const ehMercadoPago = isMercadoPagoBank(textoExtrato);
        const ehNubank = !ehMercadoPago && isNubankBank(textoExtrato);
        const ehPagBank = !ehMercadoPago && !ehNubank && isPagBankBank(textoExtrato);
        const ehNext = !ehMercadoPago && !ehNubank && !ehPagBank && isNextBank(textoExtrato);
        const ehInter = !ehMercadoPago && !ehNubank && !ehPagBank && !ehNext && isInterBank(textoExtrato);
        const ehNeon = !ehMercadoPago && !ehNubank && !ehPagBank && !ehNext && !ehInter && isNeonBank(textoExtrato);
        const ehItauMensal = !ehMercadoPago && !ehNubank && !ehInter && !ehNeon && !ehPagBank && !ehNext && isItauMensalBank(textoExtrato);
        const ehSantander = !ehMercadoPago && !ehNubank && !ehInter && !ehNeon && !ehPagBank && !ehNext && !ehItauMensal && isSantanderBank(textoExtrato);
        const mesesReferenciaSantander = ehSantander ? extrairMesesReferenciaSantanderEstrito(textoExtrato) : new Set<string>();
        const mesesReferenciaSantanderSaldo = ehSantander ? extrairMesesReferenciaSantanderPorSaldo(textoExtrato) : new Set<string>();
        const mesesReferenciaEfetivos = (ehSantander && mesesReferenciaSantander.size >= 2)
            ? mesesReferenciaSantander
            : ((ehSantander && mesesReferenciaSantanderSaldo.size >= 2) ? mesesReferenciaSantanderSaldo : mesesReferencia);
        const isBradescoExtrato = !ehMercadoPago && !ehNubank && !ehInter && !ehNeon && !ehPagBank && !ehNext && !ehItauMensal && !ehSantander && (isBradescoBank(textoExtrato) || isBradescoHeuristico(textoExtrato));
        const bankDetected: BancoDetectado = ehMercadoPago
            ? 'mercadopago'
            : (ehNubank ? 'nubank' : (ehInter ? 'inter' : (ehNeon ? 'neon' : (ehPagBank ? 'pagbank' : (ehNext ? 'next' : (ehItauMensal ? 'itau_mensal' : (ehSantander ? 'santander' : (isBradescoExtrato ? 'bradesco' : 'generic'))))))));
        let brutas = ehMercadoPago
            ? extrairMercadoPago(textoExtrato)
            : (ehNubank
                ? extrairNubank(textoExtrato)
                : (ehInter ? extrairInter(textoExtrato) : (ehNeon ? extrairNeon(textoExtrato) : (ehPagBank ? extrairPagBank(textoExtrato) : (ehNext ? extrairNext(textoExtrato) : (ehSantander ? extrairSantander(textoExtrato) : extrair(textoExtrato)))))));

        if (ehMercadoPago && brutas.length === 0) {
            // fallback de segurança: alguns PDFs do Mercado Pago chegam com OCR irregular
            // e podem aderir melhor ao parser genérico.
            brutas = extrair(textoExtrato);
        }

        if (brutas.length === 0) {
            const amostra = textoExtrato.slice(0, 2500).replace(/\n+/g, ' | ');
            res.status(422).json({
                erro: 'Nenhuma transação reconhecida.',
                bankDetected,
                debug_texto_extraido: amostra,
                debug_eh_mercadopago: ehMercadoPago,
                debug_eh_nubank: ehNubank,
                debug_eh_inter: ehInter,
                debug_eh_neon: ehNeon,
            });
            return;
        }

        let transacoes: Transacao[] = brutas.map(b => classificar(b.dataRaw, b.descricaoRaw, b.valorRaw, ctx, bankDetected));

        if (bankDetected === 'santander' || ehSantander) {
            transacoes = ajustarAnoMesSantanderPorPeriodo(transacoes, mesesReferenciaEfetivos);
        }

        if (bankDetected === 'itau_mensal' || isItauMensalBank(textoExtrato)) {
            transacoes = transacoes.filter(t => {
                const descNorm = normalizar(t.descricao);
                if (ehRuidoItauMensal(t.descricao)) return false;
                if (ehLinhaNaoExibirItauMensal(descNorm)) return false;

                // No extrato mensal do Itau, exibimos apenas movimentos relevantes:
                // transferencias (feitas/recebidas) e depositos; ocultamos ruido e blocos administrativos.
                return ehMovimentoExibirItauMensal(descNorm);
            });
        }

        if (bankDetected === 'santander' || ehSantander) {
            transacoes = transacoes.filter(t => {
                const descNorm = normalizar(t.descricao);
                if (ehLinhaNaoExibirSantander(descNorm)) return false;
                return ehMovimentoExibirSantander(descNorm);
            });
        }

        // v3: Defesa extra - Deduplicação Exata (Data + Valor + Descrição normalizada)
        // Evita que anexos de "Comprovantes" (ex: Santander) que vazem pelo filtro de seção 
        // dobrem a renda ao registrar o mesmo PIX duas vezes.
        const transacoesUnicas: Transacao[] = [];
        const assinaturas = new Set<string>();

        for (const t of transacoes) {
            // Cria uma assinatura ignorando espaços extras, mantendo apenas alfanuméricos curtos para tolerância
            const descCurta = t.descricao.replace(/[^A-Z0-9]/ig, '').substring(0, 40).toUpperCase();
            const assinatura = `${t.data}_${t.valor}_${descCurta}`;

            if (!assinaturas.has(assinatura)) {
                assinaturas.add(assinatura);
                transacoesUnicas.push(t);
            }
        }
        transacoes = transacoesUnicas;

        let mesesJanelaSantander = new Set<string>();
        if (ehSantander || bankDetected === 'santander') {
            const mesesComMovimento = new Set<string>(
                transacoes
                    .filter(t => /^(20\d{2})-(0[1-9]|1[0-2])$/.test(t.mes))
                    .map(t => t.mes)
            );

            // Santander OCR pode poluir "meses de referência" com janelas maiores que o extrato real.
            // Priorizamos os meses realmente parseados para evitar meses fantasmas/zerados.
            mesesJanelaSantander = mesesComMovimento.size >= 2
                ? mesesComMovimento
                : (mesesReferenciaEfetivos.size >= 2
                    ? new Set<string>(mesesReferenciaEfetivos)
                    : selecionarJanelaMesesSantander(transacoes, mesesReferenciaEfetivos));
            if (mesesJanelaSantander.size > 0) {
                transacoes = transacoes.filter(t => mesesJanelaSantander.has(t.mes));
            }
        }

        let removidasPorPeriodo = 0;

        // Remove meses fora do período explícito do extrato (ex.: meses fantasmas gerados por ruído OCR/PDF).
        // Para Inter usamos parser dedicado e NÃO forçamos esse corte aqui,
        // pois OCR pode truncar o "Período" e reduzir indevidamente a janela.
        if (!ehInter && !ehSantander && mesesReferencia.size >= 2) {
            const antesFiltroPeriodo = transacoes.length;
            transacoes = transacoes.filter(t => mesesReferencia.has(t.mes));
            removidasPorPeriodo = antesFiltroPeriodo - transacoes.length;
        }

        // Regra específica Bradesco: considerar apenas depósito, PIX recebido e TED/DOC/TEV recebida.
        // Evita inflar renda com linhas "DES" (destinatário/saída), resumos e lançamentos ambíguos.
        if (isBradescoExtrato) {
            const saneadas: Transacao[] = [];
            for (const t of transacoes) {
                const descLimpa = sanitizarDescricaoBradesco(t.descricao);
                if (descLimpa.length < 3) continue;
                if (BRADESCO_DESC_LIXO_GLOBAL_RE.test(descLimpa)) continue;
                saneadas.push({ ...t, descricao: descLimpa });
            }
            transacoes = saneadas;

            transacoes = transacoes.map(t => {
                if (t.classificacao === 'debito') return t;
                const descNorm = normalizar(t.descricao);
                if (ehEntradaValidaBradesco(descNorm)) return t;
                return {
                    ...t,
                    classificacao: 'ignorar_sem_keyword' as ClassificacaoTransacao,
                    motivoExclusao: 'Bradesco: apenas entradas recebidas (depósito/PIX REM/TED-DOC recebida)',
                    is_validated: false,
                };
            });
        }

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

        // Base de meses para exibição/cálculo:
        // - Se houver período explícito no extrato, usa esse período (preenchendo meses sem crédito com 0).
        // - Caso contrário, usa os meses observados nas transações parseadas.
        const mesesBaseOrdenados: string[] = (() => {
            const mesesDetectados = new Set<string>();
            for (const t of transacoes) {
                if (/^\d{4}-(0[1-9]|1[0-2])$/.test(t.mes)) mesesDetectados.add(t.mes);
            }

            if (ehInter || ehSantander) {
                const refOrdenada = Array.from(mesesReferenciaEfetivos).sort();
                const detOrdenada = Array.from(mesesDetectados).sort();
                const cabOrdenada = Array.from(extrairMesesCabecalhoInter(textoExtrato)).sort();

                if (ehSantander) {
                    const baseSantander = mesesJanelaSantander.size > 0
                        ? mesesJanelaSantander
                        : new Set<string>(detOrdenada);
                    const ordenadaSantander = Array.from(baseSantander).sort();
                    return ordenadaSantander.length > 12 ? ordenadaSantander.slice(ordenadaSantander.length - 12) : ordenadaSantander;
                }

                // Extratos Inter de 6 meses (PDF dividido) devem respeitar exatamente
                // os meses do cabeçalho "Saldo do dia" e não inflar para 12.
                if (cabOrdenada.length >= 5 && cabOrdenada.length <= 8) {
                    return cabOrdenada;
                }

                // Quando o "Período" do Inter é reconhecido como janela semestral,
                // respeitamos essa janela exatamente para não inflar para 12 meses.
                if (refOrdenada.length >= 5 && refOrdenada.length <= 8) {
                    return refOrdenada;
                }

                // Fallback: PDFs divididos que perdem parte do cabeçalho de período.
                // Se as transações indicarem uma janela semestral clara, usamos 6 meses.
                if (refOrdenada.length <= 4 && detOrdenada.length >= 6 && detOrdenada.length <= 8) {
                    return detOrdenada.slice(detOrdenada.length - 6);
                }

                // No Inter, juntamos o período reconhecido + meses realmente detectados.
                // Isso evita perder meses quando o OCR falha parcialmente no cabeçalho de período.
                const baseInter = new Set<string>([...mesesReferencia, ...mesesDetectados]);
                const ordenadaInter = Array.from(baseInter).sort();

                return ordenadaInter.length > 12 ? ordenadaInter.slice(ordenadaInter.length - 12) : ordenadaInter;
            }

            if (mesesReferencia.size >= 2) {
                const refOrdenada = Array.from(mesesReferencia).sort();
                // Alguns bancos (ex.: Inter) em "12 meses" podem expor mês inicial e final parciais,
                // resultando em 13 rótulos de mês. Mantemos a janela mais recente de 12 para apuração.
                return refOrdenada.length > 12 ? refOrdenada.slice(refOrdenada.length - 12) : refOrdenada;
            }
            return Array.from(mesesDetectados).sort();
        })();
        const usarBaseFechadaPorPeriodo = (ehInter || ehSantander)
            ? mesesBaseOrdenados.length > 0
            : mesesReferencia.size >= 2;

        const totalPorMes: Record<string, number> = {};
        for (const mes of mesesBaseOrdenados) totalPorMes[mes] = 0;
        for (const c of creditosValidos) {
            if (!(c.mes in totalPorMes)) {
                if (usarBaseFechadaPorPeriodo) continue;
                totalPorMes[c.mes] = 0;
            }
            totalPorMes[c.mes] += c.valor;
        }

        const avisos: string[] = [];

        if (removidasPorPeriodo > 0) {
            avisos.push(`${removidasPorPeriodo} transação(ões) fora do período do extrato foram removidas automaticamente.`);
        }
        const mesesComCredito = new Set(
            creditosValidos
                .map(c => c.mes)
                .filter(mes => !usarBaseFechadaPorPeriodo || (mes in totalPorMes))
        ).size;
        const mesesConsiderados = Object.keys(totalPorMes).length;

        if (mesesComCredito === 0) {
            const amostraDebug = transacoes.slice(0, 20).map(t => ({
                descricao: t.descricao, valor: t.valor, classificacao: t.classificacao, motivo: t.motivoExclusao,
            }));
            res.status(422).json({
                erro: 'Nenhum crédito válido identificado. Verifique se o nome do cliente está correto.',
                bankDetected,
                totalTransacoesBrutas: brutas.length,
                transacoesIgnoradas: ignoradas.length,
                debug_amostra_transacoes: amostraDebug,
            });
            return;
        }

        if (mesesComCredito < 2) {
            avisos.push(`Apenas ${mesesComCredito} mês(es) com créditos válidos. Resultado pode não ser representativo.`);
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
            bankDetected,
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
