const AVATAR_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function getAvatarExtension(file: Pick<File, 'name' | 'type'>): string {
  if (file.type && AVATAR_EXTENSIONS[file.type]) return AVATAR_EXTENSIONS[file.type];
  return file.name.split('.').pop()?.toLowerCase() || 'jpg';
}

export function buildChatAvatarPath(userId: string, file: Pick<File, 'name' | 'type'>, now = Date.now()): string {
  return `${userId}/chat-avatar-${now}.${getAvatarExtension(file)}`;
}

export function isAllowedAvatarMimeType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(AVATAR_EXTENSIONS, type);
}
