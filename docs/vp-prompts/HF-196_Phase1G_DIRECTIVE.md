# HF-196 Phase 1G — HC Primacy on isSequential Structural Arm

**Continuation of HF-196 vertical slice**
**Branch:** `hf-196-platform-restoration-vertical-slice` (HEAD: `d811fc64` Phase 1F-corrective)
**Date authored:** 2026-05-03
**Architect:** Andrew (vialuce founder)

---

## 1. PHASE OBJECTIVE

Apply Decision 108 (HC Override Authority Hierarchy LOCKED) to three predicate sites where structural-integer heuristics override LLM HC interpretations. Currently the OR-peer construction `hcRole === 'identifier' || (field.dataType === 'integer' && !!field.distribution.isSequential)` and parallel uniqueness-ratio predicate at `content-profile.ts:218` violate Decision 108 by giving structural arms peer authority with HC.

Empirical defect: BCL October calc produced $82,551 against ground truth $44,590 because `Cantidad_Productos_Cruzados` (count column, sample values 9, 2, distinct {1..10}) was tagged `structuralType: 'identifier'` despite LLM HC tagging it `measure@0.90`. The structural arm fired on `dataType === 'integer' && isSequential === true` and overrode HC. Convergence layer then excluded the column from the measureColumns pool, AI mapping fell back to `Depositos_Nuevos_Netos` for `Productos Cruzados` component, SCALE ANOMALY auto-correction applied `scale_factor=0.001` to mask the binding error, and engine read deposits-magnitude values into Productos Cruzados scalar_multiply evaluator. Plausible-shaped wrong result: $82,551.

Phase 1G closes the role-binding layer that operatively writes `field_identities.structuralType`. Affinity scoring sites (`negotiation.ts:34, 79, 125`; upstream signal sites `content-profile.ts:217, 460`; `tenant-context.ts:146`) violate Decision 108 in spirit but do not directly produce `structuralType` — logged as HF-202 carry-forward.

Phase 1H or HF-203 candidate: SCALE ANOMALY auto-correction logic (`convergence-service.ts:1558-1591 + 317-333`) treats binding misalignment as magnitude error. Should reject binding when ratio>10, not patch scale_factor. Logged as carry-forward.

---

## 2. SUBSTRATE GROUNDING (BODY-FIDELITY VERIFIED)

### 2.1 Decision 108 (LOCKED) — HC Override Authority Hierarchy

> "When HC is confident and structural agents disagree, HC wins. Not a weight, not a floor, not a penalty. A binary authority rule for the cold start condition."

Memory entry 9 (IP candidates, HIGH-priority patent candidate): "the confidence-threshold authority hierarchy between LLM contextual understanding and structural heuristics. The Decision 108/109 history (proposed, evaluated, one locked, one withdrawn) is strong evidence of non-obvious inventive step."

Decision 108 is the substrate authority for HC primacy. Decision 109 was withdrawn ("empirically unfounded thresholds"). Decision 108 is the operative principle.

### 2.2 HF-095 Phase 2 (March 6, 2026) — Stated Intent vs Implementation Inversion

Commit `5351a1b4c` message:

> "Replace nameSignals with HC columnRole in semantic binding and field affinity
> - FIELD_AFFINITY_RULES: now HC-aware — uses HC columnRole when available, **falls back** to structural dataType detection
> - inferRoleForAgent: uses HC columnRole for identifier, name, temporal, measure, attribute, reference_key roles
> - Removed containsId/containsName/containsDate/containsAmount/containsTarget from scoring and binding logic"

Authorial intent: "HC primary, structural fallback." Implementation diverged: the `||` predicate construction encoded structural as **peer**, not as below-HC fallback. The clause `hcRole === 'identifier' || (integer && isSequential)` fires the structural arm as a *parallel* signal whenever HC has any role *except* `identifier` — including when HC said `measure`, `attribute`, etc. with high confidence.

Phase 1G restores HF-095 Phase 2's stated intent.

### 2.3 Adjacent-Arm Drift Pattern (named in this session)

Defect class: when a defect-class is diagnosed correctly but the fix targets only the diagnosed instance, leaving the same structural defect-class active in adjacent branches of the same predicate.

