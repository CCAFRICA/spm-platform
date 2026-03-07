# OB-161: CONTEXTUAL RELIABILITY RESOLUTION — CLASSIFICATION INTELLIGENCE

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` at the project root — authoritative schema source
3. `Vialuce_Contextual_Reliability_Resolution_Specification.md` — **THE CONTROLLING SPECIFICATION. Every implementation decision must trace to this document.**
4. `web/src/lib/sci/agents.ts` — agent scoring (signal production — preserved)
5. `web/src/lib/sci/negotiation.ts` — current classification function (REPLACED)
6. `web/src/lib/sci/header-comprehension.ts` — HC (signal production — preserved)
7. `web/src/lib/sci/synaptic-ingestion-state.ts` — Synaptic Surface (extended)
8. `web/src/lib/sci/content-profile.ts` — content profiling (preserved)
9. `web/src/app/api/import/sci/analyze/route.ts` — analyze route
10. `web/src/lib/ai/ai-service.ts` — AIService (for reference — CRR is not an AI call)

**If you have not read ALL TEN files, STOP and read them now.**

---

## WHY THIS OB EXISTS

The competitive agent scoring model uses developer-assigned weights to resolve classification ambiguity. These weights have no empirical basis (Decision 109 withdrawn). HF-101 added a reference floor and transaction penalty — still arbitrary values. Decision 110 replaces competitive scoring with Contextual Reliability Resolution (CRR): Bayesian inference where signal source authority is derived from empirical evidence, not developer intuition.

### Production Evidence of Current Failure

```
[SCI-HC-DIAG] sheet=Datos_Flota_Hub roles=[Hub:reference_key@1.00, Capacidad_Total:measure@1.00]
[SCI-SCORES-DIAG] sheet=Datos_Flota_Hub winner=transaction@98% scores=[transaction=98%, reference=50%]
```

HC correctly identifies Hub as a reference key at 1.00 confidence. The scoring pipeline produces transaction@98%. The LLM knows the answer. The system ignores it because the weights favor structural signals.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **COMPLETION REPORT IS MANDATORY (Rules 25-28).**
6. **EVIDENTIARY GATES — NOT PASS/FAIL.** Every gate must include pasted code, pasted terminal output, or pasted grep results.
7. **The controlling specification is Vialuce_Contextual_Reliability_Resolution_Specification.md.** If an implementation choice deviates from the specification, STOP and document the deviation before proceeding.

---

## SQL VERIFICATION GATE (MANDATORY — FP-49)

Before writing ANY SQL or code referencing database column names:
```bash
cat SCHEMA_REFERENCE_LIVE.md
```
Verify every column name. No exceptions.

---

## PHASE 0: DIAGNOSTIC — CURRENT CLASSIFICATION PIPELINE

```bash
echo "============================================"
echo "OB-161 PHASE 0: CLASSIFICATION PIPELINE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: Current classifyContentUnits function ==="
grep -n "classifyContentUnits\|classify.*content\|function.*classify" web/src/lib/sci/ -r --include="*.ts" | head -10
echo "--- Full function ---"

echo ""
echo "=== 0B: How agents produce scores ==="
grep -n "confidence\|score\|weight\|signal" web/src/lib/sci/agents.ts | head -40

echo ""
echo "=== 0C: Current negotiation/resolution ==="
cat web/src/lib/sci/negotiation.ts

echo ""
echo "=== 0D: Synaptic Ingestion State structure ==="
grep -n "interface\|type.*State\|claims\|signals\|resolution" web/src/lib/sci/synaptic-ingestion-state.ts | head -30

echo ""
echo "=== 0E: Classification signals table schema ==="
grep "classification_signals" SCHEMA_REFERENCE_LIVE.md -A 20

echo ""
echo "=== 0F: What HF-101 added (to be replaced) ==="
grep -n "hc_override\|override_reference\|reference_floor\|penaliz\|0.80\|0.30" web/src/lib/sci/agents.ts web/src/lib/sci/negotiation.ts web/src/lib/sci/synaptic-ingestion-state.ts | head -20

echo ""
echo "=== 0G: Existing composite signatures ==="
grep -n "signature\|Signature\|composite\|floor" web/src/lib/sci/ -r --include="*.ts" | head -20

echo ""
echo "=== 0H: How analyze route calls classification ==="
grep -n "classify\|resolution\|resolve\|winner" web/src/app/api/import/sci/analyze/route.ts | head -15
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-161 Phase 0: Classification pipeline diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION GATE

