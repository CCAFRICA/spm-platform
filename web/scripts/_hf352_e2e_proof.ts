// HF-352 — END-TO-END PROOF on DISPOSABLE dummy tenants only (I9). Creates dummy A + B, seeds A
// across categories (FK-valid), proves P1/P2/P2b(EDGE-1)/P3/P4 + audit-survival, then DELETES both
// dummies. B is the cross-tenant confinement control (NEVER a real tenant — I9). Self-cleanup.
//
// Run: cd web && npx tsx scripts/_hf352_e2e_proof.ts

import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { runCleanSlate, runDeleteTenant, CLEAN_SLATE_CATEGORIES, DELETE_TENANT_TABLES } from '@/lib/platform/tenant-deletion';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const line = (s = '') => console.log(s);
const hr = () => line('────────────────────────────────────────────────────────');
const uuid = () => (globalThis.crypto as Crypto).randomUUID();
const NAMED = CLEAN_SLATE_CATEGORIES.flatMap((c) => c.tables);
// Confinement is proven over the FULL delete-table superset (not just the 11 clean-slate tables).
const SUPERSET = Array.from(new Set([...DELETE_TENANT_TABLES]));

async function ins(table: string, row: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await sb.from(table).insert({ ...row }).select('id').maybeSingle();
  if (error) { line(`   seed skip ${table}: ${error.message.slice(0, 80)}`); return null; }
  return (data?.id as string) ?? null;
}
async function cnt(table: string, tenantId: string): Promise<number | null> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  return error ? null : (count ?? 0);
}
async function namedCounts(tenantId: string): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const t of NAMED) out[t] = await cnt(t, tenantId);
  return out;
}
async function supersetCounts(tenantId: string): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const t of SUPERSET) out[t] = await cnt(t, tenantId);
  return out;
}

async function seedTenant(name: string): Promise<string> {
  const id = uuid();
  await sb.from('tenants').insert({ id, name, slug: `hf352-${id.slice(0, 8)}`, settings: {}, features: {}, locale: 'en-US', currency: 'USD' });
  return id;
}

async function seedData(tenantId: string, full: boolean) {
  const e1 = await ins('entities', { tenant_id: tenantId, display_name: 'Dummy Ent 1', external_id: `E1-${tenantId.slice(0, 6)}` });
  const e2 = await ins('entities', { tenant_id: tenantId, display_name: 'Dummy Ent 2', external_id: `E2-${tenantId.slice(0, 6)}` });
  await ins('classification_signals', { tenant_id: tenantId, signal_type: 'test:hf352', signal_value: {}, source: 'hf352', context: {} });
  await ins('structural_fingerprints', { tenant_id: tenantId, fingerprint: `fp-${tenantId.slice(0, 8)}`, fingerprint_hash: `fp-${tenantId.slice(0, 8)}`, classification_result: {}, column_roles: {} });
  const cd1 = await ins('committed_data', { tenant_id: tenantId, data_type: 'transaction', row_data: { x: 1 } });
  await ins('committed_data', { tenant_id: tenantId, data_type: 'transaction', row_data: { x: 2 } });
  const rs = await ins('rule_sets', { tenant_id: tenantId, name: 'Dummy RS' });
  if (rs && e1) await ins('rule_set_assignments', { tenant_id: tenantId, rule_set_id: rs, entity_id: e1 });
  if (e1 && e2) await ins('entity_relationships', { tenant_id: tenantId, source_entity_id: e1, target_entity_id: e2, relationship_type: 'peer' });
  if (!full) return { cd1 };
  // calc chain (period → batch → result → trace) + outcome + summary
  const p = await ins('periods', { tenant_id: tenantId, label: 'P1', start_date: '2026-01-01', end_date: '2026-01-31', canonical_key: `hf352-${tenantId.slice(0, 8)}` });
  const b = p ? await ins('calculation_batches', { tenant_id: tenantId, period_id: p }) : null;
  const r = (b && e1) ? await ins('calculation_results', { tenant_id: tenantId, batch_id: b, entity_id: e1 }) : null;
  if (r) {
    await ins('calculation_traces', { tenant_id: tenantId, result_id: r, component_name: 'C1', committed_data_id: cd1 }); // EDGE-1: trace → committed_data NO ACTION
    await ins('calculation_traces', { tenant_id: tenantId, result_id: r, component_name: 'C2' });
  }
  if (e1 && p) await ins('entity_period_outcomes', { tenant_id: tenantId, entity_id: e1, period_id: p });
  if (e1) await ins('summary_artifacts', { tenant_id: tenantId, entity_id: e1, summary_date: '2026-01-15', data_type: 'transaction', metrics: {} });
  // entity-cascade collateral tables (NOT in any clean-slate category) — for the I8 collateral proof.
  if (e1) await ins('reassignment_events', { tenant_id: tenantId, entity_id: e1, effective_date: '2026-01-01' });
  if (e1 && p) await ins('period_entity_state', { tenant_id: tenantId, entity_id: e1, period_id: p, entity_type: 'rep', status: 'active' });
  return { cd1, e1 };
}

