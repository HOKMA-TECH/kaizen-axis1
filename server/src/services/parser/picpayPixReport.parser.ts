import type { TransacaoBruta } from '../../types/transacao';
import type { BaseParser } from './base.parser';
import { limparTextoPdf, deduplicar } from './base.parser';

/**
 * Parser dedicado para a versao alternativa do extrato PicPay:
 * "Relatorio de Transferencias PIX" (tabela com Nome do Pagador/Data/ID Pix/Valor/...)
 */
export class PicPayPixReportParser implements BaseParser {
    nome = 'PicPayPixReportParser-v1';

    private static readonly REGEX_TRANSACAO_PIX = /(\d{2}\/\d{2}\/\d{4})\s+([A-Z0-9]{10,})\s+R\$\s*([+-]?\d{1,3}(?:\.\d{3})*,\d{2})/gi;

    extrair(textoRaw: string): TransacaoBruta[] {
        const texto = limparTextoPdf(textoRaw);
        const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
        const resultado: TransacaoBruta[] = [];

        const textoFlat = linhas.join(' ').replace(/\s+/g, ' ').trim();
        let match: RegExpExecArray | null;
        PicPayPixReportParser.REGEX_TRANSACAO_PIX.lastIndex = 0;

        while ((match = PicPayPixReportParser.REGEX_TRANSACAO_PIX.exec(textoFlat)) !== null) {
            const dataRaw = match[1].trim();
            const idPix = match[2].trim();
            const valorRaw = match[3].trim();
            const descricaoRaw = `PIX recebido (ID ${idPix})`;
            resultado.push({ dataRaw, descricaoRaw, valorRaw });
        }

        if (resultado.length > 0) {
            return deduplicar(resultado);
        }

        // Fallback resiliente para PDFs onde colunas saem muito quebradas no OCR/text layer.
        // Neste modo, busca por data/hora e valor e tenta o melhor nome imediatamente anterior.
        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            const mDataHora = linha.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
            if (!mDataHora) continue;

            const dataRaw = mDataHora[1];

            // Bloco local da tabela: geralmente data/hora, id pix, valor e nomes em linhas proximas
            const janela = linhas.slice(Math.max(0, i - 3), Math.min(linhas.length, i + 6));
            const bloco = janela.join(' ');

            const mValor = bloco.match(/R\$\s*([+-]?\d{1,3}(?:\.\d{3})*,\d{2})/);
            if (!mValor) continue;

            // Tenta identificar nome do pagador olhando as linhas imediatamente acima da data
            const nomePagadorCandidatos = linhas.slice(Math.max(0, i - 3), i)
                .filter(l => /[A-Za-zÀ-ÿ]{2,}/.test(l) && !/^(PICPAY|BANCO|NOME DO|ID PIX|VALOR)$/i.test(l));
            const nomePagador = nomePagadorCandidatos.length > 0
                ? nomePagadorCandidatos[nomePagadorCandidatos.length - 1]
                : '';

            const mIdPix = bloco.match(/[A-Z0-9]{8,}/i);
            const idPix = mIdPix ? mIdPix[0] : '';

            const descricaoRaw = [
                'PIX recebido',
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
        const upper = texto
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
        const temCabecalhoPix = upper.includes('RELATORIO DE TRANSFERENCIAS PIX') || upper.includes('TRANSFERENCIAS PIX');
        const temColunasMinimas = upper.includes('ID PIX') && upper.includes('VALOR') && (upper.includes('PAGADOR') || upper.includes('NOME DO PAGADOR'));
        return upper.includes('PICPAY') && temCabecalhoPix && temColunasMinimas;
    }
}

export const picPayPixReportParser = new PicPayPixReportParser();
