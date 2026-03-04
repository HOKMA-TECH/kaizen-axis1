import type { Transacao, TransacaoBruta, ContextoNomes } from '../types/transacao';
import { parseMoeda } from '../utils/moeda';
import { normalizar } from '../utils/normalizacao';
import { KEYWORDS_CREDITO, KEYWORDS_IGNORAR } from '../utils/regex';
import { calcularMatch } from './matching.service';

/**
 * ClassificacaoService — Classifica cada transação na ordem obrigatória do spec.
 *
 * ORDEM DE CLASSIFICAÇÃO (determinística, sem exceções):
 * 1. valor ≤ 0 → debito
 * 2. contém palavra de estorno → ignorar_estorno
 * 3. não contém keyword de crédito → ignorar_sem_keyword
 * 4. match forte cliente → ignorar_autotransferencia
 * 5. match forte pai → ignorar_transferencia_pai
 * 6. match forte mãe → ignorar_transferencia_mae
 * 7. match fraco qualquer → possivel_vinculo_familiar
 * 8. → credito_valido
 */

/**
 * Converte data DD/MM[/YYYY] para YYYY-MM usando ano atual como fallback.
 */
function normalizarData(dataRaw: string): { data: string; mes: string } {
    const partes = dataRaw.split('/');
    const dia = partes[0].padStart(2, '0');
    const mes = partes[1].padStart(2, '0');
    const ano = partes[2] ?? String(new Date().getFullYear());
    return {
        data: `${ano}-${mes}-${dia}`,
        mes: `${ano}-${mes}`,
    };
}

/**
 * Verifica se a descrição contém alguma das keywords de crédito.
 */
function contemKeywordCredito(descNorm: string): boolean {
    return KEYWORDS_CREDITO.some(kw => descNorm.includes(kw));
}

/**
 * Verifica se a descrição contém alguma palavra de estorno/ignorar.
 */
function contemKeywordIgnorar(descNorm: string): boolean {
    return KEYWORDS_IGNORAR.some(kw => descNorm.includes(kw));
}

/**
 * Classifica uma transação bruta de acordo com as regras do spec.
 */
export function classificarTransacao(
    bruta: TransacaoBruta,
    contexto: ContextoNomes
): Transacao {
    const { dataRaw, descricaoRaw, valorRaw } = bruta;
    const { data, mes } = normalizarData(dataRaw);
    const valor = parseMoeda(valorRaw);
    const descNorm = normalizar(descricaoRaw);

    // REGRA 1: Débito
    if (valor <= 0) {
        return { data, mes, descricao: descricaoRaw, valor, classificacao: 'debito' };
    }

    // REGRA 2: Estorno / devolução
    if (contemKeywordIgnorar(descNorm)) {
        return {
            data, mes, descricao: descricaoRaw, valor,
            classificacao: 'ignorar_estorno',
            motivoExclusao: 'Descrição contém palavra de estorno/devolução',
        };
    }

    // REGRA 3: Sem keyword de crédito válido
    if (!contemKeywordCredito(descNorm)) {
        return {
            data, mes, descricao: descricaoRaw, valor,
            classificacao: 'ignorar_sem_keyword',
            motivoExclusao: 'Descrição não contém keyword de crédito válido (PIX RECEBIDO, TED, etc.)',
        };
    }

    // REGRA 4: Match forte com o próprio cliente (autotransferência)
    const matchCliente = calcularMatch(contexto.nomeCliente, descricaoRaw, contexto.cpf);
    if (matchCliente.resultado === 'forte') {
        return {
            data, mes, descricao: descricaoRaw, valor,
            classificacao: 'ignorar_autotransferencia',
            motivoExclusao: `Autotransferência detectada: ${matchCliente.motivo}`,
        };
    }

    // REGRA 5: Match forte com nome do pai
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

    // REGRA 6: Match forte com nome da mãe
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

    // REGRA 7: Match fraco com qualquer nome → sinalizar, NÃO excluir
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

    // REGRA 8: Crédito válido
    return { data, mes, descricao: descricaoRaw, valor, classificacao: 'credito_valido' };
}

/**
 * Classifica um lote de transações brutas.
 */
export function classificarLote(
    brutas: TransacaoBruta[],
    contexto: ContextoNomes
): Transacao[] {
    return brutas.map(b => classificarTransacao(b, contexto));
}
