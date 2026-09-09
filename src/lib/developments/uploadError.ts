export type DevelopmentUploadKind = 'image' | 'pdf';

export function formatDevelopmentUploadError(
  message: string | undefined,
  kind: DevelopmentUploadKind,
): string {
  const msg = (message || '').trim();
  const lower = msg.toLowerCase();

  if (
    lower.includes('row-level security') ||
    lower.includes('violates row-level') ||
    lower.includes('new row violates')
  ) {
    return 'Sem permissão para enviar este arquivo. Entre novamente com um perfil ADMIN ou DIRETOR.';
  }

  if (
    lower.includes('mime') ||
    lower.includes('not allowed') ||
    lower.includes('invalid content') ||
    lower.includes('invalid file')
  ) {
    return kind === 'pdf'
      ? 'Envie um PDF. Outros tipos não são aceitos no book.'
      : 'Envie uma imagem (JPG, PNG, WEBP ou GIF).';
  }

  return msg || 'Falha no upload. Tente novamente.';
}
