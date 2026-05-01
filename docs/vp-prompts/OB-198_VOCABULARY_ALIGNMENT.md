# OB-198: SIGNAL VOCABULARY ALIGNMENT — F-1 REMEDIATION
## Close the silent-fail gap from OB-197 by aligning the 15 remaining writer sites + 2 reader sites

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply (SR-1 through SR-51v2)
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference
3. `DS-021_Substrate_Architecture_Biological_Lineage_v1_0_LOCKED_20260430.md` — §3 Role 4, §6 G7
4. `docs/completion-reports/OB-197_COMPLETION_REPORT.md` — the work that produced the CHECK constraint and the 8-site directive scope this OB extends
5. `docs/directives/F-1_INVENTORY.md` — enumeration of every site OB-198 must touch, with proposed mapping
6. `web/src/lib/sci/signal-capture-service.ts` — the `toPrefixSignalType` mapper that defines the prefix-vocabulary translation pattern OB-198 mirrors

**Read all six before writing any code.**

---

## WHAT THIS OB BUILDS

OB-197 added a CHECK constraint enforcing the prefix vocabulary (`classification:*` / `comprehension:*` / `convergence:*` / `cost:*` / `lifecycle:*`) and aligned 8 named writer sites. F-1 surfaced 15 additional writer sites + 2 reader sites that were outside that directive scope but exercise the same surface. After OB-197 PR #353 merges with the constraint live, those sites silently fail — the closed-loop intelligence OB-197 was meant to enable starts degraded.

OB-198 closes that gap:

1. **Writer alignment** — each of the 15 sites in F-1_INVENTORY.md gets its current signal_type literal replaced with the proposed prefix-form value.
2. **Reader alignment** — the 2 reader sites filtering on `startsWith('training:')` / `startsWith('sci:')` get updated to filter on the post-OB-197 vocabulary (or on the `signal_value.sci_internal_type` / `signal_value.signalId` fields preserved at write time).
3. **Zero schema changes** — the CHECK constraint is already live; OB-198 makes the writers conform, not the constraint accommodate.

**After OB-198, every persistSignal-bearing path emits a CHECK-compliant signal_type. The closed-loop intelligence surface is whole.**

**Out of scope (explicitly NOT in this OB):**
- Loosening or modifying the CHECK constraint (architect-disposed Option B; OB-198 is Option A)
- Adding new signal levels beyond the five locked in OB-197
- Changing the `toPrefixSignalType` mapper in `signal-capture-service.ts` (already correct per Phase 2)
- Migration of pre-existing data (no `training:*` rows exist post-OB-197 because writes were rejected; no backfill needed)
- Anything in the Cluster B/C/D follow-on OBs

---

## STANDING RULES

1. After EVERY commit: `git push origin ob-198-vocabulary-alignment`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head ob-198-vocabulary-alignment` with descriptive title and body
4. **Fix logic, not data.** No vocabulary literals invented beyond F-1_INVENTORY.md's proposed mapping; if a site doesn't map cleanly, HALT.
5. **Commit this prompt to git as first action** at `docs/ob-prompts/OB-198_VOCABULARY_ALIGNMENT.md`.
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain language introduced** at any modified site. Korean Test applies.
8. SR-27 (paste evidence, not attestation), SR-34 (no bypass — HALT to architect), SR-35 (no behavioral changes beyond directive — only the literals named in F-1_INVENTORY.md), SR-44 (architect handles browser verification post-merge), SR-51v2 (lint and typecheck after stash).
9. Branch off **main AFTER PR #353 merges**. CHECK constraint must be live; verify with `web/scripts/ob197/phase1c-verify.ts` before Phase 1.
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

# Verify main HEAD includes OB-197 merge commit
git log --oneline -3
# Expected: top commit is the merge of PR #353; HALT if PR #353 is not yet merged

# Verify F-1_INVENTORY.md is on main (it landed via the OB-197 PR merge)
ls docs/directives/F-1_INVENTORY.md docs/completion-reports/OB-197_COMPLETION_REPORT.md 2>&1
# HALT if either missing

git checkout -b ob-198-vocabulary-alignment
mkdir -p docs/vp-prompts
# Place OB-198_VOCABULARY_ALIGNMENT.md prompt at docs/vp-prompts/
git add docs/vp-prompts/OB-198_VOCABULARY_ALIGNMENT.md
git commit -m "OB-198: commit prompt to git (Rule 5)"
git push -u origin ob-198-vocabulary-alignment
```

