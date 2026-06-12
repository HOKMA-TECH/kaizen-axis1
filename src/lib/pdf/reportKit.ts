import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, StandardFonts } from 'pdf-lib';

/**
 * Kit de geração de PDFs — padroniza TODOS os relatórios do app com o mesmo
 * layout: paleta branco + azul (marca), logo da Kaizen no cabeçalho e rodapé
 * "Confidencial / Página X de Y".
 *
 * Uso típico:
 *   const doc = await PDFDocument.create();
 *   const fonts = await embedFonts(doc);
 *   const logo = await loadKaizenLogo(doc);
 *   let page = doc.addPage([PAGE.W, PAGE.H]);
 *   let y = drawReportHeader(page, fonts, logo, { title, subtitle });
 *   ... desenhar conteúdo, usando PDF_THEME ...
 *   addStandardFooters(doc, fonts);
 *   await downloadPdf(doc, 'arquivo.pdf');
 */

// ─── Paleta (branco + azul da marca) ────────────────────────────────────────
export const PDF_THEME = {
  blue: rgb(0.145, 0.388, 0.922),     // #2563eb (primary)
  blueDark: rgb(0.114, 0.306, 0.847), // #1d4ed8
  ink: rgb(0.07, 0.09, 0.15),         // texto principal
  gray: rgb(0.42, 0.45, 0.5),         // texto secundário
  line: rgb(0.85, 0.88, 0.93),        // divisórias suaves
  rowAlt: rgb(0.94, 0.96, 1),         // linha alternada (azul bem claro)
  white: rgb(1, 1, 1),
};

export const PAGE = { W: 595, H: 842, MARGIN: 36 };

export interface ReportFonts {
  regular: PDFFont;
  bold: PDFFont;
}

export async function embedFonts(doc: PDFDocument): Promise<ReportFonts> {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

// Cache dos bytes do logo (mesma aba) para não refazer fetch a cada PDF
let logoBytesCache: ArrayBuffer | null = null;

/** Embute o logo da Kaizen (public/pwa-512x512.png). Retorna null se indisponível. */
export async function loadKaizenLogo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    if (!logoBytesCache) {
      const res = await fetch('/pwa-512x512.png');
      if (!res.ok) return null;
      logoBytesCache = await res.arrayBuffer();
    }
    return await doc.embedPng(logoBytesCache);
  } catch {
    return null;
  }
}

/**
 * Cabeçalho padrão: fundo branco, logo à esquerda, título azul, subtítulo e
 * "Gerado em" em cinza, e uma divisória azul. Retorna o `y` inicial do conteúdo.
 */
export function drawReportHeader(
  page: PDFPage,
  fonts: ReportFonts,
  logo: PDFImage | null,
  opts: { title: string; subtitle?: string },
): number {
  const W = page.getWidth();
  const H = page.getHeight();
  const MARGIN = PAGE.MARGIN;
  let textX = MARGIN;

  if (logo) {
    const size = 36;
    page.drawImage(logo, { x: MARGIN, y: H - MARGIN - size, width: size, height: size });
    textX = MARGIN + size + 12;
  }

  page.drawText(opts.title, { x: textX, y: H - MARGIN - 13, size: 16, font: fonts.bold, color: PDF_THEME.blue });
  if (opts.subtitle) {
    page.drawText(opts.subtitle, { x: textX, y: H - MARGIN - 27, size: 9, font: fonts.regular, color: PDF_THEME.gray });
  }
  page.drawText(`Gerado em ${new Date().toLocaleString('pt-BR')}`, {
    x: textX, y: H - MARGIN - 39, size: 8, font: fonts.regular, color: PDF_THEME.gray,
  });

  const lineY = H - MARGIN - 50;
  page.drawRectangle({ x: MARGIN, y: lineY, width: W - MARGIN * 2, height: 1.5, color: PDF_THEME.blue });
  return lineY - 20;
}

