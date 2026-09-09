const https = require('https');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error('Missing required environment variable: ' + name);
  }
  return String(value).trim();
}

const N8N_KEY = requiredEnv('N8N_KEY');
const WF_ID  = process.env.N8N_WORKFLOW_ID || 'DRi4d9wHIoi6Jhfr';
const N8N_HOST = process.env.N8N_HOST || "kaizen-axis-n8n-n8n.2ut0z1.easypanel.host";

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const r = https.request({
      hostname: N8N_HOST,
      path, method,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_KEY,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    r.on('error', reject);
    r.setTimeout(30000, () => { r.destroy(); reject(new Error('timeout')); });
    if (payload) r.write(payload);
    r.end();
  });
}

async function main() {
  // Busca o workflow
  const wf = await req('GET', `/api/v1/workflows/${WF_ID}`);
  console.log('Workflow:', wf.name);

  // Limpa o staticData (reseta todos os estados)
  const res = await req('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || { executionOrder: 'v1' },
    staticData: null  // <- reset estado de todos os contatos
  });

  if (res.id) {
    console.log('✅ Estado resetado! Todos os contatos voltarão ao início.');
    console.log('Agora pode enviar mensagem de teste novamente.');
  } else {
    console.log('Resposta:', JSON.stringify(res).slice(0, 300));
  }
}

main().catch(e => console.error('Erro:', e.message));
