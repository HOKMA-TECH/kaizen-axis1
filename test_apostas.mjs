
function normalizar(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const KEYWORDS_APOSTAS_EXATAS = [
    'BETNACIONAL', 'BETANO', 'SPORTINGBET', 'BRAZINO', 'PIXBET',
    'ESPORTE DA SORTE', 'SUPERBET', 'NOVIBET', 'BLAZE',
    'FORTUNE TIGER', 'TIGRINHO',
];
const KEYWORDS_APOSTAS_PALAVRA = [
    'BET', 'CASINO', 'CASSINO', 'APOSTA', 'APOSTAS', 'LOTERIA', 'LOTERICA',
    'JOGO', 'JOGOS', 'SLOTS', 'ROLETA', 'POKER', 'FORTUNE',
];
const APOSTAS_PALAVRA_RE = new RegExp('\\b(' + KEYWORDS_APOSTAS_PALAVRA.join('|') + ')\\b', 'i');

function isAposta(desc) {
    const norm = normalizar(desc);
    return KEYWORDS_APOSTAS_EXATAS.some(k => norm.includes(k)) || APOSTAS_PALAVRA_RE.test(norm);
}

const testes = [
    // Deve ser BLOQUEADO (aposta real) = true
    ['PIX RECEBIDO DE BETANO LTDA', true],
    ['PIXBETNACIONAL', true],
    ['APOSTA ONLINE BET 365', true],
    ['CASINO ROYAL LTDA', true],
    ['CASSINO REAL', true],
    ['BLAZE ENTERTAINMENT', true],
    ['SPORTINGBET PAGAMENTO', true],
    ['PIX SUPERBET', true],
    ['RECEBI BET HOJE', true],
    ['FORTUNE TIGER GAME', true],
    // Deve SER PERMITIDO (nome real com BET como substring) = false
    ['PIX RECEBIDO DE ELIZABETE SOUZA', false],
    ['MARIA ELIZABETH SILVA', false],
    ['ALBERTO CASANOVA', false],
    ['ROBERTA ALVES', false],
    ['JULIETA FERREIRA', false],
];

console.log('Testando filtro de apostas com \\b word boundary:\n');
let erros = 0;
testes.forEach(([desc, esperado]) => {
    const resultado = isAposta(desc);
    const ok = resultado === esperado;
    if (!ok) erros++;
    console.log(`${ok ? '✅' : '❌'} [${esperado ? 'BLOQUEAR' : 'PERMITIR'}] "${desc}"`);
    if (!ok) console.log(`   → Esperado: ${esperado}, Obtido: ${resultado}, norm: "${normalizar(desc)}"`);
});
console.log(`\n${erros === 0 ? '✅ Todos os testes passaram!' : `❌ ${erros} erro(s)`}`);
