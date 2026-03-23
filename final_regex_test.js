const DATA_RE = /^(\d{2}[\/\-\.\s]\d{2}(?:[\/\-\.\s]\d{4})?|\d{2}[\/\-\.\s]+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\.\s]?(?:\d{2,4})?)/i;
const s1 = "06/AGO/2025 Pagamento";
const s2 = " 06/AGO/2025 Pagamento";

console.log("s1 match:", !!s1.match(DATA_RE));
console.log("s2 match:", !!s2.match(DATA_RE));
