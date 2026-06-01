import assert from 'node:assert/strict';
import { __test__ } from './apuracao.ts';

const { isC6Bank, extrair, classificar } = __test__;

async function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const ctx = { nomeCliente: 'FABIANO MATEUS FERREIRA DE ANDRADE', cpf: '206.881.557-58' };

// Recorte fiel do extrato C6 Bank: cabeçalho com a marca, cabeçalho de mês,
// colunas (Data lançamento / Data contábil) e linhas de lançamento reais
// (duas datas DD/MM por linha, valores com sinal explícito).
const c6Texto = `Extrato exportado no dia 17 de abril de 2026 às 15:10
FABIANO MATEUS FERREIRA DE ANDRADE • 206.881.557-58
Agência: 1 • Conta: 347513484
C6 BANK
Extrato
Período • 17 de abril de 2025 até 17 de abril de 2026
Abril 2025 ( 17/04/2025 - 30/04/2025 ) Entradas: R$ 16.345,44 • Saídas: R$ 16.344,94
Data lançamento Data contábil Tipo Descrição Valor
23/04 23/04 Entrada PIX Pix recebido de DELTA PAY R$ 20,00
23/04 23/04 Saída PIX Pix enviado para Rayane Fernandes da Silva -R$ 20,00
18/04 22/04 Débito de Cartão USA DELICATESSEN RIO DE JANEIR BRA -R$ 13,50
28/04 28/04 Entrada PIX Pix recebido de Fabiano Mateus Ferreira De Andrade R$ 469,89
21/05 21/05 Entradas CDB C6 LIM. GARANT. R$ 60,01
25/09 25/09 Entradas RECEBIMENTO DE TED R$ 16,49
10/07 10/07 Saída PIX Pix recusado -R$ 10,00
10/07 10/07 Entradas Pix estornado R$ 10,00
13/05 13/05 Devolução PIX Devol recebida pix de Letícia Teixeira dos Santos Martins da Silva R$ 0,01
24/05 26/05 Devolução PIX DEVOL ENVIADA PIX -R$ 800,00
Saldo do dia 23/04/25 R$ 0,00`;

await runTest('isC6Bank detecta extrato C6 pela marca + estrutura', () => {
  assert.equal(isC6Bank(c6Texto), true);
});

await runTest('isC6Bank NÃO dispara em extrato sem a marca C6 (ex.: Inter com "Saldo do dia")', () => {
  const interLike = `Banco Inter\nExtrato de conta corrente\nSaldo do dia\n01/03 PIX RECEBIDO : "Fulano" R$ 100,00 R$ 100,00`;
  assert.equal(isC6Bank(interLike), false);
});

await runTest('extrair lida com duas colunas de data e descarta a 2ª (Data contábil)', () => {
  const brutas = extrair(c6Texto);
  const entrada = brutas.find(b => b.descricaoRaw.includes('DELTA PAY'));
  assert.ok(entrada, 'deveria extrair a entrada da DELTA PAY');
  assert.equal(entrada!.dataRaw, '23/04/2025');
  assert.equal(entrada!.valorRaw, '20,00');

  const saida = brutas.find(b => b.descricaoRaw.includes('Rayane'));
  assert.ok(saida, 'deveria extrair a saída para Rayane');
  assert.equal(saida!.valorRaw, '-20,00');
});

function classificarLinha(desc: string, valor: string, data = '23/04/2025') {
  return classificar(data, desc, valor, ctx, 'c6');
}

await runTest('C6: PIX recebido de terceiro sem vínculo → crédito válido', () => {
  const t = classificarLinha('Entrada PIX Pix recebido de DELTA PAY', '20,00');
  assert.equal(t.classificacao, 'credito_valido');
  assert.equal(t.is_validated, true);
});

await runTest('C6: PIX enviado (valor negativo) → débito (exibido, não soma)', () => {
  const t = classificarLinha('Saída PIX Pix enviado para Rayane Fernandes da Silva', '-20,00');
  assert.equal(t.classificacao, 'debito');
});

await runTest('C6: Débito de Cartão → débito', () => {
  const t = classificarLinha('Débito de Cartão USA DELICATESSEN RIO DE JANEIR BRA', '-13,50');
  assert.equal(t.classificacao, 'debito');
});

await runTest('C6: RECEBIMENTO DE TED → crédito válido', () => {
  const t = classificarLinha('Entradas RECEBIMENTO DE TED', '16,49');
  assert.equal(t.classificacao, 'credito_valido');
});

await runTest('C6: CDB (rendimento/investimento) → ignorado', () => {
  const t = classificarLinha('Entradas CDB C6 LIM. GARANT.', '60,01');
  assert.equal(t.classificacao, 'ignorar_estorno');
});

await runTest('C6: "Pix estornado" (reversão de pix recusado) → ignorado, NÃO conta como renda', () => {
  const t = classificarLinha('Entradas Pix estornado', '10,00');
  assert.notEqual(t.classificacao, 'credito_valido');
  assert.equal(t.is_validated, false);
});

await runTest('C6: Devolução recebida (estorno) → ignorado', () => {
  const t = classificarLinha('Devolução PIX Devol recebida pix de Letícia Teixeira dos Santos Martins da Silva', '0,01');
  assert.notEqual(t.classificacao, 'credito_valido');
});

await runTest('C6: autotransferência (PIX recebido do próprio titular) → ignorada', () => {
  const t = classificarLinha('Entrada PIX Pix recebido de Fabiano Mateus Ferreira De Andrade', '469,89');
  assert.equal(t.classificacao, 'ignorar_autotransferencia');
});

await runTest('C6: cabeçalho de seção mensal (total Entradas/Saídas) NUNCA conta como renda', () => {
  // Após o pré-processamento de datas, "Abril 2025 ( ... ) Entradas: ... Saídas: ..."
  // vira uma pseudo-linha "01/ABR/2025 ( ... ) Entradas: ... Saídas: ...".
  const t = classificarLinha('( 17/04/2025 - 30/04/2025 ) Entradas: Saídas:', '16.345,44');
  assert.notEqual(t.classificacao, 'credito_valido');
  assert.notEqual(t.classificacao, 'possivel_vinculo_familiar');
  assert.equal(t.is_validated, false);
});
