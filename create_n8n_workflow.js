#!/usr/bin/env node
/**
 * Cria o workflow WhatsApp Pre-Atendimento no n8n via API.
 * Empresa: DIEGO | Gemini 1.5 Flash | Static Data para estado de conversa
 */

const https = require('https');
const http  = require('http');
const { randomUUID } = require('crypto');

// ── CONFIGURAÇÕES ─────────────────────────────────────────────────────────────
const N8N_URL    = 'https://kaizen-axis-n8n-n8n.2ut0z1.easypanel.host';
const N8N_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1MTI1M2FkYy1jMWQ5LTRiMDYtOGUzMi01NTE5MGZhYzg4NGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMTA3MzU1fQ.7MYQnRjBHF2ss77o7-IVoQNJI-H2hgBlmE44vaxkyc4';
const GEMINI_KEY = 'AIzaSyATK5Hb07gtfPTzZo6lwPz-RIz84oLSE0E';
const COMPANY    = 'DIEGO';

// Placeholders — preencha após ter credenciais da Evolution API
const EVO_URL      = 'https://SEU_EVOLUTION_URL';
const EVO_KEY      = 'SUA_EVO_API_KEY';
const EVO_INSTANCE = 'NOME_DA_INSTANCIA';

// ── HTTP HELPER ───────────────────────────────────────────────────────────────
function request(method, url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : '';

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_KEY,
        'Content-Length': Buffer.byteLength(payload),
        ...extraHeaders
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── JAVASCRIPT DOS NÓS ────────────────────────────────────────────────────────

const JS_FILTER = `
const body = $input.first().json;
const event = body.event || body.type || '';
if (event !== 'messages.upsert') return [];

const data = body.data || {};
const msgs = data.messages || (data.key ? [data] : []);
if (!msgs.length) return [];

const msg = msgs[0];
if (!msg || !msg.key || !msg.message) return [];

const key = msg.key;
const remoteJid = key.remoteJid || '';
const fromMe    = key.fromMe === true;

if (remoteJid.includes('@g.us')) return [];

const pushName = msg.pushName || 'Cliente';
const instance = body.instance || data.instanceName || '';
const msgObj   = msg.message;

let type = 'unknown', content = '', hasMedia = false;

if (msgObj.conversation !== undefined) {
  type = 'conversation'; content = msgObj.conversation || '';
} else if (msgObj.extendedTextMessage) {
  type = 'conversation'; content = msgObj.extendedTextMessage.text || '';
} else if (msgObj.audioMessage) {
  type = 'audioMessage'; content = '[Áudio recebido]'; hasMedia = true;
} else if (msgObj.imageMessage) {
  type = 'imageMessage'; content = msgObj.imageMessage.caption || '[Imagem recebida]'; hasMedia = true;
} else if (msgObj.documentMessage) {
  type = 'documentMessage'; content = msgObj.documentMessage.caption || '[Documento recebido]'; hasMedia = true;
} else if (msgObj.buttonsResponseMessage) {
  type = 'conversation'; content = msgObj.buttonsResponseMessage.selectedDisplayText || '';
} else if (msgObj.listResponseMessage) {
  type = 'conversation'; content = msgObj.listResponseMessage.title || '';
} else return [];

if (!content && !hasMedia) return [];
return [{ json: { remoteJid, fromMe, pushName, type, content, hasMedia, instance, msgId: key.id } }];
`;

const JS_LOAD_STATE = `
const sd = $getWorkflowStaticData('global');
const d  = $input.first().json;
const { remoteJid, fromMe, pushName } = d;

if (!sd.convs) sd.convs = {};
const c = sd.convs[remoteJid] || { state: 'new', history: [], name: pushName, startedAt: new Date().toISOString() };

let action = 'process_ai';
if      (c.state === 'human_takeover')      action = 'skip';
else if (c.state === 'pre_attendance_done') action = 'skip';
else if (fromMe && (c.state === 'active_ai' || c.state === 'new')) action = 'human_takeover';
else if (fromMe) action = 'skip';

return [{ json: { ...d, action, convState: c.state, history: c.history || [], custName: c.name || pushName } }];
`;

const JS_HUMAN_TAKEOVER = `
const sd = $getWorkflowStaticData('global');
const { remoteJid } = $input.first().json;
if (!sd.convs) sd.convs = {};
if (!sd.convs[remoteJid]) sd.convs[remoteJid] = { state: 'new', history: [] };
sd.convs[remoteJid].state   = 'human_takeover';
sd.convs[remoteJid].humanAt = new Date().toISOString();
console.log('[TAKEOVER] Humano assumiu: ' + remoteJid);
return [{ json: { ok: true, remoteJid } }];
`;

const JS_BUILD_AI = `
const d = $input.first().json;
const { remoteJid, pushName, type, content, hasMedia, history, instance, custName } = d;
const COMPANY = "${COMPANY}";

const systemPrompt = [
  'Você é um assistente de pré-atendimento da ' + COMPANY + '. Seu objetivo é coletar as informações necessárias antes de passar o cliente para um atendente humano.',
  '',
  'Responsabilidades:',
  '1. Cumprimentar o cliente cordialmente',
  '2. Identificar o nome do cliente (se ainda não souber)',
  '3. Entender o motivo do contato',
  '4. Coletar informações específicas (detalhes do problema, produto/serviço, etc.)',
  '5. Confirmar os dados coletados com o cliente',
  '6. Informar que em breve um atendente irá assumir',
  '',
  'Capacidades:',
  '- Compreende imagens e áudios enviados pelo cliente',
  '- Responda sempre em português brasileiro',
  '- Seja cordial, objetivo e profissional',
  '- Seja conciso — sem respostas longas desnecessárias',
  '',
  'REGRA CRÍTICA: Quando tiver coletado TODAS as informações necessárias e o cliente confirmar,',
  'sua resposta DEVE terminar EXATAMENTE com: [PRE_ATENDIMENTO_CONCLUIDO]',
  '',
  'Exemplo: "Perfeito, João! Registrei tudo. Em breve um atendente assumirá. Obrigado! [PRE_ATENDIMENTO_CONCLUIDO]"',
  '',
  'NÃO use essa flag antes de ter todas as informações.'
].join('\\n');

const recentHist = (history || []).slice(-30);
const contents = recentHist.map(m => ({ role: m.role, parts: m.parts }));

let userParts = [];
if      (type === 'conversation')   userParts.push({ text: content });
else if (type === 'audioMessage')   userParts.push({ text: '[Cliente enviou áudio]: ' + content });
else if (type === 'imageMessage')   userParts.push({ text: '[Cliente enviou imagem]: ' + content });
else if (type === 'documentMessage')userParts.push({ text: '[Cliente enviou documento]: ' + content });
else                                userParts.push({ text: content || '[Mensagem recebida]' });

contents.push({ role: 'user', parts: userParts });

const geminiReq = {
  system_instruction: { parts: [{ text: systemPrompt }] },
  contents,
  generationConfig: { temperature: 0.7, maxOutputTokens: 1024, topP: 0.9 },
  safetySettings: [
    { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
  ]
};

return [{ json: { geminiReq, remoteJid, pushName, instance, history, type, content, custName } }];
`;

const JS_PARSE_RESP = `
const d  = $input.first().json;
const { remoteJid, pushName, instance, history, content } = d;
const sd = $getWorkflowStaticData('global');

let geminiBody;
try { geminiBody = $('Chamar Gemini').first().json; } catch(e) { geminiBody = null; }

let aiResp = geminiBody && geminiBody.candidates && geminiBody.candidates[0] &&
             geminiBody.candidates[0].content && geminiBody.candidates[0].content.parts &&
             geminiBody.candidates[0].content.parts[0] && geminiBody.candidates[0].content.parts[0].text || '';

if (!aiResp) aiResp = 'Olá! Tive uma dificuldade técnica momentânea. Pode repetir sua mensagem, por favor?';

const FLAG = '[PRE_ATENDIMENTO_CONCLUIDO]';
const concluded = aiResp.indexOf(FLAG) !== -1;
const clean = aiResp.replace(FLAG, '').trim();

const newHist = (history || []).slice();
newHist.push({ role: 'user',  parts: [{ text: content || '[mídia]' }] });
newHist.push({ role: 'model', parts: [{ text: clean }] });
const trimmed = newHist.slice(-30);

if (!sd.convs) sd.convs = {};
if (!sd.convs[remoteJid]) sd.convs[remoteJid] = { state: 'new', history: [], startedAt: new Date().toISOString() };

sd.convs[remoteJid].state   = concluded ? 'pre_attendance_done' : 'active_ai';
sd.convs[remoteJid].history = trimmed;
sd.convs[remoteJid].name    = pushName;
if (concluded) sd.convs[remoteJid].concludedAt = new Date().toISOString();

console.log('[IA] ' + remoteJid + ' | concluido=' + concluded + ' | resp=' + clean.slice(0,60));
return [{ json: { remoteJid, instance, aiResp: clean, concluded, pushName } }];
`;

// ── BUILDER DO WORKFLOW ───────────────────────────────────────────────────────

function buildWorkflow() {
  const webhookId = randomUUID();

  const nodes = [
    {
      id: 'wh-001', name: 'Webhook WhatsApp',
      type: 'n8n-nodes-base.webhook', typeVersion: 2,
      position: [200, 300],
      parameters: { httpMethod: 'POST', path: 'whatsapp-webhook', responseMode: 'onReceived', options: {} },
      webhookId
    },
    {
      id: 'code-002', name: 'Filtrar e Extrair',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [450, 300],
      parameters: { jsCode: JS_FILTER }
    },
    {
      id: 'code-003', name: 'Carregar Estado',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [700, 300],
      parameters: { jsCode: JS_LOAD_STATE }
    },
    {
      id: 'sw-004', name: 'Rotear Acao',
      type: 'n8n-nodes-base.switch', typeVersion: 3,
      position: [950, 300],
      parameters: {
        mode: 'rules',
        rules: {
          values: [
            {
              conditions: { combinator: 'and', conditions: [{ leftValue: '={{ $json.action }}', rightValue: 'skip', operator: { type: 'string', operation: 'equals' } }], options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' } },
              renameOutput: true, outputKey: 'skip'
            },
            {
              conditions: { combinator: 'and', conditions: [{ leftValue: '={{ $json.action }}', rightValue: 'human_takeover', operator: { type: 'string', operation: 'equals' } }], options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' } },
              renameOutput: true, outputKey: 'human_takeover'
            },
            {
              conditions: { combinator: 'and', conditions: [{ leftValue: '={{ $json.action }}', rightValue: 'process_ai', operator: { type: 'string', operation: 'equals' } }], options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' } },
              renameOutput: true, outputKey: 'process_ai'
            }
          ]
        },
        options: {}
      }
    },
    { id: 'noop-005', name: 'Ignorar Mensagem', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [1200, 150], parameters: {} },
    { id: 'code-006', name: 'Registrar Takeover', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1200, 300], parameters: { jsCode: JS_HUMAN_TAKEOVER } },
    { id: 'code-007', name: 'Preparar Request IA', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1200, 450], parameters: { jsCode: JS_BUILD_AI } },
    {
      id: 'http-008', name: 'Chamar Gemini',
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
      position: [1450, 450],
      parameters: {
        method: 'POST',
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
        authentication: 'none',
        sendBody: true,
        contentType: 'json',
        body: '={{ JSON.stringify($json.geminiReq) }}',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
        options: { timeout: 30000 }
      }
    },
    { id: 'code-009', name: 'Processar Resposta IA', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1700, 450], parameters: { jsCode: JS_PARSE_RESP } },
    {
      id: 'http-010', name: 'Enviar Mensagem',
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
      position: [1950, 450],
      parameters: {
        method: 'POST',
        url: `=${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
        authentication: 'none',
        sendBody: true,
        contentType: 'json',
        body: '={{ JSON.stringify({ "number": $json.remoteJid, "text": $json.aiResp, "delay": 1200 }) }}',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'apikey', value: EVO_KEY }, { name: 'Content-Type', value: 'application/json' }] },
        options: { timeout: 15000 }
      }
    },
    {
      id: 'if-011', name: 'Verificar Conclusao',
      type: 'n8n-nodes-base.if', typeVersion: 2,
      position: [2200, 450],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          conditions: [{ leftValue: "={{ $('Processar Resposta IA').first().json.concluded }}", rightValue: true, operator: { type: 'boolean', operation: 'true' } }],
          combinator: 'and'
        }
      }
    },
    {
      id: 'http-012', name: 'Aplicar Etiqueta',
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
      position: [2450, 350],
      parameters: {
        method: 'POST',
        url: `=${EVO_URL}/label/handleLabel/${EVO_INSTANCE}`,
        authentication: 'none',
        sendBody: true,
        contentType: 'json',
        body: '={{ JSON.stringify({ "number": $json.remoteJid, "labelId": "pre_atendimento_concluido", "action": "add" }) }}',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'apikey', value: EVO_KEY }, { name: 'Content-Type', value: 'application/json' }] },
        options: { timeout: 10000 }
      }
    },
    { id: 'noop-013', name: 'Continuar Ativo', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [2450, 550], parameters: {} }
  ];

  const connections = {
    'Webhook WhatsApp':      { main: [[{ node: 'Filtrar e Extrair',    type: 'main', index: 0 }]] },
    'Filtrar e Extrair':     { main: [[{ node: 'Carregar Estado',      type: 'main', index: 0 }]] },
    'Carregar Estado':       { main: [[{ node: 'Rotear Acao',          type: 'main', index: 0 }]] },
    'Rotear Acao':           { main: [
      [{ node: 'Ignorar Mensagem',    type: 'main', index: 0 }],
      [{ node: 'Registrar Takeover',  type: 'main', index: 0 }],
      [{ node: 'Preparar Request IA', type: 'main', index: 0 }]
    ]},
    'Preparar Request IA':    { main: [[{ node: 'Chamar Gemini',        type: 'main', index: 0 }]] },
    'Chamar Gemini':          { main: [[{ node: 'Processar Resposta IA',type: 'main', index: 0 }]] },
    'Processar Resposta IA':  { main: [[{ node: 'Enviar Mensagem',      type: 'main', index: 0 }]] },
    'Enviar Mensagem':        { main: [[{ node: 'Verificar Conclusao',  type: 'main', index: 0 }]] },
    'Verificar Conclusao':    { main: [
      [{ node: 'Aplicar Etiqueta', type: 'main', index: 0 }],
      [{ node: 'Continuar Ativo',  type: 'main', index: 0 }]
    ]}
  };

  return {
    name: 'WhatsApp Pre-Atendimento - DIEGO',
    nodes, connections,
    settings: { executionOrder: 'v1', saveManualExecutions: true },
    staticData: null
  };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  const SEP = '='.repeat(65);
  console.log(SEP);
  console.log('  WhatsApp Pre-Atendimento | Criador de Workflow n8n');
  console.log(SEP);

  // 1. Testar conexão
  process.stdout.write('\n[1/3] Testando conexao com n8n... ');
  try {
    const r = await request('GET', `${N8N_URL}/api/v1/workflows`, null);
    if (r.status === 200) { console.log(`OK (${r.status})`); }
    else { console.log(`ERRO ${r.status}`); console.log(JSON.stringify(r.body).slice(0,300)); process.exit(1); }
  } catch (e) { console.log(`FALHA: ${e.message}`); process.exit(1); }

  // 2. Criar workflow
  process.stdout.write('\n[2/3] Criando workflow... ');
  const wf = buildWorkflow();
  let wfId;
  try {
    const r = await request('POST', `${N8N_URL}/api/v1/workflows`, wf);
    if (r.status === 200 || r.status === 201) {
      wfId = r.body.id;
      console.log(`OK — ID: ${wfId}`);
    } else {
      console.log(`ERRO ${r.status}`);
      console.log(JSON.stringify(r.body).slice(0, 500));
      process.exit(1);
    }
  } catch (e) { console.log(`FALHA: ${e.message}`); process.exit(1); }

  // 3. Ativar
  process.stdout.write('\n[3/3] Ativando workflow... ');
  try {
    const r = await request('PATCH', `${N8N_URL}/api/v1/workflows/${wfId}/activate`, {});
    if (r.status === 200) { console.log('OK — Ativo!'); }
    else { console.log(`Aviso ${r.status}: ${JSON.stringify(r.body).slice(0,200)}`); }
  } catch (e) { console.log(`Aviso: ${e.message}`); }

  const webhookUrl = `${N8N_URL}/webhook/whatsapp-webhook`;

  console.log('\n' + SEP);
  console.log('  CONCLUIDO COM SUCESSO!');
  console.log(SEP);
  console.log(`\n  Workflow ID : ${wfId}`);
  console.log(`  Editar em  : ${N8N_URL}/workflow/${wfId}`);
  console.log(`\n  ► URL WEBHOOK (configurar na Evolution API):`);
  console.log(`    ${webhookUrl}`);
  console.log(`\n  PROXIMOS PASSOS:`);
  console.log(`  1. No workflow, atualize os nos HTTP "Enviar Mensagem" e "Aplicar Etiqueta":`);
  console.log(`       URL: substitua "SEU_EVOLUTION_URL" pela URL real da Evolution API`);
  console.log(`       Header apikey: substitua "SUA_EVO_API_KEY" pela sua chave`);
  console.log(`       Path: substitua "NOME_DA_INSTANCIA" pelo nome da instancia`);
  console.log(`  2. Configure o webhook na Evolution API apontando para:`);
  console.log(`     ${webhookUrl}`);
  console.log(`  3. Crie a etiqueta "pre_atendimento_concluido" no WhatsApp Business`);
  console.log(SEP + '\n');
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
