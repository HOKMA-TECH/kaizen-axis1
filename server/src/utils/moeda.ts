/**
 * Conversão monetária brasileira.
 * TODOS os valores são armazenados em CENTAVOS (integer)
 * para evitar imprecisão de ponto flutuante.
 */

/**
 * Converte string monetária BR → centavos (integer).
 * Aceita: "1.250,35" | "1250,35" | "1250" | "1.250"
 * Retorna 0 se inválido.
 */
export function parseMoeda(raw: string): number {
    const limpo = raw.trim();

    // Detectar o separador decimal: vírgula → BR
    if (limpo.includes(',')) {
        // BR: 1.250,35
        const semPonto = limpo.replace(/\./g, ''); // remove separador de milhar
        const comPonto = semPonto.replace(',', '.'); // normaliza decimal
        const num = parseFloat(comPonto);
        if (isNaN(num)) return 0;
        return Math.round(num * 100); // centavos
    }

    // Sem vírgula: pode ser inteiro ou com ponto decimal
    const num = parseFloat(limpo.replace(/\./g, ''));
    if (isNaN(num)) return 0;
    return Math.round(num * 100);
}

/**
 * Converte centavos → string BRL formatada.
 * Ex: 125035 → "R$ 1.250,35"
 */
export function formatarMoeda(centavos: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    }).format(centavos / 100);
}

/**
 * Soma array de centavos com segurança (integer).
 */
export function somarCentavos(valores: number[]): number {
    return valores.reduce((acc, v) => acc + v, 0);
}