```
ARCHITECTURE DECISION RECORD
============================
Problem: Classification uses developer-assigned competitive weights.
         Decision 110 specifies Contextual Reliability Resolution (CRR).

Implementation approach:
  1. Preserve agents as signal producers (no changes to agents.ts signal production)
  2. Preserve HC as signal producer (no changes to header-comprehension.ts)
  3. Remove HF-101 hardcoded overrides (floor, penalty, R2 suppression)
  4. Create resolveClassification() — Bayesian CRRes per specification Section 4.4
  5. Create contextualReliabilityLookup() — CRL per specification Section 4.2
  6. Create seed prior configuration per specification Section 4.3
  7. Wire CRL to flywheel data (classification_signals table) with hierarchical fallback
  8. Replace classifyContentUnits() call in analyze route with resolveClassification()

Scale test: YES — hierarchical CRL prevents dilution at scale
AI-first: YES — HC authority is CRL-derived, not hardcoded
Korean Test: YES — zero field-name matching in resolver
Atomicity: YES — old function replaced, not wrapped

CHOSEN: Full CRR implementation per specification
REJECTED: Weight tuning — empirically unfounded (Decision 109)
REJECTED: Hardcoded overrides — fragile, not scalable (HF-101 pattern)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-161 Phase 1: Architecture decision — CRR per Decision 110" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

### 2A: Create Seed Prior Configuration

New file: `web/src/lib/sci/seed-priors.ts`

Define the seed prior table per specification Section 4.3. These are the cold-start reliability values. Make them configurable (not hardcoded constants) so the flywheel can override them.

### 2B: Create Contextual Reliability Lookup (CRL)

New file: `web/src/lib/sci/contextual-reliability.ts`

Implement the hierarchical CRL function per specification Section 4.2. Five levels: specific fingerprint → fingerprint category → boundary-level → global → seed prior. Query classification_signals for empirical data. Fall back through levels when insufficient data.

### 2C: Create Contextual Reliability Resolver (CRRes)

New file: `web/src/lib/sci/resolver.ts`

Implement the Bayesian resolution function per specification Section 4.4. Read all signals from the Synaptic Surface. Look up reliability for each signal's source type via CRL. Compute posterior probability for each classification. Highest posterior wins.

### 2D: Remove HF-101 Hardcoded Overrides

In `agents.ts`: remove the hc_override_reference_floor and hc_override_reference_contradict_tx logic added by HF-101.

In `synaptic-ingestion-state.ts`: remove the hasHCReferenceOverride R2 temporal suppression added by HF-101.

These are replaced by CRR — HC authority now comes from CRL seed priors, not hardcoded floors and penalties.

### 2E: Wire Resolver into Analyze Route

In `analyze/route.ts`: replace the `classifyContentUnits()` call with `resolveClassification()`. The new resolver reads from the same Synaptic Surface that agents and HC already write to.

### 2F: Enhance Signal Capture

Ensure classification_signals captures the classification boundary (which two or more classifications were competing) alongside the existing decision_source. This data feeds future CRL queries.

### After ALL implementation:

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-161 Phase 2: CRR implementation — resolver, CRL, seed priors" && git push origin dev`

---

## PHASE 3: LOCALHOST VERIFICATION WITH EVIDENCE

Start dev server. Import Meridian XLSX.

### V1: Classification Correct
**Required evidence:** Paste ALL three `[SCI-SCORES-DIAG]` lines (or equivalent CRR output):
- Plantilla: entity (highest posterior)
- Datos_Rendimiento: transaction (highest posterior)
- Datos_Flota_Hub: reference (highest posterior)

### V2: HC Contributing Through CRL
**Required evidence:** Paste CRR diagnostic output showing:
- HC signals received with source_type = hc_contextual
- CRL returned seed prior (0.85) for hc_contextual (no flywheel data yet)
- Posterior calculation shows HC influence via CRL, not hardcoded weight

### V3: No Hardcoded Overrides Remain
```bash
grep -rn "hc_override\|override_reference\|reference_floor\|reference_contradict\|hasHCReferenceOverride" web/src/lib/sci/ --include="*.ts"
```
**Required evidence:** Paste output — must be zero results.

### V4: Seed Priors Operational
**Required evidence:** Paste the seed prior configuration showing the source type hierarchy.

### V5: Build Clean
```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
```
**Required evidence:** Paste output including exit code.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-161 Phase 3: Localhost verification with evidence" && git push origin dev`

---

## PHASE 4: AUTOMATED CLT WITH EVIDENTIARY GATES

