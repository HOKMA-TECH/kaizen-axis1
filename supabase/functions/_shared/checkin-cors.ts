const PRODUCTION_ORIGINS = new Set([
  'https://app.imobkaizen.com.br',
]);

export function isAllowedCheckinOrigin(
  origin: string | null,
  configuredOrigins = '',
): boolean {
  if (!origin) return false;
  if (PRODUCTION_ORIGINS.has(origin)) return true;
  if (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000') return true;

  const allowedFromEnvironment = configuredOrigins
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return allowedFromEnvironment.includes(origin);
}
