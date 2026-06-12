import type { jsPDF } from 'jspdf';

/**
 * Equivalente do reportKit para PDFs gerados com jsPDF (ex.: Apuração de Renda).
 * Mantém o mesmo padrão visual: paleta branco + azul, logo da Kaizen no
 * cabeçalho e rodapé "Confidencial / Página X de Y". Unidade: mm (A4 = 210×297).
 */
export const JS_BLUE: [number, number, number] = [37, 99, 235];   // #2563eb
export const JS_GRAY: [number, number, number] = [110, 116, 128];
export const JS_INK: [number, number, number] = [20, 24, 33];
const A4_W = 210;
const MARGIN = 14;

let logoCache: string | null | undefined;

/** Carrega o logo (public/pwa-512x512.png) como dataURL, com cache. */
export async function loadLogoDataUrl(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch('/pwa-512x512.png');
    if (!res.ok) { logoCache = null; return null; }
    const blob = await res.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/** Cabeçalho padrão (logo + título azul + divisória). Retorna o `y` do conteúdo (mm). */
export function drawJsHeader(doc: jsPDF, opts: { title: string; subtitle?: string; logo?: string | null }): number {
  let textX = MARGIN;
  if (opts.logo) {
    try { doc.addImage(opts.logo, 'PNG', MARGIN, 10, 13, 13); textX = MARGIN + 18; } catch { /* noop */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...JS_BLUE);
  doc.text(opts.title, textX, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...JS_GRAY);
  let line = 22.5;
  if (opts.subtitle) { doc.text(opts.subtitle, textX, line); line += 5; }
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, textX, line);

  doc.setDrawColor(...JS_BLUE);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 30, A4_W - MARGIN, 30);

  doc.setTextColor(...JS_INK);
  return 40;
}

/** Título de seção em azul. Retorna o `y` após o título. */
export function drawJsSection(doc: jsPDF, y: number, text: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...JS_BLUE);
  doc.text(text.toUpperCase(), MARGIN, y);
  doc.setTextColor(...JS_INK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  return y + 7;
}

/** Rodapé padrão em todas as páginas. */
export function addJsFooters(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...JS_GRAY);
    doc.text('Kaizen Axis — Confidencial', MARGIN, 290);
    const label = `Página ${i} de ${pages}`;
    doc.text(label, A4_W - MARGIN - doc.getTextWidth(label), 290);
  }
  doc.setTextColor(...JS_INK);
}
