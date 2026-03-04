import type { TransacaoBruta } from '../../types/transacao';
import { REGEX_TRANSACAO, REGEX_TRANSACAO_ALT } from '../../utils/regex';

/**
 * BaseParser — Interface base para parsers de extrato.
 * Qualquer banco que implemente esta interface é compatível com o sistema.
 */
export interface BaseParser {
    nome: string;
    extrair(texto: string): TransacaoBruta[];
}

/**
 * Limpa o texto extraído do PDF para facilitar o parsing:
 * - Remove caracteres de controle incomuns
 * - Normaliza quebras de linha
 * - Remove linhas em branco excessivas
 */
export function limparTextoPdf(texto: string): string {
    return texto
        .replace(/\r\n/g, '\n')     // Windows → Unix
        .replace(/\r/g, '\n')
        .replace(/\f/g, '\n')       // form feed → nova linha
        .replace(/\t/g, '  ')       // tab → espaços
        .replace(/\n{3,}/g, '\n\n') // múltiplas linhas vazias → máximo 2
        .trim();
}

/**
 * Tenta extrair transações com o REGEX_TRANSACAO padrão.
 * Retorna array vazio se não encontrar nada.
 */
export function extrairComRegexPadrao(texto: string): TransacaoBruta[] {
    const resultado: TransacaoBruta[] = [];
    // Reset lastIndex para garantir consistência
    REGEX_TRANSACAO.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = REGEX_TRANSACAO.exec(texto)) !== null) {
        resultado.push({
            dataRaw: match[1].trim(),
            descricaoRaw: match[2].trim(),
            valorRaw: match[3].trim(),
        });
    }
    return resultado;
}

/**
 * Tenta extrair transações com o REGEX_TRANSACAO_ALT (valor antes da descrição).
 */
export function extrairComRegexAlt(texto: string): TransacaoBruta[] {
    const resultado: TransacaoBruta[] = [];
    REGEX_TRANSACAO_ALT.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = REGEX_TRANSACAO_ALT.exec(texto)) !== null) {
        resultado.push({
            dataRaw: match[1].trim(),
            descricaoRaw: match[3].trim(),
            valorRaw: match[2].trim(),
        });
    }
    return resultado;
}
