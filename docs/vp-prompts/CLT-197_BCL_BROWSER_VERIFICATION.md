# CLT-197 — BCL Browser Verification on Rebuilt Substrate

**Classification:** CLT (Browser verification, architect-side per SR-44, with CC support phases)
**Sequence:** CLT-197 (next per project memory CLT-196+ for CRP full proof; first verification on rebuilt substrate)
**Authored:** 2026-04-26
**Predecessor:** HF-195 closed at `05aaaecf` on `origin/revert-pre-seeds-anchor` (rebuilt substrate, build PASS)
**Successor:** Cutover-to-main confirmation (already-merged) + Meridian verification (CLT-198) + decision record on rebuilt substrate proof status

---

## ARCHITECT-CHANNEL META-CONTENT

### Why this verification exists

The rebuilt substrate (anchor + PR #340 cherry-pick) was constructed and built clean. The audit verdicts (DROP/DROP/REINSTATE) were defensible at diff-reading level. They are not yet verified at calculation-execution level.

CLT-197 is the load-bearing gate that determines whether the rebuilt substrate is architecturally clean *and* behaviorally correct on the proven BCL baseline ($312,033). This decides whether the substrate ships or whether the audit needs revisiting.

### Decision 95 (100% reconciliation) is the gate

The verification PASS condition is BCL = $312,033 exactly. Not approximately. Not within rounding. Per Decision 95: "100% reconciliation is the only gate." Any deviation, including by cents, is FAIL.

If FAIL: the substrate has a defect or the audit missed something. We diagnose; we do not adjust the target.

### What's executing where

This is a multi-channel directive. Architect is browser-only at SR-44 boundaries; CC handles everything else.

| Phase | Who | What |
|---|---|---|
| 1.1 — Open PR | CC (gh CLI) | `gh pr create` from `revert-pre-seeds-anchor` to `main` |
| 1.2 — Diff review | CC + Architect | CC pastes diff; architect sends PROCEED |
| 1.3 — Merge | CC (gh CLI) | `gh pr merge --merge` after PROCEED |
| 2 — Verify deployment | CC | Confirm origin/main SHA + vialuce.ai responsive |
| 3 — Clean slate BCL | CC (script) | Re-run April 25 28-table tenant-scoped clear; preserve identity |
| 4.1 — Plan import | Architect (browser) | SCI plan import upload via vialuce.ai |
| 4.2 — Data import | Architect (browser) | SCI data import upload via vialuce.ai |
| 4.4 — field_identities verify | CC (script) | DB query confirms FI present on imported rows |
| 5 — Run calculation | Architect (browser) | Trigger calc via UI |
| 6.1 — UI total read | Architect (screenshot) | Screenshot of result page |
| 6.2 — DB total query | CC (script) | Query `calculation_runs` for total_payout |
| 7 — FINDINGS + completion | CC | Artifacts authored and committed |

Each phase has an explicit gate. We do not proceed past a failing gate.

### Scope boundary

**IN SCOPE:** BCL verification only. Meridian is CLT-198 (separate directive).

**OUT OF SCOPE:** CRP. Per architect direction, CRP's prior baseline was on architecturally invalid code and is not being defended. CRP gets a fresh verification only after the platform is stable and Decision 147 has been redesigned signal-surface-native.

**OUT OF SCOPE:** Meridian. Sequenced after BCL.

### Risk acknowledgment

This directive ships the rebuilt substrate to production before verification completes. The reasoning: the audit verdicts are defensible, the build PASSES, and the substrate is architecturally cleaner than what's currently on main (which contains the seeds violation). Shipping to production via main merge gives us the production-grade evidence the standing rules require ("Vercel logs, browser screenshots, or production DB queries are the only valid evidence"). Preview deployments would also satisfy the rule but require additional Vercel configuration; main merge is the established deployment path.

If verification FAILS at Phase 6: production is running the rebuilt substrate, BCL is in a re-imported state, and we either roll back via revert-of-revert (return main to `a2921fbb`) or diagnose and fix forward. Both paths are recoverable.

---

## PHASE 1 — Merge `revert-pre-seeds-anchor` to `main`

**Who:** CC (gh CLI execution)
**Goal:** Replace main with the rebuilt substrate; trigger Vercel production deployment.

### CC paste block — Phase 1

```bash
echo "=== Phase 1.1: open PR from revert-pre-seeds-anchor to main ==="

cd ~/spm-platform || cd /Users/AndrewAfrica/spm-platform
git fetch origin --prune

# 1.1.1: Confirm branch states
git rev-parse origin/main
git rev-parse origin/revert-pre-seeds-anchor
echo "Expected: main = a2921fbb..., revert-pre-seeds-anchor = 05aaaecf..."

# 1.1.2: Open PR via gh CLI
gh pr create \
  --base main \
  --head revert-pre-seeds-anchor \
  --title "CLT-197: rebuilt substrate cutover — pre-seeds anchor + HF-195 cherry-pick of PR #340" \
  --body "$(cat <<'EOF'
## CLT-197 cutover

Replaces main with the rebuilt substrate constructed via:
- REVERT-001: anchor identification at SHA 283d4c24 (parent of PR #338 / HF-191)
- AUD-003 Phase 0: full diff extraction + static code-path trace at anchor
- AUD-003 inline audit: per-PR verdicts
  - PR #338 (HF-191 seeds): DROP
  - PR #339 (HF-193 partial eradication): DROP
  - PR #340 (HF-194 field_identities restore): REINSTATE
- HF-195: cherry-pick of PR #340 onto rebuilt substrate; build PASS

## Substrate state

origin/revert-pre-seeds-anchor at 05aaaecf:
- field-identities helper (lib/sci/field-identities.ts)
- execute/route.ts uses shared helper
- execute-bulk/route.ts writes field_identities to committed_data.metadata at 3 call sites
- No plan_agent_seeds, no Decision 147 seed validation flow
- Anchor + REVERT-001 + AUD-003 doc commits + HF-195 cherry-picks

## Verification gate

CLT-197 Phase 6 verifies BCL = \$312,033 exactly post-merge. If FAIL, this PR reverts via revert-of-merge.

## Decision 95 enforced

100% reconciliation only. Proximity is FAIL.
EOF
)" 2>&1

# 1.1.3: Capture PR number
PR_NUMBER=$(gh pr list --head revert-pre-seeds-anchor --base main --json number --jq '.[0].number')
echo "PR_NUMBER=$PR_NUMBER"
gh pr view "$PR_NUMBER" --json url,state,mergeable,baseRefName,headRefName

echo "=== Phase 1.2: review PR diff before merge ==="

# 1.2.1: Diff stat
gh pr diff "$PR_NUMBER" --name-only | head -50
echo "---"
gh pr view "$PR_NUMBER" --json additions,deletions,changedFiles

# 1.2.2: Confirm only audit-scope files touched in production source
echo "--- Production source files in PR diff ---"
gh pr diff "$PR_NUMBER" --name-only | grep -E '^web/src/' | sort

# 1.2.3: HALT condition — paste output and STOP if anything outside audit scope appears
echo "Expected production source files: web/src/lib/sci/field-identities.ts (new), web/src/app/api/import/sci/execute/route.ts, web/src/app/api/import/sci/execute-bulk/route.ts, plus removals from PRs #338/#339 reverted-out (convergence-service.ts, ai-plan-interpreter.ts, signal-persistence.ts, etc.)"
echo "Anything outside this scope = HALT"
```

**HALT before merge if:**
- PR is not mergeable (conflicts, branch protection)
- Production source files outside audit scope appear in diff
- `gh` CLI returns errors

If HALT: paste full output to architect channel; do NOT proceed to merge step.

### Phase 1.3 — Merge (CC executes only after architect confirms Phase 1.2 review)

CC waits for architect "PROCEED" signal before executing this step.

```bash
echo "=== Phase 1.3: merge PR (CC executes after architect PROCEED signal) ==="

# 1.3.1: Merge with --merge (preserves commit history per architect direction)
gh pr merge "$PR_NUMBER" --merge --delete-branch=false 2>&1
# --delete-branch=false: keep revert-pre-seeds-anchor on origin for audit trail

# 1.3.2: Capture merge commit SHA
git fetch origin
MERGE_SHA=$(git rev-parse origin/main)
echo "MERGE_SHA=$MERGE_SHA"
git log -1 origin/main --format='HASH=%H%nSUBJECT=%s%nDATE=%ci%nPARENTS=%P'

# 1.3.3: Confirm parents include both old main and revert-pre-seeds-anchor head
echo "Expected parents: a2921fbb... (old main) and 05aaaecf... (revert-pre-seeds-anchor)"
```

### Phase 1 Gate

| # | Criterion | Pass condition |
|---|---|---|
| G1.1 | PR opened | PR_NUMBER captured; PR URL pasted |
| G1.2 | PR diff reviewed | Architect confirms diff matches audit scope; sends PROCEED |
| G1.3 | PR merged | MERGE_SHA captured; parents confirmed |

---

## PHASE 2 — Verify Vercel production deployment

**Who:** CC (gh CLI + Vercel API/CLI if available; otherwise architect provides Vercel deployment ID)
**Goal:** Confirm vialuce.ai is now serving the rebuilt substrate code.

### CC paste block — Phase 2

```bash
echo "=== Phase 2.1: confirm origin/main matches MERGE_SHA from Phase 1.3 ==="

git fetch origin
git rev-parse origin/main
echo "Expected: matches MERGE_SHA from Phase 1.3"

echo "=== Phase 2.2: poll Vercel deployment via Vercel CLI if available ==="

# 2.2.1: Check if Vercel CLI is authenticated
vercel whoami 2>&1 || echo "VERCEL_CLI_NOT_AUTHENTICATED"

# 2.2.2: List recent deployments for the project (if vercel CLI authenticated)
vercel ls --prod 2>&1 | head -20 || echo "VERCEL_LS_FAILED"

# 2.2.3: If Vercel CLI unavailable, fall back to checking that the deployment
# eventually serves the merge SHA via a public health-check or build-id endpoint.
# vialuce.ai serves /_next/static/<BUILD_ID>/ — fetching the homepage and parsing
# the buildId from the page's __NEXT_DATA__ script tag confirms which build is live.
echo "--- Fallback: fetch vialuce.ai homepage and look for buildId ---"
curl -s https://vialuce.ai/ | grep -oE '"buildId":"[^"]+"' | head -1 || echo "BUILD_ID_NOT_FOUND_IN_HOMEPAGE"

echo "=== Phase 2.3: confirm production responds healthy ==="
curl -sI https://vialuce.ai/ | head -5
```

### Phase 2 Gate

| # | Criterion | Pass condition |
|---|---|---|
| G2.1 | origin/main = MERGE_SHA | CC paste confirms |
| G2.2 | Vercel deployment Ready (production) | Either Vercel CLI confirms latest production deployment, OR vialuce.ai responds 200 with a buildId different from pre-merge state |
| G2.3 | vialuce.ai responsive | curl returns 2xx |

**HALT if:**
- Vercel deployment is in error/failed state (production stays on prior main; architect reverts merge)
- vialuce.ai returns 5xx

---

## PHASE 3 — Clean slate BCL

**Who:** CC (script execution)
**Goal:** Clear BCL tenant data; preserve BCL tenant identity. Replicates April 25 clean-slate pattern.

### CC paste block — Phase 3

```bash
echo "=== Phase 3: clean slate BCL on production Supabase ==="

# 3.1 — Confirm BCL tenant identity exists
cat > /tmp/clt-197-confirm-bcl.ts <<'EOF'
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { data, error } = await supabase
  .from('tenants')
  .select('id, name, slug')
  .eq('slug', 'banco-cumbre-litoral')
  .single();

if (error) { console.error('BCL tenant lookup failed:', error); process.exit(1); }
if (!data) { console.error('BCL tenant not found'); process.exit(1); }

console.log('BCL tenant confirmed:');
console.log(`  id: ${data.id}`);
console.log(`  name: ${data.name}`);
console.log(`  slug: ${data.slug}`);
console.log(`Expected id: b1c2d3e4-aaaa-bbbb-cccc-111111111111`);
EOF

cd web && npx tsx /tmp/clt-197-confirm-bcl.ts && cd ..

# 3.2 — Pre-clear row counts (28 tenant-scoped tables)
# CC: enumerate row counts for all 28 BCL-tenant-scoped tables at the start.
# Use the same table list as the April 25 clean-slate operation.
# Pasting expected here for reference; CC may need to consult prior clean-slate script if available.

echo "--- Pre-clear row counts ---"
# CC: query each of the 28 tenant-scoped tables for COUNT(*) WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
# Tables include (non-exhaustive — CC should reference April 25 script for full list):
#   classification_signals, committed_data, rule_sets, calculation_runs, components,
#   entities, transactions, import_batches, content_units, semantic_bindings, etc.

# 3.3 — Atomic destructive transaction
# CC: run the same atomic delete pattern from April 25 — single transaction,
# deletes from all 28 tables WHERE tenant_id = BCL, commits or rolls back as a unit.

# 3.4 — Post-clear verification
echo "--- Post-clear row counts ---"
# CC: re-query all 28 tables; every count must be 0.

# 3.5 — Identity preservation check
echo "--- BCL identity in tenants table ---"
# CC: confirm tenants row for BCL still exists with same id/slug/name.
# Confirm 6 preserved tables (profiles, audit_logs, profile_scope, usage_metering, tenants, NULL-tenant platform_events) untouched.
```

### Phase 3 Gate

| # | Criterion | Pass condition |
|---|---|---|
| G3.1 | BCL tenant identity confirmed pre-clear | id `b1c2d3e4-aaaa-bbbb-cccc-111111111111` returned |
| G3.2 | Pre-clear row counts captured | All 28 tables enumerated with counts |
| G3.3 | Destructive transaction completed | Transaction committed atomically |
| G3.4 | Post-clear all counts = 0 | Every of 28 tables returns 0 |
| G3.5 | BCL identity preserved | Tenants row still present with same id/slug |

**HALT if:**
- BCL tenant id does not match expected
- Any of the 28 tables fails to clear
- Identity row is affected
- Any of the 6 preserved tables shows changes

---

## PHASE 4 — Re-import BCL

**Who:** Architect (browser)
**Goal:** Fresh import of BCL plan + data files through vialuce.ai SCI flow on rebuilt substrate.

### Step 4.1 — Log into vialuce.ai

Browser:
1. Go to https://vialuce.ai
2. Log in
3. Navigate to BCL tenant

### Step 4.2 — Plan import

Browser:
1. Open SCI flow / plan import page
2. Upload BCL plan file (the same file used in March $312,033 proofs — 4 files in the proof set per project memory)
3. Confirm AI plan interpretation completes
4. Confirm rule_sets are created
5. Capture: screenshot of plan import success + Vercel logs URL for the request

### Step 4.3 — Data import

Browser:
1. Open data import page
2. Upload BCL data files (Datos sheets + Personnel)
3. Confirm bulk path is taken (the path HF-194 patches; large files trigger this automatically)
4. Confirm import completes
5. Capture: screenshot of import success + entity/transaction counts + Vercel logs URL

### Step 4.4 — Confirm field_identities present (HF-194/195 verification)

CC paste block — Phase 4.4:

```bash
echo "=== Phase 4.4: confirm field_identities present in re-imported committed_data ==="

cat > /tmp/clt-197-verify-fi.ts <<'EOF'
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Sample 50 rows; verify metadata.field_identities present
const { data, error } = await supabase
  .from('committed_data')
  .select('metadata, informational_label')
  .eq('tenant_id', BCL_TENANT_ID)
  .limit(50);

if (error) { console.error('Query failed:', error); process.exit(1); }

let with_fi = 0, without_fi = 0;
const labels = new Map<string, { with: number; without: number }>();

for (const row of (data ?? [])) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const has_fi = Boolean(meta.field_identities);
  const label = (row.informational_label as string) ?? '(none)';
  const entry = labels.get(label) ?? { with: 0, without: 0 };
  if (has_fi) { with_fi++; entry.with++; } else { without_fi++; entry.without++; }
  labels.set(label, entry);
}

console.log(`Total rows sampled: ${data?.length ?? 0}`);
console.log(`With field_identities: ${with_fi}`);
console.log(`Without field_identities: ${without_fi}`);
console.log(`---`);
for (const [label, counts] of labels) {
  console.log(`  ${label}: ${counts.with} with FI / ${counts.without} without FI`);
}
EOF

cd web && npx tsx /tmp/clt-197-verify-fi.ts && cd ..
```

### Phase 4 Gate

| # | Criterion | Pass condition |
|---|---|---|
| G4.1 | Plan import success | Architect screenshot + Vercel logs URL |
| G4.2 | Data import success | Architect screenshot + Vercel logs URL |
| G4.3 | Bulk path traversed | Vercel logs show `execute-bulk` route invoked |
| G4.4 | field_identities present on all sampled rows | `with_fi == sample_size`, `without_fi == 0` |

**HALT if:**
- Import errors at any stage
- Vercel logs show errors during plan or data import
- field_identities are absent (would mean HF-194/195 cherry-pick did not produce the expected behavior; rebuilt substrate has a defect)

---

## PHASE 5 — Run BCL calculation

**Who:** Architect (browser)
**Goal:** Execute the BCL calculation through the UI.

### Step 5.1 — Trigger calculation

Browser:
1. Navigate to BCL calculation page
2. Select BCL period (the period that produced $312,033 in March proofs — 6-month range per memory)
3. Trigger calculation
4. Wait for completion

### Step 5.2 — Capture result

Browser:
1. Screenshot of calculation result page showing total
2. Capture Vercel logs URL for the calculation request

### Phase 5 Gate

| # | Criterion | Pass condition |
|---|---|---|
| G5.1 | Calculation completes without error | Result page renders |
| G5.2 | Result captured | Architect screenshot + Vercel logs URL |

**HALT if:**
- Calculation fails (paste error from UI + Vercel logs)
- Calculation hangs or times out

---

## PHASE 6 — Verify total against ground truth

**Who:** Architect (screenshot read) + CC (DB query confirmation)
**Goal:** Confirm BCL total = $312,033 exactly.

### Step 6.1 — Architect reads displayed total

From Phase 5.2 screenshot, read the total displayed in the UI.

### Step 6.2 — CC confirms via DB query

CC paste block — Phase 6.2:

```bash
echo "=== Phase 6.2: query BCL calculation result from production DB ==="

cat > /tmp/clt-197-verify-total.ts <<'EOF'
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const GROUND_TRUTH = 312033;

// Query the most recent calculation_run for BCL
const { data, error } = await supabase
  .from('calculation_runs')
  .select('id, total_payout, period_id, completed_at')
  .eq('tenant_id', BCL_TENANT_ID)
  .order('completed_at', { ascending: false })
  .limit(1)
  .single();

if (error) { console.error('Query failed:', error); process.exit(1); }
if (!data) { console.error('No calculation_runs found for BCL'); process.exit(1); }

console.log(`Most recent BCL calculation run:`);
console.log(`  id: ${data.id}`);
console.log(`  total_payout: ${data.total_payout}`);
console.log(`  period_id: ${data.period_id}`);
console.log(`  completed_at: ${data.completed_at}`);
console.log(`---`);
console.log(`Ground truth: ${GROUND_TRUTH}`);
console.log(`Delta: ${(data.total_payout as number) - GROUND_TRUTH}`);
console.log(`Match: ${(data.total_payout as number) === GROUND_TRUTH ? 'EXACT' : 'NOT MATCH'}`);
EOF

cd web && npx tsx /tmp/clt-197-verify-total.ts && cd ..
```

### Phase 6 Gate

| # | Criterion | Pass condition |
|---|---|---|
| G6.1 | UI displayed total = $312,033 exactly | Architect screenshot reads $312,033 |
| G6.2 | DB total = $312,033 exactly | CC query returns `total_payout = 312033`, delta = 0, Match: EXACT |
| G6.3 | UI and DB agree | Architect's reading matches CC's query result |

**Outcome paths:**

- **All three gates PASS:** rebuilt substrate verified for BCL. CLT-197 closes PASS. Proceed to CLT-198 Meridian verification (separate directive).

- **G6.1 ≠ $312,033 OR G6.2 ≠ $312,033:** rebuilt substrate FAIL. Architect-channel diagnostic begins. Possible disposition: revert main to `a2921fbb` while diagnostic runs, or diagnose against current production state. Architect decides.

- **G6.3 mismatch (UI ≠ DB):** indicates UI rendering issue separate from calculation correctness. Diagnose UI/DB consistency separately; calculation result from DB is the source of truth for the verification verdict.

---

## PHASE 7 — Findings + completion report

**Who:** CC (artifact authorship)

After all gates close (PASS or FAIL):

CC produces:
- `docs/verification/CLT-197_BCL_REBUILT_SUBSTRATE_FINDINGS.md` — gates PASSED/FAILED with evidence references
- `docs/completion-reports/CLT-197_COMPLETION_REPORT.md` per Rule 26
- This directive preserved at `docs/vp-prompts/CLT-197_BCL_BROWSER_VERIFICATION.md` per SOP

CC commits to `main` directly (or branch + PR per architect direction post-Phase-6).

---

## ANTI-PATTERN CHECKS

CC self-attests in completion report:

- [ ] No code modifications to production source during verification
- [ ] Clean-slate operation atomic; no partial deletes
- [ ] BCL identity preserved (Phase 3.5 evidence)
- [ ] Reconciliation gate is exact ($312,033, not "approximately")
- [ ] No proximity-to-target acceptance (Decision 95)
- [ ] All evidence pasted (Rule 27)
- [ ] Korean Test PASS

---

## SR-44 ACKNOWLEDGMENT

Architect-side work in CLT-197 is strictly browser-only operations CC cannot perform:
- Phase 4: SCI plan import upload (file selection in browser)
- Phase 4: data file import upload (file selection in browser)
- Phase 5: calculation trigger via UI
- Phase 6.1: screenshot capture of UI total
- Inter-phase PROCEED signals at gates that require architect judgment

CC handles all other phases: PR creation, merge, deployment verification, schema/DB queries, scripted operations, artifact authorship.

Architect does not perform any function CC can perform.

---

*CLT-197 · BCL browser verification on rebuilt substrate · Predecessor: HF-195 (substrate rebuilt at `05aaaecf`) · Successor: CLT-198 Meridian verification + cutover-or-revert decision · 2026-04-26 · Decision 95 enforced (100% reconciliation only) · SR-44 architect-side browser work · Standing Rules 25, 26, 27, 34, 36, 51v2 N/A*
