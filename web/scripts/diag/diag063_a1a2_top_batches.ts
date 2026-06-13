/**
 * DIAG-063 A1A2 — Scale anchor probe (READ-ONLY).
 * Lists the 10 largest import batches platform-wide by committed_data row count,
 * then structurally investigates how multi-file batches are represented.
 * SELECT-only. No tenant names/slugs queried. File names redacted to length+extension.
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;
const ENUM_RE = /^[a-z0-9_\-]{1,32}$/;

function redactFileName(n: string | null | undefined): string {
  if (!n) return '(null)';
  const ext = n.includes('.') ? n.slice(n.lastIndexOf('.')) : '';
  return `[fname-redacted len=${n.length}]${ext}`;
}

// Keep structure; keep numbers/bools/uuids/timestamps/short enums; redact free-text strings.
function sanitize(v: any, keyHint = ''): any {
  if (v === null || v === undefined) return v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (UUID_RE.test(v) || ISO_RE.test(v)) return v;
    if (/file|name|sheet|label|title/i.test(keyHint)) return redactFileName(v);
    if (ENUM_RE.test(v)) return v;
    return `[str-redacted len=${v.length}]`;
  }
  if (Array.isArray(v)) return v.map((x) => sanitize(x, keyHint));
  if (typeof v === 'object') {
    const out: any = {};
    for (const k of Object.keys(v)) out[k] = sanitize(v[k], k);
    return out;
  }
  return `[type=${typeof v}]`;
}

async function main() {
  // ---- 1. All import_batches ----
  const { data: batches, error } = await sb
    .from('import_batches')
    .select('id, tenant_id, file_name, file_type, row_count, status, created_at, completed_at, metadata')
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) throw error;
  console.log(`import_batches total rows fetched: ${batches!.length}`);

  // ---- 2. Per-batch committed_data count (head:true loop; no GROUP BY in PostgREST) ----
  const counts: Record<string, number> = {};
  for (const b of batches!) {
    const { count, error: e2 } = await sb
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('import_batch_id', b.id);
    if (e2) throw e2;
    counts[b.id] = count ?? 0;
  }
  const grandTotal = Object.values(counts).reduce((a, c) => a + c, 0);
  const { count: cdTotal } = await sb
    .from('committed_data')
    .select('id', { count: 'exact', head: true });
  const { count: cdOrphan } = await sb
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .is('import_batch_id', null);
  console.log(`committed_data total: ${cdTotal}; sum across batches: ${grandTotal}; import_batch_id IS NULL: ${cdOrphan}`);

  // ---- 3. Top 10 by committed rows ----
  const ranked = [...batches!].sort((a, b) => counts[b.id] - counts[a.id]);
  const top10 = ranked.slice(0, 10);
  console.log('\n=== TOP 10 import_batches by committed_data rows ===');
  for (const b of top10) {
    const durMs =
      b.completed_at && b.created_at
        ? new Date(b.completed_at).getTime() - new Date(b.created_at).getTime()
        : null;
    console.log(
      JSON.stringify({
        batch_id: b.id,
        tenant_id: b.tenant_id,
        file_name: redactFileName(b.file_name),
        file_type: b.file_type,
        declared_row_count: b.row_count,
        committed_rows: counts[b.id],
        status: b.status,
        created_at: b.created_at,
        completed_at: b.completed_at,
        wall_clock: durMs === null ? 'n/a (completed_at null)' : `${(durMs / 1000).toFixed(1)}s`,
        metadata_keys: b.metadata ? Object.keys(b.metadata) : null,
      })
    );
  }

  // ---- 4. Metadata structure of the top 3 batches (sanitized) ----
  for (const b of top10.slice(0, 3)) {
    console.log(`\n--- sanitized metadata, batch ${b.id} ---`);
    console.log(JSON.stringify(sanitize(b.metadata), null, 2));
  }

  // ---- 5. Multi-file representation, hypothesis A: committed_data per-row file provenance ----
  const top = top10[0];
  const { data: sampleRows, error: e3 } = await sb
    .from('committed_data')
    .select('data_type, metadata')
    .eq('import_batch_id', top.id)
    .limit(1000);
  if (e3) throw e3;
  const metaKeys = new Set<string>();
  const dataTypes: Record<string, number> = {};
  for (const r of sampleRows!) {
    if (r.metadata) Object.keys(r.metadata).forEach((k) => metaKeys.add(k));
    dataTypes[r.data_type] = (dataTypes[r.data_type] ?? 0) + 1;
  }
  console.log(`\n--- committed_data sample (n=${sampleRows!.length}) for top batch ${top.id} ---`);
  console.log('distinct metadata keys in sample:', Array.from(metaKeys).sort());
  console.log('data_type tally in sample:', JSON.stringify(dataTypes));
  console.log('first sample row metadata (sanitized):', JSON.stringify(sanitize(sampleRows![0]?.metadata)));

  // If per-row metadata carries a file/sheet identifier, do exact per-value counts.
  const fileKey = Array.from(metaKeys).find((k) => /file/i.test(k));
  const sheetKey = Array.from(metaKeys).find((k) => /sheet/i.test(k));
  for (const key of [fileKey, sheetKey].filter(Boolean) as string[]) {
    const distinct = new Set<string>();
    for (const r of sampleRows!) {
      const v = r.metadata?.[key];
      if (typeof v === 'string') distinct.add(v);
    }
    console.log(`\nper-file accounting via committed_data.metadata->>${key} (values redacted, exact head counts):`);
    let i = 0;
    for (const v of Array.from(distinct)) {
      i++;
      const { count } = await sb
        .from('committed_data')
        .select('id', { count: 'exact', head: true })
        .eq('import_batch_id', top.id)
        .eq(`metadata->>${key}`, v);
      console.log(`  ${key}#${i} = ${redactFileName(v)} -> ${count} rows`);
    }
  }

  // ---- 6. Hypothesis B: processing_jobs.session_id grouping ----
  const { count: pjCount } = await sb
    .from('processing_jobs')
    .select('id', { count: 'exact', head: true });
  console.log(`\nprocessing_jobs total: ${pjCount}`);
  const { data: jobs, error: e4 } = await sb
    .from('processing_jobs')
    .select('id, tenant_id, session_id, file_name, status, created_at, completed_at')
    .order('created_at', { ascending: true })
    .limit(1000);
  if (e4) throw e4;
  const bySession: Record<string, any[]> = {};
  for (const j of jobs!) (bySession[j.session_id] ??= []).push(j);
  const multi = Object.entries(bySession).filter(([, v]) => v.length >= 2);
  console.log(`sessions total: ${Object.keys(bySession).length}; sessions with >=2 jobs: ${multi.length}`);
  for (const [sid, js] of multi.sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
    console.log(
      `  session ${sid}: ${js.length} jobs, tenant ${js[0].tenant_id}, statuses=[${js
        .map((j: any) => j.status)
        .join(',')}], files=[${js.map((j: any) => redactFileName(j.file_name)).join(', ')}]`
    );
  }

  // ---- 7. Hypothesis C: import_batches sharing a session/job linkage via metadata ----
  const linkKeys: Record<string, number> = {};
  for (const b of batches!) {
    if (!b.metadata) continue;
    for (const k of Object.keys(b.metadata)) linkKeys[k] = (linkKeys[k] ?? 0) + 1;
  }
  console.log('\nimport_batches.metadata key frequency across all batches:', JSON.stringify(linkKeys));
}

main().catch((e) => {
  console.error('PROBE ERROR:', e.message ?? e);
  process.exit(1);
});
