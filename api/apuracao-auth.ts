export const APURACAO_ALLOWED_ROLES = [
  'ADMIN',
  'DIRETOR',
  'GERENTE',
  'COORDENADOR',
  'ANALISTA',
] as const;

export type ApuracaoAllowedRole = (typeof APURACAO_ALLOWED_ROLES)[number];

export function isApuracaoRoleAllowed(role: unknown): boolean {
  const normalized = String(role ?? '').trim().toUpperCase();
  return (APURACAO_ALLOWED_ROLES as readonly string[]).includes(normalized);
}
