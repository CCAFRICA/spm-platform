# HF-102: CRR BAYESIAN LIKELIHOOD FIX — SUPPORTING EVIDENCE MUST INCREASE POSTERIOR

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` at the project root — authoritative schema source
3. `Vialuce_Contextual_Reliability_Resolution_Specification.md` — the controlling specification for CRR
4. `web/src/lib/sci/resolver.ts` — the file being fixed
5. `web/src/lib/sci/seed-priors.ts` — seed prior configuration
6. `web/src/lib/sci/contextual-reliability.ts` — CRL implementation

**If you have not read ALL SIX files, STOP and read them now.**

---

## WHY THIS HF EXISTS

OB-161 implemented CRR (Decision 110) but the Bayesian likelihood computation in `computePosteriors()` is mathematically invalid. Supporting evidence DECREASES the posterior instead of increasing it. This causes all three Meridian sheets to misclassify — target wins everything despite having the weakest structural evidence.

### Production Evidence (March 7, 2026 20:09 UTC)

```
[SCI-CRR-DIAG] sheet=Plantilla posteriors=[target=47%, entity=26%] (should be entity)
[SCI-CRR-DIAG] sheet=Datos_Rendimiento posteriors=[target=50%, transaction=2%] (should be transaction)
[SCI-CRR-DIAG] sheet=Datos_Flota_Hub posteriors=[target=38%, reference=9%] (should be reference)
```

### Root Cause (Diagnosed — CC Traced Math)

Two fatal bugs in `resolver.ts` `computePosteriors()`:

**Bug 1: Supporting signals always decrease the posterior.**

```typescript
const likelihood = Math.max(0.01, reliability * signal.strength);
logPosterior += Math.log(likelihood);
```

`reliability × strength` is always ≤ 1.0, so `log(likelihood)` is always ≤ 0. Every supporting signal subtracts from the log posterior. More evidence = lower score.

**Bug 2: More supporting signals = worse outcome.**

Transaction has 3 supporting signals. Target has 1. Each multiplies by a value < 1.0, so transaction gets penalized 3× while target gets penalized 1×. The agent with the most evidence loses.

**Traced math for Datos_Rendimiento (from CC diagnosis):**

Transaction (3 supporting signals):
```
logP = log(0.20) + log(0.60×0.95) + log(0.85×0.18) + log(0.80×0.85) + log(contradiction)
     = -1.609    + -0.562          + -1.877          + -0.386          + -0.163
     = -4.597  →  raw = 0.0101
```

Target (1 supporting signal):
```
logP = log(0.20) + log(0.60×0.50) + log(contradiction) + log(contradiction)
     = -1.609    + -1.204          + -0.335             + -0.416
     = -3.564  →  raw = 0.0283
```

Target wins because it has FEWER supporting signals (penalized less).

### The Fix Required

The likelihood model `P(signal | C) = reliability × strength` is not a valid Bayesian likelihood. In Bayesian classification, the likelihood ratio `P(signal | C correct) / P(signal | C incorrect)` must be > 1.0 for supporting evidence. The current implementation uses the raw product as an absolute value with no ratio — there is no denominator. Supporting evidence must INCREASE the posterior, not decrease it.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **COMPLETION REPORT IS MANDATORY (Rules 25-28).**
6. **EVIDENTIARY GATES — NOT PASS/FAIL.** Every gate must include pasted code, pasted terminal output, or traced math as proof.

---

## PHASE 0: DIAGNOSTIC — CURRENT LIKELIHOOD COMPUTATION

The diagnosis is already complete (see Root Cause above). Confirm by pasting the current `computePosteriors()` function.

```bash
echo "============================================"
echo "HF-102 PHASE 0: CURRENT LIKELIHOOD CODE"
echo "============================================"

echo ""
echo "=== 0A: computePosteriors — full function ==="
grep -n "function computePosteriors" web/src/lib/sci/resolver.ts
echo "--- Paste full function body ---"

echo ""
echo "=== 0B: Supporting signal likelihood ==="
grep -n "supporting\|Supporting\|likelihood.*reliability\|reliability.*strength" web/src/lib/sci/resolver.ts | head -15

echo ""
echo "=== 0C: Contradicting signal likelihood ==="
grep -n "contradict\|Contradict\|inverse\|opposing" web/src/lib/sci/resolver.ts | head -15
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-102 Phase 0: Likelihood computation diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION GATE

