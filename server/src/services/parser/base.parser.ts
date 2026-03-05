import type { TransacaoBruta } from '../../types/transacao';
import {
    REGEX_TRANSACAO,
    REGEX_TRANSACAO_ALT,
    REGEX_DATA_FLEX,
    REGEX_VALOR_FLEX,
    REGEX_LINHA_SO_VALOR,
    LINHAS_LIXO,
} from '../../utils/regex';

/**
 * BaseParser — Interface base para parsers de extrato.
 * Qualquer banco que implemente esta interface é compatível com o sistema.
 */
export interface BaseParser {
    nome: string;
    extrair(texto: string): TransacaoBruta[];
}

// ─── LIMPEZA DO TEXTO ─────────────────────────────────────────────────────────

/**
 * Limpa o texto extraído do PDF para facilitar o parsing:
 * - Normaliza quebras de linha
 * - Remove caracteres de controle
 * - Limita linhas em branco excessivas
 */
export function limparTextoPdf(texto: string): string {
    return texto
        .replace(/\r\n/g, '\n')     // Windows → Unix
        .replace(/\r/g, '\n')
        .replace(/\f/g, '\n')       // form feed → nova linha
        .replace(/\t/g, '  ')       // tab → espaços
        .replace(/\n{3,}/g, '\n\n') // máximo 2 linhas em branco
        .trim();
}

// ─── ESTRATÉGIA 1: REGEX PADRÃO ──────────────────────────────────────────────

/**
 * Extrai transações com REGEX_TRANSACAO (DD/MM[/YYYY] DESCRIÇÃO VALOR).
 * Cobre: Itaú, Bradesco clássico, Santander, C6, Caixa.
 */
export function extrairComRegexPadrao(texto: string): TransacaoBruta[] {
    const resultado: TransacaoBruta[] = [];
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

// ─── ESTRATÉGIA 2: REGEX ALTERNATIVA ─────────────────────────────────────────

/**
 * Extrai transações com REGEX_TRANSACAO_ALT (DD/MM VALOR DESCRIÇÃO).
 * Cobre: Banco do Brasil exportado, alguns PDFs de Bradesco.
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

// ─── ESTRATÉGIA 3: MULTI-LINHA CONTEXTUAL ────────────────────────────────────

/**
 * Extrai transações de extratos com data em cabeçalho de seção.
 *
 * Cobre formatos de:
 *   Nubank:   Data em linha separada ("04 FEV 2025"), transações nas linhas seguintes
 *   Inter:    Semelhante ao Nubank
 *   C6 Bank:  Datas como "15/01/2024" com transações abaixo
 *   Bradesco: Algumas versões com data na primeira coluna
 *
 * Estratégias internas:
 *   3a) Data + descrição + valor na mesma linha
 *   3b) Data + descrição na linha, valor na linha seguinte
 *   3c) Apenas data na linha, transação na próxima linha (ex: Nubank)
 */
export function extrairMultiEstrategia(texto: string): TransacaoBruta[] {
    const limpo = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const linhas = limpo.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const vistas = new Set<string>();
    const todos: TransacaoBruta[] = [];

    /**
     * Adiciona uma transação ao resultado, deduplicando.
     * Normaliza o sinal do valor: "+250,00" → "250,00"
     * Limpa pipes do Nubank na descrição: "Remetente | Pix" → "Remetente  Pix"
     */
    function add(dataRaw: string, descricaoRaw: string, valorRaw: string): void {
        // Normaliza valor: remove espaços, strip "R$" (Mercado Pago), remove "+" inicial
        let v = valorRaw.replace(/\s+/g, '').replace(/^R\$/i, '').replace(/^-R\$/i, '-');
        if (v.startsWith('+')) v = v.substring(1);

        // Limpa pipes do Nubank e espaços excessivos
        const desc = descricaoRaw
            .replace(/\|/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (desc.length < 3) return;

        const chave = `${dataRaw}|${desc}|${v}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw, descricaoRaw: desc, valorRaw: v });
        }
    }

    /** Verifica se a linha é lixo de cabeçalho/rodapé */
    function ehLixo(linha: string): boolean {
        const norm = linha.toUpperCase().trim();
        return LINHAS_LIXO.some(l => norm.startsWith(l));
    }

    let dataContextual = '';  // Última data lida (usada para linhas sem data)

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        if (ehLixo(linha)) continue;

        const mData = linha.match(REGEX_DATA_FLEX);

        if (mData) {
            // Linha começa com uma data válida
            dataContextual = mData[1].trim();
            const descSemData = linha.substring(mData[0].length).trim();

            // ── Estratégia 3a: data + descrição + valor na mesma linha ──────
            const mValorMesmaLinha = descSemData.match(REGEX_VALOR_FLEX);
            if (mValorMesmaLinha) {
                // Remove o valor da descrição
                const descPura = descSemData.replace(mValorMesmaLinha[0], '').trim();
                if (descPura.length > 0 && !/^\d+$/.test(descPura)) {
                    add(dataContextual, descPura, mValorMesmaLinha[0]);
                }
                continue;
            }

            // ── Estratégia 3b: valor na próxima linha (sozinho) ─────────────
            if (i + 1 < linhas.length) {
                const proxLinha = linhas[i + 1];
                const mValorProximo = proxLinha.match(REGEX_LINHA_SO_VALOR);
                if (mValorProximo && descSemData.length > 0) {
                    add(dataContextual, descSemData, mValorProximo[1]);
                    i++;  // consome a próxima linha
                    continue;
                }
            }

            // Apenas data na linha (cabeçalho de seção tipo Nubank) — apenas atualiza contexto
            if (descSemData.length === 0 || /total de/i.test(descSemData)) continue;

            // Linha com data mas sem valor: descrição parcial (ignorar, será tratada abaixo)

        } else if (dataContextual) {
            // ── Estratégia 3c: linha sem data — herda dataContextual ─────────
            // (formato Nubank: transações agrupadas sob uma data)

            // Extrai todos os valores monetários na linha (suporta prefixo R$)
            const valoresMatches = Array.from(
                linha.matchAll(/(?:^|\s|\|)([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})(?:\s|\||$)/g)
            );

            if (valoresMatches.length > 0) {
                // Usa o primeiro valor diferente de 0,00
                const valorTarget = valoresMatches.find(m => m[1].replace(/\s/g, '') !== '0,00')
                    ?? valoresMatches[0];
                const valorReal = valorTarget[1];

                // Descrição = tudo antes do valor
                const idxValor = linha.indexOf(valorReal);
                const descPura = idxValor > 0
                    ? linha.substring(0, idxValor).trim()
                    : linha.replace(valorReal, '').trim();

                if (descPura.length > 0 && !/^\d+$/.test(descPura)) {
                    add(dataContextual, descPura, valorReal);
                }
            }
        }
    }

    return todos;
}

// ─── DEDUPLICAÇÃO ─────────────────────────────────────────────────────────────

/**
 * Remove transações com exata mesma data + descricao + valor.
 * Deduplicação determinística por chave composta.
 */
export function deduplicar(transacoes: TransacaoBruta[]): TransacaoBruta[] {
    const vistas = new Set<string>();
    return transacoes.filter(t => {
        const chave = `${t.dataRaw}|${t.descricaoRaw}|${t.valorRaw}`;
        if (vistas.has(chave)) return false;
        vistas.add(chave);
        return true;
    });
}
