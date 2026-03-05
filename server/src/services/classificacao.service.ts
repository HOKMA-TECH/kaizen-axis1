import type { Transacao, TransacaoBruta, ContextoNomes } from '../types/transacao';
import { parseMoeda } from '../utils/moeda';
import { normalizar } from '../utils/normalizacao';
import { KEYWORDS_CREDITO, KEYWORDS_IGNORAR } from '../utils/regex';
import { calcularMatch } from './matching.service';

/**
 * ClassificacaoService — Classifica cada transação na ordem obrigatória do spec.
 *
 * ORDEM DE CLASSIFICAÇÃO (determinística, sem exceções):
 * 1. valor ≤ 0                     → debito
 * 2. contém keyword de ignorar     → ignorar_estorno
 * 3. não contém keyword de crédito → ignorar_sem_keyword
 * 4. match forte cliente           → ignorar_autotransferencia
 * 5. match forte pai               → ignorar_transferencia_pai
 * 6. match forte mãe               → ignorar_transferencia_mae
 * 7. match fraco qualquer          → possivel_vinculo_familiar
 * 8. caso contrário                → credito_valido
 */

// ─── MAPA DE MESES ────────────────────────────────────────────────────────────

/**
 * Mapeia abreviações (3 letras) e nomes completos de meses para números.
 * Cobre todos os formatos de data usados por bancos brasileiros.
 */
const MESES: Record<string, string> = {
    // Abreviações (usadas pelo Nubank, Inter, C6)
    JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
    JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
    // Nomes completos (usados em alguns PDFs do Itaú e Bradesco)
    JANEIRO: '01', FEVEREIRO: '02', MARCO: '03', ABRIL: '04',
    MAIO: '05', JUNHO: '06', JULHO: '07', AGOSTO: '08',
    SETEMBRO: '09', OUTUBRO: '10', NOVEMBRO: '11', DEZEMBRO: '12',
};

// ─── NORMALIZAÇÃO DE DATA ────────────────────────────────────────────────────

/**
 * Converte qualquer formato de data para YYYY-MM-DD e YYYY-MM.
 *
 * Formatos suportados:
 *   DD/MM         → usa ano corrente
 *   DD/MM/YYYY    → formato completo
 *   DD/MM/YY      → converte YY para 20YY
 *   DD-MM-YYYY    → traço como separador
 *   DD MMM YYYY   → ex: "04 FEV 2025" (Nubank)
 *   DD/MMM        → ex: "04/FEV"
 *   DD/MMM/YYYY   → ex: "04/FEV/2025"
 */
export function normalizarData(dataRaw: string): { data: string; mes: string } {
    // Normaliza separadores: "/" e "-" → espaço → split fácil
    let limpo = dataRaw.trim().toUpperCase();
    limpo = limpo.replace(/[-\/]/g, ' ').replace(/\s+/g, ' ').trim();

    const parts = limpo.split(' ');

    if (parts.length >= 2) {
        const dia = parts[0].padStart(2, '0');
        const mesStr = parts[1];
        let mes: string;

        if (/^\d+$/.test(mesStr)) {
            // Mês numérico: "15 03 2024"
            mes = mesStr.padStart(2, '0');
        } else {
            // Mês textual: "FEV", "FEVEREIRO"
            // Tenta abreviação de 3 letras primeiro, depois nome completo
            mes = MESES[mesStr.substring(0, 3)] ?? MESES[mesStr] ?? '01';
        }

        let ano = parts[2] ?? String(new Date().getFullYear());
        // Converte YY para 20YY (ex: "24" → "2024")
        if (ano.length === 2) ano = `20${ano}`;

        return {
            data: `${ano}-${mes}-${dia}`,
            mes: `${ano}-${mes}`,
        };
    }

    // Fallback: usa data atual
    const fallback = new Date().toISOString().split('T')[0];
    return { data: fallback, mes: fallback.substring(0, 7) };
}

// ─── VERIFICAÇÕES DE KEYWORDS ────────────────────────────────────────────────

/**
 * Verifica se a descrição normalizada contém alguma keyword de crédito válido.
 */
function contemKeywordCredito(descNorm: string): boolean {
    return KEYWORDS_CREDITO.some(kw => descNorm.includes(kw));
}

/**
 * Verifica se a descrição normalizada contém alguma keyword de ignorar.
 */
function contemKeywordIgnorar(descNorm: string): boolean {
    return KEYWORDS_IGNORAR.some(kw => descNorm.includes(kw));
}