Empirical instances:
- HF-169 (March 23): added cardinality discrimination *inside* the OR-clause body. Did not touch the OR predicate.
- HF-171 (March 24): added LLM-primary path *inside* the OR-clause body. Did not touch the OR predicate.
- HF-186 (April 1): made `reference_key → entity_identifier` agent-aware in a *separate* predicate. Did not touch the `isSequential` arm.
- HF-196 Phase 1B (May 2): ported HF-186 pattern to `agents.ts`. Did not touch the `isSequential` arm.

**Each prior fix addressed an adjacent arm of the same defect class.** The `isSequential` structural arm survived intact across four months and four fixes targeting the same defect-class principle (HC primacy). Phase 1G is the first application of Decision 108 to this arm.

### 2.4 Phase 1F-0 Verdict + Adjacent-Arm Drift Coverage

Probe (read-only diagnostic this session) surfaced 8 sites consuming `isSequential` as a positive signal toward entity-id classification or affinity boosting. Six are defect-prone; two are defensive (negation in `signatures.ts:147` and adjacent-arm uniqueness-ratio in `content-profile.ts:218`).

Phase 1G addresses 3 sites (the role-binding sites that operatively write `field_identities.structuralType` + the parallel adjacent-arm at `content-profile.ts:218`):

| Site | Predicate | Phase 1G action |
|---|---|---|
| `negotiation.ts:299` | `hcRole === 'identifier' \|\| (integer && isSequential)` | Split. Identifier branch on `hcRole === 'identifier'` only. Structural arm gated on HC silence. |
| `agents.ts:536` | `field.dataType === 'integer' && field.distribution.isSequential` | Gate by HC silence. |
| `content-profile.ts:218` | `integer && uniquenessRatio > 0.90` (parallel adjacent-arm) | Gate by HC silence. |

The remaining 5 sites (4 affinity-scoring at `negotiation.ts:34, 79, 125` + 2 upstream-signal at `content-profile.ts:217, 460` + `tenant-context.ts:146`) feed scoring noise but do not directly write `structuralType`. Logged as **HF-202 candidate** for complete Decision 108 application.

### 2.5 Empirical Evidence (BCL Phase 5C-2 onward)

Of 13 columns in BCL Oct transactions, exactly one (`Cantidad_Productos_Cruzados`) has `isSequential=true`. Empirical firing rate of the structural arm in this dataset: 100% defective. The genuine entity identifier (`ID_Empleado`) is string-typed, classified via `hcRole === 'identifier'` clause — not via the structural arm. Zero legitimate firings of the structural arm in BCL substrate.

### 2.6 HC Silence Cases (Where Structural Fallback Earns Its Place)

`hcRole` becomes undefined or `'unknown'` when:
1. HC entirely absent (`header-comprehension.ts:132` falls back to `'unknown'`)
2. Tier 1 flywheel injection produces no `HeaderInterpretation` for columns missing from persisted `fieldBindings`
3. Flywheel `roleMap` at `analyze/route.ts:146-151` covers only 8 of 17 possible `semanticRole` values; missed roles map to `'unknown'`

These are signal-availability gaps, not signal-correctness gaps. The structural arm preserves entity-id classification capability in these genuine-silence cases. Phase 1G gating preserves the safety net via `!hcRole || hcRole === 'unknown'` predicate.

### 2.7 Memory Entry 30 — Reconstruction vs Substrate-Applying

Memory entry 30 says "Reconstruction restores what worked, not builds anew." Phase 1G is **substrate-APPLYING, not reconstruction-restoring**. The defect is pre-existing architectural drift from March 6 — it predates the reconstruction work. Phase 1G applies a locked decision (Decision 108) where it was never operative. Different pattern than other HF-196 phases (1B/1C/1D/1E/1F all closed regressions or wired existing infrastructure).

This distinction matters for substrate citation honesty. Phase 1G is not "restoring what worked" — it's "applying a locked decision to a predicate that always violated it." Memory entry 30's discipline still applies (empirical verification against documented operating ranges); the architectural framing differs.

### 2.8 Recusal Gate

