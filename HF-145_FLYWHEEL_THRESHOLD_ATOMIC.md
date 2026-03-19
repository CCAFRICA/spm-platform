# HF-145: Flywheel Confidence Threshold + Atomic Updates
## March 18, 2026

---

## READ FIRST — IN THIS ORDER

1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL rules
2. `SCHEMA_REFERENCE_LIVE.md` (March 18 refresh — HF-144) — verify column names
3. `DIAG-008_COMPLETION_REPORT.md` — the diagnostic findings that govern this fix
4. This prompt (read COMPLETELY before writing any code)

**STANDING RULES (active):**
- **29:** No code changes until diagnostic identifies root cause — DIAG-008 is the diagnostic
- **30:** One issue per prompt — this HF fixes ONE issue (flywheel self-correction reliability)
- **34:** No bypasses
- **35:** EPG mandatory — mathematical/formula changes require executable proof
- **36:** No unauthorized behavioral changes

---

## PROBLEM STATEMENT (from DIAG-008)

The flywheel self-correction is structurally defeated by three issues:

1. **No confidence threshold for Tier 1 routing.** `lookupFingerprint` checks if `classification_result` exists and is non-empty. It does NOT check the `confidence` value. At confidence 0.32, the next import still routes to Tier 1, skips re-classification, and bumps confidence back to 0.93.

2. **Read-then-write race condition.** Both `writeFingerprint` (classification path) and binding validation (execute-bulk path) use SELECT → compute → UPDATE without transactions. Parallel workers cause lost increments (matchCount 12→13→12 within 47ms).

3. **Classification path always bumps confidence.** Runs before binding failure is detectable. Even when binding failure decreases confidence, the next classification undoes the decrease.

**Current BCL state:** confidence=0.3231, match_count=12, ID_Empleado still mapped as `category_code` (wrong). The self-correction detected the problem but cannot trigger re-classification.

---

## VERIFIED SCHEMA

**structural_fingerprints** (from SCHEMA_REFERENCE_LIVE.md, March 18, 2026):

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | YES | |
| fingerprint | text | NO | |
| fingerprint_hash | text | NO | |
| classification_result | jsonb | NO | |
| column_roles | jsonb | NO | |
| match_count | integer | NO | 1 |
| confidence | numeric | NO | 0.7 |
| source_file_sample | text | YES | |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**No schema changes in this HF. All fixes are code-only.**

---

## PHASE 0: LOCATE THE CODE

Find the two functions identified in DIAG-008. Paste the current code for verification.

```bash
# lookupFingerprint — where Tier 1 routing decision is made
grep -n "lookupFingerprint\|tier.*1\|Tier 1\|classification_result.*length\|Object.keys" \
  web/src/lib/sci/fingerprint-flywheel.ts | head -20

# writeFingerprint — where confidence is bumped on Tier 1 match  
grep -n "writeFingerprint\|match_count.*+.*1\|newMatchCount\|newConfidence" \
  web/src/lib/sci/fingerprint-flywheel.ts | head -20

# Binding validation — where confidence is decreased on failure
grep -n "matchRate\|match_rate\|binding failure\|confidence.*decrease\|0\.2" \
  web/src/app/api/import/sci/execute-bulk/route.ts | head -20
```

**Paste all output.**

**Commit:** `HF-145 Phase 0: Code location verification`

---

## PHASE 1: CONFIDENCE THRESHOLD FOR TIER 1 ROUTING

**In `lookupFingerprint` (fingerprint-flywheel.ts):**

Find the condition that determines Tier 1 routing. DIAG-008 found it checks `classification_result && Object.keys(classification_result).length > 0` but does NOT check confidence.

**Add a confidence threshold check:**

```typescript
// BEFORE (DIAG-008 finding — routes to Tier 1 regardless of confidence):
if (tier1.classification_result && Object.keys(tier1.classification_result).length > 0) {
  return { tier: 1, ... };
}

// AFTER (confidence must be >= 0.5 for Tier 1):
if (tier1.classification_result && Object.keys(tier1.classification_result).length > 0 
    && Number(tier1.confidence) >= 0.5) {
  return { tier: 1, ... };
}
// If confidence < 0.5: falls through to Tier 2 (re-classify with minimal LLM)
```

**The threshold of 0.5 is the midpoint.** Below 0.5 means the system has less confidence than a coin flip — re-classification is warranted. The OB-177 self-correction decreases by 0.2 per binding failure: 3 failures from 0.92 → 0.32 (below threshold). The formula `1 - 1/(n+1)` reaches 0.5 at matchCount=1, so a single successful re-classification immediately restores Tier 1 eligibility.

