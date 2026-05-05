import type { TransacaoBruta } from '../../types/transacao';
import type { BaseParser } from './base.parser';
import { limparTextoPdf, deduplicar } from './base.parser';

/**
 * Parser dedicado para a versao alternativa do extrato PicPay:
 * "Relatorio de Transferencias PIX" (tabela com Nome do Pagador/Data/ID Pix/Valor/...)
 */
export class PicPayPixReportParser implements BaseParser {
    nome = 'PicPayPixReportParser-v1';

    private static readonly REGEX_DATA_HORA = /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/;
    private static readonly REGEX_VALOR = /R\$\s*([+-]?\d{1,3}(?:\.\d{3})*,\d{2})/;
    private static readonly REGEX_ID_PIX = /[A-Z0-9]{8,}/i;

    extrair(textoRaw: string): TransacaoBruta[] {
        const texto = limparTextoPdf(textoRaw);
        const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
        const resultado: TransacaoBruta[] = [];

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            const mDataHora = linha.match(PicPayPixReportParser.REGEX_DATA_HORA);
            if (!mDataHora) continue;

            const dataRaw = mDataHora[1];

            // Bloco local da tabela: geralmente data/hora, id pix, valor e nomes em linhas proximas
            const janela = linhas.slice(Math.max(0, i - 3), Math.min(linhas.length, i + 6));
            const bloco = janela.join(' ');

            const mValor = bloco.match(PicPayPixReportParser.REGEX_VALOR);
            if (!mValor) continue;

            // Tenta identificar nome do pagador olhando as linhas imediatamente acima da data
            const nomePagadorCandidatos = linhas.slice(Math.max(0, i - 3), i)
                .filter(l => /[A-Za-zÀ-ÿ]{2,}/.test(l) && !/^(PICPAY|BANCO|NOME DO|ID PIX|VALOR)$/i.test(l));
            const nomePagador = nomePagadorCandidatos.length > 0
                ? nomePagadorCandidatos[nomePagadorCandidatos.length - 1]
                : '';

            const mIdPix = bloco.match(PicPayPixReportParser.REGEX_ID_PIX);
            const idPix = mIdPix ? mIdPix[0] : '';

            const descricaoRaw = [
                'PIX recebido',
                nomePagador ? `de ${nomePagador}` : 'PicPay',
                idPix ? `(ID ${idPix})` : '',
            ].filter(Boolean).join(' ');

            resultado.push({
                dataRaw,
                descricaoRaw,
                valorRaw: mValor[1],
            });
        }

        return deduplicar(resultado);
    }

    static detectar(texto: string): boolean {
        const upper = texto.toUpperCase();
        return upper.includes('PICPAY')
            && upper.includes('RELATORIO DE TRANSFERENCIAS PIX')
            && upper.includes('NOME DO PAGADOR')
            && upper.includes('ID PIX')
            && upper.includes('BANCO DO RECEBEDOR');
    }
}

export const picPayPixReportParser = new PicPayPixReportParser();
