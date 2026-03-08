# HF-105: HC PATTERN CLASSIFICATION — TWO-LEVEL RESOLUTION MODEL

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` at the project root — authoritative schema source
3. `Vialuce_Contextual_Reliability_Resolution_Specification.md` — CRR specification (Level 2 fallback)
4. `web/src/lib/sci/resolver.ts` — CRR resolver (preserved as Level 2)
5. `web/src/lib/sci/agents.ts` — agent scoring + HC signal application
6. `web/src/lib/sci/header-comprehension.ts` — HC implementation
7. `web/src/app/api/import/sci/analyze/route.ts` — analyze route

**If you have not read ALL SEVEN files, STOP and read them now.**

---

## WHY THIS HF EXISTS

The CRR Bayesian resolver (Level 2) cannot correctly classify Datos_Flota_Hub because the structural signals overwhelm HC's reference_key identification. HC returns the correct answer at 1.00 confidence, but the scoring system can't use it effectively.

The solution is not better weights. The solution is a simpler model: when HC is confident and the column role pattern matches a known classification, use the pattern directly. The CRR resolver becomes the fallback for when HC is unavailable or the pattern is ambiguous.

### Production Evidence

HC returns perfect column roles at 1.00 confidence:
```
Plantilla: identifier, name, attribute, attribute, reference_key, temporal
Datos_Rendimiento: identifier, name, attribute, attribute, reference_key, temporal×2, measure×14
Datos_Flota_Hub: attribute, reference_key, temporal×2, measure×3
```

The PATTERN is the classification. The role set tells you what the sheet is:
- Identifier + name + attributes, low repeat = entity (roster of people)
- Identifier + name + measures over time, high repeat = transaction (people doing things)
- Reference_key + measures, NO identifier, NO name = reference (properties of things)

No scoring needed. No weights. The presence and absence of role types determines classification.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **COMPLETION REPORT IS MANDATORY (Rules 25-28).**
6. **EVIDENTIARY GATES — NOT PASS/FAIL.**

---

## THE TWO-LEVEL MODEL

### Level 1: HC Pattern Classification (New)

When HC runs at confidence ≥ 0.80 with sufficient column coverage (≥ 80% of columns classified as non-unknown), classify from the role pattern:

**Inputs:**
- HC column role set (which roles are present, which are absent)
- idRepeatRatio (one structural number for disambiguation)

**Pattern rules (not weights — presence/absence logic):**

```
ENTITY pattern:
  HAS identifier AND HAS name
  AND idRepeatRatio ≤ 1.5 (each ID appears ~once)
  → entity

TRANSACTION pattern:
  HAS identifier
  AND HAS measure (at least one)
  AND HAS temporal
  AND idRepeatRatio > 1.5 (each ID repeats across periods)
  → transaction

REFERENCE pattern:
  HAS reference_key
  AND NOT HAS identifier
  AND NOT HAS name
  → reference

TARGET pattern:
  HAS identifier
  AND HAS measure
  AND NOT HAS temporal
  AND idRepeatRatio ≤ 1.5
  → target

PLAN pattern:
  Content parsed from PPTX/PDF/DOCX (not XLSX data)
  → plan (handled separately, not by this pattern matcher)
```

**When no pattern matches:** Fall through to Level 2.
**When multiple patterns match:** Fall through to Level 2.

### Level 2: CRR Bayesian Resolver (Existing — Unchanged)

The current CRR implementation with structural agents, seed priors, and Bayesian posteriors. Runs when:
- HC didn't run (API unavailable)
- HC confidence < 0.80
- HC column coverage < 80%
- No Level 1 pattern matched
- Multiple Level 1 patterns matched (ambiguous)

**Level 2 code is NOT modified in this HF.** It stays exactly as built in OB-161 + HF-102. It becomes the fallback path.

### Human Authority (Both Levels)

The user always sees the proposal and can confirm or override. Override feeds the flywheel. This applies regardless of which level produced the classification.

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "HF-105 PHASE 0: PATTERN CLASSIFICATION DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: Where resolveClassification is called ==="
grep -n "resolveClassification\|classifyContent" web/src/app/api/import/sci/analyze/route.ts | head -10

echo ""
echo "=== 0B: resolveClassification function signature ==="
grep -n "export.*function.*resolveClassification\|export.*async.*resolveClassification" web/src/lib/sci/resolver.ts

echo ""
echo "=== 0C: HC result availability at classification time ==="
echo "--- How does the analyze route pass HC results to classification? ---"
grep -n "headerComprehension\|hcResult\|hcMetrics\|enhanceWithHeader" web/src/app/api/import/sci/analyze/route.ts | head -15

echo ""
echo "=== 0D: Where idRepeatRatio is available ==="
grep -n "idRepeatRatio\|identifierRepeatRatio" web/src/lib/sci/ -r --include="*.ts" | head -15

echo ""
echo "=== 0E: Current resolver entry point ==="
echo "--- First 30 lines of resolveClassification ---"
head -90 web/src/lib/sci/resolver.ts | tail -60

echo ""
echo "=== 0F: HC data structure — what's available per sheet ==="
grep -n "interface.*Header\|type.*Header\|HeaderComprehension\|interpretations" web/src/lib/sci/sci-types.ts web/src/lib/sci/types.ts 2>/dev/null | head -15
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-105 Phase 0: Pattern classification diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION GATE

```
ARCHITECTURE DECISION RECORD
============================
Problem: CRR Bayesian resolver cannot correctly classify Datos_Flota_Hub
         despite HC returning perfect column roles. Weights and scoring
         cannot overcome structural signal dominance.

