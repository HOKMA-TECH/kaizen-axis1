export function parseDateOnlyLocal(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
}

export function parseDateOnlyLocalEnd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 23, 59, 59, 999);
}

export function toDateOnlyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toPtBrDate(ymd: string): string {
  const dt = parseDateOnlyLocal(ymd);
  return dt.toLocaleDateString('pt-BR');
}
