import assert from 'node:assert/strict';
import { buildChatAvatarPath, getAvatarExtension, isAllowedAvatarMimeType } from './avatar-storage';

assert.equal(
  buildChatAvatarPath('user-123', { name: 'foto.png', type: 'image/png' }, 1710000000000),
  'user-123/chat-avatar-1710000000000.png',
  'chat avatar path must start with user id to satisfy avatars bucket RLS'
);

assert.equal(getAvatarExtension({ name: 'foto.jpeg', type: 'image/jpeg' }), 'jpg');
assert.equal(isAllowedAvatarMimeType('image/webp'), true);
assert.equal(isAllowedAvatarMimeType('image/heic'), false);

console.log('avatar-storage tests passed');