Solution: Two-level classification model.
  Level 1: HC role pattern + idRepeatRatio → direct classification (new)
  Level 2: CRR Bayesian resolver → fallback (existing, unchanged)

Implementation:
  - New function: classifyByHCPattern(profile, hcResult) → classification | null
  - Called BEFORE resolveClassification() in the analyze route
  - If Level 1 returns a classification → use it, skip Level 2
  - If Level 1 returns null → call resolveClassification() (Level 2)
  - Level 2 code is NOT modified

Scale test: YES — pattern matching is O(1), handles any column count
Korean Test: YES — uses HC semantic roles, not field names
Domain-agnostic: YES — identifier/name/measure/temporal/reference_key are structural
AP-17: NO dual code paths — Level 1 and Level 2 are sequential, not parallel

CHOSEN: Two-level model with HC pattern as primary, CRR as fallback
REJECTED: More weight tuning — proven ineffective across HF-098 through HF-104
REJECTED: Hardcoded overrides — Decision 109 principle (no unfounded thresholds)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-105 Phase 1: Architecture decision — two-level classification" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

### 2A: Create HC Pattern Classifier

New file: `web/src/lib/sci/hc-pattern-classifier.ts`

Implement `classifyByHCPattern()`:
- Accepts the content profile (for idRepeatRatio) and HC result (for column roles)
- Checks preconditions: HC confidence ≥ 0.80, column coverage ≥ 80% non-unknown
- Evaluates patterns in order: entity, transaction, reference, target
- Returns the matching classification or null (no match / ambiguous)
- Logs the decision: `[SCI-HC-PATTERN]` with the pattern matched and the evidence

**The patterns use presence/absence logic with idRepeatRatio as the single structural disambiguator. No weights. No scores. No thresholds beyond the preconditions.**

### 2B: Wire into Analyze Route

In `analyze/route.ts`, call `classifyByHCPattern()` BEFORE `resolveClassification()`:

```
For each content unit:
  1. Run HC (existing)
  2. Call classifyByHCPattern(profile, hcResult)
  3. If result → use it (Level 1)
  4. If null → call resolveClassification() (Level 2)
```

The Level 1 result should set the agent score confidence and winner on the existing data structures so the downstream code (proposal UI, execute route) works unchanged.

### 2C: Add Diagnostic Logging

```
[SCI-HC-PATTERN] sheet=X level=1 pattern=REFERENCE evidence="HAS reference_key, NOT HAS identifier, NOT HAS name" idRepeatRatio=3.00
```
or
```
[SCI-HC-PATTERN] sheet=X level=2 reason="no pattern match" fallback=CRR
```

### 2D: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-105 Phase 2: HC pattern classifier + two-level wiring" && git push origin dev`

---

## PHASE 3: LOCALHOST VERIFICATION WITH EVIDENCE

Start dev server. Import Meridian XLSX on localhost.

### V1: All Three Sheets Correct — Level 1
**Required evidence:** Paste ALL `[SCI-HC-PATTERN]` log lines:
- Plantilla: level=1, pattern=ENTITY
- Datos_Rendimiento: level=1, pattern=TRANSACTION
- Datos_Flota_Hub: level=1, pattern=REFERENCE

### V2: HC Role Patterns
**Required evidence:** Paste the HC roles for each sheet and map them to the pattern:
- Plantilla: HAS identifier ✓, HAS name ✓, idRepeatRatio=1.34 ≤ 1.5 → ENTITY
- Datos_Rendimiento: HAS identifier ✓, HAS measure ✓, HAS temporal ✓, idRepeatRatio=4.02 > 1.5 → TRANSACTION
- Datos_Flota_Hub: HAS reference_key ✓, NOT HAS identifier ✓, NOT HAS name ✓ → REFERENCE

### V3: Level 2 Not Called When Level 1 Matches
**Required evidence:** Paste terminal output showing that `resolveClassification()` (Level 2) was NOT called for sheets where Level 1 matched. Or if it was called, that its result was not used.

### V4: Build Clean
```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
```
**Required evidence:** Paste output including exit code.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-105 Phase 3: Localhost verification with evidence" && git push origin dev`

