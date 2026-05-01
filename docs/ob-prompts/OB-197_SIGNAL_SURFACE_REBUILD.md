# OB-197: SIGNAL SURFACE REBUILD — IMPORT SYSTEM RESTORATION
## Close G7 + G11 Per IRA Cluster A option_b RECOMMENDED

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply (SR-1 through SR-51v2)
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference
3. `DS-021_Substrate_Architecture_Biological_Lineage_v1_0_LOCKED_20260430.md` — §3 Role 4, §6 G7 + G11, §7 Convergence as Observation
4. `docs/audit-evidence/phase4/cluster_a_evidence.md` — full Cluster A audit findings
5. `docs/audit-evidence/phase4/cluster_a_ira_raw.txt` — IRA option_b RECOMMENDED scope verbatim
6. `PHASE_4_AUDIT_EXECUTION_PLAN_20260430.md` — Plan v1.1, governs execution mechanics

**Read all six before writing any code.**

---

## WHAT THIS OB BUILDS

The signal surface (`classification_signals`) is currently write-only. The convergence service writes one row per run and never reads. SCI agents write but with no run-scoping. The signal_type vocabulary is unenforced (`sci:*`, `training:*`, underscore form). The schema has 14 columns live that aren't in committed migrations. **The result: the import system has no closed-loop intelligence. Every import is a blank slate.**

OB-197 closes G7 + G11 per IRA Cluster A option_b RECOMMENDED scope:

1. **Schema rebuild** — add `calculation_run_id`; formalize the 14 out-of-band columns; enforce three-level signal_type vocabulary (`classification:*` / `comprehension:*` / `convergence:*` / `cost:*` / `lifecycle:*`) via CHECK constraint; migrate live signal_type values to prefix vocabulary.

2. **Write-site run_id propagation** — every signal write site that runs inside a calculation receives `calculationRunId` from the orchestrator and populates the column. SCI ingestion writes leave it NULL. Vocabulary aligned across all write sites.

3. **Convergence service read-path** — within-run reads (signals from this run for this tenant) and cross-run reads (signals from prior runs for this tenant) against `classification_signals`. Output as observations alongside the existing matching algorithm (per DS-021 §7: convergence is observation, not computation).

**After OB-197, the signal surface is read-write coherent. SCI agents write, convergence reads, the loop closes. Imports start producing learnable signals that future imports actually consume.**

**Out of scope (separate OBs):** flywheel population from `classification_signals` (Multiplier circuit — depends on Decision 23 reaffirmation); G8 Korean Test cleanup in `content-profile.ts` (Cluster B); G9 mid-run plan mutation in `route.ts` (Cluster C); G10 plan-aware UNIQUE on `entity_period_outcomes` (Cluster D).

---

## STANDING RULES

1. After EVERY commit: `git push origin ob-197-signal-surface-rebuild`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head ob-197-signal-surface-rebuild` with descriptive title and body
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain language in `convergence-service.ts`, `classification-signal-service.ts`.** Korean Test applies.
8. SR-27 (paste evidence, not attestation), SR-34 (no bypass — HALT to architect), SR-35 (no behavioral changes beyond directive), SR-44 (architect handles browser verification post-merge), SR-51v2 (lint and typecheck after stash).
9. Supabase migration MUST be executed live AND verified with database query. File existence ≠ applied.
10. If any phase cannot complete structurally: HALT, paste evidence, return to architect.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 0: PREREQUISITES + DIAGNOSTIC

### 0-PRE: Branch + verify base + commit prompt (Rule 5)

```bash
cd /Users/AndrewAfrica/spm-platform
git checkout main && git pull origin main

# Verify main HEAD is the Phase 4 audit merge commit (PR #352 merged 2026-05-01)
git log --oneline -1
# Expected: 345c5702 ... Merge pull request #352 from CCAFRICA/ds021-substrate-audit
# HALT if HEAD differs — Phase 4 audit evidence may not be present at expected paths

# Verify Phase 4 audit evidence files exist at expected paths (READ FIRST items 4-5)
ls docs/audit-evidence/phase4/cluster_a_evidence.md \
   docs/audit-evidence/phase4/cluster_a_ira_raw.txt \
   2>&1
# HALT if either file missing

