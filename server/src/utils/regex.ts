/**
 * Regex patterns para extração de transações de extratos bancários brasileiros.
 *
 * Padrão geral de linha de extrato:
 * DD/MM[/YYYY]  DESCRIÇÃO DA TRANSAÇÃO  1.250,35
 *
 * Variações cobertas:
 * - Data com ou sem ano: "15/03" | "15/03/2024"
 * - Valor positivo com separadores BR: "1.250,35" | "250,00" | "1.250"
 * - Valor negativo com "-": "-250,00"
 * - Descrição pode ter múltiplos espaços
 */

/**
 * Regex principal de extração de linha de extrato.
 * Grupos:
 *  [1] data: DD/MM ou DD/MM/YYYY
 *  [2] descricao: texto entre data e valor
 *  [3] valor: número no formato BR (pode ter sinal negativo)
 */
export const REGEX_TRANSACAO =
    /(\d{2}\/\d{2}(?:\/\d{4})?)\s{1,10}(.{3,80}?)\s{1,5}(-?[\d]{1,3}(?:\.\d{3})*,\d{2})/g;

/**
 * Regex alternativa para extratos que colocam o valor antes da descrição
 * ou com tabs como separador.
 * Ex: "15/03  1.250,35  PIX RECEBIDO JOAO SILVA"
 */
export const REGEX_TRANSACAO_ALT =
    /(\d{2}\/\d{2}(?:\/\d{4})?)\s+(-?[\d]{1,3}(?:\.\d{3})*,\d{2})\s+(.{3,80})/g;

/**
 * Keywords de crédito válido (POSSÍVEL CRÉDITO).
 * A descrição deve conter pelo menos uma dessas strings.
 * Comparação feita em uppercase normalizado.
 */
export const KEYWORDS_CREDITO = [
    'PIX RECEBIDO',
    'TED RECEBIDA',
    'DOC RECEBIDO',
    'DEPOSITO',
    'DEPOSITO IDENTIFICADO',
    'CREDITO',
] as const;

/**
 * Palavras que indicam estorno/devolução.
 * Se presentes, a transação é ignorada automaticamente.
 */
export const KEYWORDS_IGNORAR = [
    'ESTORNO',
    'DEVOLUCAO',
    'ENTRE CONTAS',
    'TRANSFERENCIA ENTRE CONTAS',
    'MESMA TITULARIDADE',
] as const;

/**
 * Palavra especial que indica autotransferência explícita.
 * Força exclusão mesmo sem match de nome.
 */
export const KEYWORD_MESMA_TITULARIDADE = 'MESMA TITULARIDADE';

/**
 * Regex para extrair CPF parcial de uma descrição.
 * Captura sequências de 3+ dígitos que podem ser parte de CPF.
 * Ex: "PIX CPF 123.456.789-09"
 */
export const REGEX_CPF_NA_DESC = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

/**
 * Regex para extrair dígitos de um CPF formatado.
 */
export const REGEX_CPF_DIGITS = /[^\d]/g;

/**
 * Regex para detectar o mês/ano de um cabeçalho de extrato.
 * Ex: "Extrato de Janeiro/2024" | "01/2024"
 */
export const REGEX_MES_ANO = /(\d{2})\/(\d{4})/;
