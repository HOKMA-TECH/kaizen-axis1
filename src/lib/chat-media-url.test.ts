import assert from 'node:assert/strict';
import { isTrustedMediaUrl, isValidChatMediaConversationSegment } from './chat-media-url.ts';

assert.equal(isTrustedMediaUrl('blob:http://localhost:3000/1234'), true);
assert.equal(isTrustedMediaUrl('javascript:alert(1)'), false);
assert.equal(isValidChatMediaConversationSegment('group-1234'), true);
assert.equal(isValidChatMediaConversationSegment('user_a_user_b'), true);
assert.equal(isValidChatMediaConversationSegment('../secret'), false);