git checkout -b ob-197-signal-surface-rebuild
mkdir -p docs/ob-prompts
# Place OB-197_SIGNAL_SURFACE_REBUILD.md prompt at docs/ob-prompts/
git add docs/ob-prompts/OB-197_SIGNAL_SURFACE_REBUILD.md
git commit -m "OB-197: commit prompt to git (Rule 5)"
git push -u origin ob-197-signal-surface-rebuild
```

### 0A: Live database state

```bash
psql "$DATABASE_URL" -c "\d classification_signals"
psql "$DATABASE_URL" -c "SELECT signal_type, COUNT(*) FROM classification_signals GROUP BY signal_type ORDER BY 2 DESC;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) AS rows FROM classification_signals;"
```

**HALT if:** schema does not show 23 columns matching the audit evidence; `calculation_run_id` already exists; signal_type values appear that are not in this map:
- `sci:classification_outcome_v2` → `classification:outcome`
- `training:plan_interpretation` → `comprehension:plan_interpretation`
- `sci:cost_event` → `cost:event`

### 0B: Code state

```bash
ls web/supabase/migrations/ | tail -5
# Confirm migration 024 slot is still available (re-checking from ENV-PREP Phase 3)
ls web/supabase/migrations/ | grep "^024" && echo "MIGRATION 024 SLOT TAKEN — HALT" || echo "024 slot available"

wc -l web/src/lib/intelligence/convergence-service.ts \
       web/src/lib/sci/classification-signal-service.ts \
       web/src/lib/ai/signal-persistence.ts \
       web/src/lib/signals/briefing-signals.ts \
       web/src/lib/signals/stream-signals.ts \
       web/src/app/api/ingest/classification/route.ts \
       web/src/lib/sci/signal-capture-service.ts \
       web/src/app/api/calculation/run/route.ts
grep -n "classification_signals" web/src/lib/intelligence/convergence-service.ts
grep -n "lookupPriorSignals\|lookupFoundationalPriors" web/src/lib/sci/classification-signal-service.ts || echo "NOTE: lookupPriorSignals not found at expected location — pattern may have moved post-Phase-4 audit; surface to architect but do NOT halt — Phase 3 read-path will create the canonical pattern regardless"

# Inspect git state. Pre-existing items expected per ENV-PREP-OB-197 closure:
git stash list
# Expected: 5 stashes on dormant branches (phase-4-e5-audit B.2.1, revert-pre-seeds-anchor HF-195/AUD-003,
# diag-023 REVERT-001, dev WIP HF-095, plus one). These are pre-existing; do NOT halt on their presence.

git branch | grep -E "phase-4-e5-audit|stash-aud-004|stash-ob-igf-26|archive/" || echo "no preserved branches"
# Expected: phase-4-e5-audit (preserved per ENV-PREP Disposition 1) may appear if checked out locally.
# These are intentional preservation branches; do NOT halt.
```

**HALT if:** `convergence-service.ts` already contains `.select` calls against `classification_signals` (would mean this work has already started elsewhere); migration 024 slot is taken (would mean an unmerged migration ships before OB-197).

### 0C: Pre-flight HALT confirmation

If all 0A and 0B checks pass, paste the output of all queries and proceed. If any HALT condition fires, stop and report to architect channel before continuing.

**Commit:** `OB-197 Phase 0: pre-flight verification`

---

## PHASE 1: SCHEMA REBUILD

### 1A: Create migration

Create `web/supabase/migrations/024_ob197_signal_surface_rebuild.sql`:

```sql
-- OB-197 Phase 1: Signal Surface Rebuild
-- Closes G7 (single canonical signal surface) and prepares G11 read-path.
-- Per IRA Cluster A option_b RECOMMENDED scope.

-- 1.1 Formalize HF-092 out-of-band columns (no-op against live; makes schema-of-record match schema-of-fact)
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS source_file_name TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS sheet_name TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS structural_fingerprint JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS classification TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS decision_source TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS classification_trace JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS header_comprehension JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS vocabulary_bindings JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS agent_scores JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS human_correction_from TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS rule_set_id UUID;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS metric_name TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS component_index INT;

-- 1.2 Add run scoping
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS calculation_run_id UUID NULL;

-- 1.3 Indexes for read-path performance (Phase 3)
CREATE INDEX IF NOT EXISTS idx_cs_run_id
  ON classification_signals (calculation_run_id)
  WHERE calculation_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_tenant_run_type
  ON classification_signals (tenant_id, calculation_run_id, signal_type)
  WHERE calculation_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_tenant_type_created
  ON classification_signals (tenant_id, signal_type, created_at DESC);

-- 1.4 Migrate vocabulary BEFORE constraint
UPDATE classification_signals SET signal_type = 'classification:outcome'
  WHERE signal_type = 'sci:classification_outcome_v2';
UPDATE classification_signals SET signal_type = 'comprehension:plan_interpretation'
  WHERE signal_type = 'training:plan_interpretation';
UPDATE classification_signals SET signal_type = 'cost:event'
  WHERE signal_type = 'sci:cost_event';