```
ARCHITECTURE DECISION RECORD
============================
Problem: computePosteriors() uses P(signal|C) = reliability × strength.
         This is always ≤ 1.0, so log(likelihood) ≤ 0 always.
         Supporting evidence decreases the posterior.

Mathematical requirement:
  For supporting evidence: likelihood ratio > 1.0 (increases posterior)
  For contradicting evidence: likelihood ratio < 1.0 (decreases posterior)
  For neutral/absent evidence: likelihood ratio = 1.0 (no effect)

Fix must satisfy:
  1. Supporting signals INCREASE the posterior for the supported classification
  2. Contradicting signals DECREASE the posterior for the contradicted classification
  3. More supporting signals = higher posterior (monotonically increasing)
  4. Higher reliability signals have more influence than lower reliability signals
  5. Higher strength signals have more influence than lower strength signals
  6. With seed priors and no flywheel data, Meridian sheets classify correctly:
     Plantilla=entity, Datos_Rendimiento=transaction, Datos_Flota_Hub=reference
  7. The fix must be mathematically sound Bayesian inference, not ad-hoc weight tuning

Scale test: The likelihood model must work for any number of signals, any strength distribution
Korean Test: Zero field-name matching
Domain-agnostic: Zero domain vocabulary in the resolver

CHOSEN: [CC determines the correct Bayesian likelihood ratio formulation]
REJECTED: Raw product (reliability × strength) — always ≤ 1.0, inverts evidence
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-102 Phase 1: Architecture decision — Bayesian likelihood fix" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

Fix `computePosteriors()` in `resolver.ts`.

Requirements:
1. Supporting evidence increases the posterior
2. Contradicting evidence decreases the posterior
3. More evidence = more confidence (not less)
4. CRL reliability determines influence magnitude
5. Signal strength determines signal impact
6. The math must be a valid Bayesian likelihood ratio formulation

After implementation:

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-102 Phase 2: Bayesian likelihood fix implemented" && git push origin dev`

---

## PHASE 3: LOCALHOST VERIFICATION WITH EVIDENCE

Start dev server. Import Meridian XLSX on localhost.

### V1: Traced Math — Datos_Rendimiento
**Required evidence:** Trace the full posterior computation for Datos_Rendimiento with the FIXED likelihood model. Show:
- Each signal, its source type, its strength
- The likelihood value for classification=transaction
- The likelihood value for classification=target
- The final posterior for transaction vs target
- Transaction must win

Format:
```
Transaction posterior:
  prior = log(0.20) = -1.609
  signal 1 [source_type, strength]: likelihood = [formula] = [value], log = [value]
  signal 2 [source_type, strength]: likelihood = [formula] = [value], log = [value]
  ...
  total logP = [sum]
  raw = exp([sum]) = [value]

Target posterior:
  [same format]

Normalized: transaction = [%], target = [%]
Winner: transaction ✓
```

### V2: All Three Sheets Correct
**Required evidence:** Paste ALL `[SCI-CRR-DIAG]` lines from terminal:
```
[SCI-CRR-DIAG] sheet=Plantilla posteriors=[entity=XX%, ...]
[SCI-CRR-DIAG] sheet=Datos_Rendimiento posteriors=[transaction=XX%, ...]
[SCI-CRR-DIAG] sheet=Datos_Flota_Hub posteriors=[reference=XX%, ...]
```
Entity, transaction, and reference must be the winners respectively.

### V3: Corrected computePosteriors Function
**Required evidence:** Paste the FULL corrected `computePosteriors()` function with line numbers.

### V4: Mathematical Validation
**Required evidence:** Demonstrate that:
- Adding a supporting signal increases the posterior (show with 1 signal vs 2 signals)
- Higher reliability increases influence (show same signal with 0.60 vs 0.85 reliability)
- Higher strength increases influence (show same signal with 0.50 vs 0.95 strength)

### V5: Build Clean
```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
```
**Required evidence:** Paste output including exit code.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-102 Phase 3: Localhost verification with traced math" && git push origin dev`

---

## PHASE 4: AUTOMATED CLT WITH EVIDENTIARY GATES

