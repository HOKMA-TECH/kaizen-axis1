
// Test to check what happens with the ACTUAL Revolut text format
// The debug showed 4652 lines which is suspicious
// The debug_texto_extraido shows NEWLINE-replaced with pipes, but the real textoExtrato uses \n

const texto = `Extrato em BRL | Gerado em 11 de mar. de 2026 | Revolut Sociedade de Crédito Direto S.A. | Marvyn Bandeira Landes | 101 Rua Humberto dos Santos | Fundos | 21635-250 | Rio de Janeiro | RJ | Resumo do saldo | Produto Saldo inicial Valores descontados Valores recebidos Saldo final | Conta (E-Money) R$0.00 R$81,156.12 R$81,203.62 R$47.50 | Para onde suas transações são remetidas | Depósito R$0.00 R$25,307.52 R$25,308.27 R$0.75 | Total R$0.00 R$106,463.64 R$106,511.89 R$48.25 | O saldo em seu extrato pode ser diferente do saldo mostrado no seu app. O saldo do extrato reflete apenas as transações concluídas, enquanto o app mostra o saldo disponível para uso, que contabiliza as transações pendentes. | Pendente de 1 de agosto de 2025 a 11 de março de 2026 | Data de início Descrição Valores descontados Valores recebidos | 11 de mar. de 2026 Camilafigueira R$6.00 | Para: Camilafigueira, Rio De Janeir Cartão: 490106******4020 | 11 de mar. de 2026 Superlar R$7.99 | Para: Superlar, Rio De Janeir | Cartão: 490106******4020 | Transações da conta de 1 de agosto de 2025 a 11 de março de 2026 | Data Descrição Valores descontados Valores recebidos Saldo | 6 de ago. de 2025 Pagamento recebido de MARVYN BANDEIRA LANDES R$900.00 R$900.00 | De: MARVYN BANDEIRA LANDES, CPF, ***.830.487-** Instituição: ITAÚ UNIBANCO S.A. | Tipo: Pix | 6 de ago. de 2025 Para BRL Contas remuneradas R$600.00 R$300.00 | 6 de ago. de 2025 Compra de Revpoints com o recurso Troco R$0.40 R$299.60 | Referência: Revpoints Spare Change | 6 de ago. de 2025 PIX QR Code payment to DAFITI GROUP R$99.90 R$199.70 | Para: DAFITI GROUP, 00763917 Tipo: Pix`;

const MESES_EXTENSO_API = {
    janeiro: 'JAN', fevereiro: 'FEV', marco: 'MAR', abril: 'ABR',
    maio: 'MAI', junho: 'JUN', julho: 'JUL', agosto: 'AGO',
    setembro: 'SET', outubro: 'OUT', novembro: 'NOV', dezembro: 'DEZ',
};

const normalizado = texto
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(
        /(\d{1,2})\s+de\s+(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)\s+de\s+(\d{4})/gi,
        (_, d, m, a) => {
            const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
            return `${d.padStart(2, '0')}/${MESES_EXTENSO_API[key]}/${a}`;
        }
    )
    .replace(
        /(?<![\/\d])(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)[\s\/]+(?:de\s+)?(\d{4})\b/gi,
        (_, m, a) => {
            const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
            return `01/${MESES_EXTENSO_API[key]}/${a}`;
        }
    );

const isRevolut = /revolut/i.test(normalizado.substring(0, 1500));
console.log('isRevolut:', isRevolut);

const linhas = isRevolut
    ? normalizado.split(/[\n|]/).map(l => l.trim()).filter(l => l.length > 0)
    : normalizado.split('\n').map(l => l.trim()).filter(l => l.length > 0);

console.log('Total linhas:', linhas.length);
console.log('\nAll lines:');
linhas.forEach((l, i) => console.log(`  [${i}] ${l.substring(0, 90)}`));

// Test what SECTIONS_IGNORE would trigger on
const SECTIONS_IGNORE = /^(comprovantes? de|pacote de servi[çc]os|[íi]ndices econ[óo]micos|resumo (do|de|consolidado)|demonstrativo de|posi[çc][ãa]o de|investimentos|t[íi]tulos? de capitaliza[çc][ãa]o|fundos? de investimento|cr[ée]dito pessoal|poupan[çc]a|cart[ãa]o de cr[ée]dito|seguros|prote[çc][ãa]o)/i;
const SECTIONS_VALID = /(conta corrente|movimenta[çc][ãa]o|lan[çc]amentos|hist[óo]rico(?! de))/i;
const C6_MES_RE = /^(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(20\d{2})/i;

console.log('\n\nSECTIONS_IGNORE matches:');
linhas.forEach((l, i) => {
    if (l.length < 80 && SECTIONS_IGNORE.test(l)) console.log(`  [${i}] IGNORE: ${l}`);
    if (l.length < 80 && SECTIONS_VALID.test(l)) console.log(`  [${i}] VALID: ${l}`);
    if (C6_MES_RE.test(l)) console.log(`  [${i}] C6_MES: ${l}`);
});
