const fs = require('fs');
let code = fs.readFileSync('c:/Users/hokma/Desktop/KAIZEN-AXIS/kaizen-axis1/api/apuracao.ts', 'utf8');
code = code.replace('const mData = linhaProcessada.match(DATA_RE);', 'const mData = linhaProcessada.match(DATA_RE); if (linha.toLowerCase().includes("ago")) console.log("LINHA> " + linhaProcessada + " MATCHED: " + !!mData);');
fs.writeFileSync('c:/Users/hokma/Desktop/KAIZEN-AXIS/kaizen-axis1/api/apuracao_temp_log.ts', code);