```bash
echo "============================================"
echo "OB-161 CLT: CRR EVIDENTIARY VERIFICATION"
echo "============================================"

echo ""
echo "=== EG-1: CRR resolver exists and is wired ==="
echo "Evidence:"
grep -n "resolveClassification\|contextualReliabilityLookup\|CRRes\|CRL" web/src/lib/sci/ -r --include="*.ts" | head -20
grep -n "resolveClassification\|contextualReliability" web/src/app/api/import/sci/analyze/route.ts

echo ""
echo "=== EG-2: Zero hardcoded overrides ==="
echo "Evidence:"
grep -rn "hc_override\|override_reference\|reference_floor\|reference_contradict\|hasHCReferenceOverride\|penaliz.*transaction" web/src/lib/sci/ --include="*.ts"
echo "--- Expected: no output ---"

echo ""
echo "=== EG-3: Seed priors defined ==="
echo "Evidence:"
cat web/src/lib/sci/seed-priors.ts 2>/dev/null || echo "File not found"

echo ""
echo "=== EG-4: CRL hierarchical levels implemented ==="
echo "Evidence:"
grep -n "fingerprint\|boundary\|global\|seed.*prior\|fallback\|level" web/src/lib/sci/contextual-reliability.ts 2>/dev/null | head -20

echo ""
echo "=== EG-5: Bayesian posterior computation ==="
echo "Evidence:"
grep -n "posterior\|prior\|likelihood\|bayesian\|reliability.*exponent\|P(C)" web/src/lib/sci/resolver.ts 2>/dev/null | head -20

echo ""
echo "=== EG-6: Build clean ==="
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
echo "Exit code: $?"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-161 Phase 4: CLT with evidentiary gates" && git push origin dev`

---

## PHASE 5: COMPLETION REPORT + PR

### Completion Report (MANDATORY)

Create `OB-161_COMPLETION_REPORT.md` at project root. Every gate must include pasted evidence per the evidentiary gate standard (memory slot 25).

### PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-161: Contextual Reliability Resolution — Decision 110" \
  --body "## Decision 110: Contextual Reliability Resolution

Replaces competitive agent scoring with Bayesian inference using empirically-derived
signal source authority.

### Key Changes
- NEW: Contextual Reliability Lookup (CRL) — hierarchical reliability per context
- NEW: Contextual Reliability Resolver (CRRes) — Bayesian posterior classification
- NEW: Seed prior configuration — cold start authority hierarchy
- REMOVED: HF-101 hardcoded overrides (floor, penalty, R2 suppression)
- REPLACED: classifyContentUnits() → resolveClassification()

### IP Innovations (TMR-C46 through TMR-C49)
- Contextual Reliability Lookup — source reliability as function of context
- Bayesian Resolver with CRL authority exponents
- Immune System Affinity Maturation for Data Classification
- Hierarchical Bayesian Cold Start with Structural Ordering

### Verification
All three Meridian sheets classify correctly on localhost.
Zero hardcoded overrides remain. Build clean.

### Production Verification Required (Andrew)
See PV-1 through PV-7 in prompt."
```

---

## WHAT NOT TO DO

1. **DO NOT use hardcoded weights, floors, or penalties.** The entire point of CRR is to replace these.
2. **DO NOT modify agent scoring logic.** Agents are signal producers. Their output is unchanged.
3. **DO NOT modify HC.** HC is a signal producer. Its output is unchanged.
4. **DO NOT use field-name matching anywhere.** Korean Test (AP-25).
5. **DO NOT skip the evidentiary gates.** Every gate requires pasted evidence.
6. **DO NOT deviate from the specification without documenting the deviation.** Standing Rule 7.
7. **DO NOT optimize for Meridian.** The resolver must work for any structural fingerprint. Scale by Design.
8. **DO NOT write SQL without checking SCHEMA_REFERENCE_LIVE.md.** FP-49.

---

## ANDREW: PRODUCTION VERIFICATION (POST-MERGE)

### PV-1: Clean Meridian Data
Three DELETE statements. Verify all at 0.

### PV-2: Re-import Meridian XLSX

### PV-3: HC Running
Expand analyze entry in Vercel Runtime Logs.
**Evidence required:** `[SCI-HC-DIAG]` showing llmCalled=true, avgConf > 0

### PV-4: Classification Correct
**Evidence required:** All three `[SCI-SCORES-DIAG]` (or CRR equivalent) lines:
- Plantilla = entity
- Datos_Rendimiento = transaction
- Datos_Flota_Hub = reference

### PV-5: Zero /api/periods on Import
**Evidence required:** Vercel logs showing zero GET /api/periods during import flow

### PV-6: Browser Results
**Evidence required:** Screenshot showing correct labels, entities matched > 0

### PV-7: Database Verification
```sql
SELECT 'entities' AS tbl, COUNT(*) AS cnt
FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'committed_data', COUNT(*) FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'reference_data', COUNT(*) FROM reference_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```
**Evidence required:** entities > 0, committed_data > 0, reference_data > 0

**Only after ALL seven PV checks pass with evidence can Decision 110 be marked as production-verified.**
