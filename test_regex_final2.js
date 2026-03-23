const fs = require('fs');

const str1 = 'Pagamento recebido de MARVYN BANDEIRA LANDES R$81,156.12 R$81,203.62';
const str2 = 'R$81,156.12';

const regex = /([+-]?\s*(?:[A-Z]{0,3}\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Za-z])/ig;

console.log('Str1:', Array.from(str1.matchAll(regex)).map(m=>m[1]));
console.log('Str2:', Array.from(str2.matchAll(regex)).map(m=>m[1]));
