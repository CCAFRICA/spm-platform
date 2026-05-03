# HF-196: Platform Restoration — Vision-Aligned Vertical Slice

# Classification: HF (Hotfix) — restoration of operability
# Author: Architect-drafted; CC executes
# Date: 2026-05-02
# PR Target: dev → main

---

# Closes
Three compounding architectural breaks identified in Phase 6-AUDIT (commit `8c85be2c`) that together render the platform inoperable:

1. **Convergence path drift.** Decision 153 atomic cutover incomplete. `plan_agent_seeds` reader/validator/promoter still active in convergence-service.ts; signal surface (`classification_signals.metric_comprehension`) writes happening in parallel. Convergence does NOT read from signal surface as operative input.
2. **Entity binding gap.** OB-182 removed import-side post-commit construction (entity resolution + back-link); calc-side replacement was never delivered. Bulk-imported rows land with `entity_id = NULL`. Engine cannot attribute committed_data to entities.
3. **Import surface fragmentation.** Two endpoints (`/api/import/sci/execute` for plan; `/api/import/sci/execute-bulk` for non-plan) instead of architect-stated ONE import surface. Fragmentation is the structural source of #2 — `execute` calls entity resolution; `execute-bulk` does not.

# Implements
Vision per T1 substrate (IRA-confirmed at full body fidelity in IRA-COMPREHENSION-DOC, PR #52):
- Korean Test (T1-E910 + T1-E922) — structural heuristics; zero domain-specific literals in foundational code
- Carry Everything, Express Contextually (T1-E902) — import all columns; AI classifications are hints not gates
- Vertical Slice Rule (T1-E906) — engine and experience evolve together; one PR
- Synaptic State Specification — agents communicate via shared surface; no private inter-agent state
- Calc-time binding (D92) — engine binds at calculation time
- Single canonical surface (D154/D155) — one signal surface; one import surface
- Atomic cutover (D153 B-E4) — every seeds reference eradicated in one event

# Builds On
- HF-195 (PR to be opened in Phase 0 of this directive) — prompt-layer registry derivation; PrimitiveEntry extension; two T5 rules; Korean Test build gate. Phases 1-5 only; Phase 6 verification scope absorbed into this HF.
- IRA-HF-195 decomposition (PR #51) — substrate-grounded IRA findings supporting HF-195
- IRA-COMPREHENSION-DOC decomposition (PR #52) — vision-grounded comprehension model

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I." NEVER pause for confirmation between phases. Execute every phase sequentially through Phase X (Completion Report) without architect intervention. HALT only on the explicit Critical HALT Conditions below.

## CRITICAL HALT CONDITIONS (architect-disposition required)

CC HALTs and surfaces ONLY when:
1. **Prerequisite verification fails** (Phase 0A) and architect cannot resolve via documented disposition path
2. **Build fails** (any phase) AND root cause is structural defect not solvable by code-level fix within scope
3. **Korean Test build gate fails** AND the violation cannot be remediated structurally within scope (would require domain-name reintroduction)
4. **Vertical slice verification reveals component-level reconciliation mismatch** — HALT for architect disposition (reopen HF / close with delta named in CR)
5. **Substrate-extending architectural decision required** that was not pre-authorized in this directive (per DS-021 §12)
6. **Tenant data integrity risk** — any operation that would write to or modify production data outside the explicitly-authorized scope

ALL OTHER ISSUES: CC resolves structurally and continues. No "shall I proceed" stops. No mid-phase architect dispositions.

---

## CC_STANDING_ARCHITECTURE_RULES.md
**READ THIS FILE FIRST.** All rules apply. Specifically relevant to this HF:
- Rule 27 [HF-195] — Prompt-layer registry derivation (already shipped in HF-195; verify holds)
- Rule 28 [HF-195] — Three-tier resolution at prompt-layer (already shipped; verify holds)
- SR-34 — No bypass recommendations
- SR-41 — Revert discipline
- SR-42 — Locked-rule halt
- Rule 27 — Paste evidence; no self-attestation
- Rule 28 — One commit per phase
- Rule 29 — Korean Test universal

---

## RECUSAL GATE
**PASS.** This HF amends VP code surfaces (`web/src/app/api/import/`, `web/src/app/api/calculation/`, `web/src/lib/intelligence/`, `web/src/lib/sci/`). Does NOT amend IRA-governing substrate. Does NOT amend any T0/T1 substrate body content.

---

## ARCHITECT APPROVAL GATE
**PASS.** Architect approved (this conversation, 2026-05-02):
- Three architectural breaks closed as one coherent vertical slice
- HF-195 ships standalone first (Phases 1-5 complete; Phase 6 verification absorbed into HF-196)
- PR sequencing: PR #51 → PR #52 → HF-195 PR → HF-196 PR (in order)
- Vision-aligned engineering: T1 principles as gate; substrate population follows restoration

---

## PRIME DIRECTIVE — VISION

The platform shall, after this HF lands, deliver this end-to-end function for any tenant:

1. Architect uploads roster, transactions, plan, references via the **one import surface**
2. SCI agents classify each file structurally (Korean Test — no field-name matching)
3. Classifications written as L1 Classification signals to `classification_signals` (single canonical surface)
4. Plan interpretation writes L2 Comprehension signals to the same surface
5. ALL columns committed to `committed_data` (Carry Everything; entity_id intentionally null at import per Decision 92)
6. Architect triggers calculation
7. **Calc-time entity resolver** populates entity_id on committed_data rows (or transient calc-time map; engineering decision made in this HF)
8. **Convergence reads L2 Comprehension signals from `classification_signals`** as the operative input (no seeds; signal surface IS the path)
9. Convergence validates against L1 Classification signals; produces metric_derivations
10. Engine consumes derivations; produces calculation_results
11. Architect reconciles component-level against tenant-supplied expected results

Every change in this HF serves this end-to-end function. Anything that doesn't serve it is out of scope.

---

## PREREQUISITES (verified Phase 0A)

| # | Prerequisite | Verification command | Disposition if fails |
|---|---|---|---|
| 1 | PR #51 (IRA-HF-195 decomposition) merged on vialuce-governance main | `cd ~/vialuce-governance && git log origin/main --oneline -10 \| grep -i "ira-hf-195\|#51"` | If unmerged: `gh pr merge 51 --merge --delete-branch --repo vialuce/vialuce-governance` |
| 2 | PR #52 (IRA-COMPREHENSION-DOC) merged on vialuce-governance main | `cd ~/vialuce-governance && git log origin/main --oneline -10 \| grep -i "ira-comprehension\|#52"` | If unmerged: `gh pr merge 52 --merge --delete-branch --repo vialuce/vialuce-governance` |
| 3 | HF-195 branch (`hf-195-prompt-layer-registry-derivation`) carries Phases 1-5 commits | `cd ~/spm-platform && git log hf-195-prompt-layer-registry-derivation --oneline -10` | Should show 7+ commits. If missing: HALT — architect investigates |
| 4 | HF-195 PR not yet open OR open and ready to merge | `gh pr list --repo CCAFRICA/spm-platform --head hf-195-prompt-layer-registry-derivation` | If absent: open HF-195 PR per Phase 0B. If open: verify status; merge per Phase 0C |
| 5 | Working tree clean on `~/spm-platform` | `cd ~/spm-platform && git status` | If dirty: SR-41 disposition (revert if pushed; checkout if untracked noise) |
| 6 | Phase 6 audit committed (`8c85be2c`) on hf-195 branch | `cd ~/spm-platform && git show 8c85be2c --stat \| head` | If absent: HALT — architect investigates |
| 7 | BCL tenant clean state per Phase 6-PRE wipe + roster re-import | tsx-script: counts on committed_data, entities, rule_sets, calculation_results | If non-zero `rule_sets` or `calculation_results`: surface; architect determines whether to re-wipe |

If any prerequisite fails AND the disposition path resolves it: CC executes the disposition and continues. If the disposition cannot resolve: HALT (Critical HALT Condition #1).

---

## READ FIRST (filesystem-resolvable; no fabricated paths)

1. `~/spm-platform/CC_STANDING_ARCHITECTURE_RULES.md`
2. `~/spm-platform/SCHEMA_REFERENCE_LIVE.md`
3. `~/spm-platform/docs/audit-evidence/HF-195/Phase-6-AUDIT_Import_To_Calculate_Flow_20260502.md` (commit `8c85be2c` on `hf-195-prompt-layer-registry-derivation`)
4. `~/vialuce-governance/docs/comprehension/Platform_Architecture_Comprehension_v2_20260502.md` (post-PR-#52-merge)
5. `~/vialuce-governance/docs/IRA-responses/Platform_Comprehension_INVOCATION_{1,2,3}_*.md` (substrate-coherence findings)
6. `~/spm-platform/web/src/app/api/import/sci/execute/route.ts` (plan import path; HF-126 + HF-109 entity resolution)
7. `~/spm-platform/web/src/app/api/import/sci/execute-bulk/route.ts` (data import path; `_postCommitConstruction_REMOVED` dead code at lines 866-1085)
8. `~/spm-platform/web/src/lib/sci/entity-resolution.ts` (resolveEntitiesFromCommittedData — DS-009 3.3)
9. `~/spm-platform/web/src/lib/intelligence/convergence-service.ts` (seeds reader at lines 185-253; signal surface write path post-OB-197)
10. `~/spm-platform/web/src/app/api/calculation/run/route.ts` (engine entry; reads committed_data.entity_id at lines 382-453)
11. `~/spm-platform/web/src/lib/compensation/ai-plan-interpreter.ts` (post-HF-195; registry-derived prompt; metric_comprehension signal write)

---

## CC FAILURE PATTERNS TO PREVENT

| # | Pattern | Prevention |
|---|---|---|
| FP-49 | Schema fabrication | Schema queries via tsx-script before any SQL or interface change |
| FP-66 | Manual SQL workaround | Zero data-modifying SQL outside explicit migration scope. Fix logic, not data |
| FP-69 | Fix one thing, leave others | All three breaks closed in this HF — they are coupled |
| FP-70 | Phase deferral as completion | HF-196 closes ONLY when component-level reconciliation passes |
| CWA-Premise | Tenant-specific assumptions in platform code | NO tenant-specific names, primitives, or data in any code change. BCL is the verification tenant; the code must work for any tenant |
| CWA-Schema | Asserting infrastructure capabilities from memory | Verify via grep, file:line citations, structural reads — never claims |
| Reverse-engineering | Patching code to make BCL pass | On reconciliation mismatch: surface structural cause + file:line; do NOT propose fix that adjusts output toward expected values |
| Architect-as-courier | CC interpreting ambiguous output | CC reports structural facts; architect interprets values |

---

## INVARIANTS THROUGHOUT

- **Vertical Slice.** All three breaks closed in one PR. No partial ship.
- **Korean Test universal.** Build-time gate active (HF-195 Rule 27); no domain-named literals introduced.
- **Single canonical surface.** Signal surface = `classification_signals`. Import surface = ONE endpoint. Calc-time entity resolution writes to ONE place per architect engineering decision (Phase 2C).
- **No seeds.** Every reference to `plan_agent_seeds` (snake_case + camelCase + comments + log strings) eradicated in one event.
- **No GT values in code or directives.** CC reports computed values; architect compares.
- **Tenant-agnostic.** Code accepts tenant_id + expected-results-file-path as runtime parameters. Verification tenant is BCL; code must work for any tenant.
- **Capability-first routing.** CC executes builds, greps, file reads, schema queries, tsx-scripts, commits, pushes, PR creation. Architect actions: SQL Editor migrations (if any), browser verification, PR merge. Both run in their lanes per memory entry 27.
- **Evidence required.** Every gate produces pasted code, pasted terminal output, or pasted grep results. PASS attestation alone is not accepted.

---

## PHASE 0: PREREQUISITE VERIFICATION + HF-195 SHIP + AUDIT-INFORMED CURRENT-STATE READ

### 0A: Prerequisite verification (Critical HALT Condition #1 if fails)
Run every command in the Prerequisites table. Paste output verbatim.

### 0B: HF-195 PR creation (if not already open)
If Prerequisite #4 shows no open HF-195 PR:
```bash
cd ~/spm-platform
git checkout hf-195-prompt-layer-registry-derivation
git push origin hf-195-prompt-layer-registry-derivation
gh pr create --base main --head hf-195-prompt-layer-registry-derivation \
  --title "HF-195: Prompt-layer registry derivation + two T5 rules + PrimitiveEntry extension" \
  --body "$(cat <<'EOF'
## Closes
Empirical defect: AI emits unrecognized componentType strings (matrix_lookup) at prompt-layer surface, despite HF-194 importer-surface fix.

## Implements
IRA-HF-195 decomposition recommendations (PR #51 merged):
- Inv-2 rank 1 (option_b_plus_c) Phase 1: registry-derived enumeration + structural-examples PREPARE-path slot
- Inv-3 rank 1 (sub_option_b_beta): PrimitiveEntry extended with optional promptStructuralExample
- Inv-1 supersession_candidates: two T5 standing rules landed verbatim

## Phase scope
Phases 1-5 complete (registry derivation, PrimitiveEntry extension, prompt refactors, Korean Test build gate, T5 rules). Phase 6 (vertical slice verification) deferred to HF-196 which closes the upstream architectural breaks discovered during Phase 6 audit.

## Architect-approved (DS-021 §12 substrate-extending)
PrimitiveEntry interface shape extension.

## Traceability
- IRA-HF-195 Inv-1: 2a104f46-7ea8-4f36-b1a1-d916e53de131 (\$1.22)
- IRA-HF-195 Inv-2: 319ed49f-8e7c-4c0c-b693-da435a5cb1c4 (\$1.46)
- IRA-HF-195 Inv-3: \$1.43
- vialuce-governance PR #51: merged
- Phase 6 audit revealed three additional architectural breaks now scoped into HF-196
EOF
)"
```
Paste PR URL.

### 0C: Merge HF-195 PR
```bash
gh pr list --repo CCAFRICA/spm-platform --head hf-195-prompt-layer-registry-derivation --json number,mergeStateStatus,mergeable
```
If `mergeable=MERGEABLE`:
```bash
gh pr merge <PR#> --merge --delete-branch --repo CCAFRICA/spm-platform
```
If not mergeable: surface mergeStateStatus; HALT (Critical HALT #2).

### 0D: Branch HF-196 from clean main
```bash
cd ~/spm-platform
git checkout main && git pull
git checkout -b hf-196-platform-restoration-vertical-slice
git status   # MUST show clean tree
```

### 0E: Audit-informed current-state read
The Phase 6-AUDIT (commit `8c85be2c`, now merged via HF-195 PR) is the authoritative current-state map. Read it:
```bash
cat docs/audit-evidence/HF-195/Phase-6-AUDIT_Import_To_Calculate_Flow_20260502.md
```
Confirm structurally:
- Two import endpoints exist: `execute/route.ts` (plan path) + `execute-bulk/route.ts` (bulk path)
- `_postCommitConstruction_REMOVED` is dead code at execute-bulk:866-1085
- `resolveEntitiesFromCommittedData` exists in `web/src/lib/sci/entity-resolution.ts:26`, called only from `execute/route.ts:232`
- Calc-side has zero `UPDATE committed_data` calls
- `convergence-service.ts:185-253` carries seeds reader/validator/promoter

Verify these via grep (paste output for each):
```bash
grep -nE "_postCommitConstruction_REMOVED|REMOVED by OB-182" web/src/app/api/import/sci/execute-bulk/route.ts
grep -nE "resolveEntitiesFromCommittedData" web/src/ --include="*.ts" -r
grep -rnE "from\\('committed_data'\\)" web/src/lib/calculation/ web/src/app/api/calculation/ --include="*.ts" | grep -iE "update|insert"
grep -nE "planAgentSeeds|plan_agent_seeds|Decision 147.*seed" web/src/lib/intelligence/convergence-service.ts
```

If audit findings do NOT match current code on main: HALT (Critical HALT #2 — codebase shifted between audit and HF-196 start).

### 0F: BCL clean-state verification
The Phase 6-PRE BCL wipe + roster re-import was confirmed at the prior HF-195 work session. Re-verify:
```bash
cd web && set -a && source .env.local && set +a
npx tsx scripts/verify-hf195-import-state.ts b1c2d3e4-aaaa-bbbb-cccc-111111111111 _discovery_
```
Expected: 1 distinct data_type (the post-wipe roster), 0 rule_sets, 0 calculation_results.
If state has drifted: surface; HALT only if drift indicates additional contamination requiring wipe (Critical HALT #6).

### 0G: Build verification baseline
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Korean Test build gate active (Rule 27 from HF-195). Paste output.

**Commit:** `git add -A && git commit -m "HF-196 Phase 0: Prerequisites + audit-informed current-state read + BCL clean-state baseline" && git push origin hf-196-platform-restoration-vertical-slice`

---

## PHASE 1: BREAK #3 RESOLUTION — IMPORT SURFACE UNIFICATION

### Engineering decision (architect-pre-authorized)

**Architectural intent:** ONE import surface. The current execute/execute-bulk split fragments the architecture and is the structural source of Break #2.

**Implementation:** Unify by extracting the post-commit work (entity resolution, signal write, downstream construction) into a shared module called by BOTH endpoints, then converging endpoints to use the shared module identically. This preserves backward compatibility of the API URLs while making the actual processing one path.

Alternative (reject): collapse to one URL endpoint. Rejected because UI dispatch logic (`SCIExecution.tsx:285-287`) is a UI concern and the URL split reflects current callers; changing URLs would require UI work outside vertical slice for this break.

### 1A: Locate post-commit work currently in execute (plan path) only
```bash
grep -nA 5 "resolveEntitiesFromCommittedData\|HF-126\|HF-109\|rule_set_assignments" web/src/app/api/import/sci/execute/route.ts
```
Paste output. Identify the post-commit code blocks that run for plan but NOT for bulk.

### 1B: Locate the dead code from OB-182 in execute-bulk
```bash
grep -nA 5 "_postCommitConstruction_REMOVED\|REMOVED by OB-182" web/src/app/api/import/sci/execute-bulk/route.ts
```
Paste output. This is the original implementation that was removed; structural reference for what should run.

### 1C: Extract shared post-commit module
Create `web/src/lib/sci/post-commit-construction.ts`:
- Korean Test compliant — no domain-name literals
- Tenant-agnostic — accepts tenant_id, batch context as parameters
- Exports a single function `executePostCommitConstruction(context)` that performs:
  - Entity resolution against committed_data (delegates to resolveEntitiesFromCommittedData)
  - entity_id back-link onto committed_data rows
  - Signal write for any post-commit classification signals
  - Returns structural counts (rows linked, entities resolved) for caller logging

### 1D: Wire execute (plan path) to use the shared module
- Replace inline post-commit logic at execute/route.ts with call to `executePostCommitConstruction`
- Plan-specific logic (rule_set_assignments creation per HF-126) remains in execute (plan-specific concern)
- Verify by build + grep that no functional change to plan path

### 1E: Wire execute-bulk (bulk path) to use the shared module
- Add call to `executePostCommitConstruction` after committed_data inserts
- Remove or finally retire `_postCommitConstruction_REMOVED` dead code (it's superseded; SR-41 disposition: it never went to production via that name, so deletion is clean)
- Verify by build that bulk path now runs entity resolution

### 1F: Build + Korean Test gate verification
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Korean Test gate (HF-195 Rule 27) must NOT trip. Paste output.

### 1G: Verify shared module has zero callers other than the two API routes
```bash
grep -rn "executePostCommitConstruction" web/src/ --include="*.ts"
```
Expected: definition site + 2 callers. If more: surface — broader refactor in scope.

**Commit:** `git add -A && git commit -m "HF-196 Phase 1: Break #3 — import surface unified via shared post-commit-construction module" && git push origin hf-196-platform-restoration-vertical-slice`

---

## PHASE 2: BREAK #2 RESOLUTION — ENTITY BINDING AT CALC TIME

### Engineering decision (architect-pre-authorized)

**Architectural intent:** Decision 92 calc-time binding extends to entity binding. Engine resolves entity attribution at calculation time, not import time.

**Implementation choice:** **Durable update at calc time.** Calc-time entity resolver runs at calculation start; populates `committed_data.entity_id` via UPDATE for any rows where entity_id is NULL and an entities-table match exists. Engine then reads entity_id from committed_data as today.

Rationale for durable over transient:
- Engine already reads `committed_data.entity_id` at lines 382-453 — durable update aligns with existing read pattern (no engine refactor needed)
- Subsequent calc runs benefit from prior resolution work (idempotent)
- Diagnostic visibility — `entity_id NULL` after calc run = unresolvable row, surfaced as data quality signal

### 2A: Verify entity_id schema on committed_data
```bash
cd web && set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await sb.from('committed_data').select('id').limit(1);
console.log('committed_data accessible:', !!data);
"
```
Confirm column accessibility. (HF-195 Schema Reference confirms entity_id column exists; this is sanity check.)

### 2B: Locate calc-side entry point
```bash
grep -nE "from\\('committed_data'\\)" web/src/app/api/calculation/run/route.ts | head -10
grep -nE "entity_id" web/src/app/api/calculation/run/route.ts | head -10
```
Identify:
- The first read of committed_data in the calc run flow (likely around line 382 per audit)
- The function that loads + groups data by entity for engine consumption

### 2C: Implement calc-time entity resolver
Create or extend `web/src/lib/sci/calc-time-entity-resolution.ts`:
- Function `resolveEntitiesAtCalcTime(tenantId, supabase)` that:
  - Queries committed_data for rows WHERE tenant_id = $1 AND entity_id IS NULL
  - For each row, attempts structural entity match (Korean Test — match by structural identifier values, not field names)
  - Populates entity_id via UPDATE for matched rows
  - Returns counts: { totalNullRows, matched, unmatched }
- Korean Test compliant — entity matching uses value-distribution / data-type heuristics from row_data, not hardcoded field names
- Idempotent — running twice produces same result

The matching logic delegates to existing `resolveEntitiesFromCommittedData` if its structural matching logic is appropriate. If not, write new structural matcher — never field-name matcher.

### 2D: Wire calc-time resolver into calc run flow
At the top of the calc run flow in `run/route.ts` (before any committed_data reads):
```typescript
// HF-196 Break #2 — calc-time entity binding per D92 + OB-182 intent
const entityResolution = await resolveEntitiesAtCalcTime(tenantId, supabase);
console.log(`[Calc-time entity resolution] tenant=${tenantId} totalNull=${entityResolution.totalNullRows} matched=${entityResolution.matched} unmatched=${entityResolution.unmatched}`);
```
If `unmatched > 0`: surface as data quality signal in calc run output (does NOT halt calc — the calc proceeds for resolved rows).

### 2E: Build verification + Korean Test gate
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Korean Test gate must NOT trip.

### 2F: Verify calc-time resolver is idempotent
Write a one-shot test (do not commit; delete after):
```typescript
// scripts/diag-hf196-resolver-idempotency.ts (DO NOT COMMIT)
// Run resolveEntitiesAtCalcTime twice; verify second run returns matched=0
```
Run; paste output; delete script.

**Commit:** `git add -A && git commit -m "HF-196 Phase 2: Break #2 — calc-time entity resolver per D92; engine entity binding restored" && git push origin hf-196-platform-restoration-vertical-slice`

---

## PHASE 3: BREAK #1 RESOLUTION — DECISION 153 ATOMIC CUTOVER (SEEDS → SIGNAL SURFACE)

### Engineering decision (architect-pre-authorized; this is D153 B-E4)

**Eradicate every plan_agent_seeds reference.** Make convergence read from `classification_signals.metric_comprehension` as the operative input. ATOMIC — in one commit if possible; if file size requires multiple commits, all within Phase 3.

### 3A: Inventory ALL seeds references
```bash
grep -rnE "plan_agent_seeds|planAgentSeeds|Decision 147.*seed|Seed.*VALIDATED" web/src/ --include="*.ts" | grep -v node_modules
```
Paste full output. Every match is in scope for eradication.

### 3B: Inventory current signal write path (post-OB-197/198)
```bash
grep -nA 5 "metric_comprehension\|persistSignal.*comprehension" web/src/lib/compensation/ai-plan-interpreter.ts web/src/lib/intelligence/convergence-service.ts web/src/lib/ai/signal-persistence.ts
```
Paste output. Verify metric_comprehension signals ARE being written at plan interpretation (post-OB-197/198 work).

### 3C: Implement convergence read from signal surface
In `web/src/lib/intelligence/convergence-service.ts`:

Locate the function that currently reads seeds (around lines 185-253 per audit). Replace with read from classification_signals:

```typescript
// HF-196 Break #1 — D153 B-E4 atomic cutover; convergence reads metric_comprehension signals
async function loadMetricComprehensionSignals(tenantId: string, ruleSetId: string, supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('classification_signals')
    .select('signal_value, vocabulary_bindings, header_comprehension, metric_name, component_index, classification_trace')
    .eq('tenant_id', tenantId)
    .eq('rule_set_id', ruleSetId)
    .eq('signal_type', 'metric_comprehension');
  
  if (error) throw new Error(`Convergence signal surface read failed: ${error.message}`);
  return data || [];
}
```

Use the composite index per D153 A2 (rule_set_id + signal_type) — if index does not exist, surface as Phase 3 finding for architect SQL Editor application.

Replace the seeds-validation logic with signal-validation logic. Same DataCapability validation, but inputs come from signals not seeds.

### 3D: Eradicate every seeds reference
For every match from 3A:
- If in convergence-service.ts: replace with signal-surface logic OR delete
- If in storage/migration paths: verify already-removed (per PR #339); delete any orphan references
- If in log strings: delete or replace with signal-surface log strings
- If in comments: update to reflect new architecture

After eradication, verify ZERO matches:
```bash
grep -rnE "plan_agent_seeds|planAgentSeeds|Decision 147.*seed|Seed.*VALIDATED" web/src/ --include="*.ts" | grep -v node_modules
```
**Expected: ZERO matches.** If any remain: HALT (Critical HALT #2).

### 3E: Composite index verification
```bash
cd web && set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data, error } = await sb.from('classification_signals').select('signal_type').limit(1);
console.log('classification_signals accessible:', !!data, 'error:', error);
"
```
If composite index per D153 A2 is missing: write SQL to architect channel for SQL Editor application:
```sql
CREATE INDEX IF NOT EXISTS idx_classification_signals_rule_set_signal_type 
ON classification_signals (tenant_id, rule_set_id, signal_type) 
WHERE signal_type = 'metric_comprehension';
```
Surface inline; architect applies if needed.

### 3F: Build verification
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0.

### 3G: Korean Test verification
```bash
bash scripts/verify-korean-test.sh
```
Must PASS (Rule 27 from HF-195).

**Commit:** `git add -A && git commit -m "HF-196 Phase 3: Break #1 — D153 atomic cutover; seeds eradicated; convergence reads metric_comprehension signal surface" && git push origin hf-196-platform-restoration-vertical-slice`

---

## PHASE 4: INTEGRATION VERIFICATION (CODE-LEVEL, PRE-RUNTIME)

### 4A: Trace the unified flow
Verify by grep that the end-to-end path is structurally consistent:
- File upload → ONE import surface (Phase 1)
- SCI classification → committed_data write
- Post-commit construction → calls shared module (entity resolution + signal write)
- Calc trigger → calc-time entity resolver runs first (Phase 2)
- Convergence reads metric_comprehension signals (Phase 3)
- Engine consumes derivations from convergence
- Engine reads committed_data with entity_id resolved
- Calculation results produced

For each step, paste a grep that confirms the surface exists and is wired:
```bash
grep -n "executePostCommitConstruction" web/src/app/api/import/sci/execute/route.ts web/src/app/api/import/sci/execute-bulk/route.ts
grep -n "resolveEntitiesAtCalcTime" web/src/app/api/calculation/run/route.ts
grep -n "loadMetricComprehensionSignals\|metric_comprehension" web/src/lib/intelligence/convergence-service.ts
grep -rn "plan_agent_seeds\|planAgentSeeds" web/src/ --include="*.ts"  # MUST be empty
```
Paste all output.

### 4B: Build + lint final
```bash
cd web && rm -rf .next && npm run build && npm run lint
```
Both must exit 0.

### 4C: Schema reference refresh check
If any new columns/indexes were introduced in this HF: verify SCHEMA_REFERENCE_LIVE.md is current. If new index for D153 A2 was applied: ensure it's documented.
```bash
grep -i "metric_comprehension\|rule_set_signal_type" SCHEMA_REFERENCE_LIVE.md
```
If absent and an index/column was added: write update SQL inline; architect applies; CC re-verifies post-application.

**Commit:** `git add -A && git commit -m "HF-196 Phase 4: Integration verification — unified flow traced; build + lint green" && git push origin hf-196-platform-restoration-vertical-slice`

---

## PHASE 5: VERTICAL SLICE VERIFICATION GATE (TENANT-AGNOSTIC)

### CRITICAL: Anti-reverse-engineering invariants

Phase 5 verifies the platform works against an architect-selected tenant with architect-supplied expected-results file. CC's discipline:

- **CC_INV_1:** Zero tenant-specific string literals in any new code or verification scripts. Tenant ID + file path are runtime parameters.
- **CC_INV_2:** Generic XLSX parsing — discover sheet/column structure dynamically; do NOT hardcode tenant-specific column names.
- **CC_INV_3:** CC never reads GT file contents into chat. Reconciliation script reports counts + keys; never values.
- **CC_INV_4:** On mismatch, CC reports `{matches, mismatches, missing, extra}` + mismatch keys (entity|period|component triplets) + computed values. NEVER expected values.
- **CC_INV_5:** On mismatch, CC's diagnosis is structural only — file:line + registry primitive + dispatch path. NEVER tenant-specific.
- **CC_INV_6:** On mismatch, CC does NOT propose patches. Architect dispositions.
- **CC_INV_7:** Read-only verification. No writes to tenant data outside calc execution itself.

### Architect-supplied runtime parameters

**TENANT_ID:** `b1c2d3e4-aaaa-bbbb-cccc-111111111111` (BCL — verification tenant)
**EXPECTED_RESULTS:** `~/spm-platform/test-fixtures/bcl/BCL_Resultados_Esperados.xlsx` (architect lands file before Phase 5; if missing at 5G, HALT — Critical HALT #1)
**DEPLOY_TARGET:** production (vialuce.ai)

### 5A: Confirm clean dev environment
```bash
cd web && rm -rf .next && npm run build && npm run dev &
sleep 5
curl -I http://localhost:3000/login
```
Confirm dev reachable. Build PASS.

### 5B: Architect imports BCL roster via production browser
**Architect action (SR-44):** vialuce.ai → BCL tenant context → import `BCL_Plantilla_Personal.xlsx`.
**CC waits.** When architect signals "roster imported," CC executes:
```bash
npx tsx scripts/verify-hf195-import-state.ts b1c2d3e4-aaaa-bbbb-cccc-111111111111 _discovery_
```
Paste output. Identify the new roster data_band value from data_type_inventory. Re-run with that band:
```bash
npx tsx scripts/verify-hf195-import-state.ts b1c2d3e4-aaaa-bbbb-cccc-111111111111 <discovered_band>
```
Paste output.

**PASS criterion:** total_rows > 0; structural_anomaly_flags shows resolution status. If `ALL_NULL_ENTITY` and Phase 1+2 wired correctly: HALT (Critical HALT #2 — wiring defect).

### 5C: Architect imports BCL transaction files (6 monthly files)
**Architect action (SR-44):** Import each via browser sequentially. Signal CC after each.
**CC verifies after each:** same script with transaction band. Paste output. Confirm cumulative count + source_date distribution.

### 5D: Architect imports BCL plan file (THE HF-196 ATOMIC CUTOVER PROOF)
**Architect action (SR-44):** Import `BCL_Plan_Comisiones_2025.xlsx` via browser.
**CC verifies:**
```typescript
// Generic verification — no BCL-specific assertions
const { data: ruleSets } = await supabase
  .from('rule_sets')
  .select('id, name, components')
  .eq('tenant_id', tenantId);
// Report counts + componentType distribution
```
**Verifies separately via Vercel logs:**
- Zero `UnconvertibleComponentError` (Rule 27 from HF-195 holds)
- Zero `plan_agent_seeds` log strings (D153 cutover holds)
- Presence of `metric_comprehension` signal write log strings
- componentType emissions ⊆ PrimitiveEntry registry IDs

**PASS criterion:** rule_sets populated; ZERO seeds log strings; ZERO UnconvertibleComponentError.
**HALT condition:** ANY seeds log string OR UnconvertibleComponentError → Critical HALT #2.

### 5E: Architect triggers calculation
**Architect action (SR-44):** Trigger calculation for BCL tenant via browser.
**CC verifies:**
```typescript
// Phase 2 calc-time entity resolution should fire
// Check Vercel logs for [Calc-time entity resolution] log line
// Verify entity_id back-link populated post-calc

const { data: backlinkCheck } = await supabase
  .from('committed_data')
  .select('id, entity_id', { count: 'exact' })
  .eq('tenant_id', tenantId);
// Report: total rows, rows with entity_id resolved, rows with entity_id NULL
```
Paste output.

**PASS criterion:** entity_id resolved on > 0 rows; calc-time resolver log line present.

```typescript
const { data: results, count } = await supabase
  .from('calculation_results')
  .select('*', { count: 'exact', head: false })
  .eq('tenant_id', tenantId);
```
Paste count.

**PASS criterion:** calculation_results count > 0.

### 5F: Convergence read-path verification
Vercel logs check during the calc run window:
- Presence of `loadMetricComprehensionSignals` or equivalent log line (Phase 3 read path active)
- Absence of seeds log strings (Phase 3 eradication holds)

Paste relevant log excerpts.

### 5G: Component-level reconciliation
Verify expected-results file is at expected path:
```bash
ls -la ~/spm-platform/test-fixtures/bcl/BCL_Resultados_Esperados.xlsx
```
If absent: HALT (Critical HALT #1 — architect must land file).

Write `web/scripts/verify-hf196-reconciliation.ts` (commit only the reconciliation script — NOT GT values):

Generic reconciliation logic:
- Parse expected-results XLSX dynamically (discover entity|period|component|value tuple shape)
- Query calculation_results for tenant
- Build expectedMap and actualMap (Map<key, number> where key = "entity|period|component")
- Compute matches, mismatches, missing, extra
- Output ONLY counts + keys + computed values; NEVER expected values

Run:
```bash
npx tsx scripts/verify-hf196-reconciliation.ts b1c2d3e4-aaaa-bbbb-cccc-111111111111 ~/spm-platform/test-fixtures/bcl/BCL_Resultados_Esperados.xlsx
```
Paste output.

### 5H: Closure determination
HF-196 CLOSES iff:
- All Phase 0-4 build/Korean-Test/structural gates PASS
- Phase 5B-5F runtime verifications PASS (entity resolution, no seeds, signal surface read-path active)
- Phase 5G reconciliation: matches > 0 AND mismatches == 0 AND missing == 0 AND extra == 0

**If reconciliation has ANY non-zero count:** HALT (Critical HALT #4) for architect disposition.
- Paste counts
- Paste mismatch keys (no values)
- Surface structural diagnosis: which registry primitives in mismatch components, which calc-time bindings, which periods
- File:line references for structural cause
- Architect dispositions: reopen / close with delta named in CR + new HF drafted

**If full PASS:** continue to Phase 6.

**Commit:** `git add -A && git commit -m "HF-196 Phase 5: Vertical slice verification — outcome [PASS|HALT_DELTA]" && git push origin hf-196-platform-restoration-vertical-slice`

---

## PHASE 6: COMPLETION REPORT + PR

### 6A: Write `docs/completion-reports/HF-196_COMPLETION_REPORT.md`

Required sections:
1. **Phase summary table** — per-phase commit SHA, gate results (Phase 0-5)
2. **Files modified inventory** — full list with brief description
3. **Three break closures**:
   - Break #1 (D153 atomic cutover): seeds eradication grep evidence + signal surface read-path file:line
   - Break #2 (calc-time entity binding): resolver file:line + idempotency test evidence + post-calc back-link counts
   - Break #3 (import surface unification): shared module file + caller verification
4. **Korean Test build-time gate** — verification (intentional violation test)
5. **Vertical slice verification outcome** — Phase 5G output verbatim (without GT values)
6. **Vision alignment** — for each closed break, T1 principle honored:
   - Korean Test (T1-E910 + T1-E922): zero domain literals introduced
   - Carry Everything (T1-E902): all columns committed; entity_id resolution at calc time
   - Vertical Slice Rule (T1-E906): all three breaks closed in one PR
   - Synaptic State Specification: signal surface as operative path
   - Calc-time binding (D92): entity_id resolved at calc time
   - Single canonical surface (D154/D155): one signal surface; one import surface (via shared module)
   - Atomic cutover (D153 B-E4): every seeds reference eradicated in one event
7. **Substrate-bounded-authority status**: confirm engineering decisions stayed within architect-pre-authorized scope (Phase 1B durable-update; Phase 2 unification via shared module; Phase 3 atomic eradication)
8. **Phase 6-AUDIT findings closure**: each finding from `docs/audit-evidence/HF-195/Phase-6-AUDIT_*` confirmed closed; with file:line evidence
9. **Traceability**: HF-195 PR (merged), PR #51 (merged), PR #52 (merged), comprehension document v2 referenced as vision-grounded model
10. **Forward work surfaced (out-of-scope from HF-196)**: substrate-population (T2 escalation), repo cleanup, etc.

### 6B: Open PR
```bash
gh pr create --base main --head hf-196-platform-restoration-vertical-slice \
  --title "HF-196: Platform restoration — vision-aligned vertical slice (3 architectural breaks closed)" \
  --body "$(cat <<'EOF'
## Closes
Three compounding architectural breaks identified in Phase 6-AUDIT (commit 8c85be2c):
1. Convergence path drift (D153 atomic cutover incomplete)
2. Entity binding gap (OB-182 incomplete vertical slice)
3. Import surface fragmentation (execute / execute-bulk split)

## Implements
Vision per T1 substrate (IRA-confirmed PR #52):
- Korean Test, Carry Everything, Vertical Slice, Synaptic State, calc-time binding, single canonical surface, D153 atomic cutover

## Vertical slice verification
Component-level reconciliation against architect-selected verification tenant (BCL): see HF-196_COMPLETION_REPORT.md Section 5.

## Traceability
- HF-195 (prompt-layer registry derivation): merged
- IRA-HF-195 PR #51: merged
- IRA-COMPREHENSION-DOC PR #52: merged (comprehension v2 = vision-grounded model)
- Phase 6-AUDIT (commit 8c85be2c): all findings closed

## Architect actions remaining (out-of-scope from this PR)
- Substrate-population (T2 escalation)
- Repo organization cleanup
EOF
)"
```
Paste PR URL.

### 6C: HALT for architect review + merge
CC does not merge PRs. Architect reviews + merges per memory.

---

## END OF DIRECTIVE

CC executes Phases 0-6 sequentially without architect intervention except where Critical HALT Conditions fire. After Phase 6 PR opens, architect reviews + merges.
