# Phase 1G-14 Amendment — HF-204 Absorption (Visitor-Pattern Metadata Extraction)

**Appends to `HF-196_Phase1G_PathAlpha_DIRECTIVE.md` after §11.12.**
**Branch:** `hf-196-platform-restoration-vertical-slice` (HEAD: `34db3b25` + working state).
**Disposition:** Path α extension confirmed 2026-05-03. HF-204 absorbs into HF-196.
**Substrate:** Decision 108 (HC primacy structurally operative); SR-34 (no known defects shipped); Adjacent-Arm Drift discipline (fix the structural shape, not the diagnosed instance).

---

## 14.0 Defect grounding

**Surface (Phase 5-RESET-7 reconciliation):** October calc returned $45,790. Architect-channel reconciliation against `BCL_Resultados_Esperados.xlsx`: C1 + C2 + C3 reconcile exactly per entity per component; C4 (Cumplimiento Regulatorio) overshoots $1,200 across 11 specific entities (10 × $100 Ejecutivo + 1 entity in dual position; combined $1,200 sum).

**Forensic chain (CC-localized):**

1. C4 component declares `componentType: 'conditional_gate'` with `intent.condition.left.sourceSpec.field = 'infracciones_regulatorias'` (lowercase snake_case, AI-plan-interpreter convention).
2. Source data `committed_data.row_data` carries column `Infracciones_Regulatorias` (Title_Case, source convention).
3. `getExpectedMetricNames` at `web/src/lib/calculation/run-calculation.ts:434-491` walks `intent.input` (singular) and `intent.inputs` (plural lookup_2d). It does NOT walk `intent.condition.left/right`.
4. For conditional_gate components, `getExpectedMetricNames` returns `[]`.
5. `buildMetricsForComponent` at `run-calculation.ts:520-777` uses `expectedNames` to drive semantic-type-based key normalization via `inferSemanticType`. Empty expectedNames → no semantic key population.
6. `data.metrics` reaching the executor contains only Title_Case keys from raw row_data; no `infracciones_regulatorias` lowercase key.
7. `resolveSource` at `intent-executor.ts:61-74` performs direct case-sensitive key access: `data.metrics[key]`. Key `'infracciones_regulatorias'` misses; `?? 0` fallback returns 0.
8. `executeConditionalGate` evaluates `0 < 1` → always TRUE → `onTrue` branch → all entities receive payout regardless of actual infraction count.

**Empirical confirmation (intentTraces from BCL-5001 calc):** `infracciones_regulatorias` input shows `resolvedValue: 0` with `rawValue` JSON-stripped (undefined → stripped on serialization). All other metrics for same row show `rawValue` populated. Confirms `data.metrics[key]` returns undefined for this field specifically.

**Defect class — Adjacent-Arm Drift at metadata-extraction layer:** `getExpectedMetricNames` covers some IntentSource positions (input, inputs) but not others (condition.left, condition.right; onTrue/onFalse if those reference metrics). Conditional_gate is the diagnosed instance. The architectural shape is incomplete coverage of the IntentOperation AST.

## 14.1 Architectural shape

`getExpectedMetricNames` is replaced with a recursive visitor over `IntentOperation`. Visitor surfaces every `IntentSource` of `source: 'metric'` regardless of position in the AST.

Adjacent-Arm Drift discipline: closing only `condition.left/right` produces the same structural defect class as Phase 1G's eight isSequential sites. The fix targets the structural shape — exhaustive AST traversal — not the diagnosed instance.

## 14.2 Phase 1G-14 sub-phases

### 14-1: Discovery probe — full IntentOperation AST orphan inventory

```bash
cd ~/spm-platform

echo "=== IntentOperation type definition ==="
grep -nE "type IntentOperation|interface IntentOperation|export type IntentOperation" web/src/lib/calculation/intent-executor.ts web/src/lib/calculation/types.ts 2>&1 | head -10

echo "---"
echo "=== All IntentOperation discriminated union variants ==="
grep -nB 1 -A 5 "operation: ['\"]" web/src/lib/calculation/intent-executor.ts 2>&1 | head -80

echo "---"
echo "=== All operation handlers (cases in dispatch switch) ==="
grep -nE "case ['\"][a-z_]+['\"]\s*:" web/src/lib/calculation/intent-executor.ts 2>&1 | head -30

echo "---"
echo "=== resolveSource invocation sites (each represents an IntentSource position) ==="
grep -nE "resolveSource\(|resolveValue\(" web/src/lib/calculation/intent-executor.ts 2>&1

echo "---"
echo "=== IntentSource definition ==="
grep -nB 1 -A 15 "type IntentSource|interface IntentSource|export type IntentSource" web/src/lib/calculation/intent-executor.ts web/src/lib/calculation/types.ts 2>&1 | head -25

echo "---"
echo "=== Current getExpectedMetricNames implementation (verbatim) ==="
sed -n '430,495p' web/src/lib/calculation/run-calculation.ts

echo "---"
echo "=== Metric source positions per operation type — verify orphan inventory ==="
grep -nB 1 -A 10 "function execute" web/src/lib/calculation/intent-executor.ts 2>&1 | head -120
```