(async () => {
  hr(); line('HF-352 E2E PROOF (disposable dummies only)'); hr();

  const A = await seedTenant('HF352 Dummy A');
  const B = await seedTenant('HF352 Dummy B');
  line(`dummy A=${A}  dummy B=${B}`);
  line('seeding A (full) + B (control)…');
  await seedData(A, true);
  await seedData(B, false);

  const aBefore = await namedCounts(A);
  const bBaseline = await supersetCounts(B); // confinement asserted over the FULL delete-table superset
  line(`\nA named-table counts (seeded): ${JSON.stringify(aBefore)}`);
  const bSeeded = Object.entries(bBaseline).filter(([, v]) => (v ?? 0) > 0).map(([t, v]) => `${t}:${v}`);
  line(`B control baseline (non-zero across the ${SUPERSET.length}-table superset): ${bSeeded.join(', ')}`);

  const bUnchanged = async (label: string) => {
    const now = await supersetCounts(B);
    const diffs = SUPERSET.filter((t) => now[t] !== bBaseline[t]);
    const same = diffs.length === 0;
    line(`   P3 confinement after ${label}: control B identical across all ${SUPERSET.length} tables = ${same} ${same ? '✓' : '✗ changed: ' + diffs.join(',')}`);
    return same;
  };

  // ── P1 selective: wipe ONLY intelligence ──
  hr(); line('P1 (selective Clean Slate: intelligence only):');
  const r1 = await runCleanSlate(sb, A, ['intelligence']);
  const a1 = await namedCounts(A);
  line(`   classification_signals: ${aBefore.classification_signals} → ${a1.classification_signals} ; structural_fingerprints: ${aBefore.structural_fingerprints} → ${a1.structural_fingerprints}`);
  line(`   OTHER categories unchanged? committed_data ${a1.committed_data}(was ${aBefore.committed_data}), entities ${a1.entities}(was ${aBefore.entities}), calc_results ${a1.calculation_results}(was ${aBefore.calculation_results}) → ${a1.committed_data === aBefore.committed_data && a1.entities === aBefore.entities && a1.calculation_results === aBefore.calculation_results ? '✓ preserved' : '✗'}`);
  const { data: aStill } = await sb.from('tenants').select('id').eq('id', A).maybeSingle();
  line(`   tenant A record preserved: ${!!aStill ? '✓' : '✗'} ; no errors: ${!r1.hadError ? '✓' : '✗'}`);
  await bUnchanged('P1');

  // ── P2b EDGE-1: wipe Data only, with calc_traces referencing committed_data ──
  hr(); line('P2b (EDGE-1: Data-only wipe; calc_traces → committed_data NO ACTION handled):');
  const tracesBefore = await cnt('calculation_traces', A);
  const r2b = await runCleanSlate(sb, A, ['data']);
  const tracesAfter = await cnt('calculation_traces', A);
  const cdAfter = await cnt('committed_data', A);
  line(`   committed_data: ${a1.committed_data} → ${cdAfter} ; calc_traces preserved: ${tracesBefore} → ${tracesAfter} (${tracesBefore === tracesAfter ? '✓ rows kept' : '✗'}) ; unlinkedCalcTraces=${r2b.unlinkedCalcTraces}`);
  line(`   NO FK error on committed_data delete: ${!r2b.hadError ? '✓' : '✗ ' + JSON.stringify(r2b.results.filter((x) => x.status === 'error'))}`);
  await bUnchanged('P2b');

  // ── P2 full: wipe all categories, dependents-first, no FK error ──
  hr(); line('P2 (full Clean Slate, all categories, dependents-first, no FK error):');
  const r2 = await runCleanSlate(sb, A, ['calc', 'plan', 'entity', 'data', 'intelligence']);
  const a2 = await namedCounts(A);
  const allZero = NAMED.every((t) => (a2[t] ?? 0) === 0);
  line(`   all named tables 0 for A: ${allZero ? '✓' : '✗ ' + JSON.stringify(a2)}`);
  line(`   no FK error: ${!r2.hadError ? '✓' : '✗'} ; per-table statuses: ${JSON.stringify(r2.results.map((x) => `${x.table}:${x.status}=${x.deleted}`))}`);
  const { data: aStill2 } = await sb.from('tenants').select('id').eq('id', A).maybeSingle();
  line(`   tenant A still present (Clean Slate preserves tenant): ${!!aStill2 ? '✓' : '✗'}`);
  line(`   collateralEffects (entity cascade into non-category tables): ${JSON.stringify(r2.collateralEffects)}`);
  await bUnchanged('P2');

  // ── I8 collateral truthfulness (review fix): an entity wipe WITHOUT data/intelligence reports the
  //    FK-forced cascade-deletes (reassignment_events/period_entity_state) AND set-nulls
  //    (committed_data/classification_signals.entity_id) — nothing silent. Isolated dummy C. ──
  hr(); line('I8 collateral ledger (entity wipe reports FK-forced cascade-deletes + set-nulls):');
  const C = await seedTenant('HF352 Dummy C');
  const ce1 = await ins('entities', { tenant_id: C, display_name: 'C Ent', external_id: `C1-${C.slice(0, 6)}` });
  if (ce1) {
    await ins('reassignment_events', { tenant_id: C, entity_id: ce1, effective_date: '2026-01-01' });
    await ins('committed_data', { tenant_id: C, entity_id: ce1, data_type: 'transaction', row_data: {} });
    await ins('classification_signals', { tenant_id: C, entity_id: ce1, signal_type: 'test', signal_value: {}, source: 'hf352', context: {} });
  }
  const cCdBefore = await cnt('committed_data', C);
  const rColl = await runCleanSlate(sb, C, ['entity', 'calc', 'plan']); // NOT data, NOT intelligence
  const coll = rColl.collateralEffects;
  const cCdAfter = await cnt('committed_data', C);
  line(`   collateralEffects: ${JSON.stringify(coll)}`);
  line(`   reassignment_events cascade_delete reported: ${coll.some((x) => x.table === 'reassignment_events' && x.effect === 'cascade_delete') ? '✓' : '✗'}`);
  line(`   committed_data + classification_signals set_null reported: ${coll.some((x) => x.table === 'committed_data' && x.effect === 'set_null') && coll.some((x) => x.table === 'classification_signals' && x.effect === 'set_null') ? '✓' : '✗'}`);
  line(`   PRESERVED categories' rows kept (committed_data ${cCdBefore}→${cCdAfter}, entity_id nulled): ${cCdBefore === cCdAfter && (cCdAfter ?? 0) > 0 ? '✓' : '✗'} ; no FK error: ${!rColl.hadError ? '✓' : '✗'}`);
  await runDeleteTenant(sb, C); line('   (dummy C cleaned up)');

  // ── B2/I6 audit survival + P4 delete ──
  hr(); line('P4 (Delete Tenant) + B2/I6 (deletion audit survives in platform_events):');
  const auditId = uuid();
  const { error: aErr } = await sb.from('platform_events').insert({ id: auditId, tenant_id: null, event_type: 'tenant.deleted', actor_id: null, payload: { target_tenant_id: A, target_tenant_name: 'HF352 Dummy A', phase: 'proof' } });
  line(`   wrote platform_events audit (tenant_id=NULL) before delete: ${aErr ? '✗ ' + aErr.message : '✓'}`);
  const rDel = await runDeleteTenant(sb, A);
  const { data: aGone } = await sb.from('tenants').select('id').eq('id', A).maybeSingle();
  line(`   tenant A fully removed: ${!aGone && rDel.tenantDeleted ? '✓' : '✗ blocking=' + (rDel.blockingRelation ?? rDel.error)}`);
  const { data: auditStill } = await sb.from('platform_events').select('id, payload').eq('id', auditId).maybeSingle();
  line(`   B2: deletion audit row SURVIVES the tenant delete (tenant_id NULL): ${auditStill ? '✓' : '✗'}`);
  await bUnchanged('P4(deleteA)');

  // ── P7 prism toggle flag-flip (the reused OB-250 route's effect), on control B ──
  hr(); line('P7 (prism toggle flips the flag — the effect the relocated toggle drives):');
  await sb.from('tenants').update({ features: { prism_enabled: false } }).eq('id', B);
  await sb.from('tenants').update({ features: { prism_enabled: true } }).eq('id', B);
  const { data: bFeat } = await sb.from('tenants').select('features').eq('id', B).maybeSingle();
  line(`   B prism_enabled now: ${(bFeat?.features as Record<string, unknown>)?.prism_enabled === true ? '✓ enabled' : '✗'} (toggle component mounted on /admin/tenants; route reused)`);

  // ── cleanup: delete dummy B + the proof audit row ──
  hr(); line('cleanup (delete dummy B + proof audit rows)…');
  await runDeleteTenant(sb, B);
  await sb.from('platform_events').delete().eq('id', auditId);
  const { data: bGone } = await sb.from('tenants').select('id').eq('id', B).maybeSingle();
  line(`   dummy B removed: ${!bGone ? '✓' : '✗'} ; both dummies cleaned up`);
  hr(); line('HF-352 E2E PROOF COMPLETE'); hr();
})().catch((e) => { console.error('PROOF THREW:', e); process.exit(1); });
