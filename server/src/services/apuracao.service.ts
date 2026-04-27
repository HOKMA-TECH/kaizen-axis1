import pdfParse from 'pdf-parse';
import type { ContextoNomes } from '../types/transacao';
import type { ResultadoApuracao } from '../types/resultado';
import { bancoPadraoParser } from './parser/bancoPadrao.parser';
import { classificarLote } from './classificacao.service';
import { somarCentavos } from '../utils/moeda';
import { calcularHashPdf, validarPdf, validarContexto, validarResultadoParsing } from '../validators/extrato.validator';

const VERSAO = '2.0.0-modo-conservador-inteligente' as const;

/**
 * ApuracaoService — Orquestrador principal do motor de apuração.
 *
 * Pipeline completo:
 * 1. Validar PDF
 * 2. Extrair texto via pdf-parse
 * 3. Parsear transações brutas (bancoPadraoParser)
 * 4. Classificar transações (classificacaoService)
 * 5. Agrupar créditos válidos por mês
 * 6. Calcular métricas matemáticas
 * 7. Retornar JSON auditável
 */
export async function processarExtrato(
    pdfBuffer: Buffer,
    contexto: ContextoNomes
): Promise<ResultadoApuracao> {
    const timestamp = new Date().toISOString();
    const avisos: string[] = [];

    // ── ETAPA 1: Validar PDF ────────────────────────────────────────────────────
    const validacaoPdf = validarPdf(pdfBuffer);
    if (!validacaoPdf.valido) {
        throw new Error(validacaoPdf.erro!);
    }

    const validacaoContexto = validarContexto(contexto.nomeCliente);
    if (!validacaoContexto.valido) {
        throw new Error(validacaoContexto.erro!);
    }

    const hashPdf = calcularHashPdf(pdfBuffer);

    // ── ETAPA 2: Extrair texto do PDF ──────────────────────────────────────────
    let textoPdf: string;
    try {
        const parsed = await pdfParse(pdfBuffer);
        textoPdf = parsed.text;
    } catch {
        throw new Error('Falha ao ler o PDF. O arquivo pode estar corrompido ou protegido por senha.');
    }

    // ── ETAPA 3: Parsear transações brutas ─────────────────────────────────────
    const transacoesBrutas = bancoPadraoParser.extrair(textoPdf);

    // ── ETAPA 4: Classificar ───────────────────────────────────────────────────
    const transacoes = classificarLote(transacoesBrutas, contexto);

    // ── ETAPA 5: Validar resultado do parsing ──────────────────────────────────
    const mesesUnicos = new Set(
        transacoes.filter(t => t.classificacao === 'credito_valido').map(t => t.mes)
    ).size;

    const validacaoParsing = validarResultadoParsing(transacoes.length, mesesUnicos);
    if (!validacaoParsing.valido) {
        throw new Error(validacaoParsing.erros.join('; '));
    }
    avisos.push(...validacaoParsing.avisos);

    // ── ETAPA 6: Separar por classificação ─────────────────────────────────────
    const creditos = transacoes.filter(t => t.classificacao === 'credito_valido');
    const sinalizadas = transacoes.filter(t => t.classificacao === 'possivel_vinculo_familiar');
    const ignoradas = transacoes.filter(t =>
        t.classificacao !== 'credito_valido' &&
        t.classificacao !== 'possivel_vinculo_familiar' &&
        t.classificacao !== 'debito'
    );

    const excluiuAutoTransferencia = transacoes.some(t => t.classificacao === 'ignorar_autotransferencia');
    const excluiuTransferenciaPais =
        transacoes.some(t =>
            t.classificacao === 'ignorar_transferencia_pai' ||
            t.classificacao === 'ignorar_transferencia_mae'
        );

    // ── ETAPA 7: Agrupar por mês ───────────────────────────────────────────────
    const totalPorMes: Record<string, number> = {};
    for (const c of creditos) {
        totalPorMes[c.mes] = (totalPorMes[c.mes] ?? 0) + c.valor;
    }

    const mesesConsiderados = Object.keys(totalPorMes).length;
    const valoresPorMes = Object.values(totalPorMes);

    // ── ETAPA 8: Calcular métricas matemáticas ─────────────────────────────────
    // Todos os cálculos em centavos (inteiros).
    // Divisões arredondadas para centavo mais próximo.
    const totalApurado = somarCentavos(valoresPorMes);
    const mediaMensalReal = mesesConsiderados > 0
        ? Math.round(totalApurado / mesesConsiderados)
        : 0;
    const divisao6Meses = Math.round(totalApurado / 6);
    const divisao12Meses = Math.round(totalApurado / 12);
    const maiorMes = valoresPorMes.length > 0 ? Math.max(...valoresPorMes) : 0;
    const menorMes = valoresPorMes.length > 0 ? Math.min(...valoresPorMes) : 0;

    // ── ETAPA 9: Montar resultado auditável ────────────────────────────────────
    const resultado: ResultadoApuracao = {
        algoritmoVersao: VERSAO,

        totalApurado,
        mediaMensalReal,
        divisao6Meses,
        divisao12Meses,
        maiorMes,
        menorMes,
        mesesConsiderados,

        totalPorMes,

        transacoesConsideradas: creditos.length,
        transacoesIgnoradas: ignoradas.length,

        transacoesSinalizadas: sinalizadas.map(t => ({
            descricao: t.descricao,
            valor: t.valor,
            mes: t.mes,
            motivo: 'possivel_vinculo_familiar',
        })),

        criteriosAplicados: {
            excluiuAutoTransferencia,
            excluiuTransferenciaPais,
            modoConservadorInteligente: true,
        },

        auditoria: {
            hashPdf,
            timestamp,
            algoritmoVersao: VERSAO,
            totalTransacoesBrutas: transacoesBrutas.length,
            transacoesRaw: transacoes,
        },

        avisos,
    };

    return resultado;
}
