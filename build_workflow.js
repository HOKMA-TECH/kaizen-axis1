// Build and POST the new n8n workflow
const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxODc4NjEzYi05Yzc5LTRiYjItOWNlOS05MzI2YWUxMWE1MjciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMmU0Y2IxZWEtNDdhMy00NGE2LThiNmEtYmMyMDBjN2QxZDFmIiwiaWF0IjoxNzcyNjUxMzkzfQ.pps84yS8blua_ZZx1yZ0lhPRwzALz5fq6845ch8qoAo';
const HOST = 'n8n.srv1452699.hstgr.cloud';

const systemPromptText = `Você é Sofia, assistente virtual da imobiliária Kaizen Axis. Seja simpática, use português do Brasil e emojis com moderação.

Seu objetivo é qualificar leads de forma natural e conversacional. Colete estas informações (uma por vez, não faça perguntas duplas):
1. Nome completo
2. Bairro ou região de interesse (ex: Campo Grande, Zona Sul, Centro)
3. Tipo de imóvel (apartamento, casa, comercial)
4. Número de dormitórios
5. Renda familiar aproximada (pode ser uma faixa)
6. Profissão ou ocupação
7. Urgência (está pronto para visitar? tem prazo para comprar?)

Regras:
- Responda de forma curta e natural
- Se o cliente enviar áudio ou foto, processe o conteúdo e continue a conversa
- Não mencione que está coletando dados
- Quando tiver TODAS as informações, diga que vai conectar com um especialista

Quando tiver todas as informações, ao FINAL da sua resposta inclua exatamente este bloco (sem texto depois do JSON):

[LEAD_COMPLETE]
{"name":"nome completo","region":"bairro/região","propertyType":"Apartamento/Casa X quartos","income":"R$ X.XXX","profession":"profissão","urgency":7,"priority":"alta","bedrooms":"2","summary":"Resumo completo em 2-3 frases descrevendo o cliente, o que busca, renda e nível de interesse."}

Onde priority é "alta" (urgente, quer visitar logo), "media" (interessado mas sem pressa) ou "baixa" (apenas pesquisando).`;

const extractMsgCode = `const body = $input.item.json.body;
const data = body.data || {};
const key = data.key || {};
const msg = data.message || {};

const remoteJid = key.remoteJid || '';
const phone = remoteJid.split('@')[0];
const pushName = data.pushName || data.notifyName || phone;

let messageType = 'text';
let rawContent = '';

if (msg.conversation) {
  messageType = 'text';
  rawContent = msg.conversation;
} else if (msg.extendedTextMessage) {
  messageType = 'text';
  rawContent = msg.extendedTextMessage.text || '';
} else if (msg.audioMessage) {
  messageType = 'audio';
} else if (msg.imageMessage) {
  messageType = 'image';
  rawContent = msg.imageMessage.caption || '';
} else if (msg.videoMessage) {
  messageType = 'video';
} else if (msg.documentMessage) {
  messageType = 'text';
  rawContent = '[Documento recebido]';
} else {
  const evtType = data.messageType || '';
  if (evtType === 'audioMessage') messageType = 'audio';
  else if (evtType === 'imageMessage') messageType = 'image';
  else if (evtType === 'videoMessage') messageType = 'video';
  else {
    messageType = 'text';
    rawContent = '[Mensagem nao suportada]';
  }
}

const instance = body.instance || body.instanceName || '';
const serverUrl = body.serverUrl || '';

return {
  phone,
  pushName,
  messageType,
  rawContent,
  instance,
  serverUrl,
  originalKey: key,
  originalMessage: msg,
  rawBody: body
};`;

