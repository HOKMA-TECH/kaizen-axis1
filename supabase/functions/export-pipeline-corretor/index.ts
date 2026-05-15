// @ts-nocheck — Deno types are not available in the local TS checker; valid at runtime.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '';
const corsHeaders = {
  'Access-Control-Allow-Origin':  CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Vary': 'Origin',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function errJson(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

function formatCurrency(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function truncate(text: string | null, max: number): string {
  if (!text) return '—';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// ── Edge Function ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') return errJson('Método não permitido', 405);

  // ── Auth: valida JWT ────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errJson('Não autorizado', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return errJson('Token inválido', 401);

  // ── Auth: verifica role ─────────────────────────────────────────────────────
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role, name, directorate_id')
    .eq('id', user.id)
    .single();

  const role = (callerProfile?.role || '').toUpperCase();
  if (role !== 'ADMIN' && role !== 'DIRETOR') {
    return errJson('Acesso negado. Apenas ADMIN e DIRETOR podem exportar pipelines.', 403);
  }

  // ── Rate limit: 10 exportações por minuto por usuário ───────────────────────
  const exportWindowStart = new Date(
    Math.floor(Date.now() / 60_000) * 60_000,
  ).toISOString();
  const { data: exportCount, error: exportRateErr } = await supabase.rpc('increment_request_counter', {
    _scope: 'export_pipeline',
    _identifier: user.id,
    _window_start: exportWindowStart,
  });
  if (exportRateErr || (exportCount ?? 0) >= 10) {
    if (exportRateErr) console.warn('[export-pipeline] rate-limit rpc failed:', exportRateErr.message);
    return errJson('Limite de exportações atingido. Aguarde 1 minuto.', 429);
  }

  // ── Body ────────────────────────────────────────────────────────────────────
  let corretor_id: string;
  try {
    const body = await req.json();
    corretor_id = body.corretor_id;
    if (!corretor_id) throw new Error();
  } catch {
    return errJson('corretor_id é obrigatório');
  }

  // ── Busca perfil do corretor e valida escopo do DIRETOR ────────────────────
  const { data: corretorProfile } = await supabase
    .from('profiles')
    .select('name, directorate_id')
    .eq('id', corretor_id)
    .single();

  // E-02: DIRETOR só pode exportar corretores da própria diretoria
  if (role === 'DIRETOR') {
    const callerDirId = callerProfile?.directorate_id;
    const corretorDirId = corretorProfile?.directorate_id;
    if (!callerDirId || callerDirId !== corretorDirId) {
      return errJson('Acesso negado. DIRETOR só pode exportar pipelines da sua diretoria.', 403);
    }
  }

  const corretorName = corretorProfile?.name || 'Corretor';

  const safeCorretorName = (corretorName || 'corretor')
    .replace(/[^\w\s\-áéíóúàâêôãõüçÁÉÍÓÚÀÂÊÔÃÕÜÇ]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 80);

  // ── Query: clientes ativos do corretor ──────────────────────────────────────
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('name, phone, email, region_of_interest, profession, gross_income, stage, intended_value, created_at, updated_at')
    .eq('owner_id', corretor_id)
    .not('stage', 'in', '("Concluido","Cancelado")')
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (clientsError) return errJson('Erro ao buscar clientes: ' + clientsError.message);

  if (!clients || clients.length === 0) {
    return errJson('Este corretor não possui clientes ativos no pipeline.', 404);
  }

  if (clients.length >= 1000) {
    return errJson('Volume acima de 1000 registros. Refine o período ou use exportação parcial.', 400);
  }

  // ── Resumo executivo ────────────────────────────────────────────────────────
  const totalLeads = clients.length;
  const valorTotal = clients.reduce((acc, c) => acc + (c.intended_value || 0), 0);
  const distribuicao: Record<string, number> = {};
  for (const c of clients) {
    distribuicao[c.stage] = (distribuicao[c.stage] || 0) + 1;
  }

  // ── Gera PDF ────────────────────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const helveticaBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica       = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 36;
  const COL_W  = PAGE_W - MARGIN * 2;

  const gold   = rgb(0.82, 0.66, 0.18);
  const dark   = rgb(0.10, 0.10, 0.10);
  const gray   = rgb(0.45, 0.45, 0.45);
  const light  = rgb(0.96, 0.96, 0.96);
  const white  = rgb(1, 1, 1);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  // ── Cabeçalho ────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PAGE_H - 70, width: PAGE_W, height: 70, color: dark });
  page.drawText('Relatório de Pipeline de Clientes', {
    x: MARGIN, y: PAGE_H - 30, size: 16, font: helveticaBold, color: gold,
  });
  page.drawText(`Corretor: ${corretorName}`, {
    x: MARGIN, y: PAGE_H - 48, size: 10, font: helvetica, color: white,
  });
  page.drawText(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, {
    x: MARGIN, y: PAGE_H - 63, size: 9, font: helvetica, color: rgb(0.75, 0.75, 0.75),
  });

  y = PAGE_H - 90;

  // ── Resumo Executivo ──────────────────────────────────────────────────────────
  page.drawText('RESUMO EXECUTIVO', {
    x: MARGIN, y, size: 10, font: helveticaBold, color: gold,
  });
  y -= 18;

  const summaryItems = [
    ['Total de Leads Ativos', String(totalLeads)],
    ['Valor Total do Pipeline', formatCurrency(valorTotal)],
  ];
  for (const [label, value] of summaryItems) {
    page.drawText(`${label}:`, { x: MARGIN, y, size: 9, font: helveticaBold, color: dark });
    page.drawText(value, { x: MARGIN + 140, y, size: 9, font: helvetica, color: dark });
    y -= 14;
  }

  y -= 4;
  page.drawText('Distribuição por Status:', { x: MARGIN, y, size: 9, font: helveticaBold, color: dark });
  y -= 13;
  for (const [stage, count] of Object.entries(distribuicao)) {
    page.drawText(`  • ${stage}: ${count}`, { x: MARGIN, y, size: 9, font: helvetica, color: gray });
    y -= 13;
  }

  y -= 10;
  page.drawRectangle({ x: MARGIN, y, width: COL_W, height: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 18;

  // ── Tabela de Clientes ────────────────────────────────────────────────────────
  page.drawText('CLIENTES NO PIPELINE', {
    x: MARGIN, y, size: 10, font: helveticaBold, color: gold,
  });
  y -= 16;

  // Colunas: Nome | Telefone | Região | Profissão | Renda | Status | Valor | Atualização
  const cols = [
    { label: 'Nome',          w: 95,  key: 'name' },
    { label: 'Telefone',      w: 72,  key: 'phone' },
    { label: 'Região',        w: 65,  key: 'region_of_interest' },
    { label: 'Profissão',     w: 70,  key: 'profession' },
    { label: 'Renda',         w: 65,  key: 'gross_income' },
    { label: 'Status',        w: 60,  key: 'stage' },
    { label: 'Valor',         w: 65,  key: 'intended_value' },
    { label: 'Atualização',   w: 55,  key: 'updated_at' },
  ] as const;

  const ROW_H = 16;
  const HEADER_H = 18;

  function drawTableHeader(pg: typeof page, startY: number) {
    pg.drawRectangle({ x: MARGIN, y: startY - HEADER_H + 4, width: COL_W, height: HEADER_H, color: dark });
    let cx = MARGIN + 4;
    for (const col of cols) {
      pg.drawText(col.label, { x: cx, y: startY - 9, size: 7, font: helveticaBold, color: white });
      cx += col.w;
    }
    return startY - HEADER_H;
  }

  y = drawTableHeader(page, y);

  let rowIndex = 0;
  for (const client of clients) {
    if (y < MARGIN + ROW_H + 20) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      page.drawText(`Pipeline — ${corretorName} (continuação)`, {
        x: MARGIN, y, size: 8, font: helvetica, color: gray,
      });
      y -= 14;
      y = drawTableHeader(page, y);
      rowIndex = 0;
    }

    const rowColor = rowIndex % 2 === 0 ? white : light;
    page.drawRectangle({ x: MARGIN, y: y - ROW_H + 5, width: COL_W, height: ROW_H, color: rowColor });

    const cellValues: string[] = [
      truncate(client.name, 16),
      truncate(client.phone, 13),
      truncate(client.region_of_interest, 11),
      truncate(client.profession, 12),
      client.gross_income ? formatCurrency(parseFloat(client.gross_income)) : '—',
      truncate(client.stage, 10),
      client.intended_value != null ? formatCurrency(client.intended_value) : '—',
      formatDate(client.updated_at),
    ];

    let cx = MARGIN + 4;
    for (let i = 0; i < cols.length; i++) {
      page.drawText(cellValues[i], { x: cx, y: y - 8, size: 7, font: helvetica, color: dark });
      cx += cols[i].w;
    }

    // linha separadora
    page.drawRectangle({ x: MARGIN, y: y - ROW_H + 5, width: COL_W, height: 0.3, color: rgb(0.88, 0.88, 0.88) });

    y -= ROW_H;
    rowIndex++;
  }

  // ── Rodapé ────────────────────────────────────────────────────────────────────
  const pages = pdfDoc.getPages();
  pages.forEach((pg, idx) => {
    pg.drawText(`Kaizen Axis — Confidencial  |  Página ${idx + 1} de ${pages.length}`, {
      x: MARGIN, y: 18, size: 7, font: helvetica, color: gray,
    });
  });

  const pdfBytes = await pdfDoc.save();

  return new Response(pdfBytes, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="pipeline-${safeCorretorName}.pdf"`,
    },
  });
});
