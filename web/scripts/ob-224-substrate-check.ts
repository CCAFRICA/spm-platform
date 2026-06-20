#!/usr/bin/env npx tsx
/**
 * OB-224 substrate check (read-only). Inspects the LIVE Supabase DB defensively
 * since supabase-js cannot run raw GROUP BY SQL.
 *
 * Implements the 6 directive queries in JS:
 *  A. List tenants (id,name).
 *  B. For a set of tables: existence + total row count, per-tenant counts, sample columns.
 *  C. (HALT-2) inspect calculation_results.components shape — array of objects? flat number?
 *  D. inspect one full calculation_traces row (exact column names).
 *  E. resolve testing tenant ids (BCL, MIR, Meridian, Pipeline Test Co) by name match.
 *
 * Never crashes on a missing table: every call wrapped in try/catch.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type Rec = Record<string, unknown>;

const TABLES = [
  'calculation_traces',
  'entity_period_outcomes',
  'profile_scope',
  'entity_relationships',
  'committed_data',
  'calculation_results',
  'disputes',
] as const;

function isMissingTableError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message || '').toLowerCase();
  return (
    m.includes('does not exist') ||
    m.includes('relation') ||
    m.includes('schema cache') ||
    m.includes('could not find the table') ||
    err.code === '42P01' ||
    err.code === 'PGRST205'
  );
}

function isMissingColumnError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message || '').toLowerCase();
  return (
    m.includes('column') ||
    m.includes('does not exist') ||
    err.code === '42703' ||
    err.code === 'PGRST204'
  );
}

const out: string[] = [];
function log(...args: unknown[]) {
  const line = args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  out.push(line);
  console.log(line);
}

async function main() {
  log('========================================================================');
  log('OB-224 SUBSTRATE CHECK  —  ' + new Date().toISOString());
  log('========================================================================');

  // -------------------------------------------------------------------------
  // QUERY A: tenants
  // -------------------------------------------------------------------------
  log('');
  log('### QUERY A: tenants (id,name) ###');
  let tenants: { id: string; name: string }[] = [];
  try {
    const { data, error } = await supabase.from('tenants').select('id,name');
    if (error) {
      log('  ERROR reading tenants:', error.message);
    } else {
      tenants = (data || []) as { id: string; name: string }[];
      for (const t of tenants) log(`  - ${t.name}  =>  ${t.id}`);
      log(`  TOTAL tenants: ${tenants.length}`);
    }
  } catch (e) {
    log('  EXCEPTION reading tenants:', (e as Error).message);
  }

  // -------------------------------------------------------------------------
  // QUERY B: per-table existence + totals + per-tenant counts + sample columns
  // -------------------------------------------------------------------------
  for (const T of TABLES) {
    log('');
    log(`### TABLE: ${T} ###`);

    // Existence + total
    let exists = false;
    let totalRows = -1;
    try {
      const { count, error } = await supabase
        .from(T)
        .select('*', { count: 'exact', head: true });
      if (error) {
        if (isMissingTableError(error)) {
          log(`  exists: false  (${error.message})`);
          continue;
        }
        log(`  exists: UNKNOWN  count error: ${error.message}`);
        // still attempt to probe columns below
        exists = true;
      } else {
        exists = true;
        totalRows = count ?? -1;
        log(`  exists: true   totalRows: ${totalRows}`);
      }
    } catch (e) {
      log(`  EXCEPTION on existence probe: ${(e as Error).message}`);
      continue;
    }

    // Sample columns (do this before per-tenant so we can detect tenant_id col)
    let sampleColumns: string[] = [];
    let hasTenantIdCol = false;
    try {
      const { data, error } = await supabase.from(T).select('*').limit(1);
      if (error) {
        log(`  sampleColumns: ERROR ${error.message}`);
      } else if (data && data.length > 0) {
        sampleColumns = Object.keys(data[0] as Rec);
        hasTenantIdCol = sampleColumns.includes('tenant_id');
        log(`  sampleColumns (${sampleColumns.length}): ${sampleColumns.join(', ')}`);
        log(`  hasTenantIdColumn: ${hasTenantIdCol}`);
      } else {
        log('  sampleColumns: <no rows to sample>');
      }
    } catch (e) {
      log(`  EXCEPTION sampling columns: ${(e as Error).message}`);
    }

    // Per-tenant counts
    log('  per-tenant counts:');
    for (const t of tenants) {
      try {
        const { count, error } = await supabase
          .from(T)
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', t.id);
        if (error) {
          if (isMissingColumnError(error)) {
            log(`    [${t.name}] tenant_id column NOT present on ${T} (${error.message})`);
            // no point looping further if column truly absent
            break;
          }
          log(`    [${t.name}] ERROR: ${error.message}`);
        } else {
          if ((count ?? 0) > 0) log(`    [${t.name}] ${count}`);
          else log(`    [${t.name}] 0`);
        }
      } catch (e) {
        log(`    [${t.name}] EXCEPTION: ${(e as Error).message}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // QUERY C (HALT-2): calculation_results.components exact shape
  // -------------------------------------------------------------------------
  log('');
  log('### QUERY C (HALT-2): calculation_results.components shape ###');
  try {
    const { data, error } = await supabase
      .from('calculation_results')
      .select('*')
      .limit(1);
    if (error) {
      log('  ERROR reading calculation_results:', error.message);
    } else if (!data || data.length === 0) {
      log('  calculation_results: <no rows>');
    } else {
      const row = data[0] as Rec;
      log('  full row keys: ' + Object.keys(row).join(', '));
      if (!('components' in row)) {
        log("  NOTE: no 'components' key on this row. Searching for component-like keys...");
        for (const k of Object.keys(row)) {
          if (/component|breakdown|detail|line/i.test(k)) {
            log(`  candidate key '${k}': ${JSON.stringify(row[k]).slice(0, 600)}`);
          }
        }
      } else {
        const comp = row.components;
        log('  typeof components: ' + typeof comp + (Array.isArray(comp) ? ' (Array)' : ''));
        log('  JSON.stringify(components): ' + JSON.stringify(comp));
        if (Array.isArray(comp)) {
          log(`  components IS an array. length=${comp.length}`);
          if (comp.length > 0 && comp[0] && typeof comp[0] === 'object') {
            log('  element[0] keys: ' + Object.keys(comp[0] as Rec).join(', '));
            log('  element[0] JSON: ' + JSON.stringify(comp[0]));
            // describe key shape across a few elements
            const allKeys = new Set<string>();
            for (const el of comp) {
              if (el && typeof el === 'object') {
                for (const k of Object.keys(el as Rec)) allKeys.add(k);
              }
            }
            log('  union of element keys: ' + Array.from(allKeys).join(', '));
          } else {
            log('  array elements are NOT objects (flat values).');
          }
        } else if (comp && typeof comp === 'object') {
          log('  components is an OBJECT (not array). keys: ' + Object.keys(comp as Rec).join(', '));
        } else {
          log('  components is a FLAT scalar value: ' + JSON.stringify(comp));
        }
      }
    }
  } catch (e) {
    log('  EXCEPTION inspecting components:', (e as Error).message);
  }

  // -------------------------------------------------------------------------
  // QUERY D: one full calculation_traces row
  // -------------------------------------------------------------------------
  log('');
  log('### QUERY D: full calculation_traces row ###');
  try {
    const { count, error: cErr } = await supabase
      .from('calculation_traces')
      .select('*', { count: 'exact', head: true });
    if (cErr && isMissingTableError(cErr)) {
      log('  calculation_traces table does not exist: ' + cErr.message);
    } else {
      log('  calculation_traces total rows: ' + (count ?? 'unknown'));
      const { data, error } = await supabase
        .from('calculation_traces')
        .select('*')
        .limit(1);
      if (error) {
        log('  ERROR reading a trace row: ' + error.message);
      } else if (!data || data.length === 0) {
        log('  calculation_traces: <no rows to sample>');
      } else {
        const row = data[0] as Rec;
        log('  column names: ' + Object.keys(row).join(', '));
        log('  full row JSON: ' + JSON.stringify(row, null, 2));
        // highlight semantically interesting columns
        for (const k of Object.keys(row)) {
          if (/formula|input|output|step|component|result|committed|entity|period|trace|value|attribut/i.test(k)) {
            const v = JSON.stringify(row[k]);
            log(`  [interesting] ${k} = ${v && v.length > 400 ? v.slice(0, 400) + '…' : v}`);
          }
        }
      }
    }
  } catch (e) {
    log('  EXCEPTION inspecting calculation_traces:', (e as Error).message);
  }

  // -------------------------------------------------------------------------
  // QUERY E: resolve testing tenant ids
  // -------------------------------------------------------------------------
  log('');
  log('### QUERY E: resolve testing tenant ids ###');
  const PIPELINE_KNOWN = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
  const resolved: Record<string, { id: string; name: string } | null> = {
    bcl: null,
    mir: null,
    meridian: null,
    pipeline: null,
  };
  for (const t of tenants) {
    const n = (t.name || '').toLowerCase();
    if (resolved.bcl === null && (n.includes('bcl') || n.includes('bay club') || n.includes('bayclub'))) {
      resolved.bcl = { id: t.id, name: t.name };
    }
    if (resolved.mir === null && (n.includes('mir') || n.includes('miró') || n.includes('miro'))) {
      resolved.mir = { id: t.id, name: t.name };
    }
    if (resolved.meridian === null && n.includes('meridian')) {
      resolved.meridian = { id: t.id, name: t.name };
    }
    if (
      resolved.pipeline === null &&
      (n.includes('pipeline') || t.id === PIPELINE_KNOWN)
    ) {
      resolved.pipeline = { id: t.id, name: t.name };
    }
  }
  // Pipeline fallback to the documented id even if not found by name
  if (resolved.pipeline === null) {
    const byId = tenants.find((t) => t.id === PIPELINE_KNOWN);
    if (byId) resolved.pipeline = { id: byId.id, name: byId.name };
  }
  for (const [k, v] of Object.entries(resolved)) {
    log(`  ${k}: ${v ? `${v.name} => ${v.id}` : 'NOT FOUND'}`);
  }

  log('');
  log('========================================================================');
  log('END OF OB-224 SUBSTRATE CHECK');
  log('========================================================================');
}

main().catch((e) => {
  console.error('FATAL (top-level):', e);
});
