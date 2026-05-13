// KAI Agent - Calls Supabase Edge Function (OpenAI key stays server-side)

import { supabase } from '@/lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export async function sendMessageToKai(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<string> {
  try {
    // A-08: Pass user JWT so Edge Function can verify the caller is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('unauthenticated');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/kai-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ message, history }),
    });

    if (!res.ok) {
      return 'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em instantes.';
    }

    const data = await res.json();

    if (data.error) {
      return 'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em instantes.';
    }

    return data.response || 'Sem resposta do KAI.';
  } catch {
    return 'Erro de conexão. Verifique sua internet e tente novamente.';
  }
}
