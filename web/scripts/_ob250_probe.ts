import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

function cols(label: string, row: any) {
  if (!row) { console.log(`  [${label}] NO ROW`); return; }
  console.log(`  [${label}] columns: ${JSON.stringify(Object.keys(row))}`);
}

async function oneRow(table: string) {
  const { data, error } = await sb.from(table).select('*').limit(1);
  if (error) { console.log(`  ERROR select-one ${table}: ${error.message}`); return null; }
  return data && data[0] ? data[0] : null;
}

async function count(table: string, filter?: (q: any) => any) {
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: c, error } = await q;
  if (error) return `ERR(${error.message})`;
  return c;
}

async function main() {
  console.log('================ OB-250 SCHEMA PROBE (READ-ONLY) ================');

  // ---------------- 1. tenants ----------------
  console.log('\n========== 1. tenants ==========');
  const tRow = await oneRow('tenants');
  cols('tenants', tRow);
  console.log(`  count(tenants) = ${await count('tenants')}`);
  // try to find settings/config/features JSONB columns and sample non-null
  if (tRow) {
    const candidateSettingsCols = Object.keys(tRow).filter(k => /setting|config|feature|flag|scanner|mode|prism|enforce|interim/i.test(k));
    console.log(`  candidate settings/config/feature columns: ${JSON.stringify(candidateSettingsCols)}`);
    const { data: allT } = await sb.from('tenants').select('*').limit(50);
    if (allT) {
      for (const c of candidateSettingsCols) {
        const nonNull = allT.filter((r: any) => r[c] !== null && r[c] !== undefined);
        console.log(`    column "${c}": ${nonNull.length}/${allT.length} non-null (of sampled). sample non-null values:`);
        nonNull.slice(0, 5).forEach((r: any) => console.log(`      tenant ${r.id ?? r.tenant_id ?? '?'} (${r.name ?? r.slug ?? ''}): ${JSON.stringify(r[c])}`));
      }
      // Also dump full sample of any JSONB-looking column values across all columns to spot scanner mode
      console.log('  --- scan ALL columns for any value mentioning scanner/enforce/interim/prism/mode ---');
      for (const r of allT) {
        for (const k of Object.keys(r)) {
          const v = r[k];
          if (v && typeof v === 'object') {
            const s = JSON.stringify(v);
            if (/scan|enforce|interim|prism|mode/i.test(s)) {
              console.log(`    tenant ${r.id ?? r.tenant_id} col "${k}": ${s}`);
            }
          } else if (typeof v === 'string' && /scan|enforce|interim|prism/i.test(v)) {
            console.log(`    tenant ${r.id ?? r.tenant_id} col "${k}" (string): ${v}`);
          }
        }
      }
      // dump first 3 tenants fully so we can see structure of any JSONB settings
      console.log('  --- first 3 tenant rows (full) ---');
      allT.slice(0, 3).forEach((r: any) => console.log(`    ${JSON.stringify(r)}`));
    }
  }

  // tenant_settings separate table?
  console.log('\n  -- probe tenant_settings table --');
  const tsRow = await oneRow('tenant_settings');
  if (tsRow) {
    cols('tenant_settings', tsRow);
    console.log(`  count(tenant_settings) = ${await count('tenant_settings')}`);
    const { data: tsAll } = await sb.from('tenant_settings').select('*').limit(50);
    console.log('  --- sample tenant_settings rows ---');
    (tsAll || []).slice(0, 10).forEach((r: any) => console.log(`    ${JSON.stringify(r)}`));
  } else {
    console.log('  tenant_settings: no row or table absent (see error above)');
  }

  // ---------------- 2. profiles ----------------
  console.log('\n========== 2. profiles ==========');
  const pRow = await oneRow('profiles');
  cols('profiles', pRow);
  console.log(`  count(profiles) = ${await count('profiles')}`);
  if (pRow) {
    const { data: pAll } = await sb.from('profiles').select('*').limit(500);
    if (pAll) {
      const roles = new Set<string>();
      pAll.forEach((r: any) => roles.add(String(r.role)));
      console.log(`  distinct role values (sampled ${pAll.length}): ${JSON.stringify([...roles])}`);
      // capabilities shape
      const capCol = Object.keys(pRow).find(k => /capab/i.test(k));
      console.log(`  capabilities column: ${capCol}`);
      if (capCol) {
        const sample = pAll.filter((r: any) => r[capCol] != null).slice(0, 6);
        sample.forEach((r: any) => console.log(`    role=${r.role} ${capCol}=${JSON.stringify(r[capCol])}`));
      }
    }
  }

  // ---------------- 3. file_objects ----------------
  console.log('\n========== 3. file_objects ==========');
  const foRow = await oneRow('file_objects');
  cols('file_objects', foRow);
  console.log(`  count(file_objects) = ${await count('file_objects')}`);
  if (foRow) {
    const { data: foAll } = await sb.from('file_objects').select('*').limit(2000);
    if (foAll) {
      const stateCol = Object.keys(foRow).find(k => /^state$|status/i.test(k)) || 'state';
      const byState: Record<string, number> = {};
      foAll.forEach((r: any) => { const s = String(r[stateCol]); byState[s] = (byState[s] || 0) + 1; });
      console.log(`  distinct "${stateCol}" values + counts (sampled ${foAll.length}): ${JSON.stringify(byState)}`);
      // clean_path + import_batch_id presence per state
      const cleanPathCol = Object.keys(foRow).find(k => /clean.*path|promoted.*path|clean_path/i.test(k));
      const batchCol = Object.keys(foRow).find(k => /import_batch|batch_id/i.test(k));
      console.log(`  clean_path-like column: ${cleanPathCol} ; import_batch-like column: ${batchCol}`);
      // For each state, show how many have clean_path set and batch set
      for (const st of Object.keys(byState)) {
        const rows = foAll.filter((r: any) => String(r[stateCol]) === st);
        const withClean = cleanPathCol ? rows.filter((r: any) => r[cleanPathCol] != null).length : 0;
        const withBatch = batchCol ? rows.filter((r: any) => r[batchCol] != null).length : 0;
        console.log(`    state="${st}": n=${rows.length}, withClean(${cleanPathCol})=${withClean}, withBatch(${batchCol})=${withBatch}`);
      }
      // sample one clean/promoted row fully
      const cleanLike = foAll.find((r: any) => /clean|promot|ready|scanned|available/i.test(String(r[stateCol])));
      if (cleanLike) console.log(`  --- sample clean/promoted-like file_object row ---\n    ${JSON.stringify(cleanLike)}`);
      else console.log(`  --- sample file_object row ---\n    ${JSON.stringify(foAll[0])}`);
    }
  }

  // ---------------- 4. committed_data ----------------
  console.log('\n========== 4. committed_data ==========');
  const cdRow = await oneRow('committed_data');
  cols('committed_data', cdRow);
  console.log(`  count(committed_data) = ${await count('committed_data')}`);
  if (cdRow) console.log(`  --- sample committed_data row ---\n    ${JSON.stringify(cdRow)}`);

  // ---------------- 5. import_batches ----------------
  console.log('\n========== 5. import_batches ==========');
  const ibRow = await oneRow('import_batches');
  cols('import_batches', ibRow);
  console.log(`  count(import_batches) = ${await count('import_batches')}`);
  if (ibRow) {
    const linkCols = Object.keys(ibRow).filter(k => /file|object|source|upload/i.test(k));
    console.log(`  file/source-link candidate columns: ${JSON.stringify(linkCols)}`);
    console.log(`  --- sample import_batches row ---\n    ${JSON.stringify(ibRow)}`);
  }

  // ---------------- 6. audit/events tables ----------------
  console.log('\n========== 6. audit / events tables ==========');
  for (const t of ['platform_events', 'audit_log', 'file_audit', 'tenant_settings_audit', 'events', 'audit_events']) {
    const r = await oneRow(t);
    if (r) {
      cols(t, r);
      console.log(`    count(${t}) = ${await count(t)}`);
      console.log(`    --- sample ${t} row ---\n      ${JSON.stringify(r)}`);
      // distinct event type values if present
      const typeCol = Object.keys(r).find(k => /type|event|action|kind/i.test(k));
      if (typeCol) {
        const { data: evAll } = await sb.from(t).select(typeCol).limit(500);
        if (evAll) {
          const types = new Set<string>();
          evAll.forEach((x: any) => types.add(String(x[typeCol])));
          console.log(`    distinct "${typeCol}" (sampled ${evAll.length}): ${JSON.stringify([...types].slice(0, 60))}`);
        }
      }
    } else {
      console.log(`  ${t}: absent / no row`);
    }
  }

  console.log('\n================ END OB-250 PROBE ================');
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
