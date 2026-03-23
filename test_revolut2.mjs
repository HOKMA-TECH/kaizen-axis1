
const MESES_EXTENSO_API = {
    janeiro: 'JAN', fevereiro: 'FEV', marco: 'MAR', abril: 'ABR',
    maio: 'MAI', junho: 'JUN', julho: 'JUL', agosto: 'AGO',
    setembro: 'SET', outubro: 'OUT', novembro: 'NOV', dezembro: 'DEZ',
};

const trecho = "11 de mar. de 2026 Camilafigueira R$6.00";

// Step 1: first replace
const r1 = trecho.replace(
    /(\d{1,2})\s+de\s+(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)\s+de\s+(\d{4})/gi,
    (_, d, m, a) => {
        const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
        return `${d.padStart(2, '0')}/${MESES_EXTENSO_API[key]}/${a}`;
    }
);
console.log('After r1:', r1);

// Step 2: second replace
const r2 = r1.replace(
    /\b(janeiro|jan\.?|fevereiro|fev\.?|mar(?:ç|c)o|mar\.?|abril|abr\.?|maio|mai\.?|junho|jun\.?|julho|jul\.?|agosto|ago\.?|setembro|set\.?|outubro|out\.?|novembro|nov\.?|dezembro|dez\.?)[\/\s]+(?:de\s+)?(\d{4})\b/gi,
    (_, m, a) => {
        const cleanM = m.replace('.', '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const key = Object.keys(MESES_EXTENSO_API).find(k => k.startsWith(cleanM)) || 'janeiro';
        return `01/${MESES_EXTENSO_API[key]}/${a}`;
    }
);
console.log('After r2:', r2);

// Test DATA_RE
const DATA_RE = /^(\d{2}[\/\-\.\s]\d{2}(?:[\/\-\.\s]\d{4})?|\d{2}[\/\-\.\s]+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\.\s]?(?:\d{2,4})?)/i;
console.log('DATA_RE match on r2:', r2.match(DATA_RE)?.[1] || 'NO MATCH');
