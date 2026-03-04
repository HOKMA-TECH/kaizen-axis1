import type { Transacao } from './transacao';

/** Sinalização de possível vínculo familiar (match fraco) */
export interface TransacaoSinalizada {
    descricao: string;
    valor: number;          // em centavos
    mes: string;
    motivo: 'possivel_vinculo_familiar';
}

/** Resultado final da apuração — formato auditável */
export interface ResultadoApuracao {
    algoritmoVersao: '2.0.0-modo-conservador-inteligente';

    // ─── Totais em centavos ─────────────────────────────────────
    totalApurado: number;       // Σ créditos válidos
    mediaMensalReal: number;    // totalApurado / mesesConsiderados
    divisao6Meses: number;      // totalApurado / 6
    divisao12Meses: number;     // totalApurado / 12
    maiorMes: number;
    menorMes: number;
    mesesConsiderados: number;

    // ─── Breakdown mensal ───────────────────────────────────────
    totalPorMes: Record<string, number>; // { "YYYY-MM": centavos }

    // ─── Contadores ─────────────────────────────────────────────
    transacoesConsideradas: number;
    transacoesIgnoradas: number;

    // ─── Sinalizações (match fraco) ─────────────────────────────
    transacoesSinalizadas: TransacaoSinalizada[];

    // ─── Critérios aplicados ─────────────────────────────────────
    criteriosAplicados: {
        excluiuAutoTransferencia: boolean;
        excluiuTransferenciaPais: boolean;
        modoConservadorInteligente: true;
    };

    // ─── Metadados de auditoria ──────────────────────────────────
    auditoria: {
        hashPdf: string;          // SHA-256 do arquivo PDF
        timestamp: string;        // ISO 8601
        algoritmoVersao: string;
        totalTransacoesBrutas: number;
        transacoesRaw: Transacao[]; // log completo para auditoria
    };

    // ─── Avisos ──────────────────────────────────────────────────
    avisos: string[];
}
