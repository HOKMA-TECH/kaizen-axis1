/**
 * Regex patterns e keywords para extração de extratos bancários brasileiros.
 *
 * Cobertura de bancos:
 *   Itaú, Bradesco, Nubank, Santander, C6, Inter, Caixa, BB, Sicredi, XP,
 *   BTG, Safra, Mercado Pago, PicPay e similares.
 */

// ─── REGEX DE EXTRAÇÃO ────────────────────────────────────────────────────────

/**
 * Regex principal — DD/MM[/YYYY]  DESCRIÇÃO  VALOR
 * Grupos: [1] data  [2] descrição  [3] valor
 */
export const REGEX_TRANSACAO =
    /(\d{2}[\/\-]\d{2}(?:[\/\-]\d{4})?)\s{1,10}(.{3,80}?)\s{1,5}(-?[\d]{1,3}(?:\.\d{3})*,\d{2})/g;

/**
 * Regex alternativa — DD/MM[/YYYY]  VALOR  DESCRIÇÃO
 * Usado em alguns formatos de Bradesco e Banco do Brasil.
 * Grupos: [1] data  [2] valor  [3] descrição
 */
export const REGEX_TRANSACAO_ALT =
    /(\d{2}[\/\-]\d{2}(?:[\/\-]\d{4})?)\s+(-?[\d]{1,3}(?:\.\d{3})*,\d{2})\s+(.{3,80})/g;

/**
 * Padrão monetário flexível — aceita sinal, prefixo R$ e espaço antes dos dígitos.
 * Ex: 1.250,35 | +13,00 | -45,00 | R$ 12,54 | R$168,60
 */
export const REGEX_VALOR_FLEX = /([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})/;

/**
 * Data flexível — cobre todos os formatos conhecidos:
 *   DD/MM        DD/MM/YYYY    DD-MM-YYYY
 *   DD MMM YYYY  (ex: 04 FEV 2025 — Nubank)
 *   DD/MMM       (ex: 04/FEV — extratos antigos)
 */
export const REGEX_DATA_FLEX =
    /^(\d{2}[\/\-\s]\d{2}(?:[\/\-\s]\d{2,4})?|\d{2}[\/\-\s]+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\s]?(?:\d{2,4})?)/i;

/**
 * Linha que contém apenas um valor monetário (formato Nubank/Inter/Mercado Pago).
 * Ex: "  1.250,35 C"  |  "-250,00 D"  |  "+13,00"  |  "R$ 12,54"
 */