const buildMessagesCode = `// Get data from merge node (current message info)
const mergeData = $('Merge - Unir Branches').item.json;
const phone = mergeData.phone;
const pushName = mergeData.pushName;
const instance = mergeData.instance;
const serverUrl = mergeData.serverUrl || '';
const finalContent = mergeData.finalContent || '';
const isImage = mergeData.isImage || false;
const imageBase64 = mergeData.imageBase64 || '';
const imageMime = mergeData.imageMime || 'image/jpeg';

// Get conversation history from Supabase response
const convArray = $input.item.json;
let existingMessages = [];

if (Array.isArray(convArray) && convArray.length > 0) {
  existingMessages = convArray[0].messages || [];
}

// System prompt
const systemPrompt = ${JSON.stringify(systemPromptText)};

// Build messages array
const messages = [
  { role: 'system', content: systemPrompt }
];

// Add history (limit to last 20 messages to avoid token overflow)
const historySlice = existingMessages.slice(-20);
for (const m of historySlice) {
  messages.push(m);
}

// Add new user message
let userMessageContent;
if (isImage && imageBase64) {
  userMessageContent = [
    {
      type: 'image_url',
      image_url: { url: 'data:' + imageMime + ';base64,' + imageBase64 }
    }
  ];
  if (finalContent) {
    userMessageContent.unshift({ type: 'text', text: finalContent });
  }
} else {
  userMessageContent = finalContent || '[Mensagem recebida]';
}

messages.push({ role: 'user', content: userMessageContent });

// For history storage: store simplified version (text only for images)
const historyUserMessage = {
  role: 'user',
  content: isImage ? (finalContent ? '[Imagem] ' + finalContent : '[Imagem enviada]') : finalContent
};

const updatedHistory = [...existingMessages, historyUserMessage];

return {
  phone,
  pushName,
  instance,
  serverUrl,
  messages: JSON.stringify(messages),
  updatedHistory,
  isImage
};`;

const parseResponseCode = `// Get AI response
const aiResponse = $input.item.json;
const chatData = $('Construir Mensagens OpenAI').item.json;

// Extract the reply text - handle various n8n openAi node response shapes
let fullReply = '';
try {
  if (typeof aiResponse === 'string') {
    fullReply = aiResponse;
  } else if (aiResponse.message && typeof aiResponse.message === 'object' && aiResponse.message.content) {
    fullReply = aiResponse.message.content;
  } else if (aiResponse.text) {
    fullReply = aiResponse.text;
  } else if (aiResponse.choices && Array.isArray(aiResponse.choices) && aiResponse.choices[0]) {
    fullReply = aiResponse.choices[0].message?.content || aiResponse.choices[0].text || '';
  } else if (aiResponse.content) {
    fullReply = typeof aiResponse.content === 'string' ? aiResponse.content : JSON.stringify(aiResponse.content);
  } else {
    fullReply = JSON.stringify(aiResponse);
  }
} catch(e) {
  fullReply = 'Desculpe, tive um problema ao processar sua mensagem. Pode repetir?';
}

// Check for [LEAD_COMPLETE] marker
const leadCompleteIndex = fullReply.indexOf('[LEAD_COMPLETE]');
const isLeadComplete = leadCompleteIndex !== -1;

// Extract user-facing message (without [LEAD_COMPLETE] block)
let userFacingMessage = fullReply;
let leadData = null;

if (isLeadComplete) {
  userFacingMessage = fullReply.substring(0, leadCompleteIndex).trim();
  const afterMarker = fullReply.substring(leadCompleteIndex + '[LEAD_COMPLETE]'.length).trim();
  try {
    const jsonMatch = afterMarker.match(/\\{[\\s\\S]*\\}/);
    if (jsonMatch) {
      leadData = JSON.parse(jsonMatch[0]);
    }
  } catch(e) {
    leadData = null;
  }
}

// Build updated history
const updatedHistory = [...(chatData.updatedHistory || []), {
  role: 'assistant',
  content: userFacingMessage || fullReply
}];

return {
  phone: chatData.phone,
  pushName: chatData.pushName,
  instance: chatData.instance,
  serverUrl: chatData.serverUrl,
  userFacingMessage,
  fullReply,
  isLeadComplete,
  leadData,
  updatedHistory
};`;

