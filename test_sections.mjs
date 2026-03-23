
const SECTIONS_IGNORE = /^(comprovantes? de|pacote de servi[çc]os|[íi]ndices econ[óo]micos|resumo consolidado|demonstrativo de|posi[çc][ãa]o de|investimentos|t[íi]tulos? de capitaliza[çc][ãa]o|fundos? de investimento|cr[ée]dito pessoal|poupan[çc]a|cart[ãa]o de cr[ée]dito|seguros|prote[çc][ãa]o)/i;
const SECTIONS_VALID = /(conta corrente|movimenta[çc][ãa]o|lan[çc]amentos|hist[óo]rico(?! de)|transa[çc][ão][ãe]es da conta|extrato de transa)/i;

const testLines = [
    'Resumo do saldo',
    'Produto Saldo inicial Valores descontados Valores recebidos Saldo final',
    'Conta (E-Money) R$0.00 R$81,156.12 R$81,203.62 R$47.50',
    'Para onde suas transações são remetidas',
    'Transações da conta de 1 de 01/AGO/2025 a 11/MAR/2026',
    'Data Descrição Valores descontados Valores recebidos Saldo',
    '06/AGO/2025 Pagamento recebido de MARVYN BANDEIRA LANDES R$900.00 R$900.00',
    'De: MARVYN BANDEIRA LANDES, CPF, ***.830.487-** Instituição: ITAÚ UNIBANCO S.A.',
    'Tipo: Pix',
    '06/AGO/2025 Para BRL Contas remuneradas R$600.00 R$300.00',
    '06/AGO/2025 PIX QR Code payment to DAFITI GROUP R$99.90 R$199.70',
];

let isIgnoredSection = false;
testLines.forEach((linha, i) => {
    if (linha.length < 80) {
        if (SECTIONS_IGNORE.test(linha)) {
            console.log(`[${i}] => ACTIVATE IGNORE: "${linha}"`);
            isIgnoredSection = true;
            return;
        } else if (SECTIONS_VALID.test(linha)) {
            console.log(`[${i}] => DEACTIVATE IGNORE: "${linha}"`);
            isIgnoredSection = false;
            return;
        }
    }
    console.log(`[${i}] ${isIgnoredSection ? 'SKIPPED' : 'OK'}: "${linha.substring(0,70)}"`);
});
