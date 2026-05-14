// HF-222 Phase 6.4 M.1 — Meridian per-entity-per-period detailed log.
// 67 entities × 3 periods = 201 rows expected.
// Columns: entity_id (external_id), entity_name, period, C1, C2, C3, C4, C5, Total.

import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

const MERIDIAN = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const OUTPUT = '/Users/AndrewAfrica/spm-platform/web/scripts/output/hf222-phase64-meridian-detail.csv';

// Component-name → C-column mapping (variant-agnostic).
function categorize(componentName: string): 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | null {
  if (componentName.startsWith('Revenue Performance')) return 'C1';
  if (componentName.startsWith('On-Time Delivery')) return 'C2';
  if (componentName.startsWith('New Accounts')) return 'C3';
  if (componentName.startsWith('Safety Record')) return 'C4';
  if (componentName.startsWith('Fleet Utilization')) return 'C5';
  return null;
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: periods } = await sb.from('periods')
    .select('id, label, start_date')
    .eq('tenant_id', MERIDIAN)
    .order('start_date');
  const periodById = new Map((periods ?? []).map(p => [p.id, { label: p.label, start: p.start_date }]));

  const { data: entities } = await sb.from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', MERIDIAN);
  const entityById = new Map((entities ?? []).map(e => [e.id, { external_id: e.external_id, display_name: e.display_name }]));

  const { data: results } = await sb.from('calculation_results')
    .select('entity_id, period_id, total_payout, components')
    .eq('tenant_id', MERIDIAN);

  type Row = { entity_id: string; entity_name: string; period: string; period_start: string; C1: number; C2: number; C3: number; C4: number; C5: number; Total: number };
  const rows: Row[] = [];
  let unmappedComponents = 0;

  for (const r of results ?? []) {
    const ent = entityById.get(r.entity_id!);
    const per = periodById.get(r.period_id!);
    if (!ent || !per) continue;
    const row: Row = {
      entity_id: ent.external_id ?? '',
      entity_name: ent.display_name ?? '',
      period: per.label,
      period_start: per.start,
      C1: 0, C2: 0, C3: 0, C4: 0, C5: 0,
      Total: Number(r.total_payout ?? 0),
    };
    const comps = (r.components as Array<{ componentName?: string; payout?: number }> | null) ?? [];
    for (const c of comps) {
      const cat = categorize(c.componentName ?? '');
      if (cat) row[cat] += Number(c.payout ?? 0);
      else unmappedComponents++;
    }
    rows.push(row);
  }

  rows.sort((a, b) => {
    if (a.entity_id !== b.entity_id) return a.entity_id.localeCompare(b.entity_id);
    return a.period_start.localeCompare(b.period_start);
  });

  console.log(`=== Meridian per-entity-per-period detail ===`);
  console.log(`row count: ${rows.length} (expected 201)`);
  console.log(`unmapped components: ${unmappedComponents}`);

  // HALT-M.1-A
  if (rows.length !== 201) {
    console.error(`HALT-M.1-A: row count ${rows.length} != 201`);
  }
  // HALT-M.1-B
  const colsAllNull: string[] = [];
  for (const col of ['C1','C2','C3','C4','C5'] as const) {
    if (rows.every(r => r[col] === 0)) colsAllNull.push(col);
  }
  if (colsAllNull.length > 0) {
    console.error(`HALT-M.1-B: column(s) entirely zero across all rows: ${colsAllNull.join(', ')}`);
  }

  // Write CSV.
  const header = 'entity_id,entity_name,period,C1_Revenue_Performance,C2_OnTime_Delivery,C3_New_Accounts,C4_Safety_Record,C5_Fleet_Utilization,Total\n';
  const body = rows.map(r =>
    [r.entity_id, r.entity_name, r.period, r.C1.toFixed(2), r.C2.toFixed(2), r.C3.toFixed(2), r.C4.toFixed(2), r.C5.toFixed(2), r.Total.toFixed(2)]
      .map(csvEscape).join(',')
  ).join('\n');
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, header + body + '\n');
  console.log(`CSV written: ${OUTPUT}`);

  // First-20-row preview.
  console.log(`\n=== First 20 rows (preview) ===`);
  console.log(header.trimEnd());
  for (const r of rows.slice(0, 20)) {
    console.log([r.entity_id, r.entity_name, r.period, r.C1.toFixed(2), r.C2.toFixed(2), r.C3.toFixed(2), r.C4.toFixed(2), r.C5.toFixed(2), r.Total.toFixed(2)].map(csvEscape).join(','));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