**Mathematical review (Standing Rule 38):**
```
Threshold: 0.5
Decrease per binding failure: 0.2
Starting from 0.92 (matchCount=12): 
  1 failure → 0.72 (still Tier 1)
  2 failures → 0.52 (still Tier 1)  
  3 failures → 0.32 (Tier 2 — re-classify)
Recovery: 1 successful match at matchCount=1 → confidence = 0.5 (exactly at threshold)
  2 successful matches → confidence = 0.67 (solidly Tier 1)
```

**Acceptance criterion:** With confidence 0.32 (current BCL state), `lookupFingerprint` returns Tier 2, not Tier 1.

**Commit:** `HF-145 Phase 1: Confidence threshold for Tier 1 routing`

---

## PHASE 2: ATOMIC CONFIDENCE UPDATES

**In `writeFingerprint` (fingerprint-flywheel.ts):**

Replace the read-then-write pattern with an atomic SQL update.

```typescript
// BEFORE (DIAG-008 finding — race-prone read-then-write):
const { data: existing } = await supabase
  .from('structural_fingerprints')
  .select('id, match_count, confidence')
  .eq('tenant_id', tenantId)
  .eq('fingerprint_hash', fingerprintHash)
  .maybeSingle();

if (existing) {
  const newMatchCount = existing.match_count + 1;
  const newConfidence = 1 - (1 / (newMatchCount + 1));
  await supabase
    .from('structural_fingerprints')
    .update({ match_count: newMatchCount, confidence: newConfidence })
    .eq('id', existing.id);
}

// AFTER (atomic — single UPDATE, no read):
if (existing) {
  await supabase.rpc('increment_fingerprint_confidence', {
    fp_id: existing.id
  });
}
```

**However** — Supabase JS client doesn't support inline SQL expressions in `.update()`. Two options:

**Option A: Supabase RPC function (preferred — truly atomic):**
```sql
CREATE OR REPLACE FUNCTION increment_fingerprint_confidence(fp_id uuid)
RETURNS void AS $$
UPDATE structural_fingerprints 
SET match_count = match_count + 1,
    confidence = 1.0 - (1.0 / (match_count + 2)),
    updated_at = now()
WHERE id = fp_id;
$$ LANGUAGE sql;
```

**Option B: Read-then-write with optimistic locking:**
```typescript
const { data: existing } = await supabase
  .from('structural_fingerprints')
  .select('id, match_count, confidence')
  .eq('tenant_id', tenantId)
  .eq('fingerprint_hash', fingerprintHash)
  .maybeSingle();

if (existing) {
  const newMatchCount = existing.match_count + 1;
  const newConfidence = 1 - (1 / (newMatchCount + 1));
  const { count } = await supabase
    .from('structural_fingerprints')
    .update({ 
      match_count: newMatchCount, 
      confidence: Number(newConfidence.toFixed(4)),
      updated_at: new Date().toISOString()
    })
    .eq('id', existing.id)
    .eq('match_count', existing.match_count);  // ← optimistic lock: only update if match_count hasn't changed
  // If count === 0, another worker already updated — skip (acceptable loss of one increment)
}
```

**Choose Option A if Supabase allows RPC creation from the dashboard. Choose Option B if not.** Document which option was used and why.

**Apply the same pattern to the binding validation confidence decrease in execute-bulk/route.ts:**
```typescript
// Atomic decrease — prevents race between parallel execute-bulk handlers
const { count } = await supabase
  .from('structural_fingerprints')
  .update({ 
    confidence: Math.max(0.3, Number(fp.confidence) - 0.2),
    updated_at: new Date().toISOString()
  })
  .eq('id', fp.id)
  .eq('confidence', fp.confidence);  // ← optimistic lock
```

**Acceptance criterion:** Under parallel worker execution (3+ simultaneous process-job handlers for same fingerprint hash), matchCount increments correctly without lost updates.

**Commit:** `HF-145 Phase 2: Atomic confidence updates — prevent race condition`

---

## PHASE 3: EPG — PROOF SCRIPTS

**Standing Rule 35: EPG mandatory for mathematical/formula changes.**

Create `scripts/verify/HF-145_threshold.ts`:

