#!/usr/bin/env npx tsx
/**
 * OB-217 LIVE verification (read-only): prove the per-row attribution reconciles to the
 * engine's ACTUAL stored output for BCL — WITHOUT needing the migration applied.
 *
 * For every BCL calculation_result, for each additive component (multiply(reference,const)),
 * it reads the engine's raw pre-rounding outcome (metadata.roundingTrace.components[idx].rawValue)
 * and the stored integer payout (components[idx].payout), then INDEPENDENTLY sums the per-row
 * contributions rate × committed_data[column] for that entity+period and asserts:
 *   SR-38 exact   : Σ(per-row) === rawValue   (decimal distribution)
 *   reconciliation: round_half_even(Σ,0) === storedPayout (the 0-dp engine rounding)
 *
 * No ground-truth commission values are emitted — only the engine's own stored outputs and
 * the independent per-row recomputation that must equal them.
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob217-verify-bcl-attribution.ts
 */
import { createClient } from '@supabase/supabase-js';
import Decimal from 'decimal.js';
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

type Rec = Record<string, unknown>;
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const p = parseFloat(v.replace(/[,$\s]/g, '')); return isNaN(p) ? null : p; }
  return null;
};

function flattenComponents(components: unknown): Rec[] {
  if (Array.isArray(components)) return components as Rec[];
  if (components && typeof components === 'object') {
    const v = (components as Rec).variants as Rec[] | undefined;
    if (Array.isArray(v)) return v.flatMap(x => (Array.isArray(x.components) ? x.components as Rec[] : []));
  }
  return [];
}

/** multiply(reference(F), const(R)) → {rate, field}; else null. */
function additiveTerm(intent: unknown): { rate: number; field: string } | null {
  const n = intent as Rec | null;
  if (!n || n.prime !== 'arithmetic' || n.op !== 'multiply' || !Array.isArray(n.inputs) || n.inputs.length !== 2) return null;
  const [a, b] = n.inputs as Rec[];
  const ref = a?.prime === 'reference' ? a : b?.prime === 'reference' ? b : null;
  const con = a?.prime === 'constant' ? a : b?.prime === 'constant' ? b : null;
  if (!ref || !con || typeof ref.field !== 'string' || typeof con.value !== 'number') return null;
  return { rate: con.value, field: ref.field };
}

