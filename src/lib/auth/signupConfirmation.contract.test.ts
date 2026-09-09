import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('signup confirmation wiring', () => {
  it('does not call native supabase.auth.signUp from the login form', () => {
    const login = readFileSync(join(root, 'src/pages/Login.tsx'), 'utf8');
    assert.doesNotMatch(login, /supabase\.auth\.signUp/);
    assert.match(login, /send-signup-confirmation/);
  });

  it('sends confirmation through generateLink and Resend', () => {
    const source = readFileSync(
      join(root, 'supabase/functions/send-signup-confirmation/index.ts'),
      'utf8',
    );
    assert.match(source, /type:\s*'signup'/);
    assert.match(source, /generateLink/);
    assert.match(source, /api\.resend\.com\/emails/);
    assert.match(source, /REQUIRE_CAPTCHA/);
    assert.match(source, /increment_request_counter/);
    assert.match(source, /if \(requireCaptcha && turnstileSecret\)/);
    assert.doesNotMatch(source, /noreply@kaizen-axis\.space/);
  });

  it('creates a pending profile before sending the confirmation email', () => {
    const source = readFileSync(
      join(root, 'supabase/functions/send-signup-confirmation/index.ts'),
      'utf8',
    );
    assert.match(source, /from\('profiles'\)/);
    assert.match(source, /status:\s*'pending'/);
    assert.match(source, /checkin_unit_code:\s*'zona_oeste'/);
    assert.match(source, /role:\s*'CORRETOR'/);
    assert.match(source, /ignoreDuplicates:\s*true|ON CONFLICT|maybeSingle/);
    const upsertAt = source.search(/from\('profiles'\)/);
    const resendAt = source.indexOf('api.resend.com/emails');
    assert.ok(upsertAt >= 0 && resendAt > upsertAt, 'profile must be created before Resend');
  });

  it('escapes the signup name in HTML email only', () => {
    const source = readFileSync(
      join(root, 'supabase/functions/send-signup-confirmation/index.ts'),
      'utf8',
    );
    assert.match(source, /function escapeHtml/);
    assert.match(source, /greetingHtml/);
    assert.match(source, /replaceAll\('&', '&amp;'\)/);
    assert.match(source, /replaceAll\('<'/);
    assert.match(source, /greetingText/);
  });
});