Paste verbatim. Synthesis required:

1. Full enumeration of operation types (case strings in dispatch).
2. Per-operation metric-bearing positions (which fields on each operation reference IntentSource of source='metric').
3. Confirmation whether conditional_gate is the only orphan, or whether other operation types also have metric positions outside intent.input/intent.inputs.

If orphans beyond conditional_gate surface, visitor must cover them. Surface inventory; proceed to 14-2.

### 14-2: Visitor pattern implementation

Replace `getExpectedMetricNames` body with recursive visitor over IntentOperation. Reference shape (CC adjusts to actual IntentOperation type):

```typescript
/**
 * HF-196 HF-204 absorption — Phase 1G-14.
 *
 * Recursive visitor over IntentOperation AST. Surfaces every IntentSource of
 * source='metric' regardless of position in the AST. Closes Adjacent-Arm Drift
 * defect class at metadata-extraction layer per Decision 108 architectural
 * discipline.
 *
 * Replaces position-by-position enumeration that orphaned conditional_gate
 * (and any future operation type whose metric sources live outside input/inputs).
 */
export function getExpectedMetricNames(component: PlanComponent): string[] {
  const names = new Set<string>();
  const intent = component.calculationIntent;
  if (!intent) return [];

  visitOperation(intent, names);
  return Array.from(names);
}

function visitOperation(op: IntentOperation, names: Set<string>): void {
  if (!op || typeof op !== 'object') return;

  // Visit every property; if it's an IntentSource, harvest. If it's an
  // IntentOperation, recurse. If it's an array or object, traverse.
  for (const value of Object.values(op)) {
    visitNode(value, names);
  }
}

function visitNode(node: unknown, names: Set<string>): void {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const child of node) visitNode(child, names);
    return;
  }

  const obj = node as Record<string, unknown>;

  // IntentSource of source='metric' — harvest field reference
  if (obj.source === 'metric' && obj.sourceSpec) {
    const spec = obj.sourceSpec as Record<string, unknown>;
    if (typeof spec.field === 'string') names.add(spec.field);
    if (typeof spec.numerator === 'string') names.add(spec.numerator);
    if (typeof spec.denominator === 'string') names.add(spec.denominator);
    return;
  }

  // IntentSource of source='ratio' — harvest both operands
  if (obj.source === 'ratio' && obj.sourceSpec) {
    const spec = obj.sourceSpec as Record<string, unknown>;
    if (typeof spec.numerator === 'string') names.add(spec.numerator);
    if (typeof spec.denominator === 'string') names.add(spec.denominator);
    return;
  }

  // IntentOperation — recurse into nested operation
  if (typeof obj.operation === 'string') {
    visitOperation(obj as unknown as IntentOperation, names);
    return;
  }

  // Plain object with nested fields — traverse children
  for (const value of Object.values(obj)) {
    visitNode(value, names);
  }
}
```

