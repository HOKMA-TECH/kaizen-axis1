export type DocumentPreviewKind = 'pdf' | 'image' | 'other';

export function classifyDocumentPreviewKind(fileName: string, mimeType?: string): DocumentPreviewKind {
  const name = (fileName || '').toLowerCase();
  const type = (mimeType || '').toLowerCase();
  if (name.endsWith('.pdf') || type === 'application/pdf' || type.includes('pdf')) return 'pdf';
  if (/\.(jpe?g|png|webp|gif)$/i.test(name) || type.startsWith('image/')) return 'image';
  return 'other';
}
