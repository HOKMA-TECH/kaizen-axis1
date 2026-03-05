import type { TransacaoBruta } from '../../types/transacao';
import {
    BaseParser,
    limparTextoPdf,
    extrairComRegexPadrao,
    extrairComRegexAlt,
    extrairMultiEstrategia,
    deduplicar,
} from './base.parser';

/**
 * BancoPadraoParser v2 — Parser multi-estratégia para extratos bancários brasileiros.
 *
 * Bancos testados:
 *   Nubank     — Data em cabeçalho de seção, valores por linha
 *   Itaú       — Formato padrão DD/MM DESCRIÇÃO VALOR
 *   Bradesco   — Padrão + TEV + formato alternativo com valor antes
 *   Santander  — Formato padrão DD/MM/YYYY DESCRIÇÃO VALOR
 *   C6 Bank    — Semelhante ao Nubank (data + transações)
 *   Inter      — Data contextual + transações em bloco
 *   Caixa      — Formato padrão com Depósito/Crédito
 *   BB         — Alternativo (valor antes da descrição)
 *
 * Algoritmo de seleção de melhor resultado:
 *   Executa as 3 estratégias e seleciona a que extraiu mais transações.
 *   Critério: quantidade (determinístico, não probabilístico).
 */
export class BancoPadraoParser implements BaseParser {
    nome = 'BancoPadraoParser-v2';

    extrair(textoRaw: string): TransacaoBruta[] {
        const texto = limparTextoPdf(textoRaw);

        // ── Estratégia 1: Regex padrão (DD/MM DESCRIÇÃO VALOR) ──────────────
        // Cobre: Itaú, Santander, C6, Caixa, maioria dos bancos tradicionais
        const s1 = extrairComRegexPadrao(texto);

        // ── Estratégia 2: Regex alternativa (DD/MM VALOR DESCRIÇÃO) ─────────
        // Cobre: Banco do Brasil (PDF), alguns formatos do Bradesco
        const s2 = extrairComRegexAlt(texto);

        // ── Estratégia 3: Multi-linha contextual ─────────────────────────────
        // Cobre: Nubank (data como cabeçalho), Inter, C6 (bloco por data)
        const s3 = extrairMultiEstrategia(texto);

        // Seleciona o resultado com MAIS transações (critério determinístico)
        const melhor = [s1, s2, s3].reduce(
            (max, current) => current.length > max.length ? current : max,
            [] as TransacaoBruta[]
        );

        // Deduplica (segurança extra caso estratégias retornem sobreposição)
        return deduplicar(melhor);
    }
}

/** Instância singleton para uso nos serviços */
export const bancoPadraoParser = new BancoPadraoParser();
