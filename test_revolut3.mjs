
const MESES_EXTENSO_API = {
    janeiro: 'JAN', fevereiro: 'FEV', marco: 'MAR', abril: 'ABR',
    maio: 'MAI', junho: 'JUN', julho: 'JUL', agosto: 'AGO',
    setembro: 'SET', outubro: 'OUT', novembro: 'NOV', dezembro: 'DEZ',
};

const trecho = "11 de mar. de 2026 Camilafigueira R$6.00 | Agosto 2025 | 6 de ago. de 2025 Pagamento recebido R$900.00 R$900.00";

// Step 1: first replace - dia de mes de ano -> DD/MES/AAAA
const r1 = trecho.replace(
    /(\d{1,2})\s+de\s+(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)\s+de\s+(\d{4})/gi,
    (_, d, m, a) => {
        const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
        return `${d.padStart(2, '0')}/${MESES_EXTENSO_API[key]}/${a}`;
    }
);
console.log('After r1:', r1);

// Step 2: second replace - "Agosto 2025" (without a day prefix) -> 01/AGO/2025
// CRITICAL FIX: must NOT match if preceded by / (which would mean it's already part of DD/MES/AAAA)
// Use negative lookbehind (?<!\/) to avoid eating already-converted dates
const r2 = r1.replace(
    /(?<![\/\d])(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)[\/\s]+(?:de\s+)?(\d{4})\b/gi,
    (_, m, a) => {
        const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
        return `01/${MESES_EXTENSO_API[key]}/${a}`;
    }
);
console.log('After r2:', r2);

// Test DATA_RE
const DATA_RE = /^(\d{2}[\/\-\.\s]\d{2}(?:[\/\-\.\s]\d{4})?|\d{2}[\/\-\.\s]+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\.\s]?(?:\d{2,4})?)/i;
const lines = r2.split(/[\n|]/).map(l => l.trim()).filter(l => l.length > 0);
console.log('\nLines:');
lines.forEach(l => {
    const m = l.match(DATA_RE);
    if (m) console.log('  DATE:', m[1], '| REST:', l.substring(m[0].length).trim().substring(0, 50));
});
