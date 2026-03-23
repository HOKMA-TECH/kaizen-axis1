const fs = require('fs');

const MESES_EXTENSO_API = {
    janeiro: 'JAN', fevereiro: 'FEV', marco: 'MAR', abril: 'ABR',
    maio: 'MAI', junho: 'JUN', julho: 'JUL', agosto: 'AGO',
    setembro: 'SET', outubro: 'OUT', novembro: 'NOV', dezembro: 'DEZ'
};

function extrair(texto) {
    const normalizado = texto
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .replace(/\|/g, '\n') // Simula a divisao por pipe
        .replace(
            /(\d{1,2})\s+de\s+(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)\s+de\s+(\d{4})/gi,
            (_, d, m, a) => {
                const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
                return `${d.padStart(2, '0')}/${MESES_EXTENSO_API[key]}/${a}`;
            }
        )
        .replace(
            /\b(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)[\s\/]+(?:de\s+)?(\d{4})\b/gi,
            (_, m, a) => {
                const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
                return `01/${MESES_EXTENSO_API[key]}/${a}`;
            }
        );

    const limpo = normalizado.trim();
    const linhas = limpo.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const todos = [];
    const vistas = new Set();
    let saldoAnteriorTracker = null;
    let dataContextual = '';
    let descAcumulada = '';

    function parseMoeda(v) {
        let limpo = v.replace(/[R$\sA-Z]/g, '').trim();
        if (limpo.indexOf(',') > limpo.indexOf('.')) limpo = limpo.replace(/\./g, '').replace(',', '.');
        else if (limpo.indexOf('.') > limpo.indexOf(',')) limpo = limpo.replace(/,/g, '');
        else if (limpo.includes(',')) limpo = limpo.replace(',', '.');
        return parseFloat(limpo) || 0;
    }

    function add(dataRaw, descricaoRaw, valorStr, isCreditInferred) {
        let v = valorStr.replace(/\s+/g, '').replace(/^R\$/i, '').replace(/^-R\$/i, '-');
        if (v.startsWith('+')) v = v.substring(1);

        const mDC = v.match(/^(-?[\d.]+,\d{2})([CD]|\(\+\)|\(-\)|\+|-)?$/i);
        if (mDC) {
            const numPart = mDC[1].replace(/^-/, '');
            const suf = (mDC[2] ?? '').toUpperCase();

            // Se for do Revolut e estiver em formato .00 temos que tratar... oh wait!
            // a REGEX no main parser (mDC) espera formatação BR no ADICIONAR (,00)!
            console.log("mDC testou: ", v, " e resultou: ", mDC);
        } else {
            console.log("mDC FALHOU em testar: ", v);
        }

        const desc = descricaoRaw.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
        if (desc.length < 3) return;
        const chave = `${dataRaw}|${desc}|${v}`;
        if (!vistas.has(chave)) {
            vistas.add(chave);
            todos.push({ dataRaw, descricaoRaw: desc, valorRaw: v });
            console.log("--- > ADD: ", desc, v);
        }
    }

    // Mesma logica do extrair
    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        
        const mData = linha.match(/^(\d{2}\/\w{3}\/\d{4})/i);
        if (mData) {
            dataContextual = mData[1];
            let descSemData = linha.substring(mData[0].length).trim();
            const valoresLine = Array.from(descSemData.matchAll(/([+-]?\s*(?:[A-Z]{0,3}\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Z])/ig));
            
            if (valoresLine.length > 0) {
                let descPura = descSemData;
                valoresLine.forEach(m => descPura = descPura.replace(m[0], ''));
                descPura = `${descAcumulada} ${descPura}`.trim();
                descAcumulada = '';

                if (valoresLine.length >= 2) {
                    const ult = valoresLine[valoresLine.length - 1];
                    const penult = valoresLine[valoresLine.length - 2];
                    const strMod = penult[2] ?? '';
                    add(dataContextual, descPura, penult[1] + strMod, undefined);
                } else {
                    const vMatch = valoresLine[0];
                    add(dataContextual, descPura, vMatch[1] + (vMatch[2] ?? ''));
                }
            }
        }
    }
}

const texto = `Extrato em BRL | Gerado em 11 de mar. de 2026 | Revolut Sociedade de Crédito Direto S.A. | Marvyn Bandeira Landes | 101 Rua Humberto dos Santos | Fundos | 21635-250 | Rio de Janeiro | RJ | Resumo do saldo | Produto Saldo inicial Valores descontados Valores recebidos Saldo final | Conta (E-Money) R$0.00 R$81,156.12 R$81,203.62 R$47.50 | Para onde suas transações são remetidas | Depósito R$0.00 R$25,307.52 R$25,308.27 R$0.75 | Total R$0.00 R$106,463.64 R$106,511.89 R$48.25 | O saldo em seu extrato pode ser diferente do saldo mostrado no seu app. O saldo do extrato reflete apenas as transações concluídas, enquanto o app mostra o saldo disponível para uso, que contabiliza as transações pendentes. | Pendente de 1 de agosto de 2025 a 11 de março de 2026 | Data de início Descrição Valores descontados Valores recebidos | 11 de mar. de 2026 Camilafigueira R$6.00 | Para: Camilafigueira, Rio De Janeir Cartão: 490106******4020 | 11 de mar. de 2026 Superlar R$7.99 | Para: Superlar, Rio De Janeir | Cartão: 490106******4020 | Transações da conta de 1 de agosto de 2025 a 11 de março de 2026 | Data Descrição Valores descontados Valores recebidos Saldo | 6 de ago. de 2025 Pagamento recebido de MARVYN BANDEIRA LANDES R$900.00 R$900.00 | De: MARVYN BANDEIRA LANDES, CPF, ***.830.487-** Instituição: ITAÚ UNIBANCO S.A. | Tipo: Pix | 6 de ago. de 2025 Para BRL Contas remuneradas R$600.00 R$300.00 | 6 de ago. de 2025 Compra de Revpoints com o recurso Troco R$0.40 R$299.60 | Referência: Revpoints Spare Change | 6 de ago. de 2025 PIX QR Code payment to DAFITI GROUP R$99.90 R$199.70 | Para: DAFITI GROUP, 00763917 Tipo: Pix |`;
extrair(texto);
