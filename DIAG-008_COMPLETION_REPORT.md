# DIAG-008 COMPLETION REPORT
## Date: March 18, 2026

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| | Phase 0-3 | Combined diagnostic — code trace + race analysis + fingerprint state + effectiveness |

## DIAGNOSTIC FINDINGS

### Phase 0: Two Confidence Update Paths

**Path 1 — Classification (process-job → writeFingerprint):**
```typescript
// fingerprint-flywheel.ts lines 120-144
const { data: existing } = await supabase
  .from('structural_fingerprints')
  .select('id, match_count, confidence')          // ← READ
  .eq('tenant_id', tenantId)
  .eq('fingerprint_hash', fingerprintHash)
  .maybeSingle();

if (existing) {
  const newMatchCount = existing.match_count + 1;
  const newConfidence = 1 - (1 / (newMatchCount + 1));  // ← COMPUTE
  await supabase
    .from('structural_fingerprints')
    .update({
      match_count: newMatchCount,
      confidence: Number(newConfidence.toFixed(4)),       // ← WRITE
    })
    .eq('id', existing.id);
}
```
**Called from:** `process-job/route.ts` line 259 as fire-and-forget: `writeFingerprint(...).catch(() => {})`
**Trigger:** Every successful classification (Tier 1, 2, or 3). ALWAYS bumps confidence.

**Path 2 — Binding validation (execute-bulk → self-correction):**
```typescript
// execute-bulk/route.ts lines 647-680
const { count: boundCount } = await supabase.from('committed_data')
  .select('*', { count: 'exact', head: true })
  .eq('import_batch_id', batchId)
  .not('entity_id', 'is', null);                         // ← READ binding rate
const matchRate = totalInserted > 0 ? (boundCount ?? 0) / totalInserted : 0;
if (totalInserted > 10 && matchRate < 0.5) {
  // ...
  const { data: fp } = await supabase.from('structural_fingerprints')
    .select('id, confidence')                              // ← READ confidence
    .eq('tenant_id', tenantId)
    .eq('fingerprint_hash', fpHash)
    .maybeSingle();
  if (fp) {
    const newConfidence = Math.max(0.3, Number(fp.confidence) - 0.2);
    await supabase.from('structural_fingerprints')
      .update({ confidence: newConfidence })               // ← WRITE decreased
      .eq('id', fp.id);
  }
}
```
**Called from:** execute-bulk route, AFTER postCommitConstruction completes.
**Trigger:** Only when `matchRate < 0.5` (binding failure detected).

**Other paths:** No other code paths modify fingerprint confidence. `writeFingerprint` is the only writer (besides the OB-177 self-correction). Grep confirms:
```
grep -rn "structural_fingerprints.*update" web/src/ → only fingerprint-flywheel.ts and execute-bulk/route.ts
```

---

### Phase 1: Race Condition Analysis

**1A: Classification path — READ-THEN-WRITE (race-prone).**
Lines 120-125: SELECT match_count, confidence → compute new values → UPDATE. No transaction, no lock, no conditional update. Two parallel workers reading match_count=11 will both compute match_count=12, losing one increment.

**1B: Binding validation — READ-THEN-WRITE (race-prone).**
Lines 662-666: SELECT confidence → compute `max(0.3, confidence - 0.2)` → UPDATE. Same TOCTOU pattern.

**1C: Both paths CAN execute simultaneously.**
For the SAME fingerprint hash:
- 6 parallel process-job workers run simultaneously for 6 BCL files (all same structure = same hash)
- Each worker calls `writeFingerprint` → 6 concurrent read-then-write cycles on the same row
- Evidence from logs: `matchCount went 12→13→12` within 47ms — last writer wins, lost increment

For the SAME file:
- process-job (classification) runs FIRST
- User confirms → execute-bulk (commitment) runs SECOND
- These are sequential for one file, but process-job writes confidence BEFORE execute-bulk can detect binding failure
- By the time binding failure is detected, confidence is already bumped

**1D: Batch 1 (16:31) — no confidence decrease:**
OB-177 PR #269 was committed at 14:22-14:26 local time (21:22-21:26 UTC). The Vercel deployment for PR #269 may not have been live at 16:31 UTC (09:31 local), which is BEFORE the commits. So the self-correction code didn't exist yet when Batch 1 ran.

