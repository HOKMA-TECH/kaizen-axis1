const str = "Pagamento recebido de MARVYN BANDEIRA LANDES R$900.00 R$900.00";
const regex = /([+-]?\s*(?:[A-Z]{0,3}\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Z])/ig;
console.log(Array.from(str.matchAll(regex)).map(v => v[1]));
