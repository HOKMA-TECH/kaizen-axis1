import type { TransacaoBruta } from '../../types/transacao';
import {
    BaseParser,
    limparTextoPdf,
    extrairComRegexPadrao,
    extrairComRegexAlt,
    extrairMultiEstrategia,
    deduplicar,
} from './base.parser';
import { C6BankParser } from './c6bank.parser';

/**
 * BancoPadraoParser v2 — Parser multi-estratégia para extratos bancários brasileiros.
 *
 * Bancos com parser dedicado (detectados automaticamente pelo texto):
 *   C6 Bank    — Duas colunas de data (lançamento + contábil), cabeçalho de mês com ano
 *
 * Bancos pelo parser genérico (multi-estratégia):
 *   Nubank     — Data em cabeçalho de seção, valores por linha
 *   Itaú       — Formato padrão DD/MM DESCRIÇÃO VALOR
 *   Bradesco   — Padrão + TEV + formato alternativo com valor antes
 *   Santander  — Formato padrão DD/MM/YYYY DESCRIÇÃO VALOR
 *   Inter      — Data contextual + transações em bloco
 *   Caixa      — Formato padrão com Depósito/Crédito
 *   BB         — Alternativo (valor antes da descrição)
 *
 * Algoritmo de seleção (bancos genéricos):
 *   Executa as 3 estratégias e seleciona a que extraiu mais transações.
 *   Critério: quantidade (determinístico, não probabilístico).
 */
export class BancoPadraoParser implements BaseParser {
    nome = 'BancoPadraoParser-v2';

    extrair(textoRaw: string): TransacaoBruta[] {
        const texto = limparTextoPdf(textoRaw);

        // ── Detecção de banco específico ─────────────────────────────────────
        // C6 Bank: tem formato próprio com duas colunas de data por linha
        if (C6BankParser.detectar(texto)) {
            const c6Parser = new C6BankParser();
            return c6Parser.extrair(textoRaw);
        }

        // ── Estratégia 1: Regex padrão (DD/MM DESCRIÇÃO VALOR) ──────────────
        // Cobre: Itaú, Santander, Caixa, maioria dos bancos tradicionais
        const s1 = extrairComRegexPadrao(texto);

        // ── Estratégia 2: Regex alternativa (DD/MM VALOR DESCRIÇÃO) ─────────
        // Cobre: Banco do Brasil (PDF), alguns formatos do Bradesco
        const s2 = extrairComRegexAlt(texto);

        // ── Estratégia 3: Multi-linha contextual ─────────────────────────────
        // Cobre: Nubank (data como cabeçalho), Inter (bloco por data)
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
