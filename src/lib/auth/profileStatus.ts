export function normalizeProfileStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function isPendingStatus(value: unknown): boolean {
  const normalized = normalizeProfileStatus(value);
  return normalized === 'pending' || normalized === 'pendente';
}

export function isActiveStatus(value: unknown): boolean {
  const normalized = normalizeProfileStatus(value);
  return normalized === 'active' || normalized === 'ativo';
}

export function isInactiveStatus(value: unknown): boolean {
  const normalized = normalizeProfileStatus(value);
  return normalized === 'inactive' || normalized === 'inativo';
}