export const REGEX_LINHA_SO_VALOR =
    /^(?:R\$\s*)?([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:[CD])?$/i;

/** Detecta mês/ano no cabeçalho do extrato. Ex: "01/2024" */
export const REGEX_MES_ANO = /(\d{2})\/(\d{4})/;

/** CPF parcial na descrição. Ex: "PIX CPF 123.456.789-09" */
export const REGEX_CPF_NA_DESC = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

/** Extrai apenas dígitos de um CPF formatado. */
export const REGEX_CPF_DIGITS = /[^\d]/g;

// ─── KEYWORDS DE CRÉDITO ─────────────────────────────────────────────────────

/**
 * Palavras-chave que indicam POSSÍVEL CRÉDITO de renda.
 * A descrição deve conter pelo menos uma (normalizada, uppercase).
 *
 * Mapeamento por banco:
 *   Nubank:       "Transferência recebida", "PIX recebido"
 *   Itaú:         "PIX Recebido", "TED Recebida", "DOC Recebido"
 *   Bradesco:     "TEV Recebida", "TED Recebida", "Depósito Identificado"
 *   Caixa/BB:     "Depósito", "Crédito"
 *   Santander/C6: "Crédito TED", "Transferência Recebida"
 *   Inter:        "Pix Recebido", "Transferência Recebida"
 *   Mercado Pago: "Recebimento de pagamento"
 */
export const KEYWORDS_CREDITO = [
    // PIX
    'PIX RECEBIDO',
    'RECEBIMENTO PIX',
    'RECEBIMENTO DE PIX',
    'TRANSFERENCIA PIX RECEBIDA',

    // TED / DOC
    'TED RECEBIDA',
    'TED CREDITO',
    'DOC RECEBIDO',
    'DOC CREDITO',
    'TEV RECEBIDA',           // Bradesco (Transferência Eletrônica de Valor)

    // Depósito
    'DEPOSITO',
    'DEPOSITO IDENTIFICADO',
    'DEPOSITO BANCARIO',
    'DEPOSITO EM CONTA',

    // Crédito genérico
    'CREDITO',
    'CREDITO EM CONTA',

    // Transferência recebida
    'TRANSFERENCIA RECEBIDA',
    'TRANSFERENCIA CREDITADA',
    'RECEBIMENTO',
    'RECEBIMENTO DE TRANSFERENCIA',
    'PAGAMENTO RECEBIDO',

    // Remuneração / Salário
    'SALARIO',
    'REMUNERACAO',
    'VENCIMENTO',
    'HONORARIO',
    'COMISSAO',
    'PROVENTO',
    'PREMIO',
    'BONIFICACAO',
    'GRATIFICACAO',
    'ADIANTAMENTO SALARIAL',
    'FERIAS',
    'DECIMO TERCEIRO',
    '13 SALARIO',

    // Benefícios / Rescisão
    'BENEFICIO',
    'AUXILIO',
    'INDENIZACAO',
    'RESCISAO',
    'FGTS',

    // Plataformas digitais (Mercado Pago, PicPay, etc.)
    'RECEBIMENTO DE PAGAMENTO',
    'LIBERACAO DE DINHEIRO',    // Mercado Pago: liberação de receita de vendas
    'PAGAMENTO COM CODIGO QR',  // Mercado Pago: pagamento recebido via QR
    'VENDA',                    // Mercado Pago / PicPay: receita de venda
] as const;

// ─── KEYWORDS DE IGNORAR ─────────────────────────────────────────────────────

/**
 * Palavras que indicam transações que NÃO devem ser contadas como renda.
 * Verificadas ANTES das keywords de crédito (regra 2 da ordem obrigatória).
 */
export const KEYWORDS_IGNORAR = [
    // Estornos / Devoluções
    'ESTORNO',
    'DEVOLUCAO',
    'DEVOLUCAO PIX',
    'ESTORNO PIX',
    'CANCELAMENTO',

    // Autotransferência explícita
    'ENTRE CONTAS',
    'TRANSFERENCIA ENTRE CONTAS',
    'MESMA TITULARIDADE',
    'CONTA PROPRIA',

    // Rendimentos / Aplicações (não são renda de trabalho)
    'RENDIMENTO',
    'RENDIMENTO POUPANCA',
    'RENDIMENTO CDB',
    'RESGATE',
    'RESGATE CDB',
    'RESGATE POUPANCA',
    'RESGATE FUNDO',
    'APLICACAO',
    'APLICACAO AUTOMATICA',
    'POUPANCA',
    'CDB',
    'CDI',
    'IOF',

    // Empréstimos (entrada de dívida, não renda)
    'EMPRESTIMO',
    'ANTECIPACAO',
    'CREDITO CONSIGNADO',
    'LIBERACAO EMPRESTIMO',

    // Tarifas / Saldo (não são créditos de renda)
    'SALDO',
    'SALDO ANTERIOR',
    'TARIFA',
    'TAXA',
    'JUROS',
    'MULTA',
    'COBRANCA',
    'ANUIDADE',
] as const;

/**
 * Palavra especial que força match forte imediato (autotransferência explícita).
 * Verificada individualmente no matching service antes da tokenização.
 */
export const KEYWORD_MESMA_TITULARIDADE = 'MESMA TITULARIDADE';

/**
 * Prefixos de linhas de cabeçalho/rodapé a ignorar durante parsing.
 * Comparação após normalização uppercase.
 */
export const LINHAS_LIXO = [
    'SALDO FINAL DO PERIODO',
    'SALDO INICIAL DO PERIODO',
    'SALDO INICIAL',
    'SALDO FINAL',
    'TOTAL DE ENTRADAS',
    'TOTAL DE SAIDAS',
    'TOTAL ENTRADAS',
    'TOTAL SAIDAS',
] as const;
