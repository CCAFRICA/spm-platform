# Phase 1G Path α §11.13 + §8 Amendment — Reconciliation Discipline

**Replaces §11.13 and revises §8 reconciliation cells of `HF-196_Phase1G_PathAlpha_DIRECTIVE.md`.**

**Purpose:** scrub ground truth from CC-facing verification artifacts. CC verifies structural correctness; CC reports raw calculated values; architect performs reconciliation in architect channel using `BCL_Resultados_Esperados.xlsx` (held architect-channel only).

**Substrate:** capability-first routing (architect verifies; CC executes); channel separation (ground truth lives architect-channel only); fix-logic-not-data (the system derives correct results from source — CC must not be given answer values that could bias implementation choices).

**Apply this amendment before CC reaches §11.13.** §11.4 through §11.12 continue per existing directive (their structural correctness does not depend on reconciliation values).

---

## §11.13 Amendment — Phase 5-RESET-7 Empirical Verification (Revised)

Replaces original §11.13 in its entirety.

### 11.13.0 Restart dev server with Phase 1G code

```bash
pkill -f "next dev" 2>&1; sleep 1
cd ~/spm-platform/web
rm -rf .next
set -a && source .env.local && set +a
npm run build 2>&1 | tail -20
> /tmp/hf196_dev.log
npm run dev > /tmp/hf196_dev.log 2>&1 &
sleep 8
curl -I http://localhost:3000/login
git log --oneline -1
```

Paste outputs.

### 11.13.1 HALT — Surface to architect for 5 architect signals

> Phase 1G Path α commit landed: `<SHA>`. Dev rebuilt. Awaiting architect signals for Phase 5-RESET-7:
>
> 1. **"wipe applied"** — full BCL clean slate via Supabase Dashboard SQL Editor
> 2. **"5-RESET-7 imports done"** — architect imports BCL_Plantilla_Personal + 6 monthly transactions (Oct/Nov/Dic/Ene/Feb/Mar) via http://localhost:3000
> 3. **"5-RESET-7 plan done"** — architect imports BCL_Plan_Comisiones_2025
> 4. **"5-RESET-7 calc done"** — architect triggers calc across 6 periods
> 5. **"5-RESET-7 architect-reconcile complete"** — architect surfaces reconciliation verdict; CC appends to completion report

### 11.13.2 On signal 1 (wipe applied)

Verify wipe via tsx-script:

```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const tables = ['committed_data','entities','rule_sets','classification_signals','import_batches','structural_fingerprints','calculation_results','entity_period_outcomes','calculation_batches','periods'];
for (const t of tables) {
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  console.log(\`  \${t}: \${count ?? 'error'}\`);
}
" 2>&1
```

Paste output. All counts = 0.

### 11.13.3 On signal 2 (imports done) — Structural Verification of HC Primacy

After 7 imports complete, verify HC primacy operative on persisted state:

```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Cumulative state
const { count: batchCount } = await sb.from('import_batches').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('superseded_by', null);
console.log('Operative import_batches:', batchCount);

const { count: cdCount } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
console.log('committed_data total:', cdCount);

const { data: typeRows } = await sb.from('committed_data').select('data_type').eq('tenant_id', tenantId);
const typeDist: Record<string, number> = {};
for (const r of typeRows ?? []) typeDist[r.data_type] = (typeDist[r.data_type] ?? 0) + 1;
console.log('committed_data data_type distribution:', typeDist);

// Source_date histogram (transaction band only)
const { data: sdRows } = await sb.from('committed_data').select('source_date').eq('tenant_id', tenantId).eq('data_type', 'transaction');
const sdDist: Record<string, number> = {};
for (const r of sdRows ?? []) sdDist[r.source_date ?? 'NULL'] = (sdDist[r.source_date ?? 'NULL'] ?? 0) + 1;
console.log('Transaction source_date histogram:', sdDist);

// Persisted field_identities — Phase 1G empirical confirmation
const { data: sample } = await sb.from('committed_data').select('metadata').eq('tenant_id', tenantId).eq('data_type', 'transaction').limit(1);
const fi = sample?.[0]?.metadata?.field_identities ?? {};
console.log('---');
console.log('Persisted field_identities (transaction sample row):');
for (const [col, identity] of Object.entries(fi)) {
  console.log(\`  \${col.padEnd(40)} structuralType=\${(identity as any).structuralType ?? '?'}\`);
}

// DS-017 fingerprint flywheel state
const { data: fps } = await sb.from('structural_fingerprints').select('fingerprint_hash, classification, match_count').eq('tenant_id', tenantId);
console.log('---');
console.log('structural_fingerprints state:', fps);
" 2>&1
```