```typescript
// Test 1: Confidence threshold gates Tier 1 routing
// Simulate lookupFingerprint with various confidence values
// confidence 0.32 → should return Tier 2
// confidence 0.50 → should return Tier 1
// confidence 0.92 → should return Tier 1

// Test 2: Atomic update formula
// match_count + 1 = N → confidence = 1 - 1/(N+1)
// Verify: match_count=12 → 13 → confidence = 1 - 1/14 = 0.9286
// Verify: match_count=0 → 1 → confidence = 1 - 1/2 = 0.5000

// Test 3: Recovery scenario
// Start at confidence 0.32, match_count=12
// Tier 2 re-classification succeeds → new match_count=1 (reset), confidence=0.5
// Next successful match → match_count=2, confidence=0.667
// Confirm monotonic recovery after re-classification

// Test 4: Self-correction scenario
// Start at confidence 0.92, match_count=12
// 3 binding failures: 0.92 → 0.72 → 0.52 → 0.32
// Next import: confidence 0.32 < 0.5 → Tier 2 (re-classify)
// Confirm self-correction triggers
```

CC must create this script, run it, paste COMPLETE output into completion report.

**Acceptance criterion:** All 4 tests pass. Confidence threshold correctly gates Tier 1/2 routing. Self-correction scenario proves the full cycle: binding failure → confidence decrease → threshold breach → Tier 2 re-classification.

**Commit:** `HF-145 Phase 3: EPG verification scripts`

---

## PHASE 4: BUILD + COMPLETION REPORT

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. Create completion report file
5. `git add . && git commit -m "HF-145 Phase 4: Build verification and completion report"`
6. `git push origin dev`
7. `gh pr create --base main --head dev --title "HF-145: Flywheel Confidence Threshold + Atomic Updates" --body "## Fixes DIAG-008 Findings\n\n1. Confidence threshold (0.5) gates Tier 1 routing — below threshold triggers Tier 2 re-classification\n2. Atomic confidence updates prevent parallel worker race condition\n3. EPG scripts prove self-correction cycle works end-to-end\n\nSee HF-145_COMPLETION_REPORT.md for proof."`

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-145_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch

---

## COMPLETION REPORT TEMPLATE

```markdown
# HF-145 COMPLETION REPORT
## Date: [DATE]

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| | Phase 0 | Code location verification |
| | Phase 1 | Confidence threshold for Tier 1 routing |
| | Phase 2 | Atomic confidence updates |
| | Phase 3 | EPG verification scripts |
| | Phase 4 | Build verification and completion report |

## FILES MODIFIED
| File | Change |
|------|--------|
| web/src/lib/sci/fingerprint-flywheel.ts | Confidence threshold in lookupFingerprint, atomic update in writeFingerprint |
| web/src/app/api/import/sci/execute-bulk/route.ts | Optimistic locking on binding failure confidence decrease |

## FILES CREATED
| File | Purpose |
|------|---------|
| scripts/verify/HF-145_threshold.ts | EPG: confidence threshold + self-correction verification |

## PROOF GATES — HARD (EPG output required)
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | confidence 0.32 → lookupFingerprint returns Tier 2 | | [paste EPG output] |
| 2 | confidence 0.50 → lookupFingerprint returns Tier 1 | | [paste EPG output] |
| 3 | Atomic update: match_count=12→13, confidence=0.9286 | | [paste EPG output] |
| 4 | Self-correction cycle: 3 failures → Tier 2 → re-classify | | [paste EPG output] |
| 5 | npm run build exits 0 | | [paste exit code] |

## PROOF GATES — SOFT
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | Optimistic lock used (not bare read-then-write) | | [paste code snippet showing .eq('match_count', existing.match_count)] |
| 2 | No schema changes (no migrations) | | PASS/FAIL |

## STANDING RULE COMPLIANCE
- Rule 30 (one issue): PASS/FAIL — only flywheel confidence logic modified
- Rule 35 (EPG): PASS/FAIL — scripts/verify/HF-145_threshold.ts created, run, output pasted
- Rule 36 (no unauthorized changes): PASS/FAIL

## KNOWN ISSUES
- [anything that didn't work]
```

---

## WHAT THIS HF DOES NOT DO

- Does NOT fix the entity_identifier misclassification in BCL's cached fingerprint (that re-classification happens automatically once Tier 1 is gated by confidence)
- Does NOT add a `needs_reclass` column (no schema changes)
- Does NOT change the binding validation logic (the detection is correct, only the gating was broken)
- Does NOT change parallel worker orchestration (atomic updates make parallel execution safe)

---

*"A self-correction that can be undone by the next classification is not self-correction. It's a suggestion."*
