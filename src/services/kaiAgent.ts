// KAI Agent - Calls Supabase Edge Function (OpenAI key stays server-side)

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function sendMessageToKai(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<string> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/kai-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ message, history }),
    });

    const data = await res.json();

    if (data.error) {
      console.error('[KAI] Error:', data.error);
      return 'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em instantes.';
    }

    return data.response || 'Sem resposta do KAI.';
  } catch (error) {
    console.error('[KAI] Network error:', error);
    return 'Erro de conexão. Verifique sua internet e tente novamente.';
  }
}