Paste output.

**Structural verification gates (CC self-asserts; surfaces to architect):**

| Gate | Required | Actual |
|---|---|---|
| Operative import_batches count | 7 | <pasted> |
| committed_data total | 595 (85 entity + 510 transaction) | <pasted> |
| Transaction source_date histogram | 6 contiguous months × 85 rows each | <pasted> |
| Persisted structuralType for `Cantidad_Productos_Cruzados` | `'measure'` | **<pasted>** |
| Persisted structuralType for `Depositos_Nuevos_Netos` | `'measure'` | <pasted> |
| Persisted structuralType for `ID_Empleado` | `'identifier'` | <pasted> |
| Transaction fingerprint match_count | 6 | <pasted> |
| Phase 1F supersession events in 5-RESET-7 | 0 | <pasted> |

**Critical gate:** `Cantidad_Productos_Cruzados.structuralType` MUST be `'measure'`. If `'identifier'`, Phase 1G Path α did not produce the expected post-state — surface; HALT.

### 11.13.4 On signal 3 (plan done) — Convergence Binding Verification

```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const { data: ruleSets } = await sb.from('rule_sets').select('id, name, status, version, input_bindings').eq('tenant_id', tenantId);
console.log('rule_sets count:', ruleSets?.length);
for (const rs of ruleSets ?? []) {
  console.log(\`  \${rs.name} status=\${rs.status} version=\${rs.version}\`);
  const cb = (rs.input_bindings as any)?.convergence_bindings ?? {};
  console.log('  convergence_bindings keys:', Object.keys(cb));
  for (const [compKey, binding] of Object.entries(cb)) {
    const b = binding as any;
    const role = b.actual ? 'actual' : b.numerator ? 'numerator' : b.row ? 'row' : '?';
    const col = b[role]?.column ?? '?';
    const sf = b[role]?.scale_factor ?? 'none';
    const mp = b[role]?.match_pass ?? '?';
    console.log(\`    \${compKey}: \${role}=\${col} scale_factor=\${sf} match_pass=\${mp}\`);
  }
}
" 2>&1
```

Paste output.

```bash
echo "--- Plan-import LLM emissions (should show Tier 3 first encounter; ZERO seeds; ZERO UnconvertibleComponentError) ---"
grep -nE "plan_agent_seeds|emitSeed|writeSeeds|UnconvertibleComponentError" /tmp/hf196_dev.log 2>&1 | head -10
echo "(expected: zero matches)"
echo "---"
grep -nE "\[Convergence\]|\[CONVERGENCE-VALIDATION\]" /tmp/hf196_dev.log 2>&1 | tail -30
```

Paste output.

**Structural verification gates:**

| Gate | Required | Actual |
|---|---|---|
| rule_sets count | 1 active | <pasted> |
| Convergence bindings count | 4 component bindings | <pasted> |
| component for "Productos Cruzados" → bound column | `Cantidad_Productos_Cruzados` | **<pasted>** |
| `scale_factor` field on any component binding | absent or value 1.0 (not 0.001 or other anomaly-correction value) | <pasted> |
| `match_pass: 'failed'` emissions | 0 (no rejected bindings — HF-203 inversion present in code but not firing on this substrate) | <pasted> |
| `seeds`/`emitSeed`/`writeSeeds` emissions | 0 | <pasted> |
| `UnconvertibleComponentError` emissions | 0 | <pasted> |
| `[CONVERGENCE-VALIDATION] SCALE ANOMALY` emissions | 0 | <pasted> |

**Critical gate:** Productos-Cruzados component binding column MUST be `Cantidad_Productos_Cruzados`, NOT `Depositos_Nuevos_Netos`. If still `Depositos_Nuevos_Netos`, Phase 1G Path α did not propagate to the convergence layer — surface; HALT.

### 11.13.5 On signal 4 (calc done) — Calculation Surface

CC reports calculated values. CC does NOT compare to expected values. CC does NOT author or load any reference dataset. Reconciliation is architect-channel work.

