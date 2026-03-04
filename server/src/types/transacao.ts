/**
 * Classificação de cada transação extraída do extrato.
 * Ordem de aplicação definida em classificacao.service.ts.
 */
export type ClassificacaoTransacao =
    | 'credito_valido'            // Crédito válido — entra na apuração
    | 'debito'                    // Valor ≤ 0
    | 'ignorar_estorno'           // Contém palavra de estorno/devolução
    | 'ignorar_sem_keyword'       // Não contém keyword de crédito válido
    | 'ignorar_autotransferencia' // Match forte com nome do próprio cliente
    | 'ignorar_transferencia_pai' // Match forte com nome do pai
    | 'ignorar_transferencia_mae' // Match forte com nome da mãe
    | 'possivel_vinculo_familiar'; // Match fraco — sinalizado para revisão

/** Transação bruta extraída do PDF */
export interface TransacaoBruta {
    dataRaw: string;    // texto original da data (DD/MM ou DD/MM/YYYY)
    descricaoRaw: string;
    valorRaw: string;   // ex: "1.250,35"
}

/** Transação processada e classificada */
export interface Transacao {
    data: string;             // YYYY-MM-DD (ou YYYY-MM se sem dia)
    mes: string;              // YYYY-MM (para agrupamento)
    descricao: string;        // normalizada para display
    valor: number;            // em CENTAVOS (inteiro — evita float)
    classificacao: ClassificacaoTransacao;
    motivoExclusao?: string;
}

/** Contexto de nomes do cliente para matching */
export interface ContextoNomes {
    nomeCliente: string;
    cpf?: string;         // para detecção de CPF parcial na descrição
    nomePai?: string;
    nomeMae?: string;
}
