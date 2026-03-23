const str = 'Pagamento recebido de MARVYN BANDEIRA LANDES R$900.00 R$900.00 | De: MARVYN BANDEIRA LANDES, CPF, ***.830.487-** Instituição: ITAÚ UNIBANCO S.A. | Tipo: Pix | ';
const str2 = 'Pagamento recebido de MARVYN BANDEIRA LANDES R$900.00 R$900.00';

const reO = /([+-]?\s*(?:[A-Z]{0,3}\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Z])/ig;
console.log('Original regex on string with pipe:', Array.from(str.matchAll(reO)).map(v => v[1]));
console.log('Original regex on string without pipe:', Array.from(str2.matchAll(reO)).map(v => v[1]));

const reFixed = /([+-]?\s*(?:[A-Z]{0,3}\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Za-z])/ig;
console.log('Fixed regex on string with pipe:', Array.from(str.matchAll(reFixed)).map(v => v[1]));
console.log('Fixed regex on string without pipe:', Array.from(str2.matchAll(reFixed)).map(v => v[1]));

const reSimplest = /([+-]?\s*(?:[A-Z]{0,3}\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?/ig;
console.log('Simplest regex on string with pipe:', Array.from(str.matchAll(reSimplest)).map(v => v[1]));
console.log('Simplest regex on string without pipe:', Array.from(str2.matchAll(reSimplest)).map(v => v[1]));
