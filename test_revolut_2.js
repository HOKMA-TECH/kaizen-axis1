const str = "R$900.00 R$900.00";
const regexes = [ 
  /\d{1,3}[.,]\d{2}/g,
  /[A-Z]{0,3}\$?\s*\d{1,3}[.,]\d{2}/g,
  /([+-]?\s*(?:[A-Z]{0,3}\$?\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s*([CD]|\(\+\)|\(-\)|\+|-))?(?=\s|$|\||[A-Z])/ig
];

regexes.forEach((re, i) => {
   console.log("Teste " + i + ": ", str.match(re));
});
