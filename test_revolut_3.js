const str = "PIX QR Code payment to DAFITI GROUP R$99.90 R$199.70 | Para: DAFITI GROUP, 00763917 Tipo: Pix |";

const regexOriginal = /([+-]?\s*(?:[A-Z]{0,3}\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Z])/ig;
console.log("Original match:", Array.from(str.matchAll(regexOriginal)).map(v=>v[1]));

// O lookahead original: (?=\s|$|\||[A-Z])
// Lookahead permissivo: (?=\s|$|\||[a-zA-Z]|[^0-9])
const regexNova = /([+-]?\s*(?:[A-Z]{0,3}\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|[^0-9.,])/ig;
console.log("Nova match:", Array.from(str.matchAll(regexNova)).map(v=>v[1]));