-- 1.5 Enforce three-level vocabulary
ALTER TABLE classification_signals
  ADD CONSTRAINT classification_signals_signal_type_vocabulary_chk
  CHECK (
    signal_type LIKE 'classification:%' OR
    signal_type LIKE 'comprehension:%'  OR
    signal_type LIKE 'convergence:%'    OR
    signal_type LIKE 'cost:%'           OR
    signal_type LIKE 'lifecycle:%'
  );
```

### 1B: Apply migration LIVE

```bash
psql "$DATABASE_URL" -f web/supabase/migrations/024_ob197_signal_surface_rebuild.sql
```

### 1C: Verify migration applied (live DB query, not file existence)

```bash
psql "$DATABASE_URL" -c "\d classification_signals" > /tmp/post_schema.txt
psql "$DATABASE_URL" -c "\di classification_signals*"
psql "$DATABASE_URL" -c "SELECT signal_type, COUNT(*) FROM classification_signals GROUP BY signal_type ORDER BY 2 DESC;"
psql "$DATABASE_URL" -c "SELECT conname FROM pg_constraint WHERE conrelid = 'classification_signals'::regclass AND contype = 'c';"
```

**HALT if:** post-migration signal_type query returns ANY value not matching prefix vocabulary; CHECK constraint is not present in pg_constraint output; `calculation_run_id` column not present.

**Commit:** `OB-197 Phase 1: schema rebuild — vocabulary CHECK, run_id column, schema-of-record formalization`

---

## PHASE 2: WRITE-SITE RUN_ID PROPAGATION + VOCABULARY ALIGNMENT

### 2A: Modify each write site

For each site below, add optional `calculationRunId?: string` parameter, replace legacy signal_type literal with prefix form, and ensure caller passes the run_id when executing inside a calculation:

| File | Line | Current signal_type | New signal_type |
|---|---|---|---|
| `web/src/lib/intelligence/convergence-service.ts` | 253 | `convergence_calculation_validation` | `convergence:calculation_validation` |
| `web/src/lib/sci/classification-signal-service.ts` | 89 (`writeClassificationSignal`) | varies | `classification:outcome` |
| `web/src/lib/intelligence/classification-signal-service.ts` | 62 (`recordSignal`) | varies | per signal level |
| `web/src/lib/ai/signal-persistence.ts` | 48, 96 | varies | `comprehension:plan_interpretation` or `comprehension:header_binding` |
| `web/src/lib/signals/briefing-signals.ts` | 60 | varies | `lifecycle:briefing` |
| `web/src/lib/signals/stream-signals.ts` | 64 | varies | `lifecycle:stream` |
| `web/src/app/api/ingest/classification/route.ts` | 38 | varies | `classification:outcome` |
| `web/src/lib/sci/signal-capture-service.ts` | 20, 59 | varies | per signal level |

If a write site emits a signal_type that does not map cleanly to the prefix vocabulary, HALT and report — do not invent a new prefix.

### 2B: Wire calculation_run_id from orchestrator

The orchestrator at `web/src/app/api/calculation/run/route.ts` holds `calculationBatchId` (from `calculation_batches.id` created at run-start). Pass it through:
- `convergeBindings(tenantId, ruleSetId, supabase, calculationBatchId)` — convergence-service.ts line ~253 INSERT populates `calculation_run_id` with this value.
- Any in-run SCI signal writes invoked from the calculation pipeline.

SCI ingestion writes (route `/api/ingest/classification`, `signal-capture-service.ts` during pre-calculation classification) leave `calculationRunId` undefined → NULL in DB.

### 2C: Verify each write site

For each modified file, paste:
1. Function signature diff (before/after)
2. signal_type literal diff (before/after)
3. Caller diff showing `calculationRunId` flowing through

```bash
npx tsc --noEmit
npx next lint
```

**HALT if:** typecheck or lint fails; any write site emits a signal_type that does not match the CHECK constraint vocabulary.

**Commit:** `OB-197 Phase 2: write-site run_id propagation + vocabulary alignment`

---

## PHASE 3: CONVERGENCE SERVICE READ-PATH

### 3A: Add within-run signal observation

In `web/src/lib/intelligence/convergence-service.ts`, before convergence performs Pass 1 / Pass 2 / Pass 3 matching, add:

```ts
// OB-197 G11: within-run signal observation. Surface what has been observed
// earlier in THIS calculation run for this tenant. Per DS-021 §7, convergence
// uses this output for OBSERVATION (matches/gaps/opportunities) — NOT for scoring.
const { data: withinRunPriors } = await supabase
  .from('classification_signals')
  .select('signal_type, signal_value, decision_source, classification, structural_fingerprint, agent_scores, confidence')
  .eq('tenant_id', tenantId)
  .eq('calculation_run_id', calculationRunId)
  .order('created_at', { ascending: true });