Visitor handles arbitrary nesting (conditional_gate's `onTrue`/`onFalse` are themselves IntentOperations that may reference metrics; aggregate operations may have arrays of operands; future operation types automatically covered).

CC adjusts visitor to actual `IntentOperation` and `IntentSource` shapes surfaced in 14-1. If `IntentSource` has additional source kinds beyond `'metric'` and `'ratio'` that reference metrics, extend visitor accordingly.

### 14-3: Build + Korean Test

```bash
cd ~/spm-platform/web && rm -rf .next && npm run build 2>&1 | tail -20
cd ~/spm-platform && bash scripts/verify-korean-test.sh 2>&1 | tail -10
```

Build EXIT 0; Korean Test PASS. The visitor uses structural primitives only (AST shape; no field-name string matching).

### 14-4: Self-test

```bash
cd ~/spm-platform

echo "=== getExpectedMetricNames replaced with visitor pattern ==="
sed -n '430,520p' web/src/lib/calculation/run-calculation.ts

echo "---"
echo "=== Visitor handles conditional_gate condition.left ==="
echo "Verification: synthesize a minimal conditional_gate component; assert visitor produces ['infracciones_regulatorias'] (or equivalent field)"
npx tsx -e "
const { getExpectedMetricNames } = require('./web/src/lib/calculation/run-calculation.ts');
const synthetic = {
  calculationIntent: {
    operation: 'conditional_gate',
    condition: {
      left:  { source: 'metric', sourceSpec: { field: 'test_metric' } },
      right: { source: 'constant', value: 1 },
      operator: '<',
    },
    onTrue:  { operation: 'constant', value: 100 },
    onFalse: { operation: 'constant', value: 0 },
  },
};
const names = getExpectedMetricNames(synthetic);
console.log('expectedNames for conditional_gate:', names);
console.log('test_metric included:', names.includes('test_metric') ? 'PASS' : 'FAIL');
" 2>&1
```

Expected: `test_metric` in result set. If FAIL, visitor implementation diverges from intent shape; surface; HALT.

### 14-5: Commit + push

```bash
cd ~/spm-platform
git add web/src/lib/calculation/run-calculation.ts
git status
git commit -m "HF-196 Phase 1G-14: HF-204 absorption — visitor-pattern metadata extraction

— getExpectedMetricNames replaced with recursive IntentOperation AST visitor
— Closes conditional_gate orphan resolution path (intent.condition.left/right + onTrue/onFalse)
— Adjacent-Arm Drift discipline: structural fix at metadata-extraction layer; future operation types automatically covered
— Closes C4 Cumplimiento Regulatorio defect surfaced by Phase 5-RESET-7 reconciliation (\$1,200 overshoot at 11 entities)
— SR-34 product-readiness: no known defects shipped at HF-196 closure"
git push origin hf-196-platform-restoration-vertical-slice
git log --oneline -1
```

Surface commit SHA + push confirmation.

### 14-6: Append Phase 1G-14 section to completion report

Add to `docs/completion-reports/HF-196_Phase1G_PathAlpha_COMPLETION_REPORT.md`:

```markdown
## Phase 1G-14: HF-204 Absorption — Visitor-Pattern Metadata Extraction

### Defect grounding
- Phase 5-RESET-7 architect-channel reconciliation: October C4 overshoot $1,200 across 11 entities
- Forensic chain: getExpectedMetricNames orphans conditional_gate condition.left → semantic key absent from data.metrics → resolveSource direct-key miss → executeConditionalGate evaluates 0<1 always TRUE
- Empirical: 11 entities with Infracciones_Regulatorias > 0 paid full bonus instead of disqualified $0

### Architectural shape
- getExpectedMetricNames rewritten as recursive visitor over IntentOperation AST
- Surfaces every IntentSource of source='metric' regardless of position
- Adjacent-Arm Drift defect class structurally closed at metadata-extraction layer

### Verification
- Build: EXIT 0
- Korean Test: PASS
- Self-test (synthetic conditional_gate): visitor returns expected field name
- Commit: <SHA>

### Substrate citations
- Decision 108: HC primacy operative across full SCI + calculation surface
- SR-34: product-readiness; no known defects shipped at HF-196 closure
- Adjacent-Arm Drift discipline: fix structural shape, not diagnosed instance
```

```bash
git add docs/completion-reports/HF-196_Phase1G_PathAlpha_COMPLETION_REPORT.md
git commit -m "HF-196 Phase 1G-14 — Completion report append"
git push origin hf-196-platform-restoration-vertical-slice
git log --oneline -1
```

Surface commit SHA.

## 14.3 Phase 5-RESET-8 — Re-verification across 6 months

After 14-5 + 14-6 commits land, restart dev server with HF-204 code:

```bash
pkill -f "next dev" 2>&1; sleep 1
cd ~/spm-platform/web
rm -rf .next
set -a && source .env.local && set +a
npm run build 2>&1 | tail -10
> /tmp/hf196_dev.log
npm run dev > /tmp/hf196_dev.log 2>&1 &
sleep 8
curl -I http://localhost:3000/login
git log --oneline -1
```

Surface to architect:

> Phase 1G-14 + HF-204 commits landed: `<SHA>` + `<SHA>`. Dev rebuilt with visitor-pattern metadata extraction. Awaiting architect signals for Phase 5-RESET-8:
>
> 1. **"5-RESET-8 Oct re-calc done"** — architect re-runs Oct 2025 calc via http://localhost:3000 (period exists from prior phase; no re-import needed)
> 2. **"5-RESET-8 Nov-Mar periods+calc done"** — architect creates remaining 5 periods via UI manual create + runs calc per period
> 3. **"5-RESET-8 reconcile complete"** — architect surfaces verdict for completion-report append

### On signal 1 (Oct re-calc done)

CC reports calculated values for Oct 2025:

```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const { data: periods } = await sb.from('periods').select('id').eq('tenant_id', tenantId).eq('start_date', '2025-10-01');
const periodId = periods?.[0]?.id;
const { data: results } = await sb.from('calculation_results').select('payout_amount, component_breakdown').eq('tenant_id', tenantId).eq('period_id', periodId);
let total = 0;
const compTotals: Record<string, number> = {};
for (const r of results ?? []) {
  total += Number(r.payout_amount ?? 0);
  for (const [k, v] of Object.entries((r.component_breakdown ?? {}) as Record<string, unknown>)) {
    compTotals[k] = (compTotals[k] ?? 0) + Number(v ?? 0);
  }
}
console.log('Oct 2025 calculated total:', total.toFixed(2));
console.log('Per-component:');
for (const [k, v] of Object.entries(compTotals).sort()) console.log('  ' + k + ': ' + v.toFixed(2));
" 2>&1
```

Re-export itemized TSV to canonical path:

```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const { data: periods } = await sb.from('periods').select('id').eq('tenant_id', tenantId).eq('start_date', '2025-10-01');
const periodId = periods?.[0]?.id;
const { data: entities } = await sb.from('entities').select('id, external_id, attributes').eq('tenant_id', tenantId);
const entityById = new Map((entities ?? []).map(e => [e.id, e]));
const { data: results } = await sb.from('calculation_results').select('entity_id, payout_amount, component_breakdown').eq('tenant_id', tenantId).eq('period_id', periodId);
const allKeys = new Set<string>();
for (const r of results ?? []) for (const k of Object.keys((r.component_breakdown ?? {}) as Record<string, unknown>)) allKeys.add(k);
const keys = Array.from(allKeys).sort();
const lines = [['external_id','display_name','role',...keys,'Total_calc'].join('\\t')];
const sorted = (results ?? []).sort((a,b) => (((entityById.get(a.entity_id)?.external_id ?? '') as string).localeCompare(((entityById.get(b.entity_id)?.external_id ?? '') as string))));
for (const r of sorted) {
  const ent = entityById.get(r.entity_id);
  const ext = (ent?.external_id ?? '?') as string;
  const attrs = (ent?.attributes ?? {}) as Record<string, unknown>;
  const name = (attrs.name ?? attrs.Nombre ?? attrs.Nombre_Completo ?? '') as string;
  const role = (attrs.tier ?? attrs.Nivel ?? attrs.role ?? '') as string;
  const cb = (r.component_breakdown ?? {}) as Record<string, unknown>;
  const vals = keys.map(k => { const v = cb[k]; return v === undefined || v === null ? '' : String(v); });
  lines.push([ext, name, role, ...vals, String(r.payout_amount ?? 0)].join('\\t'));
}
fs.mkdirSync('docs/CC-artifacts', { recursive: true });
fs.writeFileSync('docs/CC-artifacts/HF-196_Phase5RESET8_Oct2025_itemized.tsv', lines.join('\\n'));
console.log('Written: docs/CC-artifacts/HF-196_Phase5RESET8_Oct2025_itemized.tsv', lines.length, 'lines');
" 2>&1
```

Commit TSV:

```bash
cd ~/spm-platform
git add docs/CC-artifacts/HF-196_Phase5RESET8_Oct2025_itemized.tsv
git commit -m "HF-196 Phase 5-RESET-8 — Oct 2025 re-calc itemized (post-HF-204)"
git push origin hf-196-platform-restoration-vertical-slice
```

Surface to architect: per-component sums + commit SHA. Architect reconciles in architect channel against ground truth. If FAIL, surface and HALT — root cause investigation before remaining-month calcs.

### On signal 2 (Nov-Mar periods+calc done)

After architect creates Nov-Mar periods via UI and runs calc per period, CC repeats the Oct extraction pattern for each remaining period. Single tsx script extracts all 6 periods into 6 itemized TSVs at `docs/CC-artifacts/HF-196_Phase5RESET8_<period>_itemized.tsv`. Single additional commit. Surface per-period totals + per-component sums.

### On signal 3 (reconcile complete)

Architect surfaces reconciliation verdict (PASS-RECONCILED / FAIL-DELTA) for completion-report append. CC appends architect-supplied verdict to Phase 1G-14 completion report; commits.

## 14.4 HF-196 closure

After Phase 5-RESET-8 reconcile signal 3 PASS-RECONCILED:

- All 8 isSequential consumer sites: HC-silence gated (Phase 1G Path α)
- Pipeline reordering operative (α-1 two-phase split)
- HF-203 SCALE ANOMALY architectural inversion present + correctly inert
- HF-204 visitor-pattern metadata extraction operative
- BCL 6-month reconciliation against ground truth: PASS-RECONCILED
- HF-202 + HF-203 + HF-204 + HF-205 ABSORBED into HF-196

Surface to architect:

> HF-196 architecturally complete. PR #359 ready for Ready-for-Review transition. Reconciliation gate: PASS-RECONCILED.

`gh pr edit 359 --draft=false` (architect or CC executes per Rule 30 / SR-44).

---

## End of Phase 1G-14 amendment.