```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Calculation batches state
const { data: cbs } = await sb.from('calculation_batches').select('id, period_id, lifecycle_state, entity_count, summary, completed_at').eq('tenant_id', tenantId).order('completed_at');
console.log('calculation_batches count:', cbs?.length);
for (const cb of cbs ?? []) {
  console.log(\`  batch=\${cb.id} period=\${cb.period_id} state=\${cb.lifecycle_state} entities=\${cb.entity_count}\`);
}

// Calculation_results aggregate by period (sums to architect-channel for reconciliation; no comparison logic in CC)
const { data: results } = await sb
  .from('calculation_results')
  .select('period_id, payout_amount, period:periods(name, start_date)')
  .eq('tenant_id', tenantId);

console.log('---');
console.log('calculation_results count:', results?.length);

const byPeriod = new Map<string, { name: string; total: number; count: number }>();
for (const r of results ?? []) {
  const p = (r.period as any);
  const key = p?.start_date ?? 'unknown';
  const existing = byPeriod.get(key) ?? { name: p?.name ?? '?', total: 0, count: 0 };
  existing.total += Number(r.payout_amount ?? 0);
  existing.count += 1;
  byPeriod.set(key, existing);
}

console.log('---');
console.log('Per-period calculated totals:');
const sorted = Array.from(byPeriod.entries()).sort();
for (const [date, agg] of sorted) {
  console.log(\`  \${date}  \${agg.name.padEnd(20)}  total=\${agg.total.toFixed(2)}  entities=\${agg.count}\`);
}
const grandTotal = sorted.reduce((a, [_, v]) => a + v.total, 0);
console.log('---');
console.log(\`Grand total (calculated): \${grandTotal.toFixed(2)}\`);

// Component-variant breakdown if available
const { data: epoSample } = await sb.from('entity_period_outcomes').select('component_breakdown, period_id').eq('tenant_id', tenantId).limit(1);
console.log('---');
console.log('Sample entity_period_outcomes.component_breakdown shape:', epoSample?.[0]?.component_breakdown);

// Aggregate component-variant totals across all entities × all periods
const { data: epos } = await sb.from('entity_period_outcomes').select('component_breakdown, period:periods(start_date)').eq('tenant_id', tenantId);
const componentTotals = new Map<string, number>();
for (const epo of epos ?? []) {
  const cb = (epo.component_breakdown ?? {}) as Record<string, unknown>;
  for (const [compName, val] of Object.entries(cb)) {
    const n = Number(val ?? 0);
    if (!Number.isFinite(n)) continue;
    componentTotals.set(compName, (componentTotals.get(compName) ?? 0) + n);
  }
}
console.log('---');
console.log('Component-variant totals (all 6 periods, all 85 entities):');
for (const [name, total] of Array.from(componentTotals.entries()).sort()) {
  console.log(\`  \${name.padEnd(45)}  \${total.toFixed(2)}\`);
}
" 2>&1
```

Paste full output.

**Structural verification gates (CC self-asserts):**

| Gate | Required | Actual |
|---|---|---|
| calculation_batches count | 6 (one per period) | <pasted> |
| calculation_results total count | 510 (85 entities × 6 periods) | <pasted> |
| Periods with calc results | 6 (Oct 2025 → Mar 2026 contiguous) | <pasted> |
| `[CONVERGENCE-VALIDATION] SCALE ANOMALY` emissions across 6 calc runs | 0 | <pasted> |
| HF-203 binding-rejection emissions (`match_pass: 'failed'` / `binding_misalignment`) | 0 (architectural inversion present but not firing on this substrate) | <pasted> |
| Concordance (legacy vs intent executor) | 100% per period | <pasted> |
| Calc-time entity resolver: matched/unmatched | matched=N, unmatched=0 per period | <pasted> |

```bash
echo "--- Calc emission scan ---"
grep -nE "SCALE ANOMALY|binding_misalignment|match_pass.*failed" /tmp/hf196_dev.log 2>&1 | head -20
echo "---"
grep -nE "\[CalcAPI\] OB-76 Dual-path|concordance" /tmp/hf196_dev.log 2>&1 | tail -20
```

Paste output.

**Phase 1G Path α structural verification verdict (CC self-asserts):**

- HC primacy operative at field_identities (Phase 1G Sites 1+2): `<PASS|FAIL>` (per 11.13.3 Cantidad gate)
- Pipeline reordering operative (Phase 1G α-1 split): `<PASS|FAIL>` (per 11.13.3 — pattern detection produced HC-aware results)
- Convergence binding correctness (Phase 1G operates end-to-end): `<PASS|FAIL>` (per 11.13.4 — Productos Cruzados → Cantidad_Productos_Cruzados)
- HF-203 architectural inversion present + not falsely firing: `<PASS|FAIL>` (per 11.13.4 + 11.13.5 — zero scale_factor mutations, zero false binding rejections)
- Calc completes across 6 periods without errors: `<PASS|FAIL>` (per 11.13.5 calculation_batches + results count)

