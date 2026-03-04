import { tokenizarNome, normalizar, normalizarCpf } from '../utils/normalizacao';
import { KEYWORD_MESMA_TITULARIDADE, REGEX_CPF_NA_DESC } from '../utils/regex';

/**
 * MatchingService — Comparação determinística de nomes.
 *
 * NÃO usa IA, fuzzy match probabilístico, NLP ou heurística.
 * Todas as decisões são baseadas em contagem de tokens e percentuais.
 *
 * MATCH FORTE (exclusão automática):
 *   - ≥70% dos tokens relevantes do nome aparecem na descrição
 *   - OU ≥3 tokens relevantes aparecem
 *   - OU CPF parcial (digits) aparece na descrição
 *   - OU descrição contém "MESMA TITULARIDADE"
 *
 * MATCH FRACO (sinalização para revisão manual):
 *   - 1 ou 2 tokens comuns
 *   - NÃO gera exclusão automática
 */

export type ResultadoMatch = 'forte' | 'fraco' | 'sem_match';

export interface DetalheMatch {
    resultado: ResultadoMatch;
    tokensNome: string[];
    tokensEncontrados: string[];
    percentual: number;   // 0–100
    motivo: string;
}

/**
 * Computa a interseção entre tokens do nome e tokens da descrição normalizada.
 */
function intersecaoTokens(tokensNome: string[], descNormalizada: string): string[] {
    return tokensNome.filter(token => {
        // Busca exata de token com boundary de palavra (espaço ou início/fim)
        const regex = new RegExp(`(?:^|\\s)${token}(?:\\s|$)`);
        return regex.test(descNormalizada);
    });
}

/**
 * Verifica se CPF parcial (sequência de dígitos do CPF) aparece na descrição.
 * Considera CPF como presente se ≥9 dos 11 dígitos aparecem em sequência.
 */
function cpfNaDescricao(cpf: string, descNormalizada: string): boolean {
    if (!cpf || cpf.length < 9) return false;
    const digitos = normalizarCpf(cpf);
    if (digitos.length < 9) return false;

    // Extrai sequências de dígitos da descrição
    const matches = descNormalizada.match(REGEX_CPF_NA_DESC);
    if (!matches) return false;

    const digitosCpf = normalizarCpf(cpf);
    for (const m of matches) {
        const digitosDesc = m.replace(/[^\d]/g, '');
        if (digitosDesc.length >= 9 && digitosCpf.includes(digitosDesc.substring(0, 9))) {
            return true;
        }
    }
    return false;
}

/**
 * Função principal de matching.
 * Compara um nome contra uma descrição de transação.
 *
 * @param nome - Nome a ser verificado (cliente, pai ou mãe)
 * @param descricao - Descrição bruta da transação
 * @param cpf - CPF opcional do cliente para detecção de CPF parcial
 */
export function calcularMatch(
    nome: string,
    descricao: string,
    cpf?: string
): DetalheMatch {
    if (!nome || nome.trim().length === 0) {
        return {
            resultado: 'sem_match',
            tokensNome: [],
            tokensEncontrados: [],
            percentual: 0,
            motivo: 'nome vazio',
        };
    }

    const descNorm = normalizar(descricao);

    // Regra 1: "MESMA TITULARIDADE" → match forte imediato
    if (descNorm.includes(KEYWORD_MESMA_TITULARIDADE)) {
        return {
            resultado: 'forte',
            tokensNome: [],
            tokensEncontrados: [],
            percentual: 100,
            motivo: 'contém MESMA TITULARIDADE',
        };
    }

    // Regra 2: CPF parcial na descrição → match forte imediato
    if (cpf && cpfNaDescricao(cpf, descNorm)) {
        return {
            resultado: 'forte',
            tokensNome: tokenizarNome(nome),
            tokensEncontrados: [],
            percentual: 100,
            motivo: 'CPF parcial detectado na descrição',
        };
    }

    // Tokenizar o nome relevante
    const tokensNome = tokenizarNome(nome);
    if (tokensNome.length === 0) {
        return {
            resultado: 'sem_match',
            tokensNome: [],
            tokensEncontrados: [],
            percentual: 0,
            motivo: 'nome sem tokens relevantes após normalização',
        };
    }

    // Encontrar tokens em comum
    const encontrados = intersecaoTokens(tokensNome, descNorm);
    const percentual = Math.round((encontrados.length / tokensNome.length) * 100);

    // Regra 3: Match forte — ≥70% dos tokens OU ≥3 tokens
    const ehForte = percentual >= 70 || encontrados.length >= 3;
    // Regra 4: Match fraco — 1 ou 2 tokens (abaixo de 70%)
    const ehFraco = !ehForte && encontrados.length >= 1;

    if (ehForte) {
        return {
            resultado: 'forte',
            tokensNome,
            tokensEncontrados: encontrados,
            percentual,
            motivo: encontrados.length >= 3
                ? `${encontrados.length} tokens encontrados (≥3 → match forte)`
                : `${percentual}% dos tokens encontrados (≥70% → match forte)`,
        };
    }

    if (ehFraco) {
        return {
            resultado: 'fraco',
            tokensNome,
            tokensEncontrados: encontrados,
            percentual,
            motivo: `${encontrados.length} token(s) encontrado(s) — match fraco (revisão manual)`,
        };
    }

    return {
        resultado: 'sem_match',
        tokensNome,
        tokensEncontrados: [],
        percentual: 0,
        motivo: 'nenhum token do nome encontrado na descrição',
    };
}
