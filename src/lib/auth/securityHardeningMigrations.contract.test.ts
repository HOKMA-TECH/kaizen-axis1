import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function readMigration(name: string) {
  return readFileSync(join(root, 'supabase/migrations', name), 'utf8');
}

describe('security hardening migrations', () => {
  it('revokes operational rpcs from authenticated without rewriting fazer_checkin body', () => {
    const sql = readMigration('20260909121000_revoke_legacy_operational_rpcs.sql');
    assert.match(sql, /fazer_checkin/);
    assert.match(sql, /distribute_lead/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION %s TO service_role/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.fazer_checkin/);
  });

  it('binds report rpcs to admin or diretor via auth.uid', () => {
    const sql = readMigration('20260909122000_harden_report_rpcs.sql');
    assert.match(sql, /app_require_admin_or_diretor/);
    assert.match(sql, /p_caller_id é ignorado/);
    assert.match(sql, /get_xp_report/);
    assert.match(sql, /get_relatorio_diretoria/);
    assert.doesNotMatch(sql, /p_directorate := v_dir_id/);
  });

  it('keeps hierarchy helper execute for authenticated and requires caller uuid', () => {
    const sql = readMigration('20260909123000_bind_hierarchy_helpers_to_caller.sql');
    assert.match(sql, /p_manager_id IS DISTINCT FROM auth\.uid\(\)/);
    assert.match(sql, /p_diretor_id IS DISTINCT FROM auth\.uid\(\)/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_manager_corretor_ids\(uuid\) TO authenticated, service_role/);
  });

  it('hides checkin coordinates and adds reception roles without dropping today queue', () => {
    const sql = readMigration('20260909124000_hide_checkin_coordinates.sql');
    assert.match(sql, /REVOKE SELECT \(latitude, longitude\)/);
    assert.match(sql, /RECEPCAO_NI/);
    assert.match(sql, /checkin_date = CURRENT_DATE/);
  });

  it('restricts pending profiles from business tables', () => {
    const sql = readMigration('20260909220000_active_profile_restrictive_rls.sql');
    assert.match(sql, /app_current_user_is_active/);
    assert.match(sql, /AS RESTRICTIVE/);
  });

  it('revokes global QR and scopes diretor in helpers', () => {
    const sql = readMigration('20260910000000_residual_security_hardening.sql');
    assert.match(sql, /get_or_create_daily_qr/);
    assert.match(sql, /app_current_user_role\(\) = 'DIRETOR'/);
    assert.doesNotMatch(sql, /checkin_date = CURRENT_DATE/);
    assert.match(sql, /app.settings.service_role_key/);
    assert.match(sql, /storage.foldername\(name\)\)\[1\]/);
  });

  it('restores avatars bucket writes to the caller folder and public reads', () => {
    const sql = readMigration('20260909130000_restore_avatars_storage_policies.sql');
    assert.match(sql, /bucket_id = 'avatars'/);
    assert.match(sql, /Users can upload own avatar/);
    assert.match(sql, /Users can update own avatar/);
    assert.match(sql, /Users can delete own avatar/);
    assert.match(sql, /Public can read avatars/);
    assert.match(sql, /split_part\(storage\.objects\.name, '\/', 1\) = auth\.uid\(\)::text/);
  });
});
