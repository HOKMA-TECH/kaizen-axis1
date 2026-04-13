import { useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import {
    STAGE_WEIGHTS,
    GlobalMetrics,
    WeightedPipelineEntry,
    ClientHealthScore,
} from '@/types/reports';

// ─── helpers ─────────────────────────────────────────────────────────────────

const parseCurrency = (v: string | undefined | null): number => {
    if (!v) return 0;
    return parseFloat(v.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
};

/** Compute a health score for a client based on stage, value presence, and staleness */
function computeHealthScore(client: {
    stage: string;
    intendedValue?: string;
    updated_at?: string;
}): number {
    // Base score by stage
    const stageBase: Record<string, number> = {
        'Aprovado': 85,
        'Contrato': 80,
        'Em Tratativa': 65,
        'Condicionado': 55,
        'Em Análise': 50,
        'Documentação': 40,
        'Novo Lead': 35,
        'Desistência': 0,
        'Reprovado': 10,
        'Concluído': 100,
    };
    let score = stageBase[client.stage] ?? 50;

    // Bonus: intended value is filled
    if (parseCurrency(client.intendedValue) > 0) score += 10;

    // Penalty: stale — last update > 10 days ago
    if (client.updated_at) {
        const daysSinceUpdate =
            (Date.now() - new Date(client.updated_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate > 10) score -= 15;
    }

    return Math.min(100, Math.max(0, Math.round(score)));
}

// ─── hook ─────────────────────────────────────────────────────────────────────

interface UseReportsDataOptions {
    startDate?: string; // ISO date string 'YYYY-MM-DD'
    endDate?: string;   // ISO date string 'YYYY-MM-DD'
}

interface UseReportsDataResult {
    globalMetrics: GlobalMetrics;
    weightedPipeline: WeightedPipelineEntry[];
    forecastTotal: number;  // weighted total in BRL
    healthScores: ClientHealthScore[];
    filteredClientsCount: number;
}

export function useReportsData({ startDate, endDate }: UseReportsDataOptions = {}): UseReportsDataResult {
    const { clients, leads } = useApp();

    // Filter clients by the selected date range
    const filteredClients = useMemo(() => {
        return clients.filter(c => {
            const created = new Date(c.createdAt);
            if (startDate && created < new Date(startDate)) return false;
            if (endDate && created > new Date(endDate + 'T23:59:59')) return false;
            return true;
        });
    }, [clients, startDate, endDate]);

    // ── Global Metrics ─────────────────────────────────────────────────────────
    const globalMetrics = useMemo((): GlobalMetrics => {
        const total = filteredClients.length;
        const vendas = filteredClients.filter(c => c.stage === 'Concluído');
        const totalVendas = vendas.length;
        const taxaConversao = total > 0 ? (totalVendas / total) * 100 : 0;

        // Real average sales cycle: closed_at → fallback updated_at → fallback createdAt
        const ciclosComDados = vendas.filter(c => c.closed_at || c.updated_at);
        const cicloMedioDias =
            ciclosComDados.length > 0
                ? ciclosComDados.reduce((acc, c) => {
                    const closedDate = c.closed_at || c.updated_at!;
                    const days =
                        (new Date(closedDate).getTime() - new Date(c.createdAt).getTime()) /
                        (1000 * 60 * 60 * 24);
                    return acc + Math.max(0, days);
                }, 0) / ciclosComDados.length
                : 0;

        return {
            totalVendas,
            novosLeads: leads.length,
            taxaConversao: parseFloat(taxaConversao.toFixed(1)),
            cicloMedioDias: parseFloat(cicloMedioDias.toFixed(1)),
        };
    }, [filteredClients, leads]);

    // ── Weighted Pipeline (chart data) ────────────────────────────────────────
    const { weightedPipeline, forecastTotal } = useMemo(() => {
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

        let totalWeightedBRL = 0;

        const pipeline: WeightedPipelineEntry[] = months.map((m, i) => {
            const monthClients = filteredClients.filter(c => new Date(c.createdAt).getMonth() === i);

            // weighted = sum of (intended_value * stage_weight)
            const weighted = monthClients.reduce((acc, c) => {
                const val = parseCurrency(c.intendedValue);
                const weight = STAGE_WEIGHTS[c.stage] ?? 0;
                return acc + val * weight;
            }, 0);

            // confirmed = only 'Concluído' clients
            const confirmed = monthClients
                .filter(c => c.stage === 'Concluído')
                .reduce((acc, c) => acc + parseCurrency(c.intendedValue), 0);

            totalWeightedBRL += weighted;

            return { month: m, weighted: weighted / 1000, confirmed: confirmed / 1000 };
        });

        return { weightedPipeline: pipeline, forecastTotal: totalWeightedBRL };
    }, [filteredClients]);

    // ── Health Scores (top 5 clients) ─────────────────────────────────────────
    const healthScores = useMemo((): ClientHealthScore[] => {
        return filteredClients.slice(0, 5).map(c => {
            const score = computeHealthScore({
                stage: c.stage,
                intendedValue: c.intendedValue,
                updated_at: c.updated_at,
            });
            return {
                id: c.id,
                name: c.name,
                stage: c.stage,
                score,
                potentialValue: c.intendedValue,
                conversionProbability: score,
            };
        });
    }, [filteredClients]);

    return {
        globalMetrics,
        weightedPipeline,
        forecastTotal,
        healthScores,
        filteredClientsCount: filteredClients.length,
    };
}
