// OB-204 Phase B — generate role→capabilities SQL literals from deriveCapabilities (single source),
// and pre-flight the data so the constraints won't fail on apply. READ-ONLY.
import { createClient } from '@supabase/supabase-js';
import { deriveCapabilities, resolveRole, CANONICAL_ROLES } from '../src/lib/auth/permissions';
async function main() {
  console.log('=== deriveCapabilities() per canonical role (SQL jsonb literals) ===');
  for (const role of CANONICAL_ROLES) {
    console.log(`  ${role}: '${JSON.stringify(deriveCapabilities(role))}'::jsonb`);
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profs } = await sb.from('profiles').select('id, auth_user_id, role, tenant_id, capabilities');
  console.log(`\n=== PRE-FLIGHT over ${profs?.length ?? 0} profiles ===`);
  // role distribution + shapes
  const roles: Record<string, number> = {}, shapes: Record<string, number> = {};
  const dupAuth = new Map<string, number>();
  let incoherent = 0, nonArray = 0, unresolved = 0;
  for (const p of (profs ?? [])) {
    roles[p.role] = (roles[p.role] ?? 0) + 1;
    const sh = Array.isArray(p.capabilities) ? 'array' : (p.capabilities === null ? 'null' : typeof p.capabilities);
    shapes[sh] = (shapes[sh] ?? 0) + 1;
    if (sh !== 'array') nonArray++;
    dupAuth.set(p.auth_user_id, (dupAuth.get(p.auth_user_id) ?? 0) + 1);
    const canon = resolveRole(p.role);
    if (!canon) unresolved++;
    else if ((canon === 'platform') !== (p.tenant_id === null)) { incoherent++; console.log(`  INCOHERENT id=${p.id} role=${p.role}→${canon} tenant=${p.tenant_id ?? 'NULL'}`); }
  }
  console.log('  roles:', JSON.stringify(roles));
  console.log('  cap shapes:', JSON.stringify(shapes), '| non-array rows to normalize:', nonArray);
  const dups = Array.from(dupAuth.entries()).filter(([, n]) => n > 1);
  console.log('  duplicate auth_user_id groups (UNIQUE blocker):', dups.length, dups.length ? JSON.stringify(dups) : '');
  console.log('  role→tenant incoherent ((role=platform) != (tenant IS NULL)):', incoherent);
  console.log('  unresolved roles (canon CHECK blocker after rename):', unresolved);
  console.log(`\n  CONSTRAINT-SAFE TO APPLY: ${dups.length === 0 && incoherent === 0 && unresolved === 0 ? 'YES (after normalization renames non-canon roles)' : 'NO — resolve above first'}`);
}
main().catch(e => { console.error(e); process.exit(1); });
