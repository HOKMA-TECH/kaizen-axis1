import assert from 'node:assert/strict';
import { getChatAudioExtension, getSupportedChatAudioMimeType } from './chat-audio';

assert.equal(
  getSupportedChatAudioMimeType(mimeType => mimeType === 'audio/webm'),
  'audio/webm',
  'audio recording should prefer the bucket-allowed webm format when available'
);

assert.equal(
  getSupportedChatAudioMimeType(mimeType => mimeType === 'audio/mp4'),
  'audio/mp4',
  'audio recording should still support Safari/iOS mp4 audio'
);

assert.equal(getChatAudioExtension('audio/webm;codecs=opus'), 'webm');
assert.equal(getChatAudioExtension('audio/mp4'), 'm4a');

console.log('chat-audio tests passed');
