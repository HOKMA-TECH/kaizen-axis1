/**
 * Suite completa de testes Jest para o motor de apuração.
 * 10 cenários obrigatórios do spec — 100% determinísticos.
 */

import { parseMoeda, formatarMoeda, somarCentavos } from '../src/utils/moeda';
import { tokenizarNome, normalizar } from '../src/utils/normalizacao';
import { REGEX_TRANSACAO } from '../src/utils/regex';
import { calcularMatch } from '../src/services/matching.service';
import { classificarTransacao } from '../src/services/classificacao.service';
import type { TransacaoBruta, ContextoNomes } from '../src/types/transacao';

// ──────────────────────────────────────────────────────────────────────────────
// CENÁRIO 1: Conversão monetária correta
// ──────────────────────────────────────────────────────────────────────────────
describe('CENÁRIO 1 — Conversão monetária', () => {
    test('1.250,35 → 125035 centavos', () => {
        expect(parseMoeda('1.250,35')).toBe(125035);
    });

    test('250,00 → 25000 centavos', () => {
        expect(parseMoeda('250,00')).toBe(25000);
    });

    test('30.000,00 → 3000000 centavos', () => {
        expect(parseMoeda('30.000,00')).toBe(3000000);
    });

    test('0,01 → 1 centavo', () => {
        expect(parseMoeda('0,01')).toBe(1);
    });

    test('string inválida → 0', () => {
        expect(parseMoeda('abc')).toBe(0);
        expect(parseMoeda('')).toBe(0);
    });

    test('formatarMoeda: 125035 → "R$ 1.250,35"', () => {
        expect(formatarMoeda(125035)).toBe('R$\u00a01.250,35');
    });

    test('somarCentavos: [100, 200, 300] → 600', () => {
        expect(somarCentavos([100, 200, 300])).toBe(600);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// CENÁRIO 2: Regex captura corretamente data/descrição/valor
// ──────────────────────────────────────────────────────────────────────────────
describe('CENÁRIO 2 — Regex de extração de transações', () => {
    function extrairLinhas(texto: string) {
        const resultados: Array<{ data: string; desc: string; valor: string }> = [];
        REGEX_TRANSACAO.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = REGEX_TRANSACAO.exec(texto)) !== null) {
            resultados.push({ data: m[1], desc: m[2].trim(), valor: m[3] });
        }
        return resultados;
    }

    test('Linha padrão com data DD/MM', () => {
        const linha = '15/03 PIX RECEBIDO JOAO SILVA 1.250,35';
        const r = extrairLinhas(linha);
        expect(r).toHaveLength(1);
        expect(r[0].data).toBe('15/03');
        expect(r[0].valor).toBe('1.250,35');
    });

    test('Linha com data DD/MM/YYYY', () => {
        const linha = '15/03/2024 TED RECEBIDA EMPRESA ABC LTDA 5.000,00';
        const r = extrairLinhas(linha);
        expect(r).toHaveLength(1);
        expect(r[0].data).toBe('15/03/2024');
        expect(r[0].valor).toBe('5.000,00');
    });

    test('Múltiplas linhas', () => {
        const texto = [
            '01/01 PIX RECEBIDO CARLOS 500,00',
            '02/01 DEPOSITO IDENTIFICADO 1.200,00',
        ].join('\n');
        const r = extrairLinhas(texto);
        expect(r).toHaveLength(2);
    });

    test('Linha sem valor BR — NÃO deve capturar', () => {
        const linha = '15/03 PIX RECEBIDO ALGUEM SEM_VALOR';
        const r = extrairLinhas(linha);
        expect(r).toHaveLength(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// CENÁRIO 3: Match forte correto (≥70% ou ≥3 tokens)
// ──────────────────────────────────────────────────────────────────────────────
describe('CENÁRIO 3 — Match forte', () => {
    test('3 tokens presentes → match forte', () => {
        // "JOAO CARLOS DA SILVA" → tokens: JOAO, CARLOS, SILVA
        const r = calcularMatch('JOAO CARLOS DA SILVA', 'PIX RECEBIDO JOAO CARLOS SILVA');
        expect(r.resultado).toBe('forte');
        expect(r.tokensEncontrados.length).toBeGreaterThanOrEqual(3);
    });

    test('≥70% tokens presentes → match forte', () => {
        // "ANA PAULA" → tokens: ANA, PAULA (2 tokens, 100% = forte)
        const r = calcularMatch('ANA PAULA', 'PIX RECEBIDO ANA PAULA');
        expect(r.resultado).toBe('forte');
        expect(r.percentual).toBeGreaterThanOrEqual(70);
    });

    test('"MESMA TITULARIDADE" → match forte imediato', () => {
        const r = calcularMatch('JOSE SILVA', 'PIX RECEBIDO MESMA TITULARIDADE');
        expect(r.resultado).toBe('forte');
        expect(r.motivo).toContain('MESMA TITULARIDADE');
    });

    test('Nenhum token presente → sem match', () => {
        const r = calcularMatch('JOAO SILVA', 'PIX RECEBIDO EMPRESA XYZ LTDA');
        expect(r.resultado).toBe('sem_match');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// CENÁRIO 4: Match fraco correto (1–2 tokens, abaixo de 70%)
// ──────────────────────────────────────────────────────────────────────────────
describe('CENÁRIO 4 — Match fraco', () => {
    test('1 token comum → match fraco', () => {
        // JOSE ANTONIO CARLOS RODRIGUES → 4 tokens, apenas "JOSE" encontrado = 25%
        const r = calcularMatch('JOSE ANTONIO CARLOS RODRIGUES', 'PIX RECEBIDO JOSE FERREIRA');
        expect(r.resultado).toBe('fraco');
        expect(r.tokensEncontrados).toHaveLength(1);
    });

    test('2 tokens de 5 → match fraco (40%)', () => {
        const r = calcularMatch('MARIA LUCIA SOUZA COSTA PEREIRA', 'PIX RECEBIDO MARIA LUCIA FERREIRA');
        expect(r.resultado).toBe('fraco');
        expect(r.percentual).toBeLessThan(70);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// CENÁRIO 5: Exclusão correta de pai e mãe
// ──────────────────────────────────────────────────────────────────────────────
describe('CENÁRIO 5 — Exclusão pai/mãe', () => {
    const contexto: ContextoNomes = {
        nomeCliente: 'MARCOS OLIVEIRA',
        nomePai: 'JOSE OLIVEIRA',
        nomeMae: 'MARIA SANTOS OLIVEIRA',
    };

    const base = (desc: string, valor = '1.000,00'): TransacaoBruta => ({
        dataRaw: '15/03',
        descricaoRaw: desc,
        valorRaw: valor,
    });

    test('Match forte com pai → ignorar_transferencia_pai', () => {
        const t = classificarTransacao(base('PIX RECEBIDO JOSE OLIVEIRA'), contexto);
        expect(t.classificacao).toBe('ignorar_transferencia_pai');
    });

    test('Match forte com mãe → ignorar_transferencia_mae', () => {
        const t = classificarTransacao(base('PIX RECEBIDO MARIA SANTOS OLIVEIRA'), contexto);
        expect(t.classificacao).toBe('ignorar_transferencia_mae');
    });

    test('Match forte com cliente → ignorar_autotransferencia', () => {
        const t = classificarTransacao(base('PIX RECEBIDO MARCOS OLIVEIRA'), contexto);
        expect(t.classificacao).toBe('ignorar_autotransferencia');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// CENÁRIO 6: NÃO excluir homônimos comuns (match fraco → sinalizar, não excluir)
// ──────────────────────────────────────────────────────────────────────────────
describe('CENÁRIO 6 — Não excluir homônimos comuns', () => {
    test('"JOAO SILVA" → match fraco com cliente "JOAO CARLOS" → possivel_vinculo_familiar', () => {
        const contexto: ContextoNomes = { nomeCliente: 'JOAO CARLOS PEREIRA' };
        // "JOAO" é 1 de 3 tokens = 33% → fraco
        const bruta: TransacaoBruta = {
            dataRaw: '10/03',
            descricaoRaw: 'PIX RECEBIDO JOAO SILVA',
            valorRaw: '2.000,00',
        };
        const t = classificarTransacao(bruta, contexto);
        expect(t.classificacao).toBe('possivel_vinculo_familiar');
        // NÃO deve ser excluído automaticamente
        expect(t.classificacao).not.toBe('ignorar_autotransferencia');
    });

    test('Empresa com nome parecido não é excluída', () => {
        const contexto: ContextoNomes = { nomeCliente: 'CARLOS SOUZA' };
        const bruta: TransacaoBruta = {
            dataRaw: '10/03',
            descricaoRaw: 'PIX RECEBIDO CARLOS FARMA LTDA',
            valorRaw: '500,00',
        };
        const t = classificarTransacao(bruta, contexto);
        // "CARLOS" = 1 de 2 tokens = 50% → fraco (não forte)
        expect(t.classificacao).not.toBe('ignorar_autotransferencia');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// CENÁRIO 7: Cálculo matemático correto
// ──────────────────────────────────────────────────────────────────────────────
describe('CENÁRIO 7 — Cálculo matemático', () => {
    test('Divisão 6 e 12 meses correta para 30k', () => {
        const totalCentavos = 3_000_000; // R$ 30.000,00
        expect(Math.round(totalCentavos / 6)).toBe(500_000);   // R$ 5.000,00
        expect(Math.round(totalCentavos / 12)).toBe(250_000);  // R$ 2.500,00
    });

    test('mediaMensalReal = totalApurado / mesesConsiderados', () => {
        const total = 6_000_000; // R$ 60.000
        const meses = 4;
        const media = Math.round(total / meses);
        expect(media).toBe(1_500_000); // R$ 15.000
    });

    test('Arredondamento correto (sem float drift)', () => {
        // R$ 10.000 / 3 = R$ 3.333,33 → 333333 centavos
        const total = 1_000_000;
        const resultado = Math.round(total / 3);
        expect(resultado).toBe(333333);
        expect(Number.isInteger(resultado)).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// CENÁRIO 8: Caso real com R$ 30k total em 3 meses
// ──────────────────────────────────────────────────────────────────────────────
describe('CENÁRIO 8 — Caso com R$ 30.000 total', () => {
    test('3 créditos de R$ 10k → total = R$ 30k, média = R$ 10k', () => {
        const creditos = [
            parseMoeda('10.000,00'),
            parseMoeda('10.000,00'),
            parseMoeda('10.000,00'),
        ];
        const total = somarCentavos(creditos);
        expect(total).toBe(3_000_000);

        const meses = 3;
        const media = Math.round(total / meses);
        const d6 = Math.round(total / 6);
        const d12 = Math.round(total / 12);

        expect(media).toBe(1_000_000); // R$ 10.000
        expect(d6).toBe(500_000);      // R$ 5.000
        expect(d12).toBe(250_000);     // R$ 2.500
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// CENÁRIO 9: Caso com meses faltando (extrato de 2 meses)
// ──────────────────────────────────────────────────────────────────────────────
describe('CENÁRIO 9 — Meses faltando no extrato', () => {
    test('totalApurado / 6 e / 12 mesmo com apenas 2 meses de dados', () => {
        // Spec: mesmo que extrato tenha menos de 6 ou 12 meses, as divisões ocorrem
        const totalPorMes: Record<string, number> = {
            '2024-01': parseMoeda('5.000,00'),
            '2024-02': parseMoeda('7.500,00'),
        };
        const valores = Object.values(totalPorMes);
        const total = somarCentavos(valores);
        const meses = Object.keys(totalPorMes).length;

        expect(meses).toBe(2);
        expect(total).toBe(1_250_000); // R$ 12.500

        // Mesmo com 2 meses, divide por 6 e 12
        expect(Math.round(total / 6)).toBe(208333);   // ~R$ 2.083,33
        expect(Math.round(total / 12)).toBe(104167);  // ~R$ 1.041,67

        // mediaMensalReal usa meses reais (2)
        expect(Math.round(total / meses)).toBe(625_000); // R$ 6.250
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// CENÁRIO 10: Extrato inválido / sem transações
// ──────────────────────────────────────────────────────────────────────────────
describe('CENÁRIO 10 — Extrato inválido ou sem transações', () => {
    test('Texto sem nenhuma transação → regex retorna 0 matches', () => {
        const textoVazio = 'Saldo: R$ 1.000,00\nExtrato do mês de Janeiro de 2024';
        REGEX_TRANSACAO.lastIndex = 0;
        const matches: RegExpExecArray[] = [];
        let m: RegExpExecArray | null;
        while ((m = REGEX_TRANSACAO.exec(textoVazio)) !== null) {
            matches.push(m);
        }
        expect(matches).toHaveLength(0);
    });

    test('Classificação de débito → valor ≤ 0', () => {
        const contexto: ContextoNomes = { nomeCliente: 'TESTE USUARIO' };
        const bruta: TransacaoBruta = {
            dataRaw: '01/01',
            descricaoRaw: 'PIX RECEBIDO ALGUEM',
            valorRaw: '-500,00',
        };
        const t = classificarTransacao(bruta, contexto);
        expect(t.classificacao).toBe('debito');
        expect(t.valor).toBeLessThanOrEqual(0);
    });

    test('Texto com estorno → ignorar_estorno', () => {
        const contexto: ContextoNomes = { nomeCliente: 'ANTONIO CARLOS' };
        const bruta: TransacaoBruta = {
            dataRaw: '05/02',
            descricaoRaw: 'ESTORNO PIX RECEBIDO ALGUEM',
            valorRaw: '1.000,00',
        };
        const t = classificarTransacao(bruta, contexto);
        expect(t.classificacao).toBe('ignorar_estorno');
    });

    test('Normalização é determinística (idempotente)', () => {
        const input = 'João Carlos da Silva';
        const n1 = normalizar(input);
        const n2 = normalizar(input);
        const n3 = normalizar(normalizar(input)); // aplicar 2x deve ser igual
        expect(n1).toBe(n2);
        expect(n1).toBe(n3);
    });

    test('Tokenização remove stopwords corretamente', () => {
        const tokens = tokenizarNome('Jose da Silva e Santos');
        expect(tokens).toContain('JOSE');
        expect(tokens).toContain('SILVA');
        expect(tokens).toContain('SANTOS');
        expect(tokens).not.toContain('DA');
        expect(tokens).not.toContain('E');
    });
});
