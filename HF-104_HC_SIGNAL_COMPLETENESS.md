# HF-104: HC SIGNAL EXTRACTION COMPLETENESS — ALL COLUMN ROLES MUST PRODUCE SIGNALS

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` at the project root — authoritative schema source
3. `Vialuce_Contextual_Reliability_Resolution_Specification.md` — CRR controlling specification
4. `web/src/lib/sci/resolver.ts` — signal extraction (extractClassificationSignals)
5. `web/src/lib/sci/agents.ts` — applyHeaderComprehensionSignals
6. `web/src/lib/sci/types.ts` or `web/src/lib/sci/sci-types.ts` — ColumnRole definition

**If you have not read ALL SIX files, STOP and read them now.**

---

## WHY THIS HF EXISTS

HC correctly identifies all column roles at 1.00 confidence. But the signal extraction pipeline ignores some roles and double-counts others, producing an incomplete evidence set for the CRR resolver.

### Current State (Diagnosed)

| ColumnRole | Signal Status | Problem |
|---|---|---|
| `identifier` | **IGNORED** | HC returns identifier@1.00 for No_Empleado. Zero signal produced. This is the strongest entity/transaction indicator and it's discarded. |
| `name` | Produces signal | entity +0.10. OK. |
| `temporal` | Produces signal | transaction +0.10, entity -0.10, target -0.10. OK. |
| `measure` | Produces signal | transaction +0.08 if ratio > 40%. OK. |
| `attribute` | Produces signal | entity +0.08 if ratio > 30%. OK. |
| `reference_key` | **DOUBLE-COUNTED** | Path 1: agent scoring +0.15 → hc_contextual strength 0.15. Path 2: direct extraction → hc_contextual strength 1.00. Same evidence, two signals. Inflates reference on ALL sheets. |
| `unknown` | Ignored | Acceptable — unknown means HC couldn't determine the role. |

### Why This Causes the Datos_Flota_Hub Misclassification

Datos_Flota_Hub has: `Hub:reference_key, Mes:temporal, Año:temporal, Capacidad_Total:measure, Cargas_Totales:measure, Tasa_Utilizacion:measure`

Datos_Rendimiento has: `No_Empleado:identifier, Nombre:name, Hub:reference_key, Mes:temporal, Año:temporal` + 14 measure columns

Both sheets have `reference_key`. Both sheets have `temporal` and `measure`. The signal extraction treats them the same for reference_key.

The **discriminating evidence** is that Datos_Rendimiento has `identifier` and `name` (person-level data) while Datos_Flota_Hub has NEITHER. A sheet where the only structural identity is a reference_key (no person identifier, no name) is reference data. A sheet with both reference_key AND identifier AND name is transaction data with a foreign key lookup.

This discriminating evidence is invisible to the resolver because `identifier` produces zero signal.

### Production Evidence (March 8, 2026 00:03 UTC)

```
[SCI-CRR-DIAG] sheet=Datos_Flota_Hub posteriors=[transaction=49%, reference=39%]
[SCI-HC-DIAG] sheet=Datos_Flota_Hub roles=[Region:attribute, Hub:reference_key, Mes:temporal, Año:temporal, Capacidad_Total:measure, Cargas_Totales:measure, Tasa_Utilizacion:measure]
```

HC has the right information. The resolver doesn't see all of it.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **COMPLETION REPORT IS MANDATORY (Rules 25-28).**
6. **EVIDENTIARY GATES — NOT PASS/FAIL.**

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "HF-104 PHASE 0: HC SIGNAL EXTRACTION AUDIT"
echo "============================================"

echo ""
echo "=== 0A: All ColumnRole values defined ==="
grep -n "ColumnRole\|columnRole\|column_role" web/src/lib/sci/sci-types.ts web/src/lib/sci/types.ts 2>/dev/null | head -20

echo ""
echo "=== 0B: applyHeaderComprehensionSignals — full function ==="
grep -n "function applyHeaderComprehensionSignals" web/src/lib/sci/agents.ts
echo "--- Paste full function ---"

echo ""
echo "=== 0C: extractClassificationSignals — HC section ==="
echo "--- Location 1: indirect via agent scores ---"
grep -n "hcSignals\|hc_\|startsWith.*hc" web/src/lib/sci/resolver.ts | head -10
echo "--- Location 2: direct from profile ---"
grep -A 15 "HC reference_key\|direct.*signal\|reference_key.*confidence" web/src/lib/sci/resolver.ts | head -20

echo ""
echo "=== 0D: Which roles are handled in agent scoring? ==="
grep -n "temporal\|measure\|name\|attribute\|reference_key\|identifier\|unknown" web/src/lib/sci/agents.ts | grep -i "hc\|header\|columnRole\|role" | head -20

echo ""
echo "=== 0E: Signature HC boosts ==="
grep -n "temporal\|measure\|name\|attribute\|reference_key\|identifier" web/src/lib/sci/signatures.ts 2>/dev/null | head -15
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-104 Phase 0: HC signal extraction audit" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION GATE

```
ARCHITECTURE DECISION RECORD
============================
Problem: 2 of 7 HC column roles are ignored. 1 is double-counted.
         The resolver receives incomplete evidence from HC.

