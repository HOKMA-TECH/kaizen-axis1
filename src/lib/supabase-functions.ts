export function buildAuthenticatedFunctionHeaders({
  accessToken,
  anonKey,
}: {
  accessToken?: string | null;
  anonKey?: string | null;
}) {
  if (!accessToken) {
    throw new Error('Sessao expirada. Faca login novamente para enviar e-mail.');
  }

  if (!anonKey) {
    throw new Error('Configuracao do Supabase ausente. Verifique a chave anonima.');
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: anonKey,
  };
}
