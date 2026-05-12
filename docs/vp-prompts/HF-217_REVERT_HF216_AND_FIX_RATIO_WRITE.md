# HF-217: Revert HF-216 + fix ratio-write defect in `resolveMetricsFromConvergenceBindings`

**Sequence:** HF-217
**Predecessor:** HF-216 (PR #387, reverted in full by this HF — see Phase 1)
**Defect anchors:**
- DIAG-039 (Meridian Logistics, c4 Fleet Utilization, $2 vs expected $610)
- DIAG-040 (post-HF-216 full intentTrace extraction — cross-hub-summing confirmed empirically against GT)
**Decision candidate:** Decision 158 — Reverted (HF-216's `via` clause unused for Meridian's data shape; reserved for future tenants with true entity-axis joins). HF-217 introduces no new locked decision.
**Discipline:** Vertical Slice — revert + single code fix + data restoration, one PR.

---

## Architect-channel framing (read before CC dispatch)

**Why revert HF-216:** Empirical evidence from `Meridian_Resultados_Esperados.xlsx` and DIAG-040 traces confirms HF-216 was unnecessary. Meridian's transaction data carries hub-level fields (`Cargas_Flota_Hub`, `Capacidad_Flota_Hub`, `Volumen_Rutas_Hub`) redundantly on every employee row. With per-employee indexing, `resolveColumnFromBatch("70209", "Cargas_Flota_Hub")` returns Norma's own row value (1044) directly — no join needed. HF-216's `via` clause translated employee→hub for all 5 components, then `resolveColumnFromBatch` summed across 5 Mérida Hub employees, producing inflated values for c0/c1/c2/c3 and exposing a separate ratio-write defect for c4.

The via-clause infrastructure is architecturally valid for future tenants with true entity-axis joins (no redundant hub fields on per-employee rows). It is reverted from HF-216 because:
1. It was applied to all 5 Meridian components when only c4 even arguably needed it
2. Even c4 doesn't need it — Norma's own row carries hub values
3. It exposed cross-hub-summing for c0/c1/c2/c3 by routing them through hub-level lookups

The cap-slot semantics (post-multiply modifier when plan intent is pre-multiply ratio cap) remains broken after HF-217. For Norma January after HF-217: c4 resolves `1044/1370 × 800 = 609.6`, cap at 1.5 still fires post-multiply, collapses to 1.5 → rounds to 2. **Cap-slot is explicitly deferred to a future HF/Decision-153 plan re-interpretation.** HF-217 does not attempt to fix it.

**Expected Norma January post-HF-217 (architect-channel only, NOT in CC dispatch):** c0=$900, c1=$200, c2=$0, c3=$500, c4=$2 (cap still broken), total=$1,602. The cap-slot defect remains; HF-217 doesn't claim to close c4.

**Revert best practice (SR-41 + git convention):** `git revert <SHA>` per HF-216 commit in reverse chronological order. Preserves forensic trail. Data revert mirrors Phase 4 backfill. Single PR.

**Korean Test:** No language-specific literals introduced or removed in this HF. The ratio-write fix reads metric names from intent declaration (`sourceSpec.numerator`, `sourceSpec.denominator`), not by position.

**Reconciliation channel:** Verification target values for Norma January (c0=$900, c1=$200, c2=$0, c3=$500, c4=$2, total=$1,602) operate architect-channel only. CC directive scrubbed. CC pastes calculated values verbatim; produces no reconciliation interpretation.

---

## Standing rules (read first, every CC turn)

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Specifically applicable here:

- **SR-34:** No bypass; structural fixes only
- **SR-41:** Revert via `git revert <SHA>`, not `git reset` + force-push. Preserves forensic trail; composes with squash-merge. Directly governs Phase 1.
- **SR-42:** Locked-rule halt — surface rule verbatim, name dictated action, halt for architect
- **SR-44:** Architect verifies production. CC pastes localhost evidence only.
- Architecture Decision Gate before implementation
- Anti-Pattern Registry checked every build
- Commit + push after every change
- Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 → only then completion report
- Git from repo root (`spm-platform/`), NOT `web/`
- Final step: `gh pr create --base main --head dev` with descriptive title + body
- 8-category file prefix: `HF-217` for all new artifacts
- `.in()` batch ≤ 200
- Production verification mandatory; localhost ≠ production
- **Completion report:** single consolidated file at `docs/completion-reports/HF-217_COMPLETION_REPORT.md`. NO subdirectories. NO separate evidence/description/ADR files. All artifacts inline in one MD file.

---

## Defect anchors (verbatim)

### Defect 1 — HF-216 overreach (data + code revert)

**HF-216 PR #387** introduced `convergence_bindings.entity_identifier.via` clause and applied it to all 5 Meridian components via Phase 4 backfill. Post-HF-216 evidence (DIAG-040 `calculation_results.id = 5258e916-...`):

- `intentTraces[0].inputs.hub_route_volume.rawValue = 5220` (expected per-employee: 1044 — 5× inflation = sum across 5 Mérida employees)
- `intentTraces[0].inputs.revenue_goal_attainment.rawValue = 491.82` (expected per-employee: 94.72 — ~5× sum)
- `intentTraces[1].inputs.on_time_delivery_percentage.rawValue = 420.61` (expected per-employee: 87.93)
- `intentTraces[2].inputs.new_accounts_count.rawValue = 17` (expected Norma: 0; sum across 5 Mérida employees = 17, verified verbatim against GT)
- `intentTraces[3].inputs.safety_incidents_count.rawValue = 4` (expected Norma: 0; sum across 2 Mérida Standards with incidents)
- `intentTraces[4].inputs.hub_total_loads.rawValue = 0.762043795620438` (pre-divided value, see Defect 2)
- `intentTraces[4].inputs.hub_total_capacity.rawValue = 2` (derivation count fill)

The hub-level fields are redundantly carried on every Meridian transaction row. Per-employee indexing resolves all 5 components correctly without the via clause.

### Defect 2 — Ratio-write writes pre-divided value to one metric key

**File:** `web/src/app/api/calculation/run/route.ts`, function `resolveMetricsFromConvergenceBindings`, ratio branch (DIAG-039 E1.2.c reports this around line 1395; line drift is non-substantive).

**Current code (verbatim per DIAG-039 E1.2.c):**

```typescript
if (numValue !== null && denValue !== null && denValue !== 0) {
  metrics[expectedMetrics[0]] = numValue / denValue;
}
```

This writes the pre-divided ratio to `expectedMetrics[0]` and leaves `expectedMetrics[1]` unwritten. The OB-118 merge guard then fills `expectedMetrics[1]` from `derivedMetrics` (count rule = 2 for Norma). The intent-executor's `source: 'ratio'` resolver then divides the pre-divided value by the count value (0.762 / 2 = 0.381), producing nonsense.

The function must write **raw numerator and denominator values to their declared metric names** so the intent-executor can divide them per the intent declaration.

---

## Phases

### Phase 0 — Pre-implementation reads (mandatory)

CC reads, in order, before any code or git operation:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — full
2. `SCHEMA_REFERENCE_LIVE.md` — confirm `rule_sets.input_bindings` is JSONB
3. `web/src/app/api/calculation/run/route.ts` — locate the `resolveMetricsFromConvergenceBindings` function. Inside it, locate the ratio branch (the block that calls `resolveColumnFromBatch` twice for numerator and denominator, then assigns `metrics[expectedMetrics[0]] = numValue / denValue`).
4. Pre-HF-216 reference: DIAG-039 `E1_2_c.md` (the ratio branch as it existed before HF-216)
5. HF-216 PR #387 commit list to identify SHAs for revert:
   ```bash
   git log --oneline dev ^main | grep "HF-216" | awk '{print $1}'
   ```

**CC reports back:**
- "Phase 0 reads complete."
- The function name and the line range of the ratio branch in current code (whatever the actual line numbers are).
- The list of HF-216 commit SHAs from `git log`, verbatim.
- Confirmation that the ratio branch still contains `metrics[expectedMetrics[0]] = numValue / denValue` as written above.

If the ratio branch has been modified by some other commit between HF-216 and now, **HALT** and surface the actual code verbatim.

### Phase 1 — Revert HF-216 commits

Per SR-41: `git revert <SHA>` in **reverse chronological order** (latest first). HF-216 had 7 commits per the completion report:

```
48ffd8d8 HF-216 Phase 7: PR description document
6d9bcbb0 HF-216 Phase 6: localhost calc re-run evidence
c475e485 HF-216 Phase 4: Meridian convergence_bindings backfill script + execution evidence
6200011d HF-216 Phase 3: via-join lookup translation in resolveMetricsFromConvergenceBindings
575bfc59 HF-216 Phase 2: roster join index pre-computation
7b80eb16 HF-216 Phase 1: ConvergenceBindingEntry.via type definition
51394381 HF-216 Phase 0: Architecture Decision Record + Phase 0 reads
```

Revert each, latest first:

```bash
git revert --no-edit 48ffd8d8
git revert --no-edit 6d9bcbb0
git revert --no-edit c475e485
git revert --no-edit 6200011d
git revert --no-edit 575bfc59
git revert --no-edit 7b80eb16
git revert --no-edit 51394381
```

If `git revert` produces a merge conflict on any SHA, **HALT** and paste the conflict verbatim. Do not attempt automatic resolution. Architect dispositions.

**Verification after Phase 1:**

```bash
# These files should NOT exist after revert:
ls -la web/src/types/convergence-bindings.ts 2>&1
ls -la web/scripts/HF-216_backfill_meridian_via.ts 2>&1
ls -la web/scripts/HF-216_phase6_recalc.ts 2>&1
ls -la docs/hotfixes/HF-216_DESCRIPTION.md 2>&1
ls -la docs/hotfixes/HF-216_Phase6_evidence.md 2>&1
ls -la docs/architecture-decisions/HF-216_ADR.md 2>&1

# This file should be back to its pre-HF-216 content:
grep -n "rosterJoinIndex\|HF-216" web/src/app/api/calculation/run/route.ts
# Expected output: empty (no matches — HF-216 references removed)
```

CC pastes all `ls` outputs and the grep output verbatim into the completion report.

**Commit message (auto-generated by `git revert`):** `Revert "HF-216 Phase N: ..."` chain — 7 revert commits in order.

### Phase 2 — Data-side revert: remove `via` clauses from Meridian rule_set

Phase 4 of HF-216 backfilled `via` clauses into `convergence_bindings.{component_N}.entity_identifier` for all 5 components of Meridian's rule_set. The code revert does not touch the database. CC produces and runs a one-time data restoration script.

Create `web/scripts/HF-217_revert_meridian_via.ts`:

```typescript
// HF-217 data revert: remove via-clause from Meridian convergence_bindings.entity_identifier.
// Mirror-image of HF-216 Phase 4 backfill.

import { createClient } from '@supabase/supabase-js';

const TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const RULE_SET_ID = '939cf576-4096-4ceb-a142-539a486868b3';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: rs, error } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', RULE_SET_ID)
    .single();
  if (error || !rs) throw new Error(`fetch failed: ${error?.message}`);

  const bindings = rs.input_bindings as Record<string, unknown>;
  const cb = bindings.convergence_bindings as Record<string, Record<string, unknown>>;

  let removedCount = 0;
  for (const compKey of Object.keys(cb)) {
    const eid = cb[compKey].entity_identifier as Record<string, unknown> | undefined;
    if (eid && 'via' in eid) {
      delete eid.via;
      removedCount++;
      console.log(`Removed via clause from ${compKey}.entity_identifier`);
    }
  }
  console.log(`HF-217 revert: ${removedCount} via clauses removed`);

  const { error: updErr } = await supabase
    .from('rule_sets')
    .update({ input_bindings: bindings })
    .eq('id', RULE_SET_ID);
  if (updErr) throw new Error(`update failed: ${updErr.message}`);

  // Verify
  const { data: verify } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', RULE_SET_ID)
    .single();
  const verifyCb = (verify?.input_bindings as Record<string, unknown>)?.convergence_bindings as Record<string, Record<string, unknown>>;
  for (const compKey of Object.keys(verifyCb)) {
    const eid = verifyCb[compKey].entity_identifier as Record<string, unknown>;
    const hasVia = eid && 'via' in eid;
    console.log(`VERIFY ${compKey}.entity_identifier.via: ${hasVia ? 'STILL PRESENT (FAIL)' : 'absent (ok)'}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

**CC runs:**

```bash
cd web && npx tsx scripts/HF-217_revert_meridian_via.ts
```

CC pastes complete stdout. If any VERIFY line says "STILL PRESENT (FAIL)", **HALT** and surface to architect.

**Commit message:** `HF-217 Phase 2: revert Meridian via-clause backfill (data-side)`

### Phase 3 — Code fix: route.ts ratio-write defect

**File:** `web/src/app/api/calculation/run/route.ts`

After Phase 1 revert, the function `resolveMetricsFromConvergenceBindings` is back to its pre-HF-216 state. The ratio branch still contains the defect:

```typescript
if (numValue !== null && denValue !== null && denValue !== 0) {
  metrics[expectedMetrics[0]] = numValue / denValue;
}
```

**Replace with code that writes raw values to their declared metric names**, sourced from the intent declaration rather than positional indexing:

```typescript
// HF-217: Write raw numerator and denominator to their declared metric names.
// The intent-executor's source:'ratio' resolver divides them at execution time.
// Reads metric names from the binding-declared intent, not from expectedMetrics
// position, to avoid fragility against AST walk order.
const ratioIntent = (component.calculationIntent as Record<string, unknown> | undefined)?.input as
  Record<string, unknown> | undefined;
const ratioSpec = ratioIntent?.sourceSpec as Record<string, unknown> | undefined;
const numMetricName = typeof ratioSpec?.numerator === 'string'
  ? ratioSpec.numerator.replace(/^metric:/, '')
  : null;
const denMetricName = typeof ratioSpec?.denominator === 'string'
  ? ratioSpec.denominator.replace(/^metric:/, '')
  : null;

if (numMetricName && numValue !== null) {
  metrics[numMetricName] = numValue;
}
if (denMetricName && denValue !== null) {
  metrics[denMetricName] = denValue;
}
```

The OB-118 merge guard at the calling site (further down in `route.ts`) protects both keys when convergence populates both. Derivation cannot overwrite either.

If `numMetricName` or `denMetricName` resolves to `null` (intent shape doesn't declare a ratio with sourceSpec.numerator/denominator), **HALT** — the code path was reached for a non-ratio intent and the assumption is wrong. Paste the component name, the intent shape, and halt for architect.

**Commit message:** `HF-217 Phase 3: route.ts ratio-write defect — write raw num/den to declared metric names`

### Phase 4 — Build + dev server verification

From repo root:

```bash
pkill -f "next dev" || true
rm -rf web/.next
cd web && npm run build
```

CC pastes the last 30 lines of build output. If `npm run build` exits non-zero, **HALT** and paste the full error.

```bash
npm run dev &
sleep 8
curl -sI http://localhost:3000
curl -sI http://localhost:3000/login
```

CC pastes both curl outputs. Expect 307 redirect on `/` and 200 on `/login` (auth-gate, same as HF-216 Phase 5).

If neither shows expected status, **HALT**.

### Phase 5 — Localhost calc re-run

CC produces `web/scripts/HF-217_phase5_recalc.ts` (same harness pattern as HF-216 Phase 6) that POSTs to `/api/calculation/run` for Meridian × January 2025:

- tenant: `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
- ruleSet: `939cf576-4096-4ceb-a142-539a486868b3`
- period: `3c2557f4-d922-4b30-a073-ac4811f1f3cb`

After the POST returns, CC reads the resulting `calculation_results` row for entity `007da35a-8e65-453b-ada9-b62337fd8683` (Norma) and pastes verbatim into the completion report:

- `result_id`, `batch_id`, `total_payout`
- All 5 entries of `components[].payout`
- All 5 entries of `metadata.intentTraces[i].inputs` (verbatim — not just c4 this time, all of them)
- `metadata.intentTraces[i].modifiers` for each
- `metadata.intentTraces[i].finalOutcome` for each
- `metadata.intentMatch`, `metadata.intentTotal`, `metadata.legacyTotal`
- Handler log line containing `componentTotals` (search for `[CalcRecon-T1] componentTotals=`)

**CC does not interpret these values. CC does not state PASS or FAIL. CC pastes verbatim and proceeds to Phase 6.**

**Commit message:** `HF-217 Phase 5: localhost calc re-run + verbatim recalc evidence`

### Phase 6 — Completion report + PR

CC writes the single consolidated completion report at:

`docs/completion-reports/HF-217_COMPLETION_REPORT.md`

The file MUST contain, in order, with verbatim pasted evidence at every section:

1. **Header** — HF identifier, date, base branch, defect anchors (DIAG-039 + DIAG-040 IDs)
2. **Phase 0 reads** — verbatim function/line location, HF-216 commit SHA list
3. **Phase 1 revert** — verbatim `git revert` commit chain output, verbatim `ls -la` outputs showing reverted files absent, verbatim grep showing zero HF-216 references in route.ts
4. **Phase 2 data revert** — verbatim VERIFY block from `HF-217_revert_meridian_via.ts` stdout
5. **Phase 3 code fix** — verbatim diff of `web/src/app/api/calculation/run/route.ts` around the modified ratio branch
6. **Phase 4 build** — last 30 lines of build output, both curl probes with status codes
7. **Phase 5 recalc** — full verbatim Norma January result fields as listed in Phase 5 above
8. **Git log** — all HF-217 commits (revert commits + Phase 2/3/5 commits) verbatim
9. **PR number + URL** from `gh pr create` output

Final commit before PR:

```bash
cd ..  # back to repo root
git add docs/completion-reports/HF-217_COMPLETION_REPORT.md
git commit -m "HF-217 Phase 6: consolidated completion report"
git push
```

Then:

```bash
gh pr create --base main --head dev \
  --title "HF-217: Revert HF-216 + fix ratio-write defect in resolveMetricsFromConvergenceBindings" \
  --body "$(cat docs/completion-reports/HF-217_COMPLETION_REPORT.md)"
```

CC pastes the PR URL.

**CC does NOT merge. CC does NOT verify production.** Both are architect-only per SR-44.

---

## Halt conditions (CC must halt and surface verbatim)

- Phase 0: ratio branch in current code does not contain `metrics[expectedMetrics[0]] = numValue / denValue` (some intervening commit modified it)
- Phase 1: `git revert` produces merge conflict on any SHA
- Phase 1: post-revert verification — any HF-216 file still present, or `grep HF-216` returns non-empty
- Phase 2: data-revert VERIFY block shows `via` still present on any component
- Phase 3: Code path discovered that requires touching `evaluateComponent`, `executeIntent`, `executeRatioOp`, any intent-executor primitive, or `applyMetricDerivations`
- Phase 3: `numMetricName` or `denMetricName` resolves to null in the new code (intent shape lacks expected structure)
- Phase 4: `npm run build` exits non-zero
- Phase 4: `localhost:3000/login` does not return 200
- Phase 5: calculation POST returns non-200
- Phase 5: result row not found for entity `007da35a-8e65-453b-ada9-b62337fd8683`
- Phase 5: `metadata.intentTraces` is empty or missing

**On halt:** paste the exact failure output, name the directive constraint dictating halt, halt for architect disposition. Do not retry, do not modify scope, do not invent alternate paths.

---

## What HF-217 explicitly does NOT do

- Does NOT fix cap-modifier slot semantics (post-multiply vs pre-multiply ratio cap) — explicitly deferred. c4 will still produce $2 for Norma after HF-217 because cap still fires post-multiply.
- Does NOT modify the intent-executor or any execution primitive
- Does NOT modify `applyMetricDerivations` or `metric_derivations` shape
- Does NOT modify HC prompts, field-identity classification, or `contextualIdentity` tagging
- Does NOT modify convergence-agent binding generation
- Does NOT add a signal-on-substitution at engine handoff (HF-205 invariant improvement — deferred)
- Does NOT touch BCL or CRP — their bindings have no via and behavior unchanged
- Does NOT preserve any HF-216 artifact in the repository
- Does NOT verify production. Architect verifies post-merge per SR-44.

---

## File inventory

**Files CC creates this HF:**

- `web/scripts/HF-217_revert_meridian_via.ts`
- `web/scripts/HF-217_phase5_recalc.ts`
- `docs/completion-reports/HF-217_COMPLETION_REPORT.md`

**Files CC modifies this HF:**

- `web/src/app/api/calculation/run/route.ts` (Phase 3 ratio-write fix)

**Files deleted by revert (Phase 1):**

- `web/src/types/convergence-bindings.ts`
- `web/scripts/HF-216_backfill_meridian_via.ts`
- `web/scripts/HF-216_phase6_recalc.ts`
- `docs/hotfixes/HF-216_DESCRIPTION.md`
- `docs/hotfixes/HF-216_Phase6_evidence.md`
- `docs/architecture-decisions/HF-216_ADR.md`

That is the complete file inventory. Any additional file change requires architect disposition.

---

## Architect notes (not in CC dispatch)

- This HF intentionally produces c4 = $2 for Norma. The cap-slot semantic defect is real and known; deferring it isolates the diagnostic. After HF-217 lands and c0/c1/c2/c3 reconcile against architect-channel GT ($900/$200/$0/$500), the only remaining defect on Meridian is cap-slot. That becomes HF-218 candidate scope.
- The via-clause infrastructure removal is total — no `convergence-bindings.ts` type file remains, no `via` in `ConvergenceBindingEntry`. If a future tenant needs entity-axis joins, the infrastructure is re-introduced as part of that work, ideally informed by the lessons here (per-component opt-in via, first-value vs sum semantics in `resolveColumnFromBatch`).
- SR-41 governs Phase 1. Seven `git revert` commits preserve full forensic trail. Squash-merge on PR keeps mainline clean.
- Reconciliation values for architect post-merge: Norma January `total_payout` should be `1602` after HF-217 (900+200+0+500+2). Grand total across 67 entities will not be $185,063 because cap-slot remains broken on c5 for all employees. Expected post-HF-217 grand total: ~$185,063 minus the c5 delta. If c5 collapses to $2 per Senior and $1 per Standard via cap+round, total c5 = (26 × 2) + (41 × 1) = 93. Expected GT c5 total: sum of all C5_Utilizacion_Flota in `Meridian_Resultados_Esperados.xlsx`. Architect verifies in architect channel.

---

**End of HF-217 directive.**