Additionally, even if the code was deployed, the `unitSource` check (`(unit as unknown as Record<string, unknown>).sourceFile`) may return undefined for the BulkContentUnit type, since `sourceFile` is passed in the JSON body but not defined in the BulkContentUnit interface. The inner block would silently skip.

---

### Phase 2: Current Fingerprint State

**2A: Columns (from SCHEMA_REFERENCE_LIVE.md — refreshed HF-144):**
```
id, tenant_id, fingerprint, fingerprint_hash, classification_result, column_roles,
match_count, confidence, source_file_sample, created_at, updated_at
```
No `needs_reclass` column exists.

**2B: BCL datos fingerprint (hash: fbead6eed137...):**
```
match_count: 12
confidence: 0.3231
updated_at: 2026-03-18T23:39:28.54+00:00
classification_result.fieldBindings:
  ID_Empleado → category_code (confidence 0.5)          ← WRONG (should be entity_identifier)
  Cantidad_Productos_Cruzados → transaction_count        ← was entity_identifier, now corrected
column_roles:
  ID_Empleado: category_code                             ← WRONG
```

**Confidence trace (reconstructed from logs):**
```
matchCount 6 → confidence 0.8571 (OB-176 Phase 1 manual update)
Import 3 files → 3 process-job workers bump to ~0.92
Import 3 files → execute-bulk detects 0% binding → decreases by 0.2
Race: classification bumps to 0.9231, then binding failure decreases to 0.7231
Second binding failure: 0.7231 → 0.5231
Third: 0.5231 → 0.3231
Net result: confidence = 0.3231 (below initial 0.5)
```

**BCL roster fingerprint (hash: a94f3b01...):**
```
match_count: 1
confidence: 0.5
ID_Empleado → entity_identifier ← CORRECT
Nivel_Cargo → entity_attribute  ← CORRECT (contains "Ejecutivo Senior" values)
```

---

### Phase 3: Self-Correction Effectiveness

**3A: Next import behavior for hash fbead6eed137:**
1. `lookupFingerprint` queries `structural_fingerprints WHERE fingerprint_hash = 'fbead6eed137...'`
2. Record EXISTS with `classification_result` (non-empty) → returns Tier 1
3. **There is NO confidence threshold for Tier 1.** The `lookupFingerprint` function checks `tier1.classification_result && Object.keys(tier1.classification_result).length > 0` — NO confidence check.
4. Tier 1: HC is skipped, CRR runs, `writeFingerprint` bumps matchCount to 13, confidence to `1 - 1/14 = 0.929`
5. execute-bulk detects binding failure → decreases to `0.929 - 0.2 = 0.729`
6. **Net: confidence increases from 0.3231 to 0.729** — self-correction is partially defeated

**3B: Is there a binding-failure flag the classification path respects?**
**NO.** There is no flag, no column, no mechanism. The classification path (`writeFingerprint`) ALWAYS bumps confidence on Tier 1 match regardless of prior binding failures. The `lookupFingerprint` function has no confidence threshold for Tier 1 routing.

**3C: Recommended fix direction (NOT IMPLEMENTING):**

**Option 1: Confidence threshold for Tier 1 (simplest, most effective).**
In `lookupFingerprint`, add: `if (tier1.confidence < 0.5) → treat as Tier 2 (re-classify)`.
This makes the self-correction effective: once confidence drops below 0.5, the next import uses Tier 2 with minimal LLM, which re-classifies and potentially fixes the entity_identifier mapping.

**Option 2: Atomic confidence updates (prevents race, doesn't fix logic).**
Change `writeFingerprint` to use `UPDATE SET match_count = match_count + 1, confidence = 1 - (1.0 / (match_count + 2))` — a single atomic SQL statement. Prevents last-writer-wins but doesn't address the structural problem of classification path defeating binding validation.

**Option 3: Binding-failure flag (most robust but requires schema change).**
Add `needs_reclass boolean DEFAULT false` to `structural_fingerprints`. Binding failure sets it to true. `lookupFingerprint` checks: if `needs_reclass = true → Tier 2`. `writeFingerprint` clears the flag after re-classification. This requires a migration.

**Recommended: Option 1 + Option 2.** Confidence threshold is the minimum fix (no schema change needed). Atomic updates prevent the parallel worker race condition. Both can be implemented in the flywheel code without migrations.

## STANDING RULE COMPLIANCE
- Rule 29 (no code changes until diagnostic): PASS — zero source files modified
