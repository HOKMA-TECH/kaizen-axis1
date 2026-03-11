const https = require('https');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1MTI1M2FkYy1jMWQ5LTRiMDYtOGUzMi01NTE5MGZhYzg4NGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMTA3MzU1fQ.7MYQnRjBHF2ss77o7-IVoQNJI-H2hgBlmE44vaxkyc4';
const WF_ID        = 'DRi4d9wHIoi6Jhfr';
const OWNER_NUMBER = '5521990554867';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const r = https.request({
      hostname: 'kaizen-axis-n8n-n8n.2ut0z1.easypanel.host',
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
  const wf = await req('GET', `/api/v1/workflows/${WF_ID}`);

  const node = wf.nodes.find(n => n.name === 'Aplicar Etiqueta');
  if (!node) { console.log('Node não encontrado'); return; }

  node.parameters.jsonBody = `={{ JSON.stringify({
  "number": "${OWNER_NUMBER}",
  "text": "✅ *Pré-atendimento concluído!*\\n\\n👤 *Cliente:* " + ($('Processar Resposta IA').first().json.pushName || 'Desconhecido') + "\\n📱 *Número:* " + $('Processar Resposta IA').first().json.remoteJid.replace('@s.whatsapp.net', '') + "\\n\\nO pré-atendimento foi concluído pela IA. Aguardando atendente humano."
}) }}`;

  const res = await req('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || { executionOrder: 'v1' },
    staticData: wf.staticData
  });

  if (res.id) {
    console.log('✅ Número atualizado para', OWNER_NUMBER);
  } else {
    console.log('Erro:', JSON.stringify(res).slice(0, 300));
  }
}

main().catch(e => console.error('Erro:', e.message));
