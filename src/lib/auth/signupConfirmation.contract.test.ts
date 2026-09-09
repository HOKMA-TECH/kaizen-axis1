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
    assert.match(source, /verifyTurnstileToken/);
    assert.match(source, /increment_request_counter/);
    assert.doesNotMatch(source, /REQUIRE_CAPTCHA/);
    assert.doesNotMatch(source, /if \(requireCaptcha && turnstileSecret\)/);
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

  it('wires AdminPanel pending inbox through isPendingStatus', () => {
    const admin = readFileSync(join(root, 'src/pages/admin/AdminPanel.tsx'), 'utf8');
    assert.match(admin, /isPendingStatus/);
    assert.doesNotMatch(admin, /p\.status === 'pending' \|\| p\.status === 'Pendente'/);
  });

  it('attaches handle_new_user to auth.users and backfills orphans', () => {
    const sql = readFileSync(
      join(root, 'supabase/migrations/20260906140000_handle_new_user_pending_profile.sql'),
      'utf8',
    );
    assert.match(sql, /CREATE OR REPLACE FUNCTION public.handle_new_user/);
    assert.match(sql, /ON auth.users/);
    assert.match(sql, /'pending'/);
    assert.match(sql, /zona_oeste/);
    assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
    assert.match(sql, /LEFT JOIN public.profiles/);
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
