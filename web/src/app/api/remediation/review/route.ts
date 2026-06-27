/**
 * OB-249 — GET /api/remediation/review  (the rendered-remediation data source, P7)
 *
 * Returns the ACTUAL applied remediation (what changed, from what, to what, on what basis) for the
 * caller's tenant, aggregated from committed_data.metadata.remediation — the truth that was promoted,
 * not a pre-commit proposal. Session-tenant-bound via resolveCallerTenant (SR-39 / SOC 2 CC6: no
 * cross-tenant read; platform roles may target a requested tenant, everyone else is pinned).
 *
 * Shape:
 *   { tenantId, stageRan, columns: [{ column, agent, basis, rowsChanged, mappings:[{from,to,rows}] }],
 *     totalChanges, batchesSeen }
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveCallerTenant } from '@/lib/auth/api-tenant';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CellChange { original: unknown; canonical: unknown; basis: string; agent: string }
interface RemediationMeta { _stageRan?: boolean; agents?: string[]; changes?: Record<string, CellChange> }

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requested = searchParams.get('tenant_id');
  const importBatchId = searchParams.get('import_batch_id');
  const limit = Math.min(parseInt(searchParams.get('limit') || '5000', 10), 20000);

  const gate = await resolveCallerTenant(requested);
  if (!gate.ok) return gate.response;
  const tenantId = gate.caller.tenantId;

  const supabase = (await createServiceRoleClient()) as unknown as SupabaseClient;

  let query = supabase
    .from('committed_data')
    .select('metadata, import_batch_id, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (importBatchId) query = query.eq('import_batch_id', importBatchId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate per (column → from→to) mapping. metadata may be a plain object (the OB-249 write path)
  // or a JSON string (legacy paths) — handle both.
  const batches = new Set<string>();
  let stageRan = false;
  // column → { agent, basis, rows changed, mapping(from→to)→count }
  const cols = new Map<string, { agent: string; basis: string; rowsChanged: number; mappings: Map<string, { from: unknown; to: unknown; rows: number }> }>();

  for (const row of data ?? []) {
    if (row.import_batch_id) batches.add(row.import_batch_id as string);
    let meta = row.metadata as unknown;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
    const rem = ((meta as Record<string, unknown>)?.remediation ?? null) as RemediationMeta | null;
    if (!rem) continue;
    if (rem._stageRan) stageRan = true;
    if (!rem.changes) continue;
    for (const [col, ch] of Object.entries(rem.changes)) {
      let c = cols.get(col);
      if (!c) { c = { agent: ch.agent, basis: ch.basis, rowsChanged: 0, mappings: new Map() }; cols.set(col, c); }
      c.rowsChanged += 1;
      const mkey = `${JSON.stringify(ch.original)}→${JSON.stringify(ch.canonical)}`;
      const m = c.mappings.get(mkey) ?? { from: ch.original, to: ch.canonical, rows: 0 };
      m.rows += 1;
      c.mappings.set(mkey, m);
    }
  }

  const columns = Array.from(cols.entries()).map(([column, c]) => ({
    column,
    agent: c.agent,
    basis: c.basis,
    rowsChanged: c.rowsChanged,
    mappings: Array.from(c.mappings.values()).sort((a, b) => b.rows - a.rows),
  })).sort((a, b) => b.rowsChanged - a.rowsChanged);

  const totalChanges = columns.reduce((n, c) => n + c.rowsChanged, 0);

  return NextResponse.json({
    tenantId,
    stageRan,
    columns,
    totalChanges,
    batchesSeen: batches.size,
  });
}