CC does not produce a reconciliation verdict. CC reports calculated values to architect channel.

### 11.13.6 On signal 5 (architect-reconcile complete)

Architect performs reconciliation against `BCL_Resultados_Esperados.xlsx` in architect channel. Architect surfaces verdict to CC for completion-report append.

CC receives architect-channel verdict (one of: PASS-RECONCILED / FAIL-DELTA / FAIL-STRUCTURAL) + any specific defect findings.

CC appends architect verdict to completion report (§8 Architect Reconciliation Section, see §8 amendment below). CC does NOT independently produce reconciliation interpretation.

### 11.13.7 Phase 1G Path α closure verdict

Closure requires:
- All structural gates in 11.13.3, 11.13.4, 11.13.5 surface PASS
- Architect-channel reconciliation verdict surface PASS-RECONCILED

If structural gates PASS but architect reconciliation surface FAIL-DELTA: surface to architect; HALT. Architect dispositions root-cause investigation; further phase work as needed.

If structural gates FAIL: surface specific gate failure; HALT for architect.

---

## §8 Amendment — Completion Report Scaffold (Reconciliation Section Revised)

Replaces the "Phase 5-RESET-7: Empirical Verification" section of the §8 scaffold (lines covering signals 1-5 and Phase 1G Path α Verdict).

### Phase 5-RESET-7: Empirical Verification

#### Architect signal 1 — wipe applied
- Wipe verification (10-table count = 0): <pasted CC output>

#### Architect signal 2 — 7 imports done
- Operative import_batches count: <pasted>
- committed_data total + data_type distribution: <pasted>
- Transaction source_date histogram (6 contiguous months expected): <pasted>
- DS-017 fingerprint flywheel state: <pasted>
- **Persisted field_identities — Phase 1G empirical confirmation:**
  - `Cantidad_Productos_Cruzados.structuralType`: <pasted>
  - `Depositos_Nuevos_Netos.structuralType`: <pasted>
  - `ID_Empleado.structuralType`: <pasted>

#### Architect signal 3 — plan import done
- rule_sets state: <pasted>
- convergence_bindings per component: <pasted>
- **Productos Cruzados component → bound column:** <pasted>
- scale_factor presence on bindings: <pasted>
- HF-203 emissions (match_pass='failed', binding_misalignment): <pasted>
- Plan-import emission scan (seeds, UnconvertibleComponentError, SCALE ANOMALY): <pasted>

#### Architect signal 4 — calc done
- calculation_batches count + lifecycle states: <pasted>
- calculation_results total count + per-period count: <pasted>
- **Per-period calculated totals (calculated values surfaced to architect channel):** <pasted>
- **Grand total calculated:** <pasted>
- Component-variant aggregates (across 6 periods × 85 entities): <pasted>
- Calc emission scan (SCALE ANOMALY, binding_misalignment, concordance): <pasted>
- Calc-time entity resolver matched/unmatched: <pasted>

#### Architect signal 5 — architect-reconcile complete
- **Architect-channel reconciliation verdict (architect supplies):**
  - Reconciliation reference: `BCL_Resultados_Esperados.xlsx`
  - Verdict: <PASS-RECONCILED | FAIL-DELTA | FAIL-STRUCTURAL>
  - Defect findings (if any, architect-supplied): <text>
  - Disposition (if FAIL): <text>

### Phase 1G Path α Closure Verdict

Structural gates (CC self-asserts):
- HC primacy operative at field_identities: <PASS|FAIL>
- Pipeline reordering operative (α-1 two-phase split): <PASS|FAIL>
- Convergence binding correctness: <PASS|FAIL>
- HF-203 architectural inversion present + correctly inert on this substrate: <PASS|FAIL>
- Calc completes across 6 periods: <PASS|FAIL>

Reconciliation gate (architect-channel):
- Architect reconciliation verdict: <PASS-RECONCILED | FAIL-DELTA | FAIL-STRUCTURAL>

Phase 1G Path α: <PASS | FAIL> (PASS requires all structural gates + architect-channel PASS-RECONCILED)

### HF-196 Closure
- All architectural breaks closed: <YES/NO>
- Phase 5-RESET-7 PASS (structural + reconciliation): <YES/NO>
- PR #359 ready for Ready-for-Review transition: <YES/NO>

---

## End of §11.13 + §8 amendment.
