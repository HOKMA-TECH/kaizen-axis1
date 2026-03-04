import type { TransacaoBruta } from '../../types/transacao';
import {
    BaseParser,
    limparTextoPdf,
    extrairComRegexPadrao,
    extrairComRegexAlt,
} from './base.parser';

/**
 * BancoPadraoParser — Parser genérico para extratos bancários brasileiros.
 *
 * Suporta formatos de: Itaú, Bradesco, Nubank, Santander, C6, Inter e similares.
 * Estratégia: tenta o regex padrão primeiro. Se não encontrar transações,
 * tenta o regex alternativo. O banco com mais transações extraídas vence.
 *
 * Formato padrão:
 *   DD/MM[/YYYY]  DESCRIÇÃO  1.250,35
 *
 * Formato alternativo (valor antes da descrição):
 *   DD/MM[/YYYY]  1.250,35  DESCRIÇÃO
 */
export class BancoPadraoParser implements BaseParser {
    nome = 'BancoPadraoParser-v1';

    extrair(textoRaw: string): TransacaoBruta[] {
        const texto = limparTextoPdf(textoRaw);

        // Tenta o regex padrão (mais comum)
        const resultadoPadrao = extrairComRegexPadrao(texto);

        // Tenta o regex alternativo
        const resultadoAlt = extrairComRegexAlt(texto);

        // Usa o resultado com mais transações (heurística de quantidade, não de conteúdo)
        const melhor = resultadoPadrao.length >= resultadoAlt.length
            ? resultadoPadrao
            : resultadoAlt;

        // Deduplica: remove transações com exata mesma data+descricao+valor
        return deduplicar(melhor);
    }
}

/**
 * Remove transações exatamente duplicadas (mesma data + descricao + valor).
 * Usa chave composta para deduplicação determinística.
 */
function deduplicar(transacoes: TransacaoBruta[]): TransacaoBruta[] {
    const vistas = new Set<string>();
    return transacoes.filter(t => {
        const chave = `${t.dataRaw}|${t.descricaoRaw}|${t.valorRaw}`;
        if (vistas.has(chave)) return false;
        vistas.add(chave);
        return true;
    });
}

/** Instância singleton para uso nos serviços */
export const bancoPadraoParser = new BancoPadraoParser();
