export const CHAT_AUDIO_MIME_TYPES = ['audio/webm', 'audio/mp4'] as const;

export function getSupportedChatAudioMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string {
  for (const mimeType of CHAT_AUDIO_MIME_TYPES) {
    try {
      if (isTypeSupported(mimeType)) return mimeType;
    } catch {
      // Ignore browser quirks and try the next format.
    }
  }
  return '';
}

export function getChatAudioExtension(mimeType: string): 'webm' | 'm4a' {
  return mimeType.includes('mp4') || mimeType.includes('aac') ? 'm4a' : 'webm';
}