async function main() {
  // ── rule_set: components + convergence bindings ──
  const { data: rs } = await supabase.from('rule_sets').select('components, input_bindings').eq('tenant_id', BCL).single();
  const comps = flattenComponents(rs?.components);
  const cb = ((rs?.input_bindings as Rec | null)?.convergence_bindings ?? {}) as Record<string, Rec>;

  // name → { rate, column, scale, reduction } for additive components
  const additiveByName = new Map<string, { rate: number; column: string; scale: number; reduction: string }>();
  comps.forEach((c, i) => {
    const term = additiveTerm(c.calculationIntent);
    if (!term) return;
    const b = cb[`component_${i}`];
    const fb = b?.[term.field] as Rec | undefined;
    if (!fb?.column) return;
    additiveByName.set(String(c.name), {
      rate: term.rate, column: String(fb.column),
      scale: typeof fb.scale_factor === 'number' ? fb.scale_factor : 1,
      reduction: typeof fb.reduction === 'string' ? fb.reduction : 'sum',
    });
  });
  console.log(`Additive components (multiply ref×const) in BCL: ${additiveByName.size}`);
  for (const [name, s] of additiveByName) console.log(`  - ${JSON.stringify(name)} → ${s.rate} × ${s.column} (reduction=${s.reduction}, scale=${s.scale})`);
  if (additiveByName.size === 0) { console.log('No additive components — nothing to reconcile.'); return; }

  // ── periods (id → date range) ──
  const { data: periods } = await supabase.from('periods').select('id, label, start_date, end_date').eq('tenant_id', BCL);
  const periodById = new Map((periods ?? []).map(p => [p.id, p]));

  // ── entities (id → external_id) ──
  const entById = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('entities').select('id, external_id').eq('tenant_id', BCL).range(from, from + 999);
    if (!data || data.length === 0) break;
    data.forEach(e => { if (e.external_id) entById.set(e.id, String(e.external_id).trim()); });
    if (data.length < 1000) break;
  }

  // ── committed_data: pull the bound measure columns once; index by (column, periodKey, extId) ──
  const columns = Array.from(new Set(Array.from(additiveByName.values()).map(s => s.column)));
  // entity-id column is shared (ID_Empleado) — read from the first binding's entity_identifier.
  const eidCol = String((Object.values(cb)[0]?.entity_identifier as Rec | undefined)?.column ?? 'ID_Empleado');
  const periodKeyOf = (sourceDate: string | null, periodId: string | null): string | null => {
    if (periodId) return periodId;
    if (sourceDate) for (const p of periods ?? []) if (p.start_date && p.end_date && sourceDate >= p.start_date && sourceDate <= p.end_date) return p.id;
    return '__nullperiod__';
  };
  // index: column -> periodKey -> extId -> summed value (decimal)
  const idx = new Map<string, Map<string, Map<string, Decimal>>>();
  columns.forEach(c => idx.set(c, new Map()));
  let cdRows = 0;
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('committed_data').select('row_data, source_date, period_id').eq('tenant_id', BCL).range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = (r.row_data && typeof r.row_data === 'object') ? r.row_data as Rec : {};
      const ext = String(rd[eidCol] ?? '').trim();
      if (!ext) continue;
      const pk = periodKeyOf(r.source_date as string | null, r.period_id as string | null);
      if (!pk) continue;
      for (const col of columns) {
        const v = num(rd[col]);
        if (v === null) continue;
        let pm = idx.get(col)!.get(pk); if (!pm) { pm = new Map(); idx.get(col)!.set(pk, pm); }
        pm.set(ext, (pm.get(ext) ?? new Decimal(0)).plus(v));
      }
    }
    cdRows += data.length;
    if (data.length < 1000) break;
  }
  console.log(`Indexed ${cdRows} committed_data rows by (column, period, ${eidCol}).`);

  // ── walk calculation_results, reconcile additive components ──
  let checked = 0, matched = 0, reconciled = 0; const failures: string[] = []; const samples: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: results } = await supabase.from('calculation_results')
      .select('entity_id, period_id, components, metadata').eq('tenant_id', BCL).range(from, from + 999);
    if (!results || results.length === 0) break;
    for (const res of results) {
      const ext = entById.get(res.entity_id as string);
      if (!ext) continue;
      const components = Array.isArray(res.components) ? res.components as Rec[] : [];
      const rtComps = (((res.metadata as Rec | null)?.roundingTrace as Rec | undefined)?.components ?? []) as Rec[];
      components.forEach((comp, ci) => {
        const cname = String((comp as Rec).componentName ?? (comp as Rec).name);
        const spec = additiveByName.get(cname);
        if (!spec || spec.reduction !== 'sum') return;
        const payout = num(comp.payout) ?? 0;
        const rtEntry = rtComps.find(t => String((t as Rec).label) === cname) ?? rtComps[ci];
        const rawValue = num((rtEntry as Rec | undefined)?.rawValue);
        if (rawValue === null) return;            // no rounding trace for this component
        if (rawValue === 0 && payout === 0) return; // nothing produced → nothing to attribute
        const pk = (res.period_id as string) ?? '__nullperiod__';
        const summed = idx.get(spec.column)?.get(pk)?.get(ext) ?? new Decimal(0);
        const effRate = new Decimal(spec.rate).mul(spec.scale);
        const perRowSum = summed.mul(effRate);     // Σ(rate×scale×value) = rate×scale×Σvalue (distribution)
        const rounded = perRowSum.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
        const isMatch = perRowSum.minus(rawValue).abs().lte('1e-6');
        const isRecon = rounded === payout;
        checked++; if (isMatch) matched++; if (isRecon) reconciled++;
        if (!isMatch || !isRecon) {
          if (failures.length < 12) failures.push(`MISMATCH ext=${ext} period=${pk} comp=${JSON.stringify(cname)} perRowSum=${perRowSum.toString()} rawValue=${rawValue} rounded=${rounded} payout=${payout}`);
        } else if (samples.length < 6 && rawValue > 0) {
          samples.push(`OK ext=${ext} comp=${JSON.stringify(cname)} Σperrow=${perRowSum.toString()} === rawOutcome=${rawValue} ; round0=${rounded} === storedPayout=${payout}`);
        }
      });
    }
    if (results.length < 1000) break;
  }

  console.log(`\n===== SR-38 LIVE RECONCILIATION (BCL additive components) =====`);
  console.log(`entity-components checked : ${checked}`);
  console.log(`Σ(per-row) === rawOutcome : ${matched}/${checked}`);
  console.log(`round0(Σ) === storedPayout: ${reconciled}/${checked}`);
  console.log(`\nSample reconciliations:`); samples.forEach(s => console.log('  ' + s));
  if (failures.length) { console.log(`\nFAILURES (first ${failures.length}):`); failures.forEach(f => console.log('  ' + f)); }
  console.log(`\nRESULT: ${matched === checked && reconciled === checked && checked > 0 ? 'PASS — every additive entity-component reconciles' : 'REVIEW — see failures above'}`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
