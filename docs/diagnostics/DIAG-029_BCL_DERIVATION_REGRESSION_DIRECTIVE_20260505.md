# DIAG-029_BCL_DERIVATION_REGRESSION — HF-196 Closure vs Current Main Replay

**Sequence:** 029 (DIAG-025/026/027/028 assigned this session)
**Type:** Read-only forensic diagnostic with calc replay at two SHAs
**Question answered:** Which commit between HF-196 closure SHA `27c8b3a4` and current main HEAD `9f209bdf` changed Pass 4 derivation behavior such that BCL October calc dropped from PASS-RECONCILED ($312,033 full reconciliation) to current $24,270 October output (~55% of GT $44,590)?
**Decides:** Scope of next remediation HF (revert specific commit / scope-expand / new architectural work)
**Predecessor evidence chain:**
- HF-196 PR #359 merged 2026-05-03 at SHA `73d52791`; closure commit `27c8b3a4`; PASS-RECONCILED $312,033 (per HF-196_ARTIFACT_A_CODE_AUDIT_REFERENCE.md)
- HF-200 PR #363 merged 2026-05-05 at SHA `9f209bdf`; restored flatDataByEntity variant-matcher
- BCL October calc post-HF-200: $24,270 (vs GT $44,590; vs full-month-share-of-$312,033 baseline expected per HF-196 reconciliation)
- Convergence calc log shows: `OB-185 Pass 4: 5 unresolved metrics — invoking AI semantic derivation` → `2 derivations, 3 gaps`
- AUD-004 v3 flagged convergence-service.ts Pass 4 as having "current isolation from plan-agent comprehension"
- Decision 147 specifies Pass 4 as fallback only (Passes 1-3 should resolve seed-derived metrics first)

---

## CC PASTE BLOCK

```markdown
# DIAG-029_BCL_DERIVATION_REGRESSION

**Repo:** `~/spm-platform`
**Branch:** create `diag-029-bcl-derivation-regression` from main HEAD
**Type:** READ-ONLY. No code modifications. No commits. No SQL writes.
**Bindings:**
- T1-E905 (Prove Don't Describe) — verbatim git output + verbatim calc-log evidence per replay
- T1-E953 (Decision-Implementation Gap) — empirical evidence per claim
- T2-E46 (Reconciliation-Channel Separation) — CC reports calc-log values; architect reconciles
- T5-E1064 (Procedural Theater Minimization) — single statement per phase

## TASK

Identify which commit between HF-196 closure SHA `27c8b3a4` and current main HEAD `9f209bdf` changed Pass 4 derivation behavior for BCL.

## DIMENSION 1 — COMMIT INVENTORY HF-196 → CURRENT MAIN

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b diag-029-bcl-derivation-regression
git rev-parse HEAD
```

PASTE output. Confirm HEAD at `9f209bdf` (HF-200 merge).

```bash
git log --oneline 27c8b3a4..HEAD
```

PASTE all output (do not truncate).

For each commit in the range, capture full message:

```bash
for sha in $(git log --format="%H" 27c8b3a4..HEAD); do
  echo "=== $sha ==="
  git log -1 --format="%H%n%ad%n%s%n%n%b" $sha
  echo ""
done
```

PASTE output.

## DIMENSION 2 — CONVERGENCE-SERVICE + PASS 4 PATH DIFF

Identify commits in the range that touched convergence/derivation code paths:

```bash
git log --oneline 27c8b3a4..HEAD -- web/src/lib/intelligence/convergence-service.ts
```

PASTE output.

```bash
git log --oneline 27c8b3a4..HEAD -- web/src/lib/calculation/run-calculation.ts
```

PASTE output.

```bash
git log --oneline 27c8b3a4..HEAD -- web/src/app/api/calculation/run/route.ts
```

PASTE output.

```bash
git log --oneline 27c8b3a4..HEAD -- web/src/lib/compensation/ai-plan-interpreter.ts
```

PASTE output.

For each commit identified across the four log queries above, capture file diff stats:

```bash
# CC iterates per identified SHA
git show --stat <SHA>
```

PASTE output for each.

## DIMENSION 3 — PASS 4 SEMANTIC DERIVATION CODE STATE

Capture the Pass 4 AI semantic derivation logic at HF-196 closure SHA:

```bash
git show 27c8b3a4:web/src/lib/intelligence/convergence-service.ts | grep -n -B 3 -A 30 "Pass 4\|invoking AI semantic\|unresolved metrics\|OB-185" | head -100
```

PASTE output. If empty (Pass 4 logic not yet present at HF-196 closure), state empty result verbatim.

Capture the same at current HEAD:

```bash
git show HEAD:web/src/lib/intelligence/convergence-service.ts | grep -n -B 3 -A 30 "Pass 4\|invoking AI semantic\|unresolved metrics\|OB-185" | head -100
```

PASTE output.

If Pass 4 was introduced between HF-196 and current main, identify the introducing commit:

```bash
git log --all --oneline -S "OB-185" -- web/src/lib/intelligence/convergence-service.ts
git log --all --oneline -S "Pass 4" -- web/src/lib/intelligence/convergence-service.ts
git log --all --oneline -S "invoking AI semantic" -- web/src/lib/intelligence/convergence-service.ts
```

