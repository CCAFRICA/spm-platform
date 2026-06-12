/**
 * DIAG-063 A7 — READ-ONLY probe.
 *
 * The persona-context scope fetch queries profiles with
 *   .eq('auth_user_id', user.id)
 * where user.id is mapProfileToUser's profile.id (= profiles.id, via
 * classifyProfileFetch <- resolveIdentity). The filter key therefore only
 * matches when profiles.id === profiles.auth_user_id for that row.
 *
 * This script quantifies that alignment structurally: counts only, no
 * names/emails/tenant identifiers printed. SELECT-only.
 */
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from('profiles')
    .select('id, auth_user_id, tenant_id, role');

  if (error) {
    console.error('query_error:', error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  const eq = rows.filter((r) => r.id === r.auth_user_id).length;
  const ne = rows.length - eq;

  console.log('profiles total rows:', rows.length);
  console.log('rows where id === auth_user_id:', eq);
  console.log('rows where id !== auth_user_id:', ne);
  console.log('rows with tenant_id IS NULL:', rows.filter((r) => r.tenant_id === null).length);

  const byRole: Record<string, { id_eq_auth: number; id_ne_auth: number }> = {};
  for (const r of rows) {
    const k = String(r.role);
    byRole[k] ??= { id_eq_auth: 0, id_ne_auth: 0 };
    byRole[k][r.id === r.auth_user_id ? 'id_eq_auth' : 'id_ne_auth']++;
  }
  console.log('by role (id vs auth_user_id):', JSON.stringify(byRole, null, 2));
}

main();
