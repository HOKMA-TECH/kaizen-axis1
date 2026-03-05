// ─── Vercel Serverless Function: POST /api/apuracao ──────────────────────────
// Motor determinístico de apuração de renda — Kaizen Axis
// Versão: 2.0.0-modo-conservador-inteligente
// Zero IA · Zero heurística probabilística · 100% auditável
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
    // Strip prefixo "R$" (Mercado Pago, alguns PDFs do Itaú/Caixa)
    const limpo = raw.trim().replace(/^R\$\s*/i, '').replace(/^-R\$\s*/i, '-').trim();
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
    // PIX
    'PIX RECEBIDO', 'RECEBIMENTO PIX', 'RECEBIMENTO DE PIX', 'TRANSFERENCIA PIX RECEBIDA',
    'PIXRECEBIDO',                      // Santander / C6 / alguns bancos sem espaço
    'CRED PIX', 'CR PIX',               // Caixa Econômica / Banco do Brasil abreviados
    // TED / DOC
    'TED RECEBIDA', 'TED CREDITO', 'DOC RECEBIDO', 'DOC CREDITO', 'TEV RECEBIDA',
    'CRED TED', 'CR TED', 'CRED DOC', 'CR DOC',  // Caixa / BB abreviados
    // Depósito
    'DEPOSITO', 'DEPOSITO IDENTIFICADO', 'DEPOSITO BANCARIO', 'DEPOSITO EM CONTA',
    'DEP IDENT',                        // Depósito Identificado abreviado (Caixa)
    // Crédito genérico
    'CREDITO', 'CREDITO EM CONTA',
    'CRED SAL', 'CRED FGTS', 'CRED INSS',  // Caixa abreviados
    // Transferência recebida (específico — não inclui "TRANSFERENCIA" genérico)
    'TRANSFERENCIA RECEBIDA', 'TRANSFERENCIA CREDITADA', 'RECEBIMENTO', 'RECEBIMENTO DE TRANSFERENCIA', 'PAGAMENTO RECEBIDO',
    'TR RECEB', 'PAG RECEB',            // Abreviados
    // Remuneração / Salário
    'SALARIO', 'REMUNERACAO', 'VENCIMENTO', 'HONORARIO', 'COMISSAO', 'PROVENTO',
    'PREMIO', 'BONIFICACAO', 'GRATIFICACAO', 'ADIANTAMENTO SALARIAL', 'FERIAS', 'DECIMO TERCEIRO', '13 SALARIO',
    // Benefícios / Rescisão
    'BENEFICIO', 'AUXILIO', 'INDENIZACAO', 'RESCISAO', 'FGTS',
    // Plataformas digitais (Mercado Pago, PicPay, etc.)
    'RECEBIMENTO DE PAGAMENTO',
    'LIBERACAO DE DINHEIRO',    // Mercado Pago: liberação de receita de vendas
    'PAGAMENTO COM CODIGO QR',  // Mercado Pago: pagamento recebido via QR
    'VENDA',                    // Mercado Pago / PicPay
];

const KEYWORDS_IGNORAR = [
    // Estornos / Devoluções
    'ESTORNO', 'DEVOLUCAO', 'DEVOLUCAO PIX', 'ESTORNO PIX', 'CANCELAMENTO',
    // Autotransferência
    'ENTRE CONTAS', 'TRANSFERENCIA ENTRE CONTAS', 'MESMA TITULARIDADE', 'CONTA PROPRIA',
    // PIX enviado (saída de dinheiro — nunca é renda)
    'PIXENVIADO', 'PIX ENVIADO',
    // Rendimentos / Aplicações
    'RENDIMENTO', 'RENDIMENTO POUPANCA', 'RENDIMENTO CDB', 'RESGATE', 'RESGATE CDB',
    'RESGATE POUPANCA', 'RESGATE FUNDO', 'APLICACAO', 'APLICACAO AUTOMATICA', 'POUPANCA', 'CDB', 'CDI', 'IOF',
    // Correção monetária (reajuste de poupança/investimento — não é renda de trabalho)
    'CORRECAO MONETARIA', 'CORR MONETARIA',
    // Empréstimos
    'EMPRESTIMO', 'ANTECIPACAO', 'CREDITO CONSIGNADO', 'LIBERACAO EMPRESTIMO',
    // Tarifas / Saldo
    'SALDO', 'SALDO ANTERIOR', 'TARIFA', 'TAXA', 'JUROS', 'MULTA', 'COBRANCA', 'ANUIDADE',
];

