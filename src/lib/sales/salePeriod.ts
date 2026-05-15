type SaleClientLike = {
  stage?: string | null;
  createdAt?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
  history?: Array<{
    date?: string | null;
    action?: string | null;
  }> | null;
};

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const ptBrMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2}))?/);
  if (ptBrMatch) {
    const [, day, month, year, hour = '0', minute = '0'] = ptBrMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeText(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isConclusionHistoryAction(action?: string | null): boolean {
  const normalized = normalizeText(action);
  return normalized.includes('conclu');
}

function getConclusionHistoryDate(client: SaleClientLike): string | null {
  const history = Array.isArray(client.history) ? client.history : [];
  const conclusionDates = history
    .filter((entry) => isConclusionHistoryAction(entry.action))
    .map((entry) => ({ raw: entry.date || null, parsed: parseDate(entry.date) }))
    .filter((entry): entry is { raw: string; parsed: Date } => Boolean(entry.raw && entry.parsed))
    .sort((a, b) => b.parsed.getTime() - a.parsed.getTime());

  return conclusionDates[0]?.raw ?? null;
}

export function getSaleReferenceDate(client: SaleClientLike): string | null {
  return client.closed_at || getConclusionHistoryDate(client);
}

export function isSameMonth(date: Date, referenceDate: Date): boolean {
  return date.getFullYear() === referenceDate.getFullYear()
    && date.getMonth() === referenceDate.getMonth();
}

export function isSaleInCurrentMonth(client: SaleClientLike, now = new Date()): boolean {
  if (client.stage !== 'Concluído') return false;

  const saleDate = parseDate(getDashboardSaleDate(client, now));
  if (!saleDate) return false;

  return isSameMonth(saleDate, now);
}

export function getDashboardSaleDate(client: SaleClientLike, _now = new Date()): string | null {
  return getSaleReferenceDate(client);
}