**PASS.** Phase 1G amends VP code surfaces only. Does not amend IRA-governing substrate. Does not amend any T0/T1 IGF substrate.

### 2.9 Architect Approval Gate

**PASS.** Architect dispositioned 2026-05-03:
- Option B: Gate structural arm with `!hcRole` (preserve safety net for genuine HC silence)
- Include parallel adjacent-arm at `content-profile.ts:218`
- HF-202 + HF-203 logged as out-of-scope carry-forward
- Single phase, single commit, three files modified
- Sequence: Phase 1G commit → wipe BCL → re-import 7 files → re-import plan → calc 6 periods → reconcile against $312,033

---

## 3. INVARIANTS

- **Decision 108 (HC Override Authority Hierarchy).** Three predicates fire structural arm only when HC is silent (`!hcRole || hcRole === 'unknown'`).
- **HC primacy preserved.** Identifier branch fires on `hcRole === 'identifier'` only; structural fallback gated by HC silence.
- **Korean Test (T1-E910).** All three predicates use structural primitives (`hcRole`, `dataType`, `isSequential`, `distinctCount/rowCount`, `uniquenessRatio`); zero domain literals.
- **Scale by Design.** HC primacy is tenant-agnostic; predicate change applies uniformly across all tenants.
- **Vertical Slice Rule (memory 7).** Phase 1G touches role-binding layer that operatively writes `field_identities.structuralType` — single PR covers classification → field_identities → convergence pool → calc.
- **Adjacent-Arm Drift coverage.** Three predicates closed in Phase 1G; six remaining sites logged as HF-202 with explicit substrate citation.
- **Backward compatibility.** Existing genuine-silence cases (Tier 1 cache miss + flywheel-roleMap miss + LLM error) continue to receive structural classification. No empirical regression for cold-start or flywheel-injection-gap scenarios.

---

## 4. CRITICAL HALT CONDITIONS

