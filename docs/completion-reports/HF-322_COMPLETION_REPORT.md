# HF-322 COMPLETION REPORT

Construction-Layer Count-vs-Metric Discriminator

## Date
2026-06-21

## Branch / Commits (one per phase, Rule 28)
Branch: `hf-322-count-vs-metric`
| SHA | Phase | Message |
|---|---|---|
| `642bbfa5` | Directive | HF-322: directive committed (Rule 14) |
| `941c641e` | Implementation | HF-322: construction-layer count-vs-metric discriminator |
| (this) | Report | HF-322 report |

## Files
- **NEW** `web/src/lib/plan-intelligence/count-metric-discriminator.ts` — the discriminator (additive pre-pass).
- **NEW** `web/src/lib/plan-intelligence/__tests__/count-metric-discriminator.test.ts` — 6 unit tests.
- **MODIFIED** `web/src/lib/sci/plan-orchestration.ts` — one `await applyCountMetricDiscriminator(ci, tenantId)` call + import, between `const ci = …` (528) and `constructTree(ci)` (529). Engine, resolver, `constructTree`, `buildReferenceNode`, and the prompt are untouched (C3/C4/C5).

---

## ARCHITECTURAL FINDING (why the realization diverges from the directive's literal wording)

The directive (C2/PG-1) specifies the discriminator "queries the tenant's committed_data for the **named field**." Investigation (5-agent workflow + direct verification) established that **the intent's named field is not a committed_data column**:

- The LLM emits an **invented semantic token** — BCL c3's count source is `field: "cross_sold_products"`, which appears in **zero** committed_data `row_data` keys / `field_identities` keys. The physical column is `Cantidad_Productos_Cruzados`.
- The only stored token→column link is `field_identities[col].contextualIdentity` — a **free-text language string** (Korean-Test-forbidden, C1) — or the **calc-time convergence LLM**. `bridgeAIToEngineFormat` persists `inputBindings: {}` (empty), so there is **no deterministic, language-free token→column map at construction time**.

