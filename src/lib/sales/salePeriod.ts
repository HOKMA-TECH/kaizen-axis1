type SaleClientLike = {
  stage?: string | null;
  createdAt?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
};

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getSaleReferenceDate(client: SaleClientLike): string | null {
  return client.closed_at || client.updated_at || null;
}

export function isSameMonth(date: Date, referenceDate: Date): boolean {
  return date.getFullYear() === referenceDate.getFullYear()
    && date.getMonth() === referenceDate.getMonth();
}

export function isSaleInCurrentMonth(client: SaleClientLike, now = new Date()): boolean {
  if (client.stage !== 'Concluído') return false;

  const saleDate = parseDate(getSaleReferenceDate(client));
  if (!saleDate) return false;

  return isSameMonth(saleDate, now);
}