### 0A: Verify CHECK constraint live + post-OB-197 distribution

Run the OB-197 Phase 1C verifier (already on main from PR #353):

```bash
cd /Users/AndrewAfrica/spm-platform/web
set -a && source .env.local && set +a
npx tsx scripts/ob197/phase1c-verify.ts
```

**HALT if:** check (a) does not show 24 columns incl. `calculation_run_id`; check (b) does not show prefix-only distribution; check (c) does not reject the invalid INSERT.

### 0B: Confirm the 15 writer literals + 2 reader patterns are still present pre-Phase-1

```bash
# Writers (every entry in F-1_INVENTORY.md should still be present)
grep -nE "'training:|'convergence_outcome|'field_mapping|'cost_event'" \
  web/src/app/api/reconciliation/run/route.ts \
  web/src/app/api/reconciliation/compare/route.ts \
  web/src/app/api/calculation/run/route.ts \
  web/src/app/api/ai/assessment/route.ts \
  web/src/app/api/approvals/[id]/route.ts \
  web/src/app/data/import/enhanced/page.tsx \
  web/src/lib/ai/training-signal-service.ts \
  web/src/lib/calculation/synaptic-surface.ts \
  web/src/lib/calculation/calculation-lifecycle-service.ts \
  web/src/lib/ai/ai-service.ts

# Readers
grep -n "startsWith('training:')" web/src/lib/ai/training-signal-service.ts
grep -n "startsWith('sci:')" web/src/app/api/platform/observatory/route.ts
```

**HALT if:** any line returns nothing (means upstream changed; F-1_INVENTORY.md may be stale; surface to architect).

### 0C: Pre-flight HALT confirmation

If 0A and 0B pass, paste output and proceed.

**Commit:** `OB-198 Phase 0: pre-flight verification`

---

## PHASE 1: PER-SITE VOCABULARY ALIGNMENT

Execute the F-1_INVENTORY.md mapping. Each site below has a HARD proof gate — paste before/after diff in the verification step.

### 1A — W-1, W-2 (reconciliation/run/route.ts)

```ts
// L132: 'training:reconciliation_outcome' → 'convergence:reconciliation_outcome'
// L161: 'convergence_outcome' → 'convergence:calculation_validation'
```

### 1B — W-3, W-4 (reconciliation/compare/route.ts)

```ts
// L159: 'training:reconciliation_comparison' → 'convergence:reconciliation_comparison'
// L195: 'convergence_outcome' → 'convergence:calculation_validation'
```

### 1C — W-5, W-6 (calculation/run/route.ts)

```ts
// L1864: ?? 'training:synaptic_density' → ?? 'lifecycle:synaptic_consolidation'
// L1877: 'training:dual_path_concordance' → 'convergence:dual_path_concordance'
```

### 1D — W-7 (api/ai/assessment/route.ts)

```ts
// L180: 'training:assessment_generated' → 'lifecycle:assessment_generated'
```

### 1E — W-8 (api/approvals/[id]/route.ts)

```ts
// L167: 'training:lifecycle_transition' → 'lifecycle:transition'
```

### 1F — W-9 (data/import/enhanced/page.tsx)

```ts
// L2252: 'field_mapping' → 'comprehension:header_binding'
```

### 1G — W-10, W-11, W-12 (lib/ai/training-signal-service.ts)

```ts
// L39: `training:${response.task}` → `comprehension:ai_${response.task}`
// L80: 'training:user_action' → 'lifecycle:user_action'
// L110: 'training:outcome' → 'lifecycle:outcome'
```

**HALT discipline for W-10:** before applying, grep `web/src/lib/ai/types.ts` for the `AITaskType` union. For each member, decide whether `comprehension:ai_${member}` is the right prefix. If any member's semantic level is unambiguously not comprehension (e.g., a member named `cost_estimation` that should land in `cost:`), HALT and surface — do not invent a special-case branch.

### 1H — W-13 (lib/calculation/synaptic-surface.ts) — paired with W-5

```ts
// L204: 'training:synaptic_density' → 'lifecycle:synaptic_consolidation'
```

### 1I — W-14 (lib/calculation/calculation-lifecycle-service.ts) — paired with W-8

```ts
// L457: 'training:lifecycle_transition' → 'lifecycle:transition'
```

### 1J — W-15 (lib/ai/ai-service.ts)

```ts
// L125: 'cost_event' → 'cost:event'
```

### 1K — R-1 (lib/ai/training-signal-service.ts:142)

Replace the legacy `startsWith('training:')` filter with one that matches the post-OB-198 emit pattern. Cleanest implementation per F-1_INVENTORY.md R-1:

```ts
// Was:
.filter(row => row.signalType.startsWith('training:'))
// Becomes:
.filter(row => {
  const sv = row.signalValue as Record<string, unknown> | undefined;
  return typeof sv?.signalId === 'string';
})
```

This filters on the durable identifier of training-signal-service writes (every captureAIResponse / recordUserAction / recordOutcome write puts `signalId` in signal_value), making the filter robust across the dynamic comprehension prefix variation.

### 1L — R-2 (api/platform/observatory/route.ts:429)

Replace the legacy `startsWith('sci:')` filter with one that matches sci-originated signals under the new vocabulary. Per F-1_INVENTORY.md R-2:

```ts
// Was:
safeSignals.some(s => s.tenant_id === tid && s.signal_type.startsWith('sci:'))
// Becomes:
safeSignals.some(s => {
  if (s.tenant_id !== tid) return false;
  const sv = s.signal_value as Record<string, unknown> | undefined;
  return typeof sv?.sci_internal_type === 'string';
})
```

`sci_internal_type` is preserved on every sci-originated write by `signal-capture-service.ts` `toPrefixSignalType()` per OB-197 Phase 2. It is the durable indicator that a signal came from the SCI capture surface regardless of its prefix.

### 1M — Verify Phase 1

Per file, paste the before/after diff (one excerpt per site, 3-line context).

```bash
cd /Users/AndrewAfrica/spm-platform

# All writes now prefix-form (zero non-prefix literals in writer position):
grep -rnE "signalType:\s*['\"]training:|signalType:\s*['\"]convergence_outcome'|signal_type:\s*['\"]field_mapping'|signalType:\s*['\"]cost_event'" web/src 2>/dev/null
# Expected: zero output

grep -rnE 'signalType:\s*`training:' web/src 2>/dev/null
# Expected: zero output

grep -rnE "startsWith\('training:'\)|startsWith\('sci:'\)" web/src 2>/dev/null
# Expected: zero output (R-1, R-2 updated)

# All emitted prefix vocabulary present:
grep -rnE "signalType:\s*['\"]?(classification|comprehension|convergence|cost|lifecycle):" web/src 2>/dev/null | wc -l
# Expected: ≥17 (15 writers + 2 OB-197 sites that were already prefix-form: convergence-service.ts L314, briefing-signals.ts L49, etc.)

cd web
npx tsc --noEmit
echo "tsc exit: $?"
npx next lint
echo "lint exit: $?"
```

**HALT if:** any non-prefix literal remains in writer position; tsc or lint exits non-zero.

**Commit:** `OB-198 Phase 1: writer + reader vocabulary alignment (15 writes + 2 reads)`

---

## PHASE 2: BUILD VERIFICATION + PR

### 2A: Final build

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -30
echo "Build exit: $?"

nohup npm run dev > /tmp/ob198-dev.log 2>&1 &
sleep 12
curl -sI http://localhost:3000 | head -3
pkill -f "next dev" 2>/dev/null || true
```

### 2B: Open PR

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head ob-198-vocabulary-alignment \
  --title "OB-198: Signal Vocabulary Alignment — F-1 Remediation" \
  --body "[see PHASE 3 completion report for full content]"
```

(See Phase 3 completion report for the canonical PR body content; reuse it verbatim.)

**Commit:** `OB-198 Phase 2: build + PR`

---

## PHASE 3: COMPLETION REPORT

### COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE: `docs/completion-reports/OB-198_COMPLETION_REPORT.md`.

### Required structure (mirrors OB-197 report)

```markdown
# OB-198 COMPLETION REPORT
## Date: [date]
## Execution Time: [HH:MM]

## COMMITS (in order)
| Hash | Phase | Description |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD

| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| 1 | All 15 writer sites in F-1_INVENTORY.md emit prefix-vocabulary signal_type | | (paste before/after diff per site) |
| 2 | Both reader sites in F-1_INVENTORY.md updated to post-OB-197 filter pattern | | (paste before/after diff per site) |
| 3 | Zero non-prefix signal_type literals remain in writer position across web/src | | (paste grep result) |
| 4 | Zero `startsWith('training:')` / `startsWith('sci:')` filters remain | | (paste grep result) |
| 5 | `npx tsc --noEmit` exits 0 | | |
| 6 | `npx next lint` exits 0 | | |
| 7 | `npm run build` exits 0 | | |
| 8 | `curl -I http://localhost:3000` returns 200 or 307 | | |
| 9 | PR opened against main | | |

## PROOF GATES — SOFT

| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| 10 | W-2/W-4 (direct convergence_outcome callers) align with `toPrefixSignalType()` mapping for sci convergence_outcome — both produce `'convergence:calculation_validation'` | | |
| 11 | W-5 default fallback matches W-13 primary emitter (`'lifecycle:synaptic_consolidation'`) so fallback never produces a different value than primary | | |
| 12 | W-8 / W-14 paired emitters land on identical `'lifecycle:transition'` | | |
| 13 | W-10 dynamic template covers all `AITaskType` enum members under comprehension prefix | | (paste enum + verification) |
| 14 | R-1 filter robust under W-10 dynamic prefix variation (filters on signal_value.signalId presence) | | |
| 15 | R-2 filter aligned with `toPrefixSignalType()` write-side preservation of `sci_internal_type` | | |

## STANDING RULE COMPLIANCE
[Rules 1-2, 5-7, 25-28: PASS or PASS-qualified]

## KNOWN ISSUES
- (anything that did not work, partial implementations, deferred items)
- (architect verifies post-merge in browser per SR-44)

## OUT-OF-BAND FINDINGS
- (anything noticed during execution beyond F-1_INVENTORY.md scope)
- (DO NOT FIX — flag for architect)
```

**Commit:** `OB-198 Phase 3: completion report`

---

## ARCHITECT ACTION REQUIRED (Post-PR Open)

Same SR-44 / capability-routing pattern as OB-197:

1. PR review of OB-198 against F-1_INVENTORY.md
2. `gh pr merge <PR#> --merge --delete-branch`
3. Browser verification on production (vialuce.ai) — exercise reconciliation, AI assessment, approvals, calculation flows; confirm signal writes succeed (no constraint violations in Vercel logs)
4. "OB-198 PASS" sign-off in architect channel

CC does not perform browser verification. CC does not merge PRs. CC does not interpret production logs.

---

## MAXIMUM SCOPE

1 phase of writer/reader changes (no schema migration, no new tests written) + 1 phase build + 1 phase report = **3 phases**, 9 hard gates + 6 soft gates. After OB-198, every signal-write path is CHECK-compliant; the closed-loop intelligence surface OB-197 enabled is no longer silently degraded.

---

*OB-198 — 2026-05-01 (queued post-OB-197 PR #353 merge)*
*F-1 remediation. Writers conform to constraint. Constraint stays.*