```

### 3B: Add cross-run signal observation

```ts
// OB-197 G11: cross-run signal observation. Surface this tenant's signals from
// prior runs that match the current convergence context. Per DS-021 §7,
// observation only — not consumed by matching algorithm.
const { data: crossRunPriors } = await supabase
  .from('classification_signals')
  .select('signal_type, signal_value, decision_source, classification, structural_fingerprint, agent_scores, confidence')
  .eq('tenant_id', tenantId)
  .in('signal_type', [
    'classification:outcome',
    'comprehension:plan_interpretation',
    'comprehension:header_binding',
    'classification:human_correction',
  ])
  .not('calculation_run_id', 'is', null)
  .neq('calculation_run_id', calculationRunId)
  .order('created_at', { ascending: false })
  .limit(200);
```

### 3C: Update output shape

Convergence output gains:

```ts
{
  metricDerivations: [...],   // existing
  componentBindings: {...},   // existing
  observations: {              // OB-197 NEW
    withinRun: withinRunPriors ?? [],
    crossRun: crossRunPriors ?? [],
  }
}
```

The matching algorithm itself is NOT modified. Observations are surfaced; scoring stays where it is (in SCI agents via the existing `lookupPriorSignals` pattern).

### 3D: Update existing INSERT at line 253

Update the existing `classification_signals` INSERT to:
- Set `signal_type = 'convergence:calculation_validation'`
- Populate `calculation_run_id` from the function parameter

### 3E: Verify Phase 3

```bash
grep -n "classification_signals" web/src/lib/intelligence/convergence-service.ts
# Must show ≥3 hits: original INSERT + within-run SELECT + cross-run SELECT

grep -n "calculation_run_id" web/src/lib/intelligence/convergence-service.ts
# Must show populated INSERT value AND filter values

npx tsc --noEmit
npx next lint
```

**HALT if:** grep shows fewer than 3 `classification_signals` references; INSERT does not populate `calculation_run_id`; typecheck or lint fails.

**Commit:** `OB-197 Phase 3: convergence service read-path — within-run + cross-run observation`

---

## PHASE 4: COMPLETION REPORT

### COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-197_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### Required structure

```markdown
# OB-197 COMPLETION REPORT
## Date: [date]
## Execution Time: [HH:MM]

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| ... | 0 | OB-197 Phase 0: pre-flight verification |
| ... | 1 | OB-197 Phase 1: schema rebuild |
| ... | 2 | OB-197 Phase 2: write-site run_id propagation + vocabulary alignment |
| ... | 3 | OB-197 Phase 3: convergence service read-path |

## FILES CREATED
| File | Purpose |
|---|---|
| web/supabase/migrations/024_ob197_signal_surface_rebuild.sql | Phase 1 migration |
| OB-197_COMPLETION_REPORT.md | This file |

## FILES MODIFIED
| File | Change |
|---|---|
| web/src/lib/intelligence/convergence-service.ts | +run_id parameter, vocabulary fix, within-run + cross-run reads |
| web/src/lib/sci/classification-signal-service.ts | +calculationRunId param, vocabulary alignment |
| ... | (every modified file) |

## PROOF GATES — HARD

| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
|---|---|---|---|
| 1 | Migration 024 applied live; `\d classification_signals` shows `calculation_run_id` + vocabulary CHECK constraint | | (paste \d output) |
| 2 | All live signal_type values match prefix vocabulary | | (paste signal_type GROUP BY query result) |
| 3 | All 8 write sites accept optional `calculationRunId` parameter | | (paste 8 function signatures) |
| 4 | Convergence-service.ts at line 253 INSERT populates `calculation_run_id` and uses `convergence:calculation_validation` signal_type | | (paste code excerpt) |
| 5 | `grep classification_signals web/src/lib/intelligence/convergence-service.ts` shows ≥3 hits | | (paste grep output) |
| 6 | `npx tsc --noEmit` exits 0 | | (paste exit code) |
| 7 | `npx next lint` exits 0 | | (paste exit code) |
| 8 | `npm run build` exits 0 | | (paste last 20 lines + exit code) |
| 9 | `curl -I http://localhost:3000` returns 200 or 307 | | (paste HTTP response code) |
| 10 | PR opened against main with descriptive title and body | | (paste PR URL) |

## PROOF GATES — SOFT

| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| 11 | New indexes present (`idx_cs_run_id`, `idx_cs_tenant_run_type`, `idx_cs_tenant_type_created`) | | (paste \di output) |
| 12 | Cross-run query is bounded (LIMIT 200) | | (paste code excerpt) |
| 13 | Within-run query is filtered by tenant_id AND calculation_run_id | | (paste code excerpt) |
| 14 | Convergence output shape includes `observations: {withinRun, crossRun}` | | (paste type or shape excerpt) |
| 15 | All 14 out-of-band columns present in formalized schema | | (paste \d output filtering for those columns) |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS/FAIL — [N] commits for 4 phases
- Rule 2 (cache clear after commit, build, dev): PASS/FAIL
- Rule 5 (prompt committed to git): PASS — see Phase 0 commit
- Rule 6 (Supabase migration applied live AND verified): PASS — see Phase 1C
- Rule 7 (Korean Test on convergence-service.ts and classification-signal-service.ts): PASS — no domain language introduced
- Rule 25 (report created BEFORE final build): PASS — this file
- Rule 26 (mandatory structure): PASS — this report follows it
- Rule 27 (evidence = paste, not describe): PASS — every gate has pasted evidence
- Rule 28 (one commit per phase): PASS — see commits table

## KNOWN ISSUES
- (anything that did not work, partial implementations, deferred items)
- (architect verifies post-merge in browser per SR-44)

## OUT-OF-BAND FINDINGS
- (anything noticed during execution that wasn't in directive scope)
- (DO NOT FIX — flag for architect)

## VERIFICATION SCRIPT OUTPUT
(paste raw output of all verification commands across phases)
```

### Final build verification

```bash
rm -rf .next
npm run build 2>&1 | tail -30
echo "Build exit code: $?"

npm run dev &
sleep 5
curl -I http://localhost:3000
```

Append build results to the completion report.

### Final commit + PR

```bash
git add OB-197_COMPLETION_REPORT.md
git commit -m "OB-197 Phase 4: completion report"
git push

cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head ob-197-signal-surface-rebuild \
  --title "OB-197: Signal Surface Rebuild — Import System Restoration" \
  --body "## Closes G7 + G11 Per IRA Cluster A option_b RECOMMENDED

### Schema rebuild (Phase 1)
- Migration 024: \`calculation_run_id\` added; 14 HF-092 columns formalized; three-level vocabulary CHECK constraint enforced; live signal_type values migrated.

### Write-site run_id propagation (Phase 2)
- 8 signal-write sites accept \`calculationRunId\`. Vocabulary aligned to prefix form. Orchestrator wires batch_id through.

### Convergence read-path (Phase 3)
- \`convergence-service.ts\`: within-run reads + cross-run reads against \`classification_signals\`. Output gains \`observations\` field. Per DS-021 §7, observation not computation. INSERT at line 253 updated to prefix vocabulary + run_id.

### Out of scope (separate OBs)
- Multiplier circuit (flywheel population from canonical surface) — depends on Decision 23 reaffirmation
- G8 Korean Test in content-profile.ts (Cluster B)
- G9 mid-run plan mutation in route.ts (Cluster C)
- G10 plan-aware UNIQUE on entity_period_outcomes (Cluster D)

### Proof gates: 15 — see OB-197_COMPLETION_REPORT.md"
```

**Commit:** `OB-197 Phase 4: completion report + PR`

---

## ARCHITECT ACTION REQUIRED (Post-PR Open)

After CC opens the PR and pastes the URL in the completion report, CC stops. The following are architect-channel only per SR-44 and capability routing:

1. **PR review of OB-197 against the directive.** Architect reviews diffs, confirms scope adherence, no out-of-scope work crept in.
2. **`gh pr merge <PR#> --merge --delete-branch`.** Architect executes, not CC. `--merge` (not `--squash`) preserves the per-phase commit forensic trail.
3. **Browser verification on production (vialuce.ai).** Confirm platform serves post-merge; no UI regression; signal surface reads/writes functioning end-to-end against a representative tenant.
4. **Production sign-off.** Explicit "OB-197 PASS" message in architect channel. CC does not advance to any successor work (OB-198 Multiplier circuit, Cluster B/C/D OBs) without sign-off.

CC does not perform browser verification. CC does not merge PRs. CC does not interpret production logs.

---

## MAXIMUM SCOPE

3 implementation phases + 1 completion report phase. 15 proof gates. After OB-197, the import system has a working signal surface: SCI agents write, convergence reads, signals scope to runs, vocabulary is structurally enforced. The closed loop is real.

---

*OB-197 — 2026-04-30 (revised 2026-05-01 post-ENV-PREP)*
