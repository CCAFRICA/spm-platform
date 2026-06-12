/**
 * DIAG-063 / A4 — Multi-tab XLSX, part 3 (READ-ONLY)
 *
 * Q5: for the largest (tenant, file_hash_sha256) batch group, count DISTINCT
 *     metadata->>contentUnitId values — distinguishes "one file yielded many
 *     content units (sheets)" from "same unit re-processed". Counts + UUIDs only.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: batches, error } = await supabase
    .from('import_batches')
    .select('id, tenant_id, file_hash_sha256, metadata, status, row_count')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;

  const byFile = new Map<string, typeof batches>();
  for (const b of batches ?? []) {
    if (!b.file_hash_sha256) continue;
    const key = `${b.tenant_id}::${b.file_hash_sha256}`;
    byFile.set(key, [...(byFile.get(key) ?? []), b]);
  }
  const top = Array.from(byFile.values()).sort((a, b) => b.length - a.length)[0];
  if (!top) { console.log('[Q5] no file-hash groups found'); return; }

  const units = new Set<string>();
  const statuses = new Map<string, number>();
  for (const b of top) {
    const u = (b.metadata as Record<string, unknown> | null)?.contentUnitId;
    if (typeof u === 'string') units.add(u);
    statuses.set(b.status as string, (statuses.get(b.status as string) ?? 0) + 1);
  }
  console.log(`[Q5] largest group: tenant=${top[0].tenant_id} file_hash=${(top[0].file_hash_sha256 as string).slice(0, 12)}…`);
  console.log(`[Q5] batches=${top.length} distinct_contentUnitIds=${units.size}`);
  console.log(`[Q5] batch statuses: ${Array.from(statuses.entries()).map(([s, n]) => `${s}=${n}`).join(' ')}`);
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
