export async function parseApiResponse<T extends Record<string, unknown>>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.toLowerCase().includes('application/json')) {
    return response.json() as Promise<T>;
  }

  const text = (await response.text().catch(() => '')).trim();
  const fallbackMessage = text
    ? `Erro ${response.status}: ${text}`
    : `Erro ${response.status}: resposta invalida do servidor.`;

  return { erro: fallbackMessage } as unknown as T;
}
