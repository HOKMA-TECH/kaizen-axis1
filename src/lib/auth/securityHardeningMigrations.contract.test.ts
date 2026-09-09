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
});