// ─── CLASSIFICAÇÃO ────────────────────────────────────────────────────────────

/**
 * Classifica uma transação bruta de acordo com as 8 regras obrigatórias do spec.
 * A ordem das regras é IMUTÁVEL e determinística.
 */
export function classificarTransacao(
    bruta: TransacaoBruta,
    contexto: ContextoNomes
): Transacao {
    const { dataRaw, descricaoRaw, valorRaw } = bruta;
    const { data, mes } = normalizarData(dataRaw);
    const valor = parseMoeda(valorRaw);
    const descNorm = normalizar(descricaoRaw);

    // ── REGRA 1: Débito (valor ≤ 0) ─────────────────────────────────────────
    if (valor <= 0) {
        return { data, mes, descricao: descricaoRaw, valor, classificacao: 'debito' };
    }

    // ── REGRA 2: Estorno / devolução ─────────────────────────────────────────
    if (contemKeywordIgnorar(descNorm)) {
        return {
            data, mes, descricao: descricaoRaw, valor,
            classificacao: 'ignorar_estorno',
            motivoExclusao: 'Descrição contém palavra de estorno/devolução/aplicação',
        };
    }

    // ── REGRA 3: Sem keyword de crédito válido ───────────────────────────────
    if (!contemKeywordCredito(descNorm)) {
        return {
            data, mes, descricao: descricaoRaw, valor,
            classificacao: 'ignorar_sem_keyword',
            motivoExclusao: 'Descrição não contém keyword de crédito válido (PIX RECEBIDO, TED, SALARIO, etc.)',
        };
    }

    // ── REGRA 4: Match forte com o próprio cliente (autotransferência) ───────
    const matchCliente = calcularMatch(contexto.nomeCliente, descricaoRaw, contexto.cpf);
    if (matchCliente.resultado === 'forte') {
        return {
            data, mes, descricao: descricaoRaw, valor,
            classificacao: 'ignorar_autotransferencia',
            motivoExclusao: `Autotransferência detectada: ${matchCliente.motivo}`,
        };
    }

    // ── REGRA 5: Match forte com nome do pai ─────────────────────────────────
    if (contexto.nomePai) {
        const matchPai = calcularMatch(contexto.nomePai, descricaoRaw);
        if (matchPai.resultado === 'forte') {
            return {
                data, mes, descricao: descricaoRaw, valor,
                classificacao: 'ignorar_transferencia_pai',
                motivoExclusao: `Transferência do pai detectada: ${matchPai.motivo}`,
            };
        }
    }

    // ── REGRA 6: Match forte com nome da mãe ─────────────────────────────────
    if (contexto.nomeMae) {
        const matchMae = calcularMatch(contexto.nomeMae, descricaoRaw);
        if (matchMae.resultado === 'forte') {
            return {
                data, mes, descricao: descricaoRaw, valor,
                classificacao: 'ignorar_transferencia_mae',
                motivoExclusao: `Transferência da mãe detectada: ${matchMae.motivo}`,
            };
        }
    }

    // ── REGRA 7: Match fraco com qualquer nome → sinalizar, NÃO excluir ─────
    // IMPORTANTE: NÃO exclui automaticamente. Aparece no JSON para revisão humana.
    const matchFracoCliente = matchCliente.resultado === 'fraco';
    const matchFracoPai = contexto.nomePai
        ? calcularMatch(contexto.nomePai, descricaoRaw).resultado === 'fraco'
        : false;
    const matchFracoMae = contexto.nomeMae
        ? calcularMatch(contexto.nomeMae, descricaoRaw).resultado === 'fraco'
        : false;

    if (matchFracoCliente || matchFracoPai || matchFracoMae) {
        return {
            data, mes, descricao: descricaoRaw, valor,
            classificacao: 'possivel_vinculo_familiar',
            motivoExclusao: 'Match fraco com nome do cliente/familiar — revisão manual recomendada',
        };
    }

    // ── REGRA 8: Crédito válido ──────────────────────────────────────────────
    return { data, mes, descricao: descricaoRaw, valor, classificacao: 'credito_valido' };
}

/**
 * Classifica um lote de transações brutas.
 * Retorna o mesmo número de transações que entrou, com classificação atribuída.
 */
export function classificarLote(
    brutas: TransacaoBruta[],
    contexto: ContextoNomes
): Transacao[] {
    return brutas.map(b => classificarTransacao(b, contexto));
}
