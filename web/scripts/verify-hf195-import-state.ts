#!/usr/bin/env npx tsx
/**
 * HF-195 Phase 6 — Tenant-agnostic import-state verification (read-only).
 *
 * Reports structural counts and anomaly flags for committed_data rows in a
 * given tenant and data_band. No field values are emitted; row id samples
 * only. Re-usable across Phase 6B (roster band), 6C (transaction bands),
 * and 6D import-side verification (plan band, if applicable).
 *
 * Usage:
 *   npx tsx scripts/verify-hf195-import-state.ts <tenant_id> <data_band>
 *
 * Both parameters are runtime-supplied. The data_band parameter is matched
 * exactly against committed_data.data_type. No aliasing, no inference, no
 * hardcoded band-name resolution. If a tenant's import flow stores the
 * supplied band under a different data_type granularity, the discovery
 * output (distinct data_type inventory) lets the architect observe the
 * actual values present and re-invoke with the correct band name.
 *
 * Korean Test (Rule 27 / IGF-T1-E910) compliance:
 *   - Zero hardcoded tenant identifiers
 *   - Zero hardcoded band names or band-name aliases
 *   - Zero hardcoded sheet-name or component-name inferences
 *   - No legacy primitive-name string literals
 *
 * Read-only contract:
 *   - Service-role client used for SELECT only
 *   - Zero INSERT, UPDATE, DELETE, RPC mutations, or schema changes
 *
 * Output contract (per HF-195 Phase 6 directive):
 *   - total_rows                  : count of committed_data rows for (tenant_id, data_band)
 *   - resolved_entity_rows        : rows with non-null entity_id
 *   - null_entity_rows            : rows with null entity_id
 *   - distinct_entity_ids         : count of distinct non-null entity_ids
 *   - distinct_data_types_in_tenant : count of distinct data_type values present in tenant
 *                                    (discovery hint for granularity mismatch)
 *   - data_type_inventory         : sorted list of distinct data_type values (ids only)
 *   - distinct_source_dates       : count of distinct source_date values for the band
 *   - rows_per_source_date        : per-date row counts (transaction band useful; entity band harmless)
 *   - sample_row_ids              : up to 5 row UUIDs (id only — no field values)
 *   - structural_anomaly_flags    : ZERO_ROWS | ALL_NULL_ENTITY | PARTIAL_RESOLUTION | (none)
 *
 * Exit codes:
 *   0 = query succeeded (with or without anomaly flags — flags are structural,
 *       not failures; architect interprets)
 *   1 = query error (Supabase, network, schema)
 *   2 = invalid invocation (missing args, malformed UUID, missing env vars)
 */

import { createClient } from '@supabase/supabase-js';

const PAGE = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Args {
  tenantId: string;
  dataBand: string;
}

function parseArgs(): Args {
  const [, , tenantId, dataBand] = process.argv;
  if (!tenantId || !dataBand) {
    console.error('Usage: npx tsx scripts/verify-hf195-import-state.ts <tenant_id> <data_band>');
    process.exit(2);
  }
  if (!UUID_RE.test(tenantId)) {
    console.error(`tenant_id is not a UUID: ${tenantId}`);
    process.exit(2);
  }
  if (dataBand.length === 0) {
    console.error('data_band must be a non-empty string');
    process.exit(2);
  }
  return { tenantId, dataBand };
}

function getEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing required env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY');
    console.error('Run: set -a && source .env.local && set +a');
    process.exit(2);
  }
  return { url, key };
}

async function main() {
  const { tenantId, dataBand } = parseArgs();
  const { url, key } = getEnv();

  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  HF-195 Phase 6 — Import-State Verification (Read-Only)   ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  tenant_id : ${tenantId}`);
  console.log(`  data_band : ${dataBand}`);
  console.log('───────────────────────────────────────────────────────────');

  // 1. Total rows for (tenant_id, data_band) — single round-trip head count.
  const totalQ = await sb
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('data_type', dataBand);
  if (totalQ.error) {
    console.error('total-row query failed:', totalQ.error.message);
    process.exit(1);
  }
  const total = totalQ.count ?? 0;
  console.log(`  total_rows                       : ${total}`);

  // 2. Paginate filtered rows to compute:
  //    - distinct entity_id count
  //    - null-entity row count
  //    - distinct source_date + per-date counts
  //    - first 5 row ids (sample, id-only)
  let nullCount = 0;
  const entitySet = new Set<string>();
  const dateMap = new Map<string, number>();
  const sampleIds: string[] = [];

  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('committed_data')
      .select('id, entity_id, source_date')
      .eq('tenant_id', tenantId)
      .eq('data_type', dataBand)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error('paginated row query failed:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.entity_id == null) {
        nullCount++;
      } else {
        entitySet.add(r.entity_id as string);
      }
      if (r.source_date) {
        const d = r.source_date as string;
        dateMap.set(d, (dateMap.get(d) ?? 0) + 1);
      }
      if (sampleIds.length < 5) {
        sampleIds.push(r.id as string);
      }
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const resolved = total - nullCount;
  console.log(`  resolved_entity_rows             : ${resolved}`);
  console.log(`  null_entity_rows                 : ${nullCount}`);
  console.log(`  distinct_entity_ids              : ${entitySet.size}`);

  // 3. Distinct data_type inventory across the tenant — helps the architect
  //    detect granularity mismatch when total_rows for the supplied band is 0
  //    or unexpectedly low. Paginated; ids only (no row content).
  const allTypes = new Set<string>();
  let offset2 = 0;
  while (true) {
    const { data, error } = await sb
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', tenantId)
      .range(offset2, offset2 + PAGE - 1);
    if (error) {
      console.error('data_type inventory query failed:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const r of data) allTypes.add(r.data_type as string);
    if (data.length < PAGE) break;
    offset2 += PAGE;
  }
  console.log(`  distinct_data_types_in_tenant    : ${allTypes.size}`);
  if (allTypes.size > 0) {
    console.log('  data_type_inventory              :');
    Array.from(allTypes).sort().forEach((t) => console.log(`    - ${t}`));
  }

  // 4. Per-source-date row counts.
  console.log(`  distinct_source_dates            : ${dateMap.size}`);
  if (dateMap.size > 0 && dateMap.size <= 50) {
    console.log('  rows_per_source_date             :');
    Array.from(dateMap.keys()).sort().forEach((d) => {
      console.log(`    - ${d}: ${dateMap.get(d)} rows`);
    });
  } else if (dateMap.size > 50) {
    console.log(`  rows_per_source_date             : (suppressed; ${dateMap.size} distinct dates)`);
  }

  // 5. Sample row ids — id-only, max 5.
  if (sampleIds.length > 0) {
    console.log(`  sample_row_ids (max 5, id-only)  :`);
    sampleIds.forEach((id) => console.log(`    - ${id}`));
  }

  // 6. Structural anomaly flags.
  console.log('───────────────────────────────────────────────────────────');
  const flags: string[] = [];
  if (total === 0) {
    flags.push('ZERO_ROWS');
  } else if (nullCount === total) {
    flags.push('ALL_NULL_ENTITY');
  } else if (nullCount > 0) {
    flags.push('PARTIAL_RESOLUTION');
  }
  if (flags.length === 0) {
    console.log('  structural_anomaly_flags         : (none — full resolution)');
  } else {
    console.log(`  structural_anomaly_flags         : ${flags.join(', ')}`);
  }
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
