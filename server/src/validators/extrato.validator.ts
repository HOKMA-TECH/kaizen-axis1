import { createHash } from 'crypto';

/**
 * Validações de input obrigatórias antes do processamento.
 * Baseadas no spec do prompt — determinísticas e auditáveis.
 */

export interface ValidacaoResult {
    valido: boolean;
    erros: string[];
    avisos: string[];
}

/**
 * Valida o buffer do PDF.
 * - Verifica assinatura mágica "%PDF"
 * - Verifica tamanho mínimo
 */
export function validarPdf(buffer: Buffer): { valido: boolean; erro?: string } {
    if (!buffer || buffer.length < 100) {
        return { valido: false, erro: 'Arquivo PDF inválido ou vazio.' };
    }
    // Assinatura mágica dos PDFs: bytes \x25\x50\x44\x46 = "%PDF"
    const assinatura = buffer.slice(0, 4).toString('ascii');
    if (!assinatura.startsWith('%PDF')) {
        return { valido: false, erro: 'O arquivo enviado não é um PDF válido.' };
    }
    return { valido: true };
}

/**
 * Calcula hash SHA-256 do buffer para auditoria.
 * Permite detectar extrato duplicado.
 */
export function calcularHashPdf(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Valida os dados de contexto dos nomes.
 */
export function validarContexto(nomeCliente: string): { valido: boolean; erro?: string } {
    if (!nomeCliente || nomeCliente.trim().length < 2) {
        return { valido: false, erro: 'Nome do cliente é obrigatório (mínimo 2 caracteres).' };
    }
    return { valido: true };
}

/**
 * Valida o resultado do parsing:
 * - Nenhuma transação reconhecida
 * - Menos de 2 meses de dados (aviso, não bloqueia)
 */
export function validarResultadoParsing(
    totalTransacoes: number,
    mesesEncontrados: number
): ValidacaoResult {
    const erros: string[] = [];
    const avisos: string[] = [];

    if (totalTransacoes === 0) {
        erros.push(
            'Nenhuma transação foi reconhecida no extrato. ' +
            'O formato do banco pode não ser suportado.'
        );
    }

    if (mesesEncontrados < 2 && totalTransacoes > 0) {
        avisos.push(
            `Apenas ${mesesEncontrados} mês(es) de dados encontrado(s). ` +
            'Resultado pode não ser representativo.'
        );
    }

    return {
        valido: erros.length === 0,
        erros,
        avisos,
    };
}