PASTE output for each.

## DIMENSION 4 — INPUT_BINDINGS / METRIC_DERIVATIONS PERSISTENCE STATE

Read current Meridian rule_set state (Supabase SELECT, READ-ONLY):

```sql
SELECT
  rs.id,
  rs.name,
  rs.tenant_id,
  jsonb_pretty(rs.input_bindings) AS input_bindings_pretty,
  jsonb_array_length(COALESCE(rs.input_bindings->'metric_derivations', '[]'::jsonb)) AS derivation_count,
  jsonb_array_length(COALESCE(rs.input_bindings->'convergence_bindings', '[]'::jsonb)) AS binding_count,
  rs.updated_at
FROM rule_sets rs
WHERE rs.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY rs.updated_at DESC;
```

PASTE verbatim output. (Tenant ID is BCL per the live calc log.)

Then read classification_signals state for BCL rule_set:

```sql
SELECT
  signal_type,
  rule_set_id,
  metric_name,
  component_index,
  jsonb_pretty(signal_value) AS signal_value_pretty,
  created_at
FROM classification_signals
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND signal_type = 'metric_comprehension'
ORDER BY component_index, metric_name;
```

PASTE verbatim output.

## DIMENSION 5 — IDENTIFY THE THREE GAPS

The live calc log identifies 3 gaps from Pass 4. From the calc log evidence (architect provides; CC does not infer):
- 5 metrics needing derivation: cumplimiento_colocacion, calidad_cartera, cumplimiento_depositos, productos_cruzados_vendidos, infracciones_regulatorias
- 2 derivations succeeded: cumplimiento_colocacion → ratio(); cumplimiento_depositos → ratio()
- 3 gaps remaining (implicit): calidad_cartera, productos_cruzados_vendidos, infracciones_regulatorias

For each of the three gap metrics, capture how the convergence-service code attempts to derive them:

```bash
git show HEAD:web/src/lib/intelligence/convergence-service.ts | grep -n -B 3 -A 15 "calidad_cartera\|productos_cruzados\|infracciones_regulatorias" | head -100
```

PASTE output. If no matches (the metric names are AI-determined, not hardcoded), state verbatim that the code does not enumerate these metric names — search for the calc operation types instead:

```bash
git show HEAD:web/src/lib/intelligence/convergence-service.ts | grep -n -B 3 -A 15 "scalar_multiply\|conditional_gate\|bounded_lookup_2d\|bounded_lookup_1d" | head -120
```

PASTE output.

## DIMENSION 6 — PLAN-AGENT SEED FLOW

Per Decision 147, plan-agent seeds should reach convergence as Level 2 Comprehension signals; convergence reads them BEFORE invoking Pass 4 AI derivation.

Identify whether plan-agent comprehension signals are being consumed at convergence time:

```bash
git show HEAD:web/src/lib/intelligence/convergence-service.ts | grep -n -B 3 -A 15 "metric_comprehension\|comprehension:\|D153 cutover\|HF-196" | head -100
```

PASTE output.

Also locate where comprehension signals are READ during convergence:

```bash
grep -rn "metric_comprehension\|signal_type.*comprehension" web/src/lib/intelligence/ --include="*.ts"
```

PASTE output.

## DIMENSION 7 — EMPIRICAL FINDINGS

CC writes 5-7 single-sentence facts derived from Dimensions 1-6:

- Number of commits between HF-196 closure (`27c8b3a4`) and current main (`9f209bdf`): <count>
- Of those, <count> touched convergence-service.ts; <count> touched run-calculation.ts; <count> touched calculation/run/route.ts; <count> touched ai-plan-interpreter.ts
- Pass 4 AI semantic derivation code at HF-196 closure: <PRESENT / ABSENT / DIFFERENT>
- Pass 4 AI semantic derivation code at current main: <description of current shape>
- Commit that introduced "OB-185" / "Pass 4" / "invoking AI semantic derivation" log strings (if introduced post HF-196): <SHA + HF/OB identifier>
- BCL classification_signals state for metric_comprehension: <count signals; per-metric_name listing>
- BCL rule_sets.input_bindings state for metric_derivations: <count derivations; per-metric_name listing>
- Code-search for the three gap metrics (calidad_cartera, productos_cruzados_vendidos, infracciones_regulatorias) in convergence-service.ts: <count matches; line ranges>

NO interpretation. NO recommendations. Architect interprets.

## REPORT

Write evidence document to `/tmp/DIAG_029_BCL_DERIVATION_REGRESSION_REPORT_<YYYYMMDD>.md` with sections corresponding to Dimensions 1-7.

Write completion report to `docs/completion-reports/DIAG-029_BCL_DERIVATION_REGRESSION_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26 mandatory structure (Commits → Files Created → Files Modified → Hard Gates → Soft Gates → Standing Rule Compliance → Known Issues → Verification Script Output). Hard Gates evidence references `/tmp/` evidence document by section.

PASTE both file paths + ls -la verification + completion report content in chat.

NO commits. Branch left untracked for architect disposition.
```
