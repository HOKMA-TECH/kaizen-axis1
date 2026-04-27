import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENAI_API_KEY = String(Deno.env.get('OPENAI_API_KEY') || '').trim();
const OPENAI_MODEL = String(Deno.env.get('KAI_OPENAI_MODEL') || 'gpt-4o-mini').trim();
const OPENAI_TEMPERATURE = Number(Deno.env.get('KAI_TEMPERATURE') || '0.2');
const OPENAI_TOP_P = Number(Deno.env.get('KAI_TOP_P') || '0.9');
const OPENAI_EMBEDDING_MODEL = String(Deno.env.get('KAI_EMBEDDING_MODEL') || 'text-embedding-3-small').trim();
const KAI_USE_EMBEDDINGS = String(Deno.env.get('KAI_USE_EMBEDDINGS') || 'true').toLowerCase() === 'true';
const MAX_HISTORY = Number(Deno.env.get('KAI_MAX_HISTORY') || '16');
const KAI_KNOWLEDGE_MATCH_COUNT = Number(Deno.env.get('KAI_KNOWLEDGE_MATCH_COUNT') || '8');

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ChatRole = 'user' | 'assistant';

type ChatBody = {
  message?: string;
  history?: { role: ChatRole; content: string }[];
};

type KnowledgeRow = {
  id: number;
  item_code: string;
  volume: number | null;
  bloco: string | null;
  question: string | null;
  answer: string;
  tags: string[] | null;
  score: number;
};

type KnowledgeChunk = {
  id: string;
  content: string;
  tags: string[];
};

const KNOWLEDGE_BASE: KnowledgeChunk[] = [
  {
    id: 'V1-001',
    content:
      'Financiamento imobiliario e quando uma instituicao, como a Caixa, empresta parte do valor do imovel e o cliente paga em parcelas com juros, seguros e encargos.',
    tags: ['financiamento', 'conceitos', 'caixa'],
  },
  {
    id: 'V1-050',
    content:
      'Como referencia pratica, muitas modalidades usam ate 30% da renda familiar bruta para prestacao, sempre sujeita a analise oficial.',
    tags: ['renda', 'parcela', '30%'],
  },
  {
    id: 'V2-022',
    content:
      'Referencia MCMV urbano (abril/2026): Faixa 1 ate R$ 3.200; Faixa 2 de R$ 3.200,01 a R$ 5.000; Faixa 3 de R$ 5.000,01 a R$ 9.600; Classe Media/Faixa 4 ate R$ 13.000.',
    tags: ['mcmv', 'faixas', '2026'],
  },
  {
    id: 'V2-084',
    content:
      'Tetos de referencia MCMV 2026: Faixa 3 ate R$ 400 mil; Classe Media/Faixa 4 ate R$ 600 mil; Faixas 1 e 2 com limites regionais podendo chegar a R$ 275 mil.',
    tags: ['mcmv', 'teto', 'faixa-3', 'faixa-4'],
  },
  {
    id: 'V3-041',
    content:
      'FGTS pode ser usado para entrada, amortizacao, quitacao e abatimento temporario de parcelas, quando aplicavel e conforme regras vigentes.',
    tags: ['fgts', 'entrada', 'amortizacao', 'quitacao'],
  },
  {
    id: 'V5-001',
    content:
      'Apos assinatura ainda existem etapas como registro em cartorio e liberacao/repasse do recurso.',
    tags: ['assinatura', 'registro', 'cartorio'],
  },
];

const MASTER_PROMPT = `
Voce e KAI, um agente especialista em financiamento imobiliario no Brasil, com foco na CAIXA Economica Federal.

Sua funcao e responder duvidas sobre:
- financiamento imobiliario pela CAIXA;
- Minha Casa Minha Vida (MCMV);
- SBPE;
- uso do FGTS;
- subsidio/desconto habitacional;
- etapas do processo de compra financiada;
- documentacao do comprador, vendedor e imovel;
- analise de credito;
- avaliacao de engenharia;
- assinatura de contrato;
- registro em cartorio;
- liberacao do credito.

Objetivo da resposta:
- clara;
- correta;
- concisa;
- util para o proximo passo do usuario.

Regras obrigatorias:
1) Responder sempre em portugues do Brasil.
2) Linguagem simples, sem juridiques desnecessario.
3) Nao inventar taxas, subsidios, limites ou exigencias nao confirmadas.
4) Se valor exato depender de simulacao/analise de credito/avaliacao/regiao/renda/regras internas da CAIXA, deixe isso explicito.
5) Nunca garantir aprovacao de credito ou valor de subsidio.
6) Diferenciar corretamente:
   - MCMV x SBPE;
   - entrada x subsidio x FGTS;
   - analise de credito x analise do imovel;
   - assinatura do contrato x registro do contrato.
7) Referencia MCMV urbano (abril/2026):
   - Faixa 1: ate R$ 3.200;
   - Faixa 2: R$ 3.200,01 ate R$ 5.000;
   - Faixa 3: R$ 5.000,01 ate R$ 9.600;
   - Classe Media/Faixa 4: ate R$ 13.000.
8) Tetos do MCMV em 2026:
   - Faixa 3: ate R$ 400 mil;
   - Classe Media/Faixa 4: ate R$ 600 mil;
   - Faixas 1 e 2: limites regionais, podendo chegar a ate R$ 275 mil.
9) Explicar subsidio como desconto habitacional sujeito a renda, localizacao, composicao familiar e regras vigentes.
10) Ordem do processo: simulacao -> enquadramento -> analise de credito -> documentos -> avaliacao/documentacao do imovel -> aprovacao -> assinatura -> registro/cartorio -> liberacao/repasse.
11) Quando perguntarem sobre prestacao, usar referencia pratica de ate 30% da renda familiar bruta, sempre sujeita a analise.
12) Quando perguntarem financiamento maximo, deixar claro que depende de renda, idade, prazo, modalidade, score, relacionamento, avaliacao e entrada.
13) Quando perguntarem FGTS, explicar usos possiveis (entrada, amortizacao, quitacao, abatimento temporario de parcelas) quando aplicavel e conforme regras.
14) Se tema estiver fora do escopo, dizer com transparencia e redirecionar para assunto imobiliario/financeiro relacionado.

Formato ideal da resposta:
- 1o paragrafo: resposta direta.
- 2o paragrafo: explicacao curta.
- 3o paragrafo (opcional): proximo passo pratico.

Quando fizer sentido, usar estruturas:
- Em resumo:
- Na pratica:
- O proximo passo e:

Nunca use resposta generica. Personalize com os dados informados pelo usuario.
`.trim();

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9$\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function buildLocalKnowledgeContext(message: string): string {
  const tokens = new Set(tokenize(message));

  const scored = KNOWLEDGE_BASE.map((chunk) => {
    const tagScore = chunk.tags.reduce((acc, tag) => acc + (tokens.has(tag.toLowerCase()) ? 3 : 0), 0);
    const contentTokens = tokenize(chunk.content);
    const lexicalScore = contentTokens.reduce((acc, token) => acc + (tokens.has(token) ? 1 : 0), 0);
    return { chunk, score: tagScore + lexicalScore };
  })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const fallback = scored.length > 0
    ? scored
    : KNOWLEDGE_BASE.slice(0, 5).map((chunk) => ({ chunk, score: 1 }));

  return fallback
    .map(({ chunk }) => `- [${chunk.id}] ${chunk.content}`)
    .join('\n');
}

