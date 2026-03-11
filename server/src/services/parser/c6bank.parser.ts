import type { TransacaoBruta } from '../../types/transacao';
import type { BaseParser } from './base.parser';
import { limparTextoPdf, deduplicar } from './base.parser';

/**
 * C6BankParser — Parser dedicado para extratos PDF do C6 Bank.
 *
 * Formato do C6 Bank:
 *   - Cabeçalho de mês:  "Maio 2025 (21/05/2025 - 31/05/2025)"
 *   - Linhas de transação: "24/05  26/05  Entrada PIX  Pix recebido de NOME  R$200,00"
 *     onde a 1ª coluna é Data lançamento (DD/MM) e a 2ª coluna é Data contábil (DD/MM).
 *
 * Estratégia:
 *   1. Detecta cabeçalhos de mês para extrair o ANO corrente do bloco.
 *   2. Para cada linha de transação, captura a 1ª data (lançamento) e ignora a 2ª (contábil).
 *   3. Combina DD/MM + ano do cabeçalho para gerar a data final correta.
 */
export class C6BankParser implements BaseParser {
    nome = 'C6BankParser-v1';

    // Cabeçalho de mês: "Maio 2025" ou "Agosto 2025 (01/08/2025 - 31/08/2025)"
    private static readonly REGEX_CABECALHO_MES =
        /^(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{4})/i;

    // Linha de transação com DUAS datas no início: "24/05  26/05  ..."
    // Grupo 1: dia lançamento, Grupo 2: mês lançamento
    // Grupo 3: resto da linha (tipo + descrição + valor)
    private static readonly REGEX_LINHA_DUPLA_DATA =
        /^(\d{2})\/(\d{2})\s+\d{2}\/\d{2}\s+(.+)/;

    // Valor monetário ao final da linha (R$ opcional, sinal opcional)
    private static readonly REGEX_VALOR_FIM =
        /([+-]?\s*R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

    // Tipos de transação do C6 (colunas de tipo)
    private static readonly TIPOS_TRANSACAO = [
        'Entrada PIX', 'Saída PIX', 'Débito de Cartão', 'Pagamento',
        'Outros gastos', 'Transferência', 'TED', 'DOC', 'Saque',
        'Crédito', 'Débito', 'PIX', 'Boleto',
    ];

    extrair(textoRaw: string): TransacaoBruta[] {
        const texto = limparTextoPdf(textoRaw);
        const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const resultado: TransacaoBruta[] = [];
        let anoContextual = new Date().getFullYear();

        for (const linha of linhas) {
            // ── Detecta cabeçalho de mês → atualiza o ano contextual ──────────
            const mCab = linha.match(C6BankParser.REGEX_CABECALHO_MES);
            if (mCab) {
                anoContextual = parseInt(mCab[2], 10);
                continue;
            }

            // ── Detecta linha com duas datas (formato C6) ─────────────────────
            const mLinha = linha.match(C6BankParser.REGEX_LINHA_DUPLA_DATA);
            if (!mLinha) continue;

            const dia = mLinha[1];
            const mes = mLinha[2];
            const resto = mLinha[3].trim();

            // Extrai o valor monetário do final da linha
            const mValor = resto.match(C6BankParser.REGEX_VALOR_FIM);
            if (!mValor) continue;

            const valorRaw = mValor[1].replace(/\s+/g, '').replace(/^R\$/i, '');

            // Remove o tipo de transação e o valor da descrição
            let descricao = resto.substring(0, resto.lastIndexOf(mValor[1])).trim();

            // Remove o tipo de transação no início (ex: "Entrada PIX  ")
            for (const tipo of C6BankParser.TIPOS_TRANSACAO) {
                if (descricao.toUpperCase().startsWith(tipo.toUpperCase())) {
                    descricao = descricao.substring(tipo.length).trim();
                    break;
                }
            }

            if (descricao.length < 3) continue;

            // Monta a data com o ano do cabeçalho: "DD/MM/YYYY"
            const dataRaw = `${dia}/${mes}/${anoContextual}`;

            resultado.push({ dataRaw, descricaoRaw: descricao, valorRaw });
        }

        return deduplicar(resultado);
    }

    /**
     * Verifica se o texto do PDF parece ser do C6 Bank.
     * Critério: presença de "C6BANK" ou "C6 BANK" no texto.
     */
    static detectar(texto: string): boolean {
        const upper = texto.toUpperCase();
        return upper.includes('C6BANK') || upper.includes('C6 BANK');
    }
}

export const c6BankParser = new C6BankParser();
