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

function req(path) {
  return new Promise((resolve, reject) => {
    const r = https.request({
      hostname: N8N_HOST,
      path, method: 'GET',
      headers: { 'X-N8N-API-KEY': N8N_KEY }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    r.on('error', reject);
    r.end();
  });
}

async function main() {
  // 1. Verificar código atual do nó
  console.log('=== VERIFICANDO CODIGO ATUAL DO NO ===');
  const wf = await req(`/api/v1/workflows/${WF_ID}`);
  const node = wf.nodes.find(n => n.id === 'code-002');
  const code = node.parameters.jsCode;
  console.log('Primeiras 5 linhas do código atual:');
  console.log(code.split('\n').slice(0, 6).join('\n'));
  console.log('');
  console.log('Tem "rawEvent"?', code.includes('rawEvent') ? 'SIM (código novo)' : 'NAO (código antigo!)');
  console.log('');

  // 2. Buscar execução com dados completos
  console.log('=== BUSCANDO DADOS DA EXECUCAO ===');
  const execs = await req(`/api/v1/executions?workflowId=${WF_ID}&limit=1`);
  if (!execs.data || !execs.data.length) {
    console.log('Nenhuma execucao. Mande uma mensagem no WhatsApp.');
    return;
  }

  const execId = execs.data[0].id;
  console.log('Exec ID:', execId);

  // Tentar endpoint com dados incluídos
  const detail = await req(`/api/v1/executions/${execId}?includeData=true`);
  const rd = detail.data && detail.data.resultData && detail.data.resultData.runData;

  if (!rd) {
    console.log('runData nao disponivel nesta execucao.');
    console.log('');
    console.log('SOLUCAO: No n8n, va em Settings > Save execution data > ative "Save successful executions"');
    console.log('Depois mande outra mensagem e rode este script novamente.');
    return;
  }

  // Mostrar JSON completo do webhook
  console.log('Nos com dados:', Object.keys(rd).join(', '));
  const whn = rd['Webhook WhatsApp'];
  if (whn && whn[0]) {
    const items = whn[0].data && whn[0].data.main && whn[0].data.main[0];
    if (items && items[0]) {
      console.log('');
      console.log('=== PAYLOAD DO WEBHOOK (primeiros 1500 chars) ===');
      console.log(JSON.stringify(items[0].json).slice(0, 1500));
    }
  }
}

main().catch(e => console.error('Erro:', e.message));
