/**
 * OB-237 RESIDUAL — POPULATE write-time rollups for staff + patterns (PG-STAFF-ROLLUP / PG-PATTERNS-ROLLUP).
 *
 * THE PRINCIPLE (third tier): summary_artifacts_fine (88,459 rows) is to staff/patterns what
 * committed_data was to summary_artifacts — too fine. The staff surface reads ~40 servers; the patterns
 * surface reads a 7×24 heatmap. Pre-aggregate the fine table to those display grains so the surfaces read
 * a small filtered set, not 88K rows of JSONB reduced in JS.
 *
 * Derived from the fine materialization (data_type='pos_cheque'), NOT committed_data — the fine table
 * already carries the same base data, and deriving from it guarantees the rollup == what the surface's
 * own 88K-row reduce produces. Replicates the EXACT logic of aggregateStaffFromFine / aggregatePatternsFromFine
 * (the non-cancelled = unconditional-minus-cancelled rule, the per-row skip, weekIndex, dowFromDate).
 *
 * TIER 1 — staff_rollup: one row per (entity_id=location, sub_entity_id=mesero). metrics =
 *   {revenue, checks, tips, week0..week3} — excl-cancelled, weekly buckets pre-summed. ~40 rows.
 *   Keeps entity_id (location) so scopeEntityIds filtering still works at read time.
 * TIER 2 — patterns_rollup: one row per (entity_id, dow). sub_entity_id=String(dow). metrics =
 *   {hours:{h:{r,c}}, revenue, checks, tips, guests, num_days, service_minutes_sum, service_count}. ~140 rows.
 *   Keeps entity_id so locationFilter still works.
 * TIER 2 meta — patterns_meta: ONE row (sub_entity_id=''). metrics={dow_days:{0..6}, total_days} = the
 *   GLOBAL distinct-date counts (the network heatmap divides per-dow revenue by the UNION of dates across
 *   entities, which is not summable from per-entity counts). Location reads use the entity's own num_days.
 *
 * Idempotent: delete the three rollup data_types for Sabor, then insert.
 * VERIFY: staff Σrevenue === patterns Σheatmap-revenue === $99,555,426.88 (truth minus cancelled). Else HALT.
 *
 * Run: cd web && NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/ob237-populate-rollups-sabor.ts
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';
const EXCL_CANCELLED_TRUTH = 99555426.88;

const n = (v: unknown): number => { const x = typeof v === 'number' ? v : Number(v); return Number.isFinite(x) ? x : 0; };
// weekIndex — identical to route.ts:106 (days since the earliest date / 7), anchored on the global first date.
const weekIndex = (dateStr: string, first: string): number =>
  Math.floor((new Date(dateStr).getTime() - new Date(first).getTime()) / (7 * 24 * 60 * 60 * 1000));
// dowFromDate — identical to route.ts:968 (local-time constructor).
const dowFromDate = (s: string): number => { const [y, mo, d] = s.split('-').map(Number); return new Date(y, mo - 1, d).getDay(); };

interface FineRow { entity_id: string; sub_entity_id: string; summary_date: string; hour: number; metrics: Record<string, number>; row_count: number; }

(async () => {
  // 1. Read the fine materialization deterministically (.order('id') — unique key).
  const fine: FineRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('summary_artifacts_fine')
      .select('entity_id, sub_entity_id, summary_date, hour, metrics, row_count')
      .eq('tenant_id', SABOR).eq('data_type', 'pos_cheque')
      .order('id', { ascending: true }).range(offset, offset + 999);
    if (error) throw new Error(`fine read: ${error.message}`);
    if (!data || data.length === 0) break;
    fine.push(...(data as FineRow[]));
    if (data.length < 1000) break;
  }
  console.log(`fine rows read: ${fine.length}`);
  if (fine.length === 0) throw new Error('HALT: fine table empty — run ob237-populate-fine-sabor.ts first');

  const firstDate = fine.map(f => f.summary_date).filter(Boolean).sort()[0];

  // 2. STAFF ROLLUP — group by (entity_id=location, mesero). Replicates aggregateStaffFromFine:562-578.
  interface StaffAgg { entity_id: string; mesero: string; revenue: number; checks: number; tips: number; weekly: [number, number, number, number]; }
  const staff = new Map<string, StaffAgg>();
  for (const f of fine) {
    const mid = f.sub_entity_id;
    if (!mid || mid === '0' || mid === '') continue;
    const m = f.metrics || {};
    const revenue = n(m.total) - n(m.cancelled_revenue);
    const checks = f.row_count - n(m.cancelled_count);
    const tips = n(m.propina) - n(m.cancelled_tips);
    if (checks <= 0 && revenue === 0) continue;
    const k = `${f.entity_id}|${mid}`;
    let a = staff.get(k);
    if (!a) { a = { entity_id: f.entity_id, mesero: mid, revenue: 0, checks: 0, tips: 0, weekly: [0, 0, 0, 0] }; staff.set(k, a); }
    a.revenue += revenue; a.checks += checks; a.tips += tips;
    a.weekly[Math.min(weekIndex(f.summary_date, firstDate), 3)] += revenue;
  }

  // 3. PATTERNS ROLLUP — group by (entity_id, dow). Replicates aggregatePatternsFromFine:987-1013.
  interface PatAgg { entity_id: string; dow: number; hours: Record<string, { r: number; c: number }>; revenue: number; checks: number; tips: number; guests: number; dates: Set<string>; svcSum: number; svcCount: number; }
  const pat = new Map<string, PatAgg>();
  const dowDates: Set<string>[] = Array.from({ length: 7 }, () => new Set<string>());
  const allDates = new Set<string>();
  for (const f of fine) {
    const dt = f.summary_date; if (!dt) continue;
    const dow = dowFromDate(dt);
    const k = `${f.entity_id}|${dow}`;
    let a = pat.get(k);
    if (!a) { a = { entity_id: f.entity_id, dow, hours: {}, revenue: 0, checks: 0, tips: 0, guests: 0, dates: new Set(), svcSum: 0, svcCount: 0 }; pat.set(k, a); }
    const m = f.metrics || {};
    // service accumulates for ALL rows (route.ts:996 + 1011 — both branches add it).
    a.svcSum += n(m.service_minutes_sum); a.svcCount += n(m.service_count);
    const rev = n(m.total) - n(m.cancelled_revenue);
    const checks = f.row_count - n(m.cancelled_count);
    if (checks <= 0 && rev === 0) continue; // skipped: no grid/dayTotals/date contribution
    const tips = n(m.propina) - n(m.cancelled_tips);
    const guests = n(m.numero_de_personas) - n(m.cancelled_guests);
    const h = String(f.hour);
    if (!a.hours[h]) a.hours[h] = { r: 0, c: 0 };
    a.hours[h].r += rev; a.hours[h].c += checks;
    a.revenue += rev; a.checks += checks; a.tips += tips; a.guests += guests;
    a.dates.add(dt); dowDates[dow].add(dt); allDates.add(dt);
  }

  // 4. Build insert rows.
  const now = new Date().toISOString();
  const staffRows = Array.from(staff.values()).map(a => ({
    tenant_id: SABOR, entity_id: a.entity_id, sub_entity_id: a.mesero, summary_date: firstDate, hour: 0,
    period_id: null, data_type: 'staff_rollup',
    metrics: { revenue: a.revenue, checks: a.checks, tips: a.tips, week0: a.weekly[0], week1: a.weekly[1], week2: a.weekly[2], week3: a.weekly[3] },
    row_count: a.checks, convergence_hash: null, computed_at: now, created_at: now,
  }));
  const patRows = Array.from(pat.values()).map(a => ({
    tenant_id: SABOR, entity_id: a.entity_id, sub_entity_id: String(a.dow), summary_date: firstDate, hour: a.dow,
    period_id: null, data_type: 'patterns_rollup',
    metrics: { hours: a.hours, revenue: a.revenue, checks: a.checks, tips: a.tips, guests: a.guests, num_days: a.dates.size, service_minutes_sum: a.svcSum, service_count: a.svcCount },
    row_count: a.checks, convergence_hash: null, computed_at: now, created_at: now,
  }));
  const metaRow = {
    tenant_id: SABOR, entity_id: staffRows[0]?.entity_id ?? patRows[0]?.entity_id, sub_entity_id: '', summary_date: firstDate, hour: 0,
    period_id: null, data_type: 'patterns_meta',
    metrics: { dow_days: Object.fromEntries(dowDates.map((s, i) => [i, s.size])), total_days: allDates.size },
    row_count: allDates.size, convergence_hash: null, computed_at: now, created_at: now,
  };

  // 5. Idempotent replace (delete the three rollup data_types, keep pos_cheque untouched).
  for (const dt of ['staff_rollup', 'patterns_rollup', 'patterns_meta']) {
    const { error } = await sb.from('summary_artifacts_fine').delete().eq('tenant_id', SABOR).eq('data_type', dt);
    if (error) throw new Error(`delete ${dt}: ${error.message}`);
  }
  const all = [...staffRows, ...patRows, metaRow];
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await sb.from('summary_artifacts_fine').insert(all.slice(i, i + 500));
    if (error) throw new Error(`insert: ${error.message}`);
  }
  console.log(`written: staff_rollup=${staffRows.length} patterns_rollup=${patRows.length} patterns_meta=1`);

  // 6. Verify both rollups sum to the excl-cancelled truth.
  const staffSum = staffRows.reduce((s, r) => s + r.metrics.revenue, 0);
  const patSum = patRows.reduce((s, r) => s + Object.values(r.metrics.hours as Record<string, { r: number }>).reduce((t, c) => t + c.r, 0), 0);
  console.log(`\nstaff_rollup    Σrevenue       = $${staffSum.toFixed(2)}`);
  console.log(`patterns_rollup Σheatmap-rev   = $${patSum.toFixed(2)}`);
  console.log(`truth (excl-cancelled)         = $${EXCL_CANCELLED_TRUTH.toFixed(2)}`);
  console.log(`patterns_meta: dow_days=${JSON.stringify(metaRow.metrics.dow_days)} total_days=${metaRow.metrics.total_days}`);
  const staffMatch = Math.abs(staffSum - EXCL_CANCELLED_TRUTH) < 0.01;
  const patMatch = Math.abs(patSum - EXCL_CANCELLED_TRUTH) < 0.01;
  console.log(`\nPG-STAFF-ROLLUP    truth-match: ${staffMatch ? 'YES ✓' : 'NO ✗ HALT-ROLLUP-MATCH'}`);
  console.log(`PG-PATTERNS-ROLLUP truth-match: ${patMatch ? 'YES ✓' : 'NO ✗ HALT-ROLLUP-MATCH'}`);
  process.exit(staffMatch && patMatch ? 0 : 1);
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
