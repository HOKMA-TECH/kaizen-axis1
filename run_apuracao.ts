import handler from './api/apuracao';

const req = {
    method: 'POST',
    body: {
        nomeCliente: 'marvyn bandeira landes',
        cpf: '***.830.487-**',
        textoExtrato: `Extrato em BRL | Gerado em 11 de mar. de 2026 | Revolut Sociedade de Crédito Direto S.A. | Marvyn Bandeira Landes | 101 Rua Humberto dos Santos | Fundos | 21635-250 | Rio de Janeiro | RJ | Resumo do saldo | Produto Saldo inicial Valores descontados Valores recebidos Saldo final | Conta (E-Money) R$0.00 R$81,156.12 R$81,203.62 R$47.50 | Para onde suas transações são remetidas | Depósito R$0.00 R$25,307.52 R$25,308.27 R$0.75 | Total R$0.00 R$106,463.64 R$106,511.89 R$48.25 | O saldo em seu extrato pode ser diferente do saldo mostrado no seu app. O saldo do extrato reflete apenas as transações concluídas, enquanto o app mostra o saldo disponível para uso, que contabiliza as transações pendentes. | Pendente de 1 de agosto de 2025 a 11 de março de 2026 | Data de início Descrição Valores descontados Valores recebidos | 11 de mar. de 2026 Camilafigueira R$6.00 | Para: Camilafigueira, Rio De Janeir Cartão: 490106******4020 | 11 de mar. de 2026 Superlar R$7.99 | Para: Superlar, Rio De Janeir | Cartão: 490106******4020 | Transações da conta de 1 de agosto de 2025 a 11 de março de 2026 | Data Descrição Valores descontados Valores recebidos Saldo | 6 de ago. de 2025 Pagamento recebido de MARVYN BANDEIRA LANDES R$900.00 R$900.00 | De: MARVYN BANDEIRA LANDES, CPF, ***.830.487-** Instituição: ITAÚ UNIBANCO S.A. | Tipo: Pix | 6 de ago. de 2025 Para BRL Contas remuneradas R$600.00 R$300.00 | 6 de ago. de 2025 Compra de Revpoints com o recurso Troco R$0.40 R$299.60 | Referência: Revpoints Spare Change | 6 de ago. de 2025 PIX QR Code payment to DAFITI GROUP R$99.90 R$199.70 | Para: DAFITI GROUP, 00763917 Tipo: Pix`
    }
};

const res = {
    setHeader: () => {},
    status: (code) => ({
        json: (data) => console.log(JSON.stringify({code, data}, null, 2)),
        end: () => console.log(code)
    })
};

(async () => {
    await handler(req as any, res as any);
})();