Therefore a literal "query the named field" cannot be satisfied by deterministic structural code without crossing the Korean Test. The structurally-correct realization (SR-34) decides the flip from a **token-free data property** and lets convergence — which already resolves the token at calc time — do the resolution. The override **preserves the field token**; the target is `metric` (a reference prime that reads convergence's binding-resolved, default-`sum` scalar), **not** `aggregate/sum` (a sum prime reads the raw `row_data[token]` key, which the invented token does not match → 0). This is exactly why the directive's stated target (`metric`) is correct.

**The token-free structural signal:** a `count` is overridden to `metric` when, in the tenant's committed_data, `count` is **structurally degenerate** — the transactional rows form a one-row-per-(entity, period) grid (`rowCount === entityCount × periodCount`), so `count` over any entity-period group is invariably 1 and can never express a varying per-period payout — **and** the data contains a varying-numeric measure (so reading a value is meaningful). Verified on live BCL: `entities(85) × periods(6) = 510 == transaction rows(510)`. This naturally spares legitimate multi-row counts (e.g. MIR P4 count-of-verified-clients): a multi-row tenant is not a one-row grid, so the override never fires.

---

## PROOF GATES

### PG-1 — CODE EVIDENCE
The structural test + override + apply (full file: `count-metric-discriminator.ts`). Verbatim core:

```ts
function isVaryingNumericMeasure(values: unknown[]): boolean {
  let numericCount = 0; let min = Infinity; let max = -Infinity;
  const distinct = new Set<number>();
  for (const v of values) {
    if (v === '' || v === null || v === undefined) continue;
    const num = Number(v);
    if (Number.isNaN(num)) continue;
    numericCount++; distinct.add(num);
    if (num < min) min = num; if (num > max) max = num;
  }
  if (numericCount < values.length * 0.8) return false; // predominantly numeric
  if (distinct.size <= 2) return false;                 // constant or binary
  if (max - min <= 1) return false;                     // degenerate spread
  if (min === 0 && max === 1) return false;             // 0/1 flag
  return true;
}

// shape: rowCount === entityCount × periodCount  → count is degenerate (always 1/group)
const oneRowPerEntityPeriodGrid = ec > 0 && pc > 0 && rc > 0 && rc === ec * pc;

function overrideDegenerateCounts(node: unknown, overridden: string[]): void {
  if (Array.isArray(node)) { for (const child of node) overrideDegenerateCounts(child, overridden); return; }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'aggregate' && obj.op === 'count' &&
      typeof obj.field === 'string' && obj.field !== '' && obj.field !== '*') {
    overridden.push(obj.field);
    obj.type = 'metric';   // count-of-rows → read-the-value (metric reference)
    delete obj.op;         // field token preserved → convergence resolves it at calc time
  }
  for (const value of Object.values(obj)) if (value && typeof value === 'object') overrideDegenerateCounts(value, overridden);
}

export async function applyCountMetricDiscriminator(intent, tenantId, supabase?) {
  try {
    if (!tenantId) return { applied: false, overriddenFields: [], shape: null, skippedReason: 'no tenantId' };
    const client = supabase ?? createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
    const shape = await getTenantDataShape(tenantId, client);   // entities/periods/committed_data counts (memoized per tenant)
    if (!shape) return { applied: false, … 'no data shape' };
    if (!shape.oneRowPerEntityPeriodGrid) return { applied: false, … 'count not degenerate' };
    if (!shape.hasVaryingNumericMeasure)  return { applied: false, … 'no varying-numeric measure' };
    const overriddenFields: string[] = [];
    overrideDegenerateCounts(intent, overriddenFields);          // mutates ci IN PLACE
    return { applied: overriddenFields.length > 0, overriddenFields, shape };
  } catch (err) { console.warn('[count-metric-discriminator] no-op on error:', err); return { applied: false, … }; }
}
```

The data query (`profileTenantDataShape`) reads `entities`/`periods` row counts and a `committed_data` sample for the numeric profile, all scoped by `tenant_id`. It checks for **varying numeric values** and overrides `aggregate/count → metric`. **No field-name match, no pattern catalog.**

### PG-2 — KOREAN TEST
**Does the discriminator reference any field name, compensation concept, or language-specific string? NO.** It branches only on (1) the structural shape of a `ReferenceSource` (`type==='aggregate' && op==='count'`), (2) table **cardinalities** (`rowCount === entityCount × periodCount`), and (3) numeric **value distributions** (distinct/min/max/span; reject `≤2 distinct`, `span ≤ 1`, `{0,1}` flag). No field name (`cross_sold_products`, `Cantidad_Productos_Cruzados`, `verified-clients`) is ever read or matched; the language-bearing `field_identities.contextualIdentity` is deliberately **not** consulted; there is no enumerated "metric fields" list (C7/AUD-009). A Korean tenant with Hangul columns runs through identical logic. **HALT-1 not triggered.**

### PG-3 — BCL c2/c3 → METRIC (real discriminator + live BCL DB + real constructTree)
The defect is the **"Productos Cruzados"** component (live id `c3-productos-cruzados-{senior,ejecutivo}`; the directive's "c2" is off-by-one vs the live rule_set, where c2 = "Captación de Depósitos", a banded ratio — matched **structurally**, never by id). Its stored `calculationIntent` = `{op:multiply, inputs:[{op:count, field:cross_sold_products, prime:aggregate}, {value:25|18}]}`. Applying the real discriminator (live BCL grid 85×6=510) then `constructTree`:

```
c3 Productos Cruzados SENIOR (×25):
  DAG before: arithmetic·multiply[ aggregate·count·field=cross_sold_products , constant 25 ]
  DAG after : arithmetic·multiply[ reference·field=cross_sold_products       , constant 25 ]   ← count→metric
c3 Productos Cruzados EJECUTIVO (×18):
  DAG before: arithmetic·multiply[ aggregate·count·field=cross_sold_products , constant 18 ]
  DAG after : arithmetic·multiply[ reference·field=cross_sold_products       , constant 18 ]   ← count→metric
```
`overriddenFields = ["cross_sold_products"]`; the count source becomes `{type:'metric', field:'cross_sold_products'}`, which `buildReferenceNode` emits as `{prime:'reference', field:'cross_sold_products'}`. **c2/c3 now uses `metric`.**

### PG-4 — c0/c1/c3 (non-count) DAG-EQUIVALENCE
Same live run, non-count components are **byte-identical** before/after (the degenerate grid does NOT blanket-override — only count-aggregate sources flip):

| Component | shape | discriminator applied | DAG before === after |
|---|---|---|---|
| c1 Colocación | 2D banded_lookup (metric dims) | false | **identical** (30-cell nested conditional tree) |
| c2 Captación | banded_lookup (ratio dim → divide) | false | **identical** |
| aggregate/**sum** component | arithmetic·multiply[sum, k] | false | **identical** (sum is never flipped — only `count`) |

Unit tests confirm the same on banded_lookup, aggregate/sum, multi-row, flag-only, and plan-before-data inputs. **HALT-2 not triggered.**

### PG-5 — BCL CALCULATION (per-period driver; c2/c3 must VARY)
The authoritative engine recalc (clean-slate re-import via the interpretation LLM + browser calc + per-variant roster + GT reconciliation) is the **architect channel** (SR-44 / C6 — CC reports values, no GT comparison). CC reports the deterministic per-period driver from **real committed_data**, contrasting the current count-DAG with the corrected metric-DAG:

| period | rows | entities | COUNT-DAG (count×25) | METRIC-DAG (Σqty×25) | METRIC ×18 | Σ qty |
|---|---|---|---|---|---|---|
| 2025-10 | 85 | 85 | **2125** | 10825 | 7794 | 433 |
| 2025-11 | 85 | 85 | **2125** | 12200 | 8784 | 488 |
| 2025-12 | 85 | 85 | **2125** | 13600 | 9792 | 544 |
| 2026-01 | 85 | 85 | **2125** | 12875 | 9270 | 515 |
| 2026-02 | 85 | 85 | **2125** | 13125 | 9450 | 525 |
| 2026-03 | 85 | 85 | **2125** | 13000 | 9360 | 520 |

- **COUNT-DAG: 1 distinct value across all 6 periods (CONSTANT)** — the defect (each entity has exactly 1 row → count=1 → ×25 → invariant; matches the directive's "all 1,621" invariance, exact figure differs by roster).
- **METRIC-DAG: 6 distinct values (VARIES by period).** **HALT-3 not triggered.**
- Dependency the architect verifies at recalc: the corrected `metric`/`reference` leaf is correct only if convergence's binding `reduction` for the field resolves to `sum` (default when the binding carries no explicit reduction — empirically the BCL case). If convergence assigns `reduction:'count'`, the value would stay constant; C4 forbids touching reduction, so this is reported as the calc-time invariant to confirm.

### PG-6 — BUILD CLEAN
```
tsc --noEmit            → exit 0
npm run build           → exit 0 ; ✓ Compiled successfully ; 198 static pages ; ~217 routes
node --test (discriminator) → 6 pass / 0 fail
```

---

## STANDING RULE COMPLIANCE
- **Decision 158:** LLM recognizes (names the field, emits the intent); deterministic code constructs (flips count→metric structurally); convergence resolves the token at calc time. The boundary is honored exactly.
- **C1/C7/Korean Test (Principle 1, AUD-009):** structural data-property test; no field names, no compensation patterns, no language strings, no enumerated set.
- **C2:** construction-time, queries committed_data, additive-only when no data context (plan-before-data → no-op).
- **C3/C4/C5:** prompt, engine, resolver, `constructTree`, `buildReferenceNode`, and the banded_lookup/arithmetic/conditional/composed paths are all unchanged; the discriminator is a new pre-pass that mutates only the `ci`.
- **C6:** values reported verbatim; no anchor/GT comparison or pass/fail accuracy claim.
- **Rule 14 / Rule 28:** directive committed; one commit per phase. **AP-25:** no silent hardcoded fallback — the no-op path is explicit and logged.

## HALT ACTIVATIONS
None. HALT-1 (language string) / HALT-2 (c0/c1/c3 DAG change) / HALT-3 (c2 still constant) all NOT triggered.

## RESIDUALS (§6A)
- **R-MIR-P4 (false-positive guard, unproven live):** the structural guard spares legit counts two ways — a multi-row tenant is not a one-row grid (primary), and a 0/1 / boolean / categorical field is not a varying-numeric measure (secondary). MIR (`972c8eb0`) currently has **zero rule_sets** (activation architect-gated), so the guard is reasoned + unit-tested (multi-row + flag-only cases) but not validated against a live MIR P4 DAG. Architect re-validates post-MIR-activation (SR-44). Note: a numeric-**coded** status (e.g. 1/2/3) in a *one-row-grid* tenant is the residual edge the distribution test cannot fully separate from a genuine small-integer measure — but such a tenant is not MIR (MIR is multi-row), so the grid test already protects P4.
- **Reduction dependency (PG-5):** the metric override yields varying values only if convergence's binding reduction for the field is `sum` (default). Architect confirms at recalc; C4 forbids pinning it here.
- **Directive id drift:** the defect is "Productos Cruzados" (live `c3`, two variants ×25/×18), not literal `c2`. The discriminator matches **structurally**, so the drift is immaterial to the fix.
- **New capability surface:** this is the first constructor use of data context at construction time. Future expansions (ratio/categorical detection) must each pass C1/C7 (structural, not catalog).

## ARCHITECT NEXT STEPS (SR-44)
Clean-slate the BCL rule_set → re-import the BCL plan document (the interpretation LLM re-emits the same count intent; the discriminator flips it to metric) → run calculate for all 6 periods in the browser → confirm c2/c3 VARIES (≈ the Σqty×rate series above) and reconcile against GT. BCL totals will shift materially vs the prior $312,033 baseline (the count-portion was ~2,125/period constant; the metric-portion varies) — re-baseline the anchor.