---

## PHASE 4: AUTOMATED CLT WITH EVIDENTIARY GATES

```bash
echo "============================================"
echo "HF-105 CLT: TWO-LEVEL CLASSIFICATION"
echo "============================================"

echo ""
echo "=== EG-1: HC pattern classifier exists ==="
echo "Evidence:"
ls -la web/src/lib/sci/hc-pattern-classifier.ts
grep -n "classifyByHCPattern\|ENTITY\|TRANSACTION\|REFERENCE\|TARGET" web/src/lib/sci/hc-pattern-classifier.ts | head -20

echo ""
echo "=== EG-2: Two-level wiring in analyze route ==="
echo "Evidence:"
grep -n "classifyByHCPattern\|HC-PATTERN\|level.*1\|level.*2\|resolveClassification" web/src/app/api/import/sci/analyze/route.ts | head -15

echo ""
echo "=== EG-3: Pattern rules use presence/absence, not weights ==="
echo "Evidence:"
grep -n "weight\|score\|confidence.*+=\|confidence.*-=" web/src/lib/sci/hc-pattern-classifier.ts
echo "--- Expected: zero results (no weight manipulation in pattern classifier) ---"

echo ""
echo "=== EG-4: Level 2 preserved unchanged ==="
echo "Evidence:"
git diff HEAD~1 web/src/lib/sci/resolver.ts | head -5
echo "--- Expected: no changes to resolver.ts ---"

echo ""
echo "=== EG-5: Build clean ==="
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
echo "Exit code: $?"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-105 Phase 4: CLT evidentiary gates" && git push origin dev`

---

## PHASE 5: COMPLETION REPORT + PR

### Completion Report (MANDATORY)

Create `HF-105_COMPLETION_REPORT.md` at project root. Required evidentiary gates:

1. **EG-1:** Pattern classifier code — paste the pattern rules
2. **EG-2:** Two-level wiring — paste the analyze route integration
3. **EG-3:** All SCI-HC-PATTERN log lines from localhost — all three Level 1 matches
4. **EG-4:** HC role → pattern mapping for each sheet
5. **EG-5:** resolver.ts unchanged (Level 2 preserved)
6. **EG-6:** Build output

### PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-105: Two-level classification — HC pattern primary, CRR Bayesian fallback" \
  --body "## Design Change
Replaces weight-based scoring as primary classifier with HC role pattern matching.
When HC is confident (≥0.80) and column coverage is sufficient (≥80%),
the classification is determined by the presence/absence of role types
plus idRepeatRatio as the single structural disambiguator.

## Two-Level Model
Level 1: HC role pattern + idRepeatRatio → direct classification
Level 2: CRR Bayesian resolver → fallback (unchanged)

## Pattern Rules
- ENTITY: HAS identifier + HAS name + idRepeatRatio ≤ 1.5
- TRANSACTION: HAS identifier + HAS measure + HAS temporal + idRepeatRatio > 1.5
- REFERENCE: HAS reference_key + NOT HAS identifier + NOT HAS name
- TARGET: HAS identifier + HAS measure + NOT HAS temporal + idRepeatRatio ≤ 1.5

## Evidence
All three Meridian sheets classify correctly via Level 1 on localhost.
No weights, no scores — presence/absence logic only.
Level 2 (CRR) preserved unchanged as fallback.

## Production Verification Required (Andrew)
See PV-1 through PV-4 in prompt."
```

---

## WHAT NOT TO DO

1. **DO NOT add weights or scores to the pattern classifier.** Presence/absence + idRepeatRatio. That's it.
2. **DO NOT modify resolver.ts.** Level 2 is preserved exactly as-is.
3. **DO NOT modify agents.ts.** Agent scoring is part of Level 2. Level 1 bypasses it.
4. **DO NOT hardcode Meridian-specific patterns.** The patterns must be structurally general.
5. **DO NOT use field-name matching.** Korean Test (AP-25). Patterns use HC semantic roles.
6. **DO NOT skip the completion report.**
7. **DO NOT add more than idRepeatRatio as a structural disambiguator.** One number. Simplicity.

---

## ANDREW: PRODUCTION VERIFICATION (POST-MERGE)

### PV-1: Clean Meridian Data
Three DELETE statements. Verify all at 0.

### PV-2: Re-import Meridian XLSX

### PV-3: Classification Correct
Expand `POST /api/import/sci/analyze` in Vercel Runtime Logs.
**Evidence required:** `[SCI-HC-PATTERN]` lines showing:
- Plantilla: level=1, pattern=ENTITY
- Datos_Rendimiento: level=1, pattern=TRANSACTION
- Datos_Flota_Hub: level=1, pattern=REFERENCE

### PV-4: Zero /api/periods
**Evidence required:** Vercel logs showing zero GET /api/periods during import flow.

**Only after ALL four PV checks pass with evidence can classification be considered production-verified.**