function sanitizeHistory(history: ChatBody['history']) {
  if (!Array.isArray(history)) return [] as { role: ChatRole; content: string }[];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content.length > 0)
    .slice(-Math.max(2, MAX_HISTORY));
}

async function fetchEmbedding(input: string): Promise<number[] | null> {
  if (!KAI_USE_EMBEDDINGS) return null;
  if (!OPENAI_API_KEY) return null;

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input,
      }),
    });

    if (!response.ok) {
      console.warn('[kai-agent] embedding request failed', await response.text().catch(() => 'unknown'));
      return null;
    }

    const data = await response.json();
    const emb = data?.data?.[0]?.embedding;
    return Array.isArray(emb) ? emb : null;
  } catch (error) {
    console.warn('[kai-agent] embedding error', error);
    return null;
  }
}

function formatDbKnowledgeContext(rows: KnowledgeRow[]): string {
  return rows
    .map((row) => {
      const header = `[${row.item_code}${row.volume ? ` | V${row.volume}` : ''}${row.bloco ? ` | ${row.bloco}` : ''}]`;
      const question = row.question ? `Pergunta: ${row.question}` : '';
      const tags = row.tags && row.tags.length ? `Tags: ${row.tags.join(', ')}` : '';
      const score = Number.isFinite(row.score) ? `Score: ${row.score.toFixed(4)}` : '';
      return `${header}\n${question}\nResposta: ${row.answer}\n${tags}\n${score}`.trim();
    })
    .join('\n\n');
}

async function fetchKnowledgeContextFromDb(message: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const queryEmbedding = await fetchEmbedding(message);
  const { data, error } = await supabase.rpc('match_kai_knowledge', {
    query_text: message,
    match_count: Math.max(1, KAI_KNOWLEDGE_MATCH_COUNT),
    query_embedding: queryEmbedding,
  });

  if (error) {
    console.warn('[kai-agent] match_kai_knowledge rpc error', error.message);
    return null;
  }

  const rows = (data || []) as KnowledgeRow[];
  if (!rows.length) return null;
  return formatDbKnowledgeContext(rows);
}

async function buildKnowledgeContext(message: string): Promise<string> {
  const dbContext = await fetchKnowledgeContextFromDb(message);
  if (dbContext) return dbContext;
  return buildLocalKnowledgeContext(message);
}

async function callOpenAI(payload: {
  userMessage: string;
  history: { role: ChatRole; content: string }[];
}) {
  const knowledgeContext = await buildKnowledgeContext(payload.userMessage);

  const systemContent = `${MASTER_PROMPT}\n\nBase de conhecimento relevante para esta resposta:\n${knowledgeContext}\n\nSe houver qualquer conflito, priorize as regras obrigatorias e deixe incertezas explicitas.`;

  const messages = [
    { role: 'system', content: systemContent },
    ...payload.history,
    { role: 'user', content: payload.userMessage },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: Number.isFinite(OPENAI_TEMPERATURE) ? OPENAI_TEMPERATURE : 0.2,
      top_p: Number.isFinite(OPENAI_TOP_P) ? OPENAI_TOP_P : 0.9,
      max_tokens: 700,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'OpenAI request failed');
    throw new Error(errText);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Empty model response');
  }
  return content.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!OPENAI_API_KEY) {
    return jsonResponse({ error: 'Server misconfigured: missing OPENAI_API_KEY' }, 500);
  }

  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const message = String(body.message || '').trim();
  if (!message) {
    return jsonResponse({ error: 'Message is required' }, 400);
  }

  try {
    const history = sanitizeHistory(body.history);
    const response = await callOpenAI({ userMessage: message, history });
    return jsonResponse({ response });
  } catch (error) {
    console.error('[kai-agent] error:', error);
    return jsonResponse({
      error: 'Falha ao gerar resposta do KAI',
      response:
        'Desculpe, tive uma instabilidade agora. Tente novamente em instantes. Se quiser, ja me diga renda familiar, valor do imovel e cidade para eu te orientar no proximo passo.',
    }, 500);
  }
});