function normalizarData(dataRaw: string): { data: string; mes: string } {
    let limpo = dataRaw.trim().toUpperCase();

    // Converte separador de traço para espaço/barra para padronizar
    limpo = limpo.replace(/-/g, ' ').replace(/\//g, ' ').replace(/\s+/g, ' ');

    const MESES: Record<string, string> = {
        JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
        JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
        JANEIRO: '01', FEVEREIRO: '02', MARCO: '03', ABRIL: '04',
        MAIO: '05', JUNHO: '06', JULHO: '07', AGOSTO: '08',
        SETEMBRO: '09', OUTUBRO: '10', NOVEMBRO: '11', DEZEMBRO: '12',
    };

    const parts = limpo.split(' ');

    // Pelo menos dia e mes presentes
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
        // Normaliza ano de 2 dígitos: "24" → "2024"
        const ano = anoRaw.length === 2 ? `20${anoRaw}` : anoRaw;
        return {
            data: `${ano}-${mes}-${dia}`,
            mes: `${ano}-${mes}`,
        };
    }

    // Fallback
    const fallback = new Date().toISOString().split('T')[0];
    return { data: fallback, mes: fallback.substring(0, 7) };
}

// Keywords que indicam renda laboral genuína (salário, FGTS, etc.)
// Quando presentes, o nome do cliente na descrição é ESPERADO (empregador inclui nome do funcionário)
// e NÃO deve ser interpretado como autotransferência.
const INCOME_KEYWORDS_NOMES = new Set([
    'SALARIO', 'VENCIMENTO', 'REMUNERACAO', 'HONORARIO', 'COMISSAO',
    'PROVENTO', 'BONIFICACAO', 'GRATIFICACAO', 'INDENIZACAO', 'RESCISAO',
    'FGTS', 'BENEFICIO', 'AUXILIO', 'FERIAS', 'DECIMO TERCEIRO',
    '13 SALARIO', 'ADIANTAMENTO SALARIAL', 'CRED SAL', 'CRED FGTS',
]);

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

    // 2. Estorno / palavra proibida
    if (KEYWORDS_IGNORAR.some(k => descNorm.includes(k))) {
        return { data, mes, descricao: descricaoRaw, valor, classificacao: 'ignorar_estorno', motivoExclusao: 'Estorno/devolução' };
    }

    // 3. Sem keyword de crédito
    if (!KEYWORDS_CREDITO.some(k => descNorm.includes(k))) {
        return { data, mes, descricao: descricaoRaw, valor, classificacao: 'ignorar_sem_keyword', motivoExclusao: 'Sem keyword de crédito' };
    }

    // Renda laboral comprovada → ignora verificação de autotransferência por nome/CPF.
    // Empregadores incluem o nome/CPF do empregado na descrição de salário — isso é esperado e
    // NÃO indica autotransferência. Exemplos: "CREDITO SALARIO JOAO SILVA 770.292.327-04"
    const ehRendaLaboral = [...INCOME_KEYWORDS_NOMES].some(k => descNorm.includes(k));

    if (!ehRendaLaboral) {
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
    }

    // 8. Crédito válido
    return { data, mes, descricao: descricaoRaw, valor, classificacao: 'credito_valido' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSER — Extração de transações via regex (multi-estratégia)
// ═══════════════════════════════════════════════════════════════════════════════

// Padrão monetário flexível com sufixo D/C opcional (Caixa, BB): 250,00 | 1.250,00 C | 250,00D
const VALOR_RE = /([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})(\s*[CD])?(?=\s|$|\|)/i;
// Formatos de data suportados: 15/03/2024, 15-03, 15 FEV 2024, 15/FEV
const DATA_RE = /^(\d{2}[/-\s]\d{2}(?:[/-\s]\d{2,4})?|\d{2}[/-\s]+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[/-\s]?(?:\d{2,4})?)/i;

// Mapa de meses por extenso (Inter)
const MESES_EXTENSO_API: Record<string, string> = {
    janeiro: 'JAN', fevereiro: 'FEV', marco: 'MAR', abril: 'ABR',
    maio: 'MAI', junho: 'JUN', julho: 'JUL', agosto: 'AGO',
    setembro: 'SET', outubro: 'OUT', novembro: 'NOV', dezembro: 'DEZ',
};

function extrair(texto: string): Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> {
    // Normaliza "11 de Fevereiro de 2025" → "11/FEV/2025" (formato Inter)
    const normalizado = texto
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .replace(
            /(\d{1,2})\s+de\s+(janeiro|fevereiro|mar(?:ç|c)o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/gi,
            (_, d, m, a) => {
                const key = m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                return `${d.padStart(2, '0')}/${MESES_EXTENSO_API[key] ?? 'JAN'}/${a}`;
            }
        );
    const limpo = normalizado.trim();
    const linhas = limpo.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const vistas = new Set<string>();
    const todos: Array<{ dataRaw: string; descricaoRaw: string; valorRaw: string }> = [];

    function add(dataRaw: string, descricaoRaw: string, valorRaw: string) {
        // Limpar valor: remove espaços, strip "R$" (Mercado Pago), remove "+" inicial
        let v = valorRaw.replace(/\s+/g, '').replace(/^R\$/i, '').replace(/^-R\$/i, '-');
        if (v.startsWith('+')) v = v.substring(1);

        // Sufixo D/C (Caixa Econômica, Banco do Brasil):
        //   "1.250,00C" → crédito (mantém positivo)
        //   "250,00D"   → débito (nega o valor)
        const mDC = v.match(/^(-?[\d.]+,\d{2})([CD])$/i);
        if (mDC) {
            v = mDC[2].toUpperCase() === 'D'
                ? `-${mDC[1].replace(/^-/, '')}` // força negativo para débito
                : mDC[1];                          // crédito: remove o 'C', mantém valor
        }

        // Limpar descrição de barras pipe (|) comuns no Nubank
        const desc = descricaoRaw.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
        if (desc.length < 3) return;

        const chave = `${dataRaw}|${desc}|${v}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw, descricaoRaw: desc, valorRaw: v });
        }
    }

    let dataContextual = ''; // Guarda a última data lida (ex: Nubank cabeçalho "04 FEV 2025")

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];

        // 1. Verificar se a linha começa com uma data conhecida
        const mData = linha.match(DATA_RE);
        if (mData) {
            dataContextual = mData[1];

            // Tentar extrair valor da mesma linha (Estratégia 1 e 2 juntas)
            const descSemData = linha.substring(mData[0].length).trim();

            // Ignora "Saldo do dia: R$ X" do Inter (saldo corrente, não é transação)
            if (/^saldo\s+do\s+dia/i.test(descSemData)) continue;

            const linhaTemValor = descSemData.match(VALOR_RE);

            if (linhaTemValor) {
                // linhaTemValor[0] = match completo (inclui sufixo D/C se presente)
                // linhaTemValor[2] = sufixo D/C (ou undefined)
                const dc = linhaTemValor[2]?.trim() ?? '';
                const valorComDC = linhaTemValor[1] + dc; // ex: "1.250,00C" ou "1.250,00"
                // Remove o valor (+ sufixo D/C) da descrição
                const descPura = descSemData.replace(linhaTemValor[0], '').trim();
                if (descPura.length > 0 && !/^\d+$/.test(descPura)) {
                    add(dataContextual, descPura, valorComDC);
                }
                continue; // Linha já lida por completo
            }

            // Se não tem valor, mas a linha a seguir só tem valor (Estratégia 3)
            const proxLinha = i + 1 < linhas.length ? linhas[i + 1] : '';
            // Captura sufixo D/C em grupo 2 para Caixa/BB
            const mValorProximo = proxLinha.match(/^(?:R\$\s*)?([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})\s*([CD])?$/i);

            if (mValorProximo && descSemData.length > 0) {
                const dc = mValorProximo[2]?.trim() ?? '';
                add(dataContextual, descSemData, mValorProximo[1] + dc);
                i++; // Pula a próxima linha que já foi lida
                continue;
            }

            // Se só tem a data (ex: Nubank cabeçalho de dia), apenas atualiza o dataContextual
            if (descSemData.length === 0 || descSemData.toLowerCase().includes('total de')) continue;
        }
        // 2. Linha sem data no início, mas temos um dataContextual ativo (Nubank transactions)
        else if (dataContextual) {
            // Ignorar lixos (Nubank, Inter)
            if (linha.startsWith('Saldo final do período') || linha.startsWith('Saldo inicial') || linha.includes('Rendimento líquido') || /^saldo\s+do\s+dia/i.test(linha)) continue;

            // Regex global para pegar o ÚLTIMO valor da linha, ignorando valores no meio (ex: 0,00 | +13,00 | -45,00)
            // No Nubank, as vezes a linha da transação tem o valor no meio "Transferência Recebida - Nome | 12,50 | Tran"
            // Vamos procurar qualquer valor monetário na linha
            const valoresMatches = Array.from(linha.matchAll(/(?:^|\s|\|)([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})(?:\s|\||$)/g));

            if (valoresMatches.length > 0) {
                // Assumir o primeiro valor encontrado como sendo o da transação se não for 0,00
                const valorTarget = valoresMatches.find(m => m[1] !== '0,00') || valoresMatches[0];
                const valorReal = valorTarget[1];

                // Extrai a descrição (tudo antes do valor ou se o valor estiver no meio, limpa depois dele)
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
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ erro: 'Método não permitido. Use POST.' }); return; }

    const timestamp = new Date().toISOString();

    try {
        // ── Parse JSON body ────────────────────────────────────────────────────
        let body = req.body;
        // Se o body veio vazio, pode ser que o Vercel não tenha feito o parse (ou foi lido como stream)
        if (!body || Object.keys(body).length === 0 || Buffer.isBuffer(body)) {
            const rawBody = Buffer.isBuffer(body) ? body.toString('utf8') : await new Promise<string>((resolve, reject) => {
                let str = '';
                req.on('data', chunk => str += chunk.toString('utf8'));
                req.on('end', () => resolve(str));
                req.on('error', reject);
            }).catch(() => '');

            if (rawBody.trim()) {
                try { body = JSON.parse(rawBody); } catch (e) { }
            }
        }
        body = body || {};

        const { textoExtrato, hashPdf, nomeCliente, cpf, nomePai, nomeMae } = body;

        if (!nomeCliente?.trim()) { res.status(400).json({ erro: 'Campo "nomeCliente" é obrigatório.' }); return; }
        if (!textoExtrato?.trim()) { res.status(400).json({ erro: 'Texto do extrato ("textoExtrato") é obrigatório.' }); return; }

        const ctx: ContextoNomes = {
            nomeCliente: nomeCliente.trim(),
            cpf: cpf?.trim(),
            nomePai: nomePai?.trim(),
            nomeMae: nomeMae?.trim(),
        };

        // ── Parsear e classificar transações ───────────────────────────────────
        const brutas = extrair(textoExtrato);
        if (brutas.length === 0) {
            // Return a sample of the extracted text to help diagnose unsupported formats
            const amostra = textoExtrato.slice(0, 2500).replace(/\n+/g, ' | ');
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

        if (mesesConsiderados === 0) {
            // Debug: amostra das transações classificadas para diagnóstico
            const amostraDebug = transacoes.slice(0, 20).map(t => ({
                descricao: t.descricao,
                valor: t.valor,
                classificacao: t.classificacao,
                motivo: t.motivoExclusao,
            }));
            res.status(422).json({
                erro: 'Nenhum crédito válido identificado após classificação. Verifique se o nome do cliente está correto e se o extrato contém créditos reconhecíveis.',
                totalTransacoesBrutas: brutas.length,
                transacoesIgnoradas: ignoradas.length,
                transacoesSinalizadas: sinalizadas.length,
                debug_amostra_transacoes: amostraDebug,
            }); return;
        }

        if (mesesConsiderados < 2) {
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
