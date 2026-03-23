
// Test what normalizer produces and what regex works

function normalizar(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

console.log('ELIZABETE normalized:', normalizar('ELIZABETE SOUZA'));
console.log('BET apostas:', normalizar('PIX RECEBIDO DA BETANO'));
console.log('JOGOBET:', normalizar('JOGOBET LTDA'));

// \b = word boundary in JS: position between \w and \W (or start/end)
// In normalized string (A-Z space), \b boundaries are at transitions between letters and spaces
// So \bBET\b in "ELIZABETE" will NOT match because "ELIZABET" and "E" are all letters

const tests = [
    'ELIZABETE SOUZA',
    'MARIA ELIZABETH SILVA',
    'ROBERTA ALVES',
    'ALBERTO CASANOVA',
    'PIX DE BETANO LTDA',
    'JOGOBET APOSTAS',
    'APOSTA ONLINE',
    'BET 365',
    'RECEBI BET',
    'CASINO REAL',
    'CASSINO',
];

const re = /\bBET\b|\bCASINO\b|\bCASSINO\b|\bAPOSTA\b|\bAPOSTAS\b|\bLOTERIA\b|\bLOTERICA\b|\bJOGO\b|\bJOGOS\b|\bSLOTS\b|\bROLETA\b|\bPOKER\b|\bFORTUNE\b/i;

tests.forEach(t => {
    const norm = normalizar(t);
    const match = re.test(norm);
    console.log(`${match ? '🚫' : '✅'} "${t}" → norm:"${norm}" → ${match ? 'APOSTA' : 'ok'}`);
});
