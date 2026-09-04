export const CLIENT_DOCUMENT_ACCEPT =
  '.jpg,.jpeg,.jfif,.png,.webp,.gif,.heic,.heif,.pdf,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/*';

const GENERIC_MIME = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/x-citrix-png': 'image/png',
  'application/x-pdf': 'application/pdf',
  'image/heic-sequence': 'image/heic',
  'image/heif-sequence': 'image/heif',
};

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  jpe: 'image/jpeg',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export type SniffedDocumentKind = { mime: string; ext: string };

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function sniffDocumentKind(bytes: Uint8Array): SniffedDocumentKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heif'].includes(brand)) {
      return { mime: 'image/heic', ext: 'heic' };
    }
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
  ) {
    return { mime: 'application/msword', ext: 'doc' };
  }
  return null;
}

function normalizeMime(type?: string | null): string {
  const raw = (type || '').toLowerCase().trim();
  return MIME_ALIASES[raw] || raw;
}

export function isUnknownMimeType(type?: string | null): boolean {
  return GENERIC_MIME.has(normalizeMime(type));
}

function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() || name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function inferDocumentContentType(file: { name: string; type?: string | null }): string {
  const normalized = normalizeMime(file.type);
  if (!isUnknownMimeType(normalized)) return normalized;
  const ext = extensionOf(file.name);
  return EXT_MIME[ext] || 'application/octet-stream';
}

function hasKnownExtension(name: string): boolean {
  return Boolean(EXT_MIME[extensionOf(name)]);
}

function withNameAndType(file: File, name: string, type: string): File {
  if (file.name === name && file.type === type) return file;
  return new File([file], name, { type, lastModified: file.lastModified });
}

function ensureNamedFile(file: File, mime: string, ext: string): File {
  const type = normalizeMime(mime) || mime;
  if (hasKnownExtension(file.name)) return withNameAndType(file, file.name, type);
  const stem = (file.name || 'documento').replace(/\.+$/, '') || 'documento';
  return withNameAndType(file, `${stem}.${ext}`, type);
}

export function withInferredMime(file: File): File {
  const type = inferDocumentContentType(file);
  const ext = MIME_EXT[type] || extensionOf(file.name);
  if (isUnknownMimeType(type) || !ext) return withNameAndType(file, file.name, type);
  return ensureNamedFile(file, type, ext);
}

function isHeicLike(file: File, sniffed?: SniffedDocumentKind | null): boolean {
  if (sniffed?.ext === 'heic') return true;
  const type = inferDocumentContentType(file).toLowerCase();
  const name = file.name.toLowerCase();
  return type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
}

function convertImageFileToJpeg(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Falha ao converter imagem'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Falha ao converter imagem'));
            return;
          }
          const jpegName = file.name.replace(/\.(heic|heif|jpe?g|jfif|png|webp|gif)$/i, '') + '.jpg';
          resolve(new File([blob], jpegName, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Falha ao carregar imagem'));
    };
    img.src = objectUrl;
  });
}

export async function prepareClientUploadFile(file: File): Promise<File> {
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const sniffed = sniffDocumentKind(header);
  const identified = sniffed
    ? ensureNamedFile(file, sniffed.mime, sniffed.ext)
    : withInferredMime(file);

  if (isHeicLike(identified, sniffed)) {
    try {
      return await convertImageFileToJpeg(identified);
    } catch {
      return identified;
    }
  }

  if (isUnknownMimeType(identified.type)) {
    throw new Error('Não foi possível identificar o arquivo. Envie JPG, PNG ou PDF.');
  }

  return identified;
}