1. **Build fails** with structural defect not solvable in scope.
2. **Korean Test gate fails** — predicate change introduces domain literal.
3. **Probe surfaces additional unanticipated isSequential consumer** that operatively writes `field_identities.structuralType` (i.e., a 4th defect-prone role-binding site that wasn't in the prior probe). Surface; halt for architect.
4. **Existing test suite fails** (if test fixtures depend on isSequential structural classification of non-identifier columns).
5. **CC cannot determine HC silence semantic** — if `hcRole === 'unknown'` vs `hcRole === undefined` produce different empirical behavior in current code, surface for architect disposition.

ALL OTHER ISSUES: CC resolves structurally and continues.

---

## 5. AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER pause for confirmation between sub-phases. Execute every sub-phase sequentially through commit + push without architect intervention. HALT only on Critical HALT Conditions or architect-signal-required points (wipe applied; sequential re-import signals).

---

## 6. CC FAILURE PATTERNS TO PREVENT

| # | Pattern | Prevention |
|---|---|---|
| Adjacent-Arm Drift | Closing only role-binding sites without including `content-profile.ts:218` | Phase 1G explicitly includes 3 sites, named in §2.4 |
| FP-49 | Schema fabrication | N/A — no SQL in Phase 1G |
| Substrate citation drift | Citing Decision 108 without verifying body-fidelity | §2.1 + §2.2 substrate citations include verbatim commit messages where available |
| Bypass (SR-34) | Removing the structural arm entirely (Option A) | Phase 1G is Option B (gate by HC silence); preserves safety net for genuine silence |
| Korean Test | Domain literal introduced via predicate change | All three predicates use structural primitives only |
| Architect-as-courier | CC interpreting ambiguous empirical state | CC reports structural facts; halts on Critical HALT |
| Vertical Slice violation | Predicate change without reconciliation verification | Phase 5-RESET-6 covers full pipeline (wipe → re-import → calc → reconcile) |
| FP-70 | Phase deferral as completion | Phase 1G ships single commit; closure requires Phase 5-RESET-6 PASS reconciling to $312,033 |

---

## 7. PHASE STRUCTURE

| Sub-phase | Scope | Architect signal? |
|---|---|---|
| 1G-1 | Read-only verification of three predicate sites (current state) | No |
| 1G-2 | Edit `negotiation.ts:299` (split predicate, gate structural arm) | No |
| 1G-3 | Edit `agents.ts:536` (gate structural arm by HC silence) | No |
| 1G-4 | Edit `content-profile.ts:218` (gate uniqueness-ratio arm by HC silence) | No |
| 1G-5 | Build verification (must exit 0) | No |
| 1G-6 | Korean Test gate | No |
| 1G-7 | Self-test: re-grep all 3 sites; confirm change applied | No |
| 1G-8 | Commit + push | No |
| 5-RESET-6 | Empirical verification (wipe → 7 imports → plan → calc → reconcile) | **Yes** (5 architect signals) |

---

## 8. COMPLETION REPORT SCAFFOLD (CC POPULATES)

```markdown
# HF-196 Phase 1G — Completion Report

**Phase:** 1G (HC Primacy on isSequential Structural Arm — Decision 108 Application)
**Branch:** hf-196-platform-restoration-vertical-slice
**Final commit:** <SHA>
**Date executed:** <YYYY-MM-DD>

## Phase 1G-1: Pre-Edit Verification
- negotiation.ts:295-320 current state: <pasted>
- agents.ts:533-545 current state: <pasted>
- content-profile.ts:215-225 current state: <pasted>
- All three sites confirmed present at expected line numbers.

## Phase 1G-2: negotiation.ts:299 edit
- Pre-edit: hcRole === 'identifier' || (integer && isSequential)
- Post-edit: split into two clauses (hcRole === 'identifier' branch + HC-silence-gated structural arm)
- Diff pasted: <yes/no>

## Phase 1G-3: agents.ts:536 edit
- Pre-edit: standalone if (integer && isSequential)
- Post-edit: gated by !hcRole || hcRole === 'unknown'
- Diff pasted: <yes/no>

## Phase 1G-4: content-profile.ts:218 edit
- Pre-edit: integer && uniquenessRatio > 0.90 → return true (no HC gate)
- Post-edit: gated by HC silence in calling context
- Note: content-profile.ts:218 is inside detectStructuralIdentifier — verify whether HC is available at this call site. If not, surface alternative gating mechanism (e.g., demote to 'identifier' candidacy with confidence < 0.5 and let downstream HC override) and HALT for architect.

## Phase 1G-5: Build
- Build output (tail): <pasted>
- Exit code: 0

## Phase 1G-6: Korean Test
- Script output: <pasted>
- Verdict: PASS

## Phase 1G-7: Self-test
- grep verification at all 3 sites: <pasted>
- All sites show post-edit form: <yes/no>

## Phase 1G-8: Commit
- Commit SHA: <SHA>
- Push confirmation: <pasted>
- Files changed: 3 (negotiation.ts, agents.ts, content-profile.ts)

## Phase 5-RESET-6: Empirical Verification
- Wipe applied: <timestamp>
- 7 imports completed: <list with SHAs>
- Plan import completed: <SHA + rule_set id>
- Calc 6 periods completed: <calculation_batches count>
- Per-period totals: <table>
- Per-period delta vs ground truth: <table>
- Grand total vs $312,033: <delta>

## Out-of-Scope Carry-Forward
- HF-202 candidate: 6 remaining isSequential sites (negotiation.ts:34, 79, 125; content-profile.ts:217, 460; tenant-context.ts:146)
- HF-203 candidate: SCALE ANOMALY auto-correction logic (convergence-service.ts:1558-1591 + 317-333) — should reject binding on ratio>10, not patch scale_factor
- HF-198 candidate: OB-42 Phase 4 calculation_batches audit-column gap (superseded_at + supersession_reason)
- HF-199 candidate: OB-50 surface restoration (15 schema columns + SCI integration to ingestion_events)
- commit/route.ts + intelligence/wire/route.ts data_type vocabulary (Phase 1D carry-forward)

## Phase 1G Verdict
PASS / FAIL / PASS-WITH-DELTA
```

---

## 9. OUT OF SCOPE

- **HF-202 candidate (Decision 108 full application):** Six structural-integer signal sites — `negotiation.ts:34, 79, 125`; `content-profile.ts:217, 460`; `tenant-context.ts:146`. Each produces affinity scoring or upstream signal toward entity-id classification without HC gating. Closing them per Decision 108 is the complete architectural alignment. Out of scope because they don't directly write `field_identities.structuralType`.

- **HF-203 candidate (SCALE ANOMALY correction architectural inversion):** `convergence-service.ts:1558-1591 + 317-333` interprets binding misalignment as magnitude error and patches `scale_factor` instead of rejecting the binding. Should mark `match_pass: 'failed'` when ratio>10 against peer median and force re-mapping or surface convergence gap. Out of scope because this is a separate defect class on a separate architectural surface.

- **HF-198 candidate:** OB-42 Phase 4 `calculation_batches.superseded_at` + `supersession_reason` audit-column gap (surfaced Phase 1E-1).

- **HF-199 candidate:** OB-50 surface restoration (15 schema columns missing on `ingestion_events`; SCI flow bypasses).

- **commit/route.ts + intelligence/wire/route.ts data_type vocabulary** (Phase 1D out-of-scope carry-forward; Phase 5D empirical verification: did NOT surface as live state issue).

---

## 10. END OF DIRECTIVE — NEXT SECTION IS CC PASTE BLOCK

Per Rule 29: nothing follows §11.

---

## 11. CC PASTE BLOCK

> CC: paste this section verbatim into operational context. Execute sequentially. HALT only at explicit signal-required points.

### 11.1 Read first

- `CC_STANDING_ARCHITECTURE_RULES.md` (SR-34, SR-39, SR-41, Rule 27, Rule 28, Rule 29)

### 11.2 Phase 1G-1 — Pre-edit verification

Confirm three predicate sites at expected line numbers:

```bash
cd ~/spm-platform

echo "=== negotiation.ts:295-320 (Site 1: OR predicate) ==="
sed -n '295,320p' web/src/lib/sci/negotiation.ts 2>&1
echo "---"

echo "=== agents.ts:533-545 (Site 2: standalone structural arm) ==="
sed -n '533,545p' web/src/lib/sci/agents.ts 2>&1
echo "---"

echo "=== content-profile.ts:213,225 (Site 3: uniquenessRatio adjacent-arm) ==="
sed -n '213,225p' web/src/lib/sci/content-profile.ts 2>&1
echo "---"
```
Paste output. Confirm predicates present at expected lines. If line numbers shifted (e.g., due to prior edits), surface and halt for architect re-localization.

### 11.3 Phase 1G-2 — Edit negotiation.ts:299

Current code (block to replace):
```typescript
if (hcRole === 'identifier' || (field.dataType === 'integer' && !!field.distribution.isSequential)) {
  // LLM-Primary
  if (identifiesWhat) {
    ...
  }
  // Deterministic Fallback: cardinality
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) {
    return { role: 'transaction_identifier', context: `… per-row identifier (uniqueness ${...}%, no LLM context)`, confidence: 0.80 };
  }
  return { role: 'entity_identifier',
           context: `${field.fieldName} — identifier (cardinality fallback, uniqueness ${...}%)`,
           confidence: 0.85 };
}
```

Replace with two separate clauses (HC-primary first, structural-fallback gated):

```typescript
// HF-196 Phase 1G — HC-primary identifier branch (Decision 108)
if (hcRole === 'identifier') {
  // LLM-Primary
  if (identifiesWhat) {
    ...  // PRESERVE existing body verbatim
  }
  // Deterministic Fallback: cardinality
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) {
    return { role: 'transaction_identifier', context: `… per-row identifier (uniqueness ${...}%, no LLM context)`, confidence: 0.80 };
  }
  return { role: 'entity_identifier',
           context: `${field.fieldName} — identifier (cardinality fallback, uniqueness ${...}%)`,
           confidence: 0.85 };
}

// HF-196 Phase 1G — Structural fallback ONLY when HC is silent (Decision 108)
// Preserves classification capability for cold-start / flywheel-roleMap-miss / LLM-error scenarios
// while preventing structural override of HC-confident interpretations.
if ((!hcRole || hcRole === 'unknown') && field.dataType === 'integer' && !!field.distribution.isSequential) {
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) {
    return { role: 'transaction_identifier', context: `${field.fieldName} — sequential per-row identifier (HC silent)`, confidence: 0.75 };
  }
  return { role: 'entity_identifier',
           context: `${field.fieldName} — sequential identifier (HC silent, cardinality ${...}%)`,
           confidence: 0.75 };
}
```

Notes:
- Confidence reduced from 0.85 to 0.75 in HC-silence branch — structural-only classification is less authoritative than HC-grounded.
- LLM-primary path (`if (identifiesWhat)`) stays inside HC-primary branch — only fires when HC said `'identifier'`.
- Body verbatim preservation: keep all existing log strings, return values, and confidence numbers in the HC-primary branch.

CC: read the actual file at this site, preserve the body content character-for-character, only restructure the predicate and add the second clause.

Build:
```bash
cd web && npx tsc --noEmit 2>&1 | head -10
```
Must exit 0.

### 11.4 Phase 1G-3 — Edit agents.ts:536

Current code:
```typescript
// Structural sequential integer → cardinality check
if (field.dataType === 'integer' && field.distribution.isSequential) {
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) {
    return { role: 'transaction_identifier', context: `… sequential per-row identifier`, confidence: 0.85 };
  }
  return { role: 'entity_identifier', context: `… sequential entity identifier`, confidence: 0.85 };
}
```

Replace with:
```typescript
// HF-196 Phase 1G — Structural fallback ONLY when HC is silent (Decision 108)
// Preserves entity-id classification for cold-start / flywheel-roleMap-miss scenarios;
// prevents structural override of HC-confident measure/attribute interpretations.
if ((!hcRole || hcRole === 'unknown') && field.dataType === 'integer' && field.distribution.isSequential) {
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) {
    return { role: 'transaction_identifier', context: `${field.fieldName} — sequential per-row identifier (HC silent)`, confidence: 0.75 };
  }
  return { role: 'entity_identifier', context: `${field.fieldName} — sequential entity identifier (HC silent)`, confidence: 0.75 };
}
```

Build:
```bash
cd web && npx tsc --noEmit 2>&1 | head -10
```
Must exit 0.

### 11.5 Phase 1G-4 — Edit content-profile.ts:218

**Critical: this edit requires careful reading of the call site context.** `content-profile.ts:218` is inside `detectStructuralIdentifier`, which is called during content-profile generation. HC role may not be available at this call site (HC runs after profile generation in some flows).

CC: before editing, verify the call site context:
```bash
echo "=== detectStructuralIdentifier function signature + body ==="
grep -nE "function detectStructuralIdentifier|detectStructuralIdentifier\s*\(" web/src/lib/sci/content-profile.ts | head -5
sed -n '210,235p' web/src/lib/sci/content-profile.ts 2>&1
echo "---"
echo "=== detectStructuralIdentifier call sites ==="
grep -rnE "detectStructuralIdentifier\(" web/src/ --include="*.ts" 2>&1
```

Three possibilities:

**(a) HC is available at this call site** (function signature includes hcRole or hcInterpretations parameter): apply same `!hcRole || hcRole === 'unknown'` gating.

**(b) HC is NOT available at this call site** (function called before HC runs): the predicate cannot be HC-gated directly. Two sub-options:
   - **(b.1) Pass HC through:** modify function signature to accept `hcRole?` parameter, thread through call chain. Larger blast radius.
   - **(b.2) Demote signal strength:** keep predicate but reduce its downstream weight. Function returns `true` but with a confidence/strength signal that downstream can override. Smaller blast radius if downstream consumers respect the strength.

**(c) Function is consumed only by HC-gated downstream code:** the predicate's output already gets HC-gated downstream → no fix needed at content-profile.ts:218 itself; close as no-op.

CC: read the call sites, determine which case applies, surface verdict. **HALT for architect disposition before editing if case (b) — passing HC through is non-trivial scope; case (b.2) reduces signal but doesn't close the defect; architect dispositions which path.**

If case (a) or (c): apply the appropriate edit (or no-op) and proceed.

### 11.6 Phase 1G-5 — Build verification

```bash
cd web && rm -rf .next && npm run build 2>&1 | tail -20
```
Must exit 0. Paste tail.

### 11.7 Phase 1G-6 — Korean Test gate

```bash
cd ~/spm-platform
bash scripts/verify-korean-test.sh 2>&1 | tail -20
```
Must PASS. Paste output. If FAIL → Critical HALT #2.

### 11.8 Phase 1G-7 — Self-test

Re-grep all three sites; confirm post-edit form:
```bash
echo "=== negotiation.ts post-edit ==="
sed -n '295,335p' web/src/lib/sci/negotiation.ts 2>&1 | head -40
echo "---"
echo "=== agents.ts post-edit ==="
sed -n '533,548p' web/src/lib/sci/agents.ts 2>&1
echo "---"
echo "=== content-profile.ts post-edit (or no-op note) ==="
sed -n '213,228p' web/src/lib/sci/content-profile.ts 2>&1
echo "---"
echo "=== confirm no remaining unguarded structural-arm role-binding sites ==="
grep -rnE "hcRole\s*===\s*['\"]identifier['\"]\s*\|\|\s*\(.*isSequential" web/src/lib/sci/ --include="*.ts" 2>&1
echo "(expected: zero matches — all such predicates should be split or gated)"
```
Paste output.

### 11.9 Phase 1G-8 — Commit

```bash
cd ~/spm-platform
git add -A
git status
```
Confirm scope:
- `web/src/lib/sci/negotiation.ts` (modified)
- `web/src/lib/sci/agents.ts` (modified)
- `web/src/lib/sci/content-profile.ts` (modified — or unchanged if case (c))
- NO unrelated changes

```bash
git commit -m "HF-196 Phase 1G: HC primacy on isSequential structural arm — Decision 108 application; closes Adjacent-Arm Drift on negotiation.ts:299, agents.ts:536, content-profile.ts:218; structural arm gated by HC silence; HF-202 (6 remaining sites) + HF-203 (SCALE ANOMALY correction) logged as carry-forward; closes Cantidad_Productos_Cruzados misclassification surfaced by BCL Oct calc 82,551 vs 44,590"
git push origin hf-196-platform-restoration-vertical-slice
git log --oneline -1
```
Paste commit SHA + push confirmation.

### 11.10 Phase 5-RESET-6 — Empirical Verification

Restart dev server with Phase 1G code:
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

**HALT — surface to architect:**

> Phase 1G commit landed: <SHA>. Dev rebuilt. Awaiting architect signals for Phase 5-RESET-6:
>
> 1. **"wipe applied"** — full-platform clean slate (8-table BEGIN/COMMIT, all tenants)
> 2. **"5-RESET-6 imports done"** — architect imports 7 files (BCL_Plantilla_Personal + 6 monthly transactions) via http://localhost:3000
> 3. **"5-RESET-6 plan done"** — architect imports BCL_Plan_Comisiones_2025
> 4. **"5-RESET-6 calc done"** — architect triggers calc across 6 periods
> 5. **"5G reconcile request"** — architect signals reconciliation phase

#### On signal 1 (wipe applied)
Verify wipe via tsx-script (paste counts; all = 0).

#### On signals 2 + 3
After each, verify state per Phase 5C / 5D PASS criteria (entities count, committed_data totals, structural_fingerprints, rule_sets count, convergence bindings populated).

**Critical verification at signal 2** (transaction imports complete): pull persisted `field_identities.structuralType` for `Cantidad_Productos_Cruzados`. **Must be `measure`, not `identifier`.** This is the empirical confirmation that Phase 1G Site 1 + Site 2 fixes operate.

```bash
# After all transaction imports:
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { data } = await sb
  .from('committed_data')
  .select('metadata')
  .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
  .eq('source_date', '2025-10-01')
  .limit(1);

const fi = data?.[0]?.metadata?.field_identities ?? {};
console.log('Cantidad_Productos_Cruzados field_identity:', fi.Cantidad_Productos_Cruzados);
console.log('Depositos_Nuevos_Netos field_identity:', fi.Depositos_Nuevos_Netos);
console.log('ID_Empleado field_identity:', fi.ID_Empleado);
" 2>&1
```

Expected post-1G:
- `Cantidad_Productos_Cruzados.structuralType = 'measure'` (HC-tagged measure preserved)
- `Depositos_Nuevos_Netos.structuralType = 'measure'` (unchanged)
- `ID_Empleado.structuralType = 'identifier'` (HC-tagged identifier preserved)

If `Cantidad_Productos_Cruzados.structuralType !== 'measure'`: Phase 1G failed; surface for architect; halt.

#### On signal 4 (calc done)
Verify calc state:
- 6 calculation_batches (one per period)
- entity_period_outcomes count: 510 (85 entities × 6 periods)
- Convergence binding for component_2 (Productos Cruzados): **must point to `Cantidad_Productos_Cruzados`, NOT `Depositos_Nuevos_Netos`**
- SCALE ANOMALY emissions: should be zero or near-zero (Productos Cruzados scale anomaly was a downstream symptom of misbinding; with correct binding, the anomaly disappears)

```bash
# Convergence binding check
cd web && npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: ruleSets } = await sb
  .from('rule_sets')
  .select('input_bindings')
  .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111');
const cb = ruleSets?.[0]?.input_bindings?.convergence_bindings;
console.log('component_2 binding (Productos Cruzados):', JSON.stringify(cb?.component_2, null, 2));
" 2>&1
cd ..
```

If component_2 still points to Depositos_Nuevos_Netos: Phase 1G fix didn't propagate to convergence layer (cache hit on prior fingerprint? structural-fingerprint-import_batch_id FK referencing pre-1G state?). Surface; halt.

#### On signal 5 (5G reconcile)
Component-level reconciliation against `BCL_Resultados_Esperados.xlsx`:
```bash
# Author reconciliation script
cd web && npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Pull calculated results per period
const { data: results } = await sb
  .from('calculation_results')
  .select('period_id, entity_id, payout_amount, period:periods(name, start_date)')
  .eq('tenant_id', tenantId);

// Aggregate by period
const calcByPeriod = new Map();
for (const r of results ?? []) {
  const key = (r.period as any)?.start_date ?? 'unknown';
  calcByPeriod.set(key, (calcByPeriod.get(key) ?? 0) + Number(r.payout_amount ?? 0));
}
const calcSorted = Array.from(calcByPeriod.entries()).sort();
console.log('Calculated per period:', calcSorted);
const calcTotal = calcSorted.reduce((a, [_, v]) => a + v, 0);
console.log('Calculated grand total:', calcTotal);

// Load ground truth from project knowledge
const buf = fs.readFileSync('/mnt/project/BCL_Resultados_Esperados.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);
console.log('Ground truth sample row keys:', Object.keys(rows[0] ?? {}));
console.log('Ground truth first 3 rows:', rows.slice(0, 3));

console.log('--- RECONCILIATION ---');
console.log('Expected grand total: \$312,033');
console.log('Calculated grand total: \$' + calcTotal.toLocaleString());
console.log('Delta: \$' + (312033 - calcTotal).toLocaleString());
console.log('Within 0.5%?:', Math.abs(312033 - calcTotal) / 312033 < 0.005 ? 'YES' : 'NO');
" 2>&1
cd ..
```
Paste output.

**Phase 1G PASS criteria (all must hold):**

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| Cantidad_Productos_Cruzados structuralType | 'measure' | <pasted> | |
| component_2 binding column | 'Cantidad_Productos_Cruzados' | <pasted> | |
| component_2 SCALE ANOMALY emission | 0 | <pasted> | |
| Per-period totals (6 periods) | within 0.5% of ground truth | <table> | |
| Grand total | 312,033 ± 0.5% | <pasted> | |

**If all PASS:** HF-196 closes architecturally complete. Populate completion report. Surface for PR #359 Ready for Review transition.

**If grand total within 0.5% but a single period off:** PASS-WITH-DELTA; surface specific period defect; architect dispositions.

**If grand total >0.5% delta:** Phase 1G insufficient; root cause unresolved; halt for architect.

### 11.11 Final Completion Report

Populate §8 scaffold; surface to architect channel as the closing artifact for HF-196 PR.

**End of Phase 1G directive.**
