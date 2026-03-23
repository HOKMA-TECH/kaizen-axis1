fetch('http://localhost:3000/api/apuracao', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    nomeCliente: 'Maicon',
    textoExtrato: 'PIX RECEBIDO DE JOAO 22/07/2025 R$ 100,00'
  })
}).then(res => res.json()).then(console.log).catch(console.error);