Principle: Carry Everything, Express Contextually.
           HC produces 7 role types. The resolver should receive signals
           from ALL meaningful roles. The Bayesian posterior determines
           which signals matter for which classification — not the signal
           extraction filtering them out.

Fix requirements:
  1. identifier role MUST produce a classification signal
     - identifier is evidence for entity AND transaction (both have identifiers)
     - ABSENCE of identifier on a sheet with reference_key is evidence for reference
  
  2. reference_key double-counting MUST be eliminated
     - ONE signal path, not two
     - Remove either the agent scoring path OR the direct extraction path
     - The direct extraction in resolver.ts:282-294 was an HF-101 remnant
  
  3. The signal extraction must be COMPLETE
     - Every non-unknown ColumnRole produces exactly one signal
     - No role ignored, no role double-counted
  
  4. No hardcoded classification rules
     - Don't add "if reference_key AND NOT identifier THEN reference"
     - Instead: identifier presence/absence produces signals
     - The Bayesian resolver determines the classification from the signal combination
     - This preserves CRR's design — the resolver reasons, the extraction observes

Scale test: YES — works for any column role combination
Korean Test: YES — zero field-name matching, uses HC semantic roles
Domain-agnostic: YES — identifier/name/measure/temporal are structural concepts
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-104 Phase 1: Architecture decision — complete HC signal extraction" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

### 2A: Add identifier Signal

In `applyHeaderComprehensionSignals()` (agents.ts), add handling for `identifier` role:
- identifier columns are evidence for entity (roster/person data has identifiers)
- identifier columns are evidence for transaction (transaction data has entity identifiers)
- The weight should be comparable to existing HC signals (name is +0.10, reference_key is +0.15)

### 2B: Remove reference_key Double-Counting

Remove the direct extraction block in `resolver.ts:282-294` (the HF-101 remnant). reference_key signals should flow through ONE path — the agent scoring path via `applyHeaderComprehensionSignals()`, then extracted as hc_contextual signals like every other role.

### 2C: Verify All Roles Produce Signals

After implementation, verify that `applyHeaderComprehensionSignals()` handles:
- identifier → signal produced
- name → signal produced (existing)
- temporal → signal produced (existing)
- measure → signal produced (existing)
- attribute → signal produced (existing)
- reference_key → signal produced (existing, now single path)
- unknown → no signal (acceptable)

### 2D: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-104 Phase 2: Complete HC signal extraction" && git push origin dev`

---

## PHASE 3: LOCALHOST VERIFICATION WITH EVIDENCE

Start dev server. Import Meridian XLSX on localhost.

### V1: All Three Sheets Correct
**Required evidence:** Paste ALL `[SCI-CRR-DIAG]` lines:
- Plantilla: entity wins
- Datos_Rendimiento: transaction wins
- Datos_Flota_Hub: reference wins

### V2: identifier Signal Present
**Required evidence:** Paste the `[SCI-HC-DIAG]` for all three sheets showing column roles. Then paste terminal output or log showing that identifier columns produced classification signals. Datos_Rendimiento should show identifier signal for entity/transaction. Datos_Flota_Hub should show NO identifier signal (because it has no identifier column).

### V3: No reference_key Double-Counting
```bash
grep -n "HC reference_key.*direct\|direct.*extraction\|refKeys.*filter.*reference_key" web/src/lib/sci/resolver.ts
```
**Required evidence:** Paste output — must be zero results (direct extraction removed).

### V4: Signal Extraction Completeness
```bash
grep -n "identifier\|name\|temporal\|measure\|attribute\|reference_key" web/src/lib/sci/agents.ts | grep -i "hc\|header"
```
**Required evidence:** Paste output showing all 6 meaningful roles handled.

