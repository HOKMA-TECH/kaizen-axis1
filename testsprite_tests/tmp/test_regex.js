const regex = /([+-]?\s*(?:R\$?\s*|\b(?:USD|EUR|GBP|BRL|CHF|CAD|JPY|AUD|ARS)\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Za-z])/ig;
console.log(Array.from('12:07 Compra realizada Prana Eventos Campos do Jor Bra Com saldo - R$ 20,00'.matchAll(regex)).map(m=>m[0]));
