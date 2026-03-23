import fs from 'fs';
import path from 'path';

// Carrega o arquivo mock
const txtPath = path.join(process.cwd(), 'testsprite_tests', 'tmp', 'caixa_mock.txt');
const textoExtrato = fs.readFileSync(txtPath, 'utf8');

// Copia do core do conversor só para testar como o regex se comporta nesta string

const MESES_EXTENSO_API = {
    janeiro: 'JAN', fevereiro: 'FEV', marco: 'MAR', abril: 'ABR',
    maio: 'MAI', junho: 'JUN', julho: 'JUL', agosto: 'AGO',
    setembro: 'SET', outubro: 'OUT', novembro: 'NOV', dezembro: 'DEZ',
};

const VALOR_RE = /([+-]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})\s*([CD]|\(\+\)|\(-\)|\+|-)?(?=\s|$|\|)/i;
const DATA_RE = /^(\d{2}[\/\-\.\s]\d{2}(?:[\/\-\.\s]\d{4})?|\d{2}[\/\-\.\s]+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\.\s]?(?:\d{2,4})?)/i;

function extrair(texto) {
    const limpo = texto.trim();
    const linhas = limpo.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const todos = [];
    let saldoAnteriorTracker = null;
    let dataContextual = '';
    let anoContextual = new Date().getFullYear().toString();
    let descAcumulada = '';

    const CABECALHOS_IGNORE = /^(extrato de|bradesco|banco do brasil|lançamentos|histórico|docto|crédito|débito|saldo|data:|cliente:|agência:|conta:|^[\d/]+$)/i;

    const SECTIONS_IGNORE = /^(comprovantes? de|pacote de servi[çc]os|[íi]ndices econ[óo]micos|resumo consolidado|demonstrativo de|posi[çc][ãa]o de|investimentos|t[íi]tulos? de capitaliza[çc][ãa]o|fundos? de investimento|cr[ée]dito pessoal|poupan[çc]a|cart[ãa]o de cr[ée]dito|seguros|prote[çc][ãa]o)/i;
    const SECTIONS_VALID = /(conta corrente|movimenta[çc][ãa]o|lan[çc]amentos|hist[óo]rico(?! de)|transa[çc][ão][ãe]es da conta|extrato de transa|extrato)/i; // ADDED EXTRATO just in case

    let isIgnoredSection = false;

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];

        if (linha.length < 80) {
            if (SECTIONS_IGNORE.test(linha)) {
                isIgnoredSection = true;
                continue;
            } else if (SECTIONS_VALID.test(linha)) {
                isIgnoredSection = false;
                continue;
            }
        }

        if (isIgnoredSection) continue;

        const mData = linha.match(DATA_RE);

        if (mData) {
            let dataCandidata = mData[1];
            dataContextual = dataCandidata;

            let descSemData = linha.substring(mData[0].length).trim();
            const valoresLine = Array.from(descSemData.matchAll(/([+-]?\s*(?:R\$?\s*|[A-Z]{1,3}\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Za-z])/ig));

            if (valoresLine.length > 0) {
                let descPura = descSemData;
                valoresLine.forEach(m => {
                    descPura = descPura.replace(m[0], '');
                });
                descPura = descPura.trim();

                if (valoresLine.length >= 2) {
                    const ult = valoresLine[valoresLine.length - 1];
                    const penult = valoresLine[valoresLine.length - 2];
                    todos.push({ dataRaw: dataContextual, descricaoRaw: descPura, valorRaw: penult[1] + (penult[2] || '') });
                } else {
                    const vMatch = valoresLine[0];
                    todos.push({ dataRaw: dataContextual, descricaoRaw: descPura, valorRaw: vMatch[1] + (vMatch[2] || '') });
                }
            } 
        }
    }
    return todos;
}

const resultado = extrair(textoExtrato);
console.log(JSON.stringify(resultado, null, 2));