```bash
echo "============================================"
echo "HF-102 CLT: BAYESIAN LIKELIHOOD VERIFICATION"
echo "============================================"

echo ""
echo "=== EG-1: Corrected likelihood formula ==="
echo "Evidence:"
grep -A 5 "likelihood\|supporting.*signal\|logPosterior.*Math.log" web/src/lib/sci/resolver.ts | head -30
echo "--- Verify: supporting likelihood > 1.0 for strong signals ---"

echo ""
echo "=== EG-2: No raw reliability × strength as absolute likelihood ==="
echo "Evidence:"
grep -n "reliability \* signal.strength\|reliability \* strength" web/src/lib/sci/resolver.ts
echo "--- Expected: zero results or only inside a ratio formulation ---"

echo ""
echo "=== EG-3: CRR diagnostic output from localhost import ==="
echo "Evidence:"
echo "[Paste the [SCI-CRR-DIAG] lines from terminal]"

echo ""
echo "=== EG-4: Build clean ==="
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
echo "Exit code: $?"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-102 Phase 4: CLT with evidentiary gates" && git push origin dev`

---

## PHASE 5: COMPLETION REPORT + PR

### Completion Report (MANDATORY)

Create `HF-102_COMPLETION_REPORT.md` at project root. Must include:

1. **EG-1: Corrected computePosteriors function** — paste the full function
2. **EG-2: Traced math for Datos_Rendimiento** — show the full posterior calculation proving transaction wins
3. **EG-3: All three SCI-CRR-DIAG lines** — entity, transaction, reference as winners
4. **EG-4: Mathematical validation** — demonstrate monotonic increase with more evidence
5. **EG-5: Build output** — paste last 10 lines

### PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-102: Fix CRR Bayesian likelihood — supporting evidence must increase posterior" \
  --body "## Problem
computePosteriors() uses likelihood = reliability × strength, which is always ≤ 1.0.
In log space, every supporting signal DECREASES the posterior.
More evidence = lower score. Agent with most evidence loses.

## Root Cause
The likelihood model is not a valid Bayesian likelihood ratio.
P(signal | C correct) / P(signal | C incorrect) must be > 1.0 for supporting evidence.
The implementation used the raw product as an absolute value with no ratio.

## Fix
[CC fills — describe the corrected likelihood formulation]

## Evidence
Traced math for Datos_Rendimiento:
- Before: transaction=2%, target=50% (wrong)
- After: transaction=[X]%, target=[Y]% (correct)

All three sheets classify correctly on localhost:
- Plantilla = entity
- Datos_Rendimiento = transaction
- Datos_Flota_Hub = reference

## Production Verification Required (Andrew)
See PV-1 through PV-5 in prompt."
```

---

## WHAT NOT TO DO

1. **DO NOT use ad-hoc weight tuning.** The fix must be mathematically valid Bayesian inference.
2. **DO NOT revert to competitive scoring.** Fix the resolver, don't abandon the architecture.
3. **DO NOT hardcode floors, penalties, or bonuses.** The whole point of CRR is to eliminate these.
4. **DO NOT skip the traced math.** Evidentiary Gate V1 requires the full posterior calculation.
5. **DO NOT skip the completion report.** 
6. **DO NOT use field-name matching.** Korean Test (AP-25).
7. **DO NOT optimize for Meridian.** The fix must be mathematically general.

---

## ANDREW: PRODUCTION VERIFICATION (POST-MERGE)

### PV-1: Clean Meridian Data
Three DELETE statements. Verify all at 0.

### PV-2: Re-import Meridian XLSX

### PV-3: Classification Correct
Expand `POST /api/import/sci/analyze` in Vercel Runtime Logs.
**Evidence required:** `[SCI-CRR-DIAG]` lines showing:
- Plantilla: entity wins
- Datos_Rendimiento: transaction wins
- Datos_Flota_Hub: reference wins

**Compare against pre-fix:**
- Before HF-102: target@47%, target@50%, target@38% (all wrong)
- After HF-102: entity, transaction, reference (all correct)

### PV-4: HC Running
**Evidence required:** `[SCI-HC-DIAG]` showing llmCalled=true, avgConf > 0

### PV-5: Zero /api/periods on Import
**Evidence required:** Vercel logs showing zero GET /api/periods during import flow

**Only after ALL five PV checks pass with evidence can OB-161/HF-102 be considered production-verified.**