const makeSetNode = (id, name, position, assignments) => ({
  id,
  name,
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  position,
  parameters: {
    mode: 'manual',
    duplicateItem: false,
    assignments: { assignments },
    options: {}
  }
});

const makeDownloadMediaNode = (id, name, position) => ({
  id,
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position,
  parameters: {
    method: 'POST',
    url: "={{ $('Extrair Mensagem').item.json.serverUrl }}/chat/getBase64FromMediaMessage/{{ $('Extrair Mensagem').item.json.instance }}",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'apikey', value: '={{ $env.EVOLUTION_API_KEY }}' }
      ]
    },
    sendBody: true,
    contentType: 'json',
    body: "={{ JSON.stringify({ message: { key: $('Extrair Mensagem').item.json.originalKey, message: $('Extrair Mensagem').item.json.originalMessage } }) }}",
    options: {
      timeout: name.includes('Video') ? 60000 : 30000,
      response: { response: { neverError: true } }
    }
  }
});

const workflow = {
  name: 'Kaizen Axis — Agente IA WhatsApp Leads',
  nodes: [
    {
      id: 'node-001',
      name: 'Webhook WhatsApp',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [240, 400],
      webhookId: 'kaizen-whatsapp-lead-v2',
      parameters: {
        httpMethod: 'POST',
        path: 'whatsapp-lead',
        responseMode: 'lastNode',
        options: { allowedOrigins: '*' }
      }
    },
    {
      id: 'node-002',
      name: 'Filtrar Mensagens Reais',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [500, 400],
      parameters: {
        conditions: {
          options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
          conditions: [
            { id: 'cond-fromme', leftValue: '={{ $json.body.data.key.fromMe }}', rightValue: false, operator: { type: 'boolean', operation: 'equals' } },
            { id: 'cond-event', leftValue: '={{ $json.body.event }}', rightValue: 'messages.upsert', operator: { type: 'string', operation: 'equals' } }
          ],
          combinator: 'and'
        }
      }
    },
    {
      id: 'node-003',
      name: 'Stop - Ignorar',
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: [760, 600],
      parameters: {}
    },
    {
      id: 'node-004',
      name: 'Extrair Mensagem',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [760, 280],
      parameters: { jsCode: extractMsgCode }
    },
    {
      id: 'node-005',
      name: 'Switch Tipo de Mensagem',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3,
      position: [1020, 280],
      parameters: {
        mode: 'rules',
        rules: {
          values: [
            { conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' }, conditions: [{ id: 'sw-text', leftValue: '={{ $json.messageType }}', rightValue: 'text', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'Texto' },
            { conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' }, conditions: [{ id: 'sw-audio', leftValue: '={{ $json.messageType }}', rightValue: 'audio', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'Audio' },
            { conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' }, conditions: [{ id: 'sw-image', leftValue: '={{ $json.messageType }}', rightValue: 'image', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'Imagem' },
            { conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' }, conditions: [{ id: 'sw-video', leftValue: '={{ $json.messageType }}', rightValue: 'video', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'Video' }
          ]
        },
        fallbackOutput: 'extra'
      }
    },
    makeSetNode('node-006', 'Set - Conteudo Texto', [1280, 80], [
      { id: 'a1', name: 'phone', value: '={{ $json.phone }}', type: 'string' },
      { id: 'a2', name: 'pushName', value: '={{ $json.pushName }}', type: 'string' },
      { id: 'a3', name: 'instance', value: '={{ $json.instance }}', type: 'string' },
      { id: 'a4', name: 'serverUrl', value: '={{ $json.serverUrl }}', type: 'string' },
      { id: 'a5', name: 'messageType', value: 'text', type: 'string' },
      { id: 'a6', name: 'finalContent', value: '={{ $json.rawContent }}', type: 'string' },
      { id: 'a7', name: 'isImage', value: false, type: 'boolean' },
      { id: 'a8', name: 'imageBase64', value: '', type: 'string' },
      { id: 'a9', name: 'imageMime', value: '', type: 'string' }
    ]),
    makeDownloadMediaNode('node-007', 'HTTP - Download Audio', [1280, 280]),
    {
      id: 'node-008',
      name: 'OpenAI - Transcrever Audio',
      type: 'n8n-nodes-base.openAi',
      typeVersion: 1.8,
      position: [1540, 280],
      parameters: {
        resource: 'audio',
        operation: 'transcribe',
        model: 'whisper-1',
        binaryPropertyName: 'data',
        inputDataFieldName: 'data',
        options: { language: 'pt' }
      },
      credentials: { openAiApi: { id: 'openai', name: 'OpenAI' } }
    },
    makeSetNode('node-009', 'Set - Transcricao Audio', [1800, 280], [
      { id: 'b1', name: 'phone', value: "={{ $('Extrair Mensagem').item.json.phone }}", type: 'string' },
      { id: 'b2', name: 'pushName', value: "={{ $('Extrair Mensagem').item.json.pushName }}", type: 'string' },
      { id: 'b3', name: 'instance', value: "={{ $('Extrair Mensagem').item.json.instance }}", type: 'string' },
      { id: 'b3b', name: 'serverUrl', value: "={{ $('Extrair Mensagem').item.json.serverUrl }}", type: 'string' },
      { id: 'b4', name: 'messageType', value: 'audio', type: 'string' },
      { id: 'b5', name: 'finalContent', value: "={{ '[Áudio transcrito]: ' + $json.text }}", type: 'string' },
      { id: 'b6', name: 'isImage', value: false, type: 'boolean' },
      { id: 'b7', name: 'imageBase64', value: '', type: 'string' },
      { id: 'b8', name: 'imageMime', value: '', type: 'string' }
    ]),
    makeDownloadMediaNode('node-010', 'HTTP - Download Imagem', [1280, 480]),
    makeSetNode('node-011', 'Set - Imagem Base64', [1540, 480], [
      { id: 'c1', name: 'phone', value: "={{ $('Extrair Mensagem').item.json.phone }}", type: 'string' },
      { id: 'c2', name: 'pushName', value: "={{ $('Extrair Mensagem').item.json.pushName }}", type: 'string' },
      { id: 'c3', name: 'instance', value: "={{ $('Extrair Mensagem').item.json.instance }}", type: 'string' },
      { id: 'c3b', name: 'serverUrl', value: "={{ $('Extrair Mensagem').item.json.serverUrl }}", type: 'string' },
      { id: 'c4', name: 'messageType', value: 'image', type: 'string' },
      { id: 'c5', name: 'finalContent', value: "={{ $('Extrair Mensagem').item.json.rawContent || '[Imagem enviada]' }}", type: 'string' },
      { id: 'c6', name: 'isImage', value: true, type: 'boolean' },
      { id: 'c7', name: 'imageBase64', value: '={{ $json.base64 }}', type: 'string' },
      { id: 'c8', name: 'imageMime', value: "={{ $json.mimetype || 'image/jpeg' }}", type: 'string' }
    ]),
    makeDownloadMediaNode('node-012', 'HTTP - Download Video', [1280, 680]),
    {
      id: 'node-013',
      name: 'OpenAI - Transcrever Video',
      type: 'n8n-nodes-base.openAi',
      typeVersion: 1.8,
      position: [1540, 680],
      parameters: {
        resource: 'audio',
        operation: 'transcribe',
        model: 'whisper-1',
        binaryPropertyName: 'data',
        inputDataFieldName: 'data',
        options: { language: 'pt' }
      },
      credentials: { openAiApi: { id: 'openai', name: 'OpenAI' } }
    },
    makeSetNode('node-014', 'Set - Transcricao Video', [1800, 680], [
      { id: 'd1', name: 'phone', value: "={{ $('Extrair Mensagem').item.json.phone }}", type: 'string' },
      { id: 'd2', name: 'pushName', value: "={{ $('Extrair Mensagem').item.json.pushName }}", type: 'string' },
      { id: 'd3', name: 'instance', value: "={{ $('Extrair Mensagem').item.json.instance }}", type: 'string' },
      { id: 'd3b', name: 'serverUrl', value: "={{ $('Extrair Mensagem').item.json.serverUrl }}", type: 'string' },
      { id: 'd4', name: 'messageType', value: 'video', type: 'string' },
      { id: 'd5', name: 'finalContent', value: "={{ '[Vídeo transcrito]: ' + $json.text }}", type: 'string' },
      { id: 'd6', name: 'isImage', value: false, type: 'boolean' },
      { id: 'd7', name: 'imageBase64', value: '', type: 'string' },
      { id: 'd8', name: 'imageMime', value: '', type: 'string' }
    ]),
    {
      id: 'node-015',
      name: 'Merge - Unir Branches',
      type: 'n8n-nodes-base.merge',
      typeVersion: 3,
      position: [2060, 400],
      parameters: { mode: 'passThrough', output: 'input1' }
    },
    {
      id: 'node-016',
      name: 'HTTP - Buscar Conversa',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2320, 400],
      parameters: {
        method: 'GET',
        url: '={{ $env.SUPABASE_URL }}/rest/v1/wa_conversations?phone=eq.{{ $json.phone }}&limit=1',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
            { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_KEY }}' },
            { name: 'Content-Type', value: 'application/json' }
          ]
        },
        options: { timeout: 10000, response: { response: { neverError: true } } }
      }
    },
    {
      id: 'node-017',
      name: 'Construir Mensagens OpenAI',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2580, 400],
      parameters: { jsCode: buildMessagesCode }
    },
    {
      id: 'node-018',
      name: 'OpenAI - GPT-4o Chat',
      type: 'n8n-nodes-base.openAi',
      typeVersion: 1.8,
      position: [2840, 400],
      parameters: {
        resource: 'chat',
        operation: 'complete',
        model: 'gpt-4o',
        prompt: {
          type: 'define',
          instructions: '={{ $json.messages }}'
        },
        simplify: true,
        jsonOutput: false,
        options: {
          maxTokens: 1000,
          temperature: 0.7
        }
      },
      credentials: { openAiApi: { id: 'openai', name: 'OpenAI' } }
    },
    {
      id: 'node-019',
      name: 'Parsear Resposta IA',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3100, 400],
      parameters: { jsCode: parseResponseCode }
    },
    {
      id: 'node-020',
      name: 'HTTP - Enviar Resposta WhatsApp',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3360, 400],
      parameters: {
        method: 'POST',
        url: '={{ $json.serverUrl }}/message/sendText/{{ $json.instance }}',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'apikey', value: '={{ $env.EVOLUTION_API_KEY }}' }
          ]
        },
        sendBody: true,
        contentType: 'json',
        body: '={{ JSON.stringify({ number: $json.phone, text: $json.userFacingMessage }) }}',
        options: { timeout: 15000, response: { response: { neverError: true } } }
      }
    },
    {
      id: 'node-021',
      name: 'IF - Lead Completo?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [3620, 400],
      parameters: {
        conditions: {
          options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
          conditions: [
            { id: 'cond-leadcomplete', leftValue: "={{ $('Parsear Resposta IA').item.json.isLeadComplete }}", rightValue: true, operator: { type: 'boolean', operation: 'equals' } }
          ],
          combinator: 'and'
        }
      }
    },
    {
      id: 'node-022',
      name: 'HTTP - Inserir Lead Supabase',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3880, 220],
      parameters: {
        method: 'POST',
        url: '={{ $env.SUPABASE_URL }}/rest/v1/leads',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
            { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_KEY }}' },
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Prefer', value: 'return=representation' }
          ]
        },
        sendBody: true,
        contentType: 'json',
        body: `={{ JSON.stringify({
  name: ($('Parsear Resposta IA').item.json.leadData && $('Parsear Resposta IA').item.json.leadData.name) || $('Parsear Resposta IA').item.json.pushName || $('Parsear Resposta IA').item.json.phone,
  phone: $('Parsear Resposta IA').item.json.phone,
  origin: 'WhatsApp',
  ai_summary: ($('Parsear Resposta IA').item.json.leadData && $('Parsear Resposta IA').item.json.leadData.summary) || '',
  interest_level: (() => {
    const p = ($('Parsear Resposta IA').item.json.leadData && $('Parsear Resposta IA').item.json.leadData.priority) || 'media';
    if (p === 'alta') return 'Alto';
    if (p === 'baixa') return 'Baixo';
    return 'Médio';
  })(),
  stage: 'novo_lead',
  distribution_status: 'aguardando_distribuicao',
  ai_metadata: $('Parsear Resposta IA').item.json.leadData ? {
    region: $('Parsear Resposta IA').item.json.leadData.region || '',
    propertyType: $('Parsear Resposta IA').item.json.leadData.propertyType || '',
    income: $('Parsear Resposta IA').item.json.leadData.income || '',
    profession: $('Parsear Resposta IA').item.json.leadData.profession || '',
    urgency: $('Parsear Resposta IA').item.json.leadData.urgency || 5,
    priority: $('Parsear Resposta IA').item.json.leadData.priority || 'media',
    bedrooms: $('Parsear Resposta IA').item.json.leadData.bedrooms || ''
  } : {}
}) }}`,
        options: { timeout: 15000 }
      }
    },
    {
      id: 'node-023',
      name: 'HTTP - Distribuir Lead RPC',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [4140, 220],
      parameters: {
        method: 'POST',
        url: '={{ $env.SUPABASE_URL }}/rest/v1/rpc/distribute_lead',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
            { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_KEY }}' },
            { name: 'Content-Type', value: 'application/json' }
          ]
        },
        sendBody: true,
        contentType: 'json',
        body: "={{ JSON.stringify({ p_lead_id: Array.isArray($('HTTP - Inserir Lead Supabase').item.json) ? $('HTTP - Inserir Lead Supabase').item.json[0].id : $('HTTP - Inserir Lead Supabase').item.json.id }) }}",
        options: { timeout: 15000, response: { response: { neverError: true } } }
      }
    },
    {
      id: 'node-024',
      name: 'HTTP - Deletar Conversa',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [4400, 220],
      parameters: {
        method: 'DELETE',
        url: "={{ $env.SUPABASE_URL }}/rest/v1/wa_conversations?phone=eq.{{ $('Parsear Resposta IA').item.json.phone }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
            { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_KEY }}' },
            { name: 'Content-Type', value: 'application/json' }
          ]
        },
        options: { timeout: 10000, response: { response: { neverError: true } } }
      }
    },
    {
      id: 'node-025',
      name: 'HTTP - Upsert Conversa',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3880, 580],
      parameters: {
        method: 'POST',
        url: '={{ $env.SUPABASE_URL }}/rest/v1/wa_conversations',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
            { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_KEY }}' },
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Prefer', value: 'resolution=merge-duplicates' }
          ]
        },
        sendBody: true,
        contentType: 'json',
        body: `={{ JSON.stringify({
  phone: $('Parsear Resposta IA').item.json.phone,
  push_name: $('Parsear Resposta IA').item.json.pushName,
  messages: $('Parsear Resposta IA').item.json.updatedHistory,
  status: 'active',
  updated_at: new Date().toISOString()
}) }}`,
        options: { timeout: 10000, response: { response: { neverError: true } } }
      }
    }
  ],
  connections: {
    'Webhook WhatsApp': { main: [[{ node: 'Filtrar Mensagens Reais', type: 'main', index: 0 }]] },
    'Filtrar Mensagens Reais': { main: [[{ node: 'Extrair Mensagem', type: 'main', index: 0 }], [{ node: 'Stop - Ignorar', type: 'main', index: 0 }]] },
    'Extrair Mensagem': { main: [[{ node: 'Switch Tipo de Mensagem', type: 'main', index: 0 }]] },
    'Switch Tipo de Mensagem': { main: [
      [{ node: 'Set - Conteudo Texto', type: 'main', index: 0 }],
      [{ node: 'HTTP - Download Audio', type: 'main', index: 0 }],
      [{ node: 'HTTP - Download Imagem', type: 'main', index: 0 }],
      [{ node: 'HTTP - Download Video', type: 'main', index: 0 }]
    ]},
    'Set - Conteudo Texto': { main: [[{ node: 'Merge - Unir Branches', type: 'main', index: 0 }]] },
    'HTTP - Download Audio': { main: [[{ node: 'OpenAI - Transcrever Audio', type: 'main', index: 0 }]] },
    'OpenAI - Transcrever Audio': { main: [[{ node: 'Set - Transcricao Audio', type: 'main', index: 0 }]] },
    'Set - Transcricao Audio': { main: [[{ node: 'Merge - Unir Branches', type: 'main', index: 1 }]] },
    'HTTP - Download Imagem': { main: [[{ node: 'Set - Imagem Base64', type: 'main', index: 0 }]] },
    'Set - Imagem Base64': { main: [[{ node: 'Merge - Unir Branches', type: 'main', index: 2 }]] },
    'HTTP - Download Video': { main: [[{ node: 'OpenAI - Transcrever Video', type: 'main', index: 0 }]] },
    'OpenAI - Transcrever Video': { main: [[{ node: 'Set - Transcricao Video', type: 'main', index: 0 }]] },
    'Set - Transcricao Video': { main: [[{ node: 'Merge - Unir Branches', type: 'main', index: 3 }]] },
    'Merge - Unir Branches': { main: [[{ node: 'HTTP - Buscar Conversa', type: 'main', index: 0 }]] },
    'HTTP - Buscar Conversa': { main: [[{ node: 'Construir Mensagens OpenAI', type: 'main', index: 0 }]] },
    'Construir Mensagens OpenAI': { main: [[{ node: 'OpenAI - GPT-4o Chat', type: 'main', index: 0 }]] },
    'OpenAI - GPT-4o Chat': { main: [[{ node: 'Parsear Resposta IA', type: 'main', index: 0 }]] },
    'Parsear Resposta IA': { main: [[{ node: 'HTTP - Enviar Resposta WhatsApp', type: 'main', index: 0 }]] },
    'HTTP - Enviar Resposta WhatsApp': { main: [[{ node: 'IF - Lead Completo?', type: 'main', index: 0 }]] },
    'IF - Lead Completo?': { main: [
      [{ node: 'HTTP - Inserir Lead Supabase', type: 'main', index: 0 }],
      [{ node: 'HTTP - Upsert Conversa', type: 'main', index: 0 }]
    ]},
    'HTTP - Inserir Lead Supabase': { main: [[{ node: 'HTTP - Distribuir Lead RPC', type: 'main', index: 0 }]] },
    'HTTP - Distribuir Lead RPC': { main: [[{ node: 'HTTP - Deletar Conversa', type: 'main', index: 0 }]] }
  },
  settings: {
    executionOrder: 'v1',
    saveManualExecutions: true,
    callerPolicy: 'workflowsFromSameOwner',
    errorWorkflow: '',
    availableInMCP: false
  },
};

const body = JSON.stringify(workflow);
console.log('Workflow JSON size:', body.length, 'bytes');
console.log('Node count:', workflow.nodes.length);

const options = {
  hostname: HOST,
  port: 443,
  path: '/api/v1/workflows',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-N8N-API-KEY': API_KEY,
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const parsed = JSON.parse(data);
      if (parsed.id) {
        console.log('SUCCESS! New workflow ID:', parsed.id);
        console.log('Webhook URL: https://' + HOST + '/webhook/' + (parsed.nodes.find(n => n.type === 'n8n-nodes-base.webhook')?.parameters?.path || 'whatsapp-lead'));
      } else {
        console.log('Response:', JSON.stringify(parsed, null, 2).substring(0, 2000));
      }
    } catch(e) {
      console.log('Raw response:', data.substring(0, 2000));
    }
  });
});

req.on('error', (e) => { console.error('Error:', e.message); });
req.write(body);
req.end();
