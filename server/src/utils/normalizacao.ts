/**
 * Normalização de strings para matching determinístico.
 *
 * Pipeline obrigatório (na ordem):
 * 1. Remover acentos (NFD + strip combining marks)
 * 2. Uppercase
 * 3. Remover caracteres especiais (manter apenas [A-Z0-9 ])
 * 4. Remover stopwords: DE DA DO DOS DAS E
 * 5. Tokenizar por espaço → filtrar tokens length > 1
 */

/** Stopwords a serem removidas antes da tokenização */
const STOPWORDS = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']);

/**
 * Remove acentos e diacríticos de uma string.
 * Usa NFD decomposition + remoção dos combining characters.
 */
export function removerAcentos(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza uma string completa:
 * acentos → uppercase → limpar especiais → remove stopwords
 */
export function normalizar(s: string): string {
    return removerAcentos(s)
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Tokeniza um string normalizado removendo stopwords e tokens curtos.
 * Retorna array de tokens relevantes (length > 1 e não stopword).
 */
export function tokenizar(s: string): string[] {
    const normalizado = normalizar(s);
    return normalizado
        .split(' ')
        .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Tokeniza um nome completo para matching.
 * Ex: "João Carlos da Silva" → ["JOAO", "CARLOS", "SILVA"]
 */
export function tokenizarNome(nome: string): string[] {
    return tokenizar(nome);
}

/**
 * Extrai dígitos de um CPF: "123.456.789-09" → "12345678909"
 * Retorna string vazia se CPF inválido/ausente.
 */
export function normalizarCpf(cpf: string): string {
    return cpf.replace(/[^\d]/g, '');
}
