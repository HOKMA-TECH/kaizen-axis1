export async function assertActiveProfile(
  client: { from: (table: string) => any },
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const { data, error } = await client
    .from('profiles')
    .select('status')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 500, message: 'Falha ao verificar o perfil.' };
  }
  const status = String(data?.status || '').trim().toLowerCase();
  if (status === 'active' || status === 'ativo') return { ok: true };
  if (status === 'pending' || status === 'pendente') {
    return { ok: false, status: 403, message: 'Sua conta aguarda aprovação.' };
  }
  return { ok: false, status: 403, message: 'Sua conta não está ativa.' };
}