/** Cabeçalho compacto de páginas de continuação. Retorna o `y` inicial. */
export function drawContinuationHeader(page: PDFPage, fonts: ReportFonts, label: string): number {
  const H = page.getHeight();
  const MARGIN = PAGE.MARGIN;
  page.drawText(`${label} (continuação)`, { x: MARGIN, y: H - MARGIN, size: 8, font: fonts.regular, color: PDF_THEME.gray });
  return H - MARGIN - 16;
}

/** Título de seção (azul, caixa-alta). Retorna o `y` após o título. */
export function drawSectionTitle(page: PDFPage, fonts: ReportFonts, y: number, text: string): number {
  page.drawText(text.toUpperCase(), { x: PAGE.MARGIN, y, size: 10, font: fonts.bold, color: PDF_THEME.blue });
  return y - 16;
}

/** Lista de indicadores "Rótulo: valor". Retorna o `y` após a lista. */
export function drawKeyValues(
  page: PDFPage,
  fonts: ReportFonts,
  y: number,
  pairs: Array<{ label: string; value: string }>,
  labelWidth = 170,
): number {
  pairs.forEach(({ label, value }) => {
    page.drawText(`${label}:`, { x: PAGE.MARGIN, y, size: 8.5, font: fonts.bold, color: PDF_THEME.ink });
    page.drawText(value, { x: PAGE.MARGIN + labelWidth, y, size: 8.5, font: fonts.regular, color: PDF_THEME.ink });
    y -= 13;
  });
  return y;
}

/**
 * Gráfico de barras horizontais (on-brand, azul). Cada item vira uma barra
 * proporcional ao valor, com rótulo à esquerda e valor à direita. Retorna o `y`.
 */
export function drawHBars(
  page: PDFPage,
  fonts: ReportFonts,
  y: number,
  data: Array<{ label: string; value: number; sub?: string }>,
  opts?: { color?: ReturnType<typeof rgb>; labelW?: number; rowH?: number },
): number {
  const MARGIN = PAGE.MARGIN;
  const W = page.getWidth();
  const color = opts?.color ?? PDF_THEME.blue;
  const labelW = opts?.labelW ?? 150;
  const rowH = opts?.rowH ?? 16;
  const max = Math.max(1, ...data.map((d) => d.value));
  const barX = MARGIN + labelW + 6;
  const barMaxW = Math.max(40, W - MARGIN - barX - 64);

  data.forEach((d) => {
    const label = d.label.length > 26 ? d.label.slice(0, 25) + '…' : d.label;
    page.drawText(label, { x: MARGIN, y: y - 9, size: 8, font: fonts.regular, color: PDF_THEME.ink });
    page.drawRectangle({ x: barX, y: y - rowH + 4, width: barMaxW, height: 8, color: PDF_THEME.rowAlt });
    const w = Math.max(2, (d.value / max) * barMaxW);
    page.drawRectangle({ x: barX, y: y - rowH + 4, width: w, height: 8, color });
    page.drawText(d.sub ?? String(d.value), { x: barX + barMaxW + 6, y: y - 9, size: 8, font: fonts.bold, color: PDF_THEME.ink });
    y -= rowH;
  });
  return y - 4;
}

/** Divisória horizontal suave. Retorna o `y` após a linha. */
export function drawDivider(page: PDFPage, y: number): number {
  page.drawRectangle({ x: PAGE.MARGIN, y, width: PAGE.W - PAGE.MARGIN * 2, height: 0.7, color: PDF_THEME.line });
  return y - 15;
}

/** Rodapé padrão em todas as páginas: confidencial (esq.) + paginação (dir.). */
export function addStandardFooters(doc: PDFDocument, fonts: ReportFonts) {
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    pg.drawText('Kaizen Axis — Confidencial', { x: PAGE.MARGIN, y: 20, size: 7, font: fonts.regular, color: PDF_THEME.gray });
    const label = `Página ${i + 1} de ${pages.length}`;
    const w = fonts.regular.widthOfTextAtSize(label, 7);
    pg.drawText(label, { x: pg.getWidth() - PAGE.MARGIN - w, y: 20, size: 7, font: fonts.regular, color: PDF_THEME.gray });
  });
}

/** Salva e dispara o download do PDF no navegador. */
export async function downloadPdf(doc: PDFDocument, filename: string) {
  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