### V5: Traced Math for Datos_Flota_Hub
**Required evidence:** Show the CRR posterior computation for Datos_Flota_Hub:
- What hc_contextual signals are present (reference_key → reference, temporal → transaction, measure → transaction)
- What hc_contextual signals are ABSENT (no identifier → no entity/transaction boost)
- How the posterior for reference exceeds the posterior for transaction

### V6: Build Clean
```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
```
**Required evidence:** Paste output including exit code.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-104 Phase 3: Localhost verification with evidence" && git push origin dev`

---

## PHASE 4: AUTOMATED CLT WITH EVIDENTIARY GATES

```bash
echo "============================================"
echo "HF-104 CLT: HC SIGNAL COMPLETENESS"
echo "============================================"

echo ""
echo "=== EG-1: identifier role handled ==="
echo "Evidence:"
grep -n "identifier" web/src/lib/sci/agents.ts | grep -i "hc\|header\|columnRole"
echo "--- Must show identifier handling in applyHeaderComprehensionSignals ---"

echo ""
echo "=== EG-2: Zero reference_key double-counting ==="
echo "Evidence:"
grep -n "reference_key.*confidence\|refKeys.*filter\|direct.*extraction" web/src/lib/sci/resolver.ts
echo "--- Expected: no direct extraction block ---"

echo ""
echo "=== EG-3: All 6 meaningful roles produce signals ==="
echo "Evidence:"
grep -c "identifier\|name\|temporal\|measure\|attribute\|reference_key" web/src/lib/sci/agents.ts | head -1
echo "--- Count of role references in agent scoring ---"

echo ""
echo "=== EG-4: Build clean ==="
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
echo "Exit code: $?"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-104 Phase 4: CLT evidentiary gates" && git push origin dev`

---

## PHASE 5: COMPLETION REPORT + PR

### Completion Report (MANDATORY)

Create `HF-104_COMPLETION_REPORT.md` at project root. Every gate must include pasted evidence.

Required evidentiary gates:
1. **EG-1:** identifier signal code — paste the handler
2. **EG-2:** Zero double-counting — paste grep showing no direct extraction
3. **EG-3:** All CRR-DIAG lines from localhost — entity, transaction, reference as winners
4. **EG-4:** Traced math for Datos_Flota_Hub showing reference wins
5. **EG-5:** Build output

### PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-104: HC signal extraction completeness — identifier role + remove double-counting" \
  --body "## Problem
2 of 7 HC column roles ignored (identifier, unknown). reference_key double-counted.
Datos_Flota_Hub has no identifier/name columns but signal extraction can't see this
because identifier role produces zero signal.

## Fix
- identifier role now produces entity/transaction signals
- reference_key direct extraction removed (single path through agent scoring)
- All 6 meaningful HC roles produce exactly one signal each

## Evidence
Datos_Flota_Hub classifies as reference on localhost.
Traced math shows identifier absence allows reference posterior to exceed transaction.
Zero double-counting. Build clean.

## Production Verification Required (Andrew)
See PV-1 through PV-4 in prompt."
```

---

## WHAT NOT TO DO

1. **DO NOT add hardcoded combination rules** like "if reference_key AND NOT identifier THEN reference." Let the Bayesian resolver reason from the signals.
2. **DO NOT change the Bayesian computation.** HF-102 fixed the math. This HF fixes the inputs.
3. **DO NOT use field-name matching.** Korean Test (AP-25). identifier is a semantic role from HC, not a field name pattern.
4. **DO NOT skip V5 (traced math).** The evidence must show WHY reference wins for Datos_Flota_Hub, not just THAT it wins.
5. **DO NOT skip the completion report.**

---

## ANDREW: PRODUCTION VERIFICATION (POST-MERGE)

### PV-1: Clean Meridian Data
Three DELETE statements. Verify all at 0.

### PV-2: Re-import Meridian XLSX

### PV-3: Classification Correct
Expand `POST /api/import/sci/analyze` in Vercel Runtime Logs.
**Evidence required:** `[SCI-CRR-DIAG]` lines:
- Plantilla: entity wins
- Datos_Rendimiento: transaction wins
- Datos_Flota_Hub: reference wins

### PV-4: Zero /api/periods
**Evidence required:** Vercel logs showing zero GET /api/periods during import flow.

**Only after ALL four PV checks pass with evidence can classification be considered production-verified.**
