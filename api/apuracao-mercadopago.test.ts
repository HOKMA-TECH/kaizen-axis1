import assert from 'node:assert/strict';
import { __test__ } from './apuracao.ts';

async function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const mercadoPagoTableText = `
Mercado Pago
Detalhe dos movimentos
Data Descricao ID da operacao Valor Saldo
01/09/2025 Transferencia Pix recebida
NATALIA RAPOSO DA SILVA 123873325893 R$ 1.616,00 R$ 1.617,37
05/09/2025 Transferencia Pix enviada
RENATO LOUCANA FERREIRA 125076946510 R$ -100,00 R$ 1.517,37
07/09/2025 Pagamento com QR Pix
PAGAMENTO SEGUR 118940379101 R$ -30,00 R$ 1.487,37
11/09/2025 Rendimentos 1731594798479 R$ 0,01 R$ 1.487,38
`;

await runTest('extrai contraparte do Pix MercadoPago sem colar ID/valor na descricao', () => {
  const transacoes = __test__.extrairMercadoPago(mercadoPagoTableText);

  assert.equal(transacoes.length, 4);
  assert.deepEqual(transacoes[0], {
    dataRaw: '01/09/2025',
    descricaoRaw: 'Transferencia Pix recebida NATALIA RAPOSO DA SILVA',
    valorRaw: '1.616,00',
  });
  assert.deepEqual(transacoes[1], {
    dataRaw: '05/09/2025',
    descricaoRaw: 'Transferencia Pix enviada RENATO LOUCANA FERREIRA',
    valorRaw: '-100,00',
  });
});
