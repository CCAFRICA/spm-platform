# DIAG-024 — Importer/Engine Alignment Diagnostic

**Classification:** DIAG (Diagnostic; zero code changes; evidence pack only)
**Sequence:** DIAG-024 (next per project memory; DIAG-018 was the last DIAG, DIAG-019 through DIAG-023 not yet authored)
**Authored:** 2026-04-27
**Predecessor:** CLT-197 BCL re-import + October calc on rebuilt substrate produced $19,280 vs ~$44,590 expected (~43% of target). Intent executor and legacy engine produced 100% concordance on the wrong answer. Two components (C1 Credit Placement, C2 Deposit Capture) returned $0 with `matchedTier: "none"`. Two components (C3 Cross Products, C4 Regulatory Compliance) returned correct values.
**Successor:** Architect-side disposition decision (importer-side fix, engine-side fix, or both) based on this evidence pack.

---

## ARCHITECT-CHANNEL META-CONTENT

### Why this diagnostic exists

The rebuilt substrate (anchor + PR #340 cherry-pick) imports the BCL plan and calculates incorrectly. Per-component evidence shows:

| Component | Type per rule_set | Calc result | Issue |
|---|---|---|---|
| C1 Credit Placement | `componentType: tier_lookup` (1D) but `calculationIntent.operation: bounded_lookup_2d` | $0 | tierConfig.tiers is empty; metadata.intent has the 2D grid; legacy 1D handler can't use 2D data |
| C2 Deposit Capture | `componentType: tier_lookup` (1D) and `calculationIntent.operation: bounded_lookup_1d` | $0 | tierConfig.tiers is empty; metadata.intent has the outputs array; legacy handler can't read it |
| C3 Cross Products | `componentType: scalar_multiply` | $250 ✓ | Works |
| C4 Regulatory Compliance | `componentType: conditional_gate` | $150 ✓ | Works |

Comparison to proven March substrate (rule_set `03bdd3e6`, $312,033 verified four times):

| Component | March proven shape | Current shape |
|---|---|---|
| C1 | `componentType: matrix_lookup` + populated `matrixConfig` | `componentType: tier_lookup` + empty `tierConfig` + populated `metadata.intent` |
| C2 | `componentType: tier_lookup` + populated `tierConfig.tiers` (5 tiers) | `componentType: tier_lookup` + empty `tierConfig.tiers` + populated `metadata.intent` |
| C3 | `componentType: scalar_multiply` + rate | Same |
| C4 | `componentType: tier_lookup` + populated `tierConfig.tiers` (2 tiers) | `componentType: conditional_gate` + intent.condition |

The rule_set storage shape changed between the proven March substrate and today. The legacy engine reads `tierConfig`/`matrixConfig`. The new shape stores data in `metadata.intent`. The intent executor (Decision 151 sole authority for new primitives) should read `metadata.intent`, but Adriana's intent_payout was also 0 for C1 and C2 — meaning the intent executor's bounded_lookup_2d / bounded_lookup_1d handling on the rebuilt substrate isn't reading from `metadata.intent` correctly either, OR the intent executor's scale handling for row/column inputs differs from route.ts's actual/target scale handling.

This diagnostic establishes the full picture in one CC pass so we stop chasing single greps and start deciding.

### Scope boundary

**IN SCOPE:**
- Read-only code inspection of `revert-pre-seeds-anchor` substrate
- Read-only DB query of current rule_set shape
- Mapping importer output shape → engine read shape, end-to-end
- Synthesis verdict identifying where the structural mismatch lives

**OUT OF SCOPE:**
- Any code changes
- Any database modifications
- Any rule_set re-import
- Any calculation re-run
- Any disposition or fix recommendation
- Any speculation beyond the evidence

### What CC produces

A single comprehensive findings document at `docs/diagnostics/DIAG-024_FINDINGS.md` containing five blocks of evidence:

1. **Block 1 — Reference rule_set shapes** (provided inline below; CC includes verbatim)
2. **Block 2 — Current rule_set shape on production** (DB query; CC executes)
3. **Block 3 — Importer code path trace** (CC reads `convertComponent`, `bridgeAIToEngineFormat`, plan interpretation handler)
4. **Block 4 — Engine read paths** (CC reads `evaluateTierLookup`, `evaluateMatrixLookup`, intent executor's bounded_lookup_2d / bounded_lookup_1d handlers)
5. **Block 5 — Structural verdict** (CC tabulates: which fields the importer writes; which fields each engine path reads; where the mismatch is)

CC produces evidence. CC does not propose dispositions. Architect interprets and decides next step.

### Capability-first routing per memory

CC handles:
- All code grep / view operations
- DB query for current rule_set shape
- Findings document authorship and commit
- All git operations

Architect handles:
- Reading findings; making disposition decision
- No browser actions required (this is a diagnostic, not a verification)

---

## CC PASTE BLOCK BELOW THIS LINE

---

# CC DIRECTIVE — DIAG-024

## CC Standing Architecture Rules

- **Rule 25:** Completion report authored before final commit/push.
- **Rule 26:** Completion report follows mandatory structure.
- **Rule 27:** Every block has pasted evidence — no self-attestation.
- **Rule 29:** This paste block is the final block of the architect's message.
- **Rule 34:** No bypass recommendations. No fix proposals. Evidence only.
- **Rule 36:** Scope held strictly to read-only inspection. No code changes. No disposition.
- **Rule 51v2:** N/A (no code changes; no build verification needed)
- **Korean Test:** Structural identifiers only.
- **SR-44:** No browser verification required.

## Architecture Decision Gate

```bash
cd ~/spm-platform || cd /Users/AndrewAfrica/spm-platform
git fetch origin --prune

# ADG-1: Confirm working from rebuilt substrate
git rev-parse origin/main
echo "Expected: post-merge SHA from PR #342 (cutover-revert-338-339 merged)"

# ADG-2: Confirm current branch
git branch --show-current
git checkout main
git pull origin main
git rev-parse HEAD

# ADG-3: Working tree clean (or stash standard noise)
git status --short
echo "If dirty with .DS_Store / settings.local.json only: git stash push -u -m 'DIAG-024 ADG-3 stash: standard noise'"
echo "If dirty with anything else: HALT and report"

# ADG-4: Confirm DIAG-024 directive prompt placed at docs/vp-prompts/
ls -la docs/vp-prompts/DIAG-024_IMPORTER_ENGINE_ALIGNMENT.md 2>&1 || echo "PROMPT_FILE_NOT_PRESENT — architect must provide before commit step"
```

**HALT conditions:**
- ADG-1 SHA does not match post-CLT-197 merge state
- ADG-3 working tree dirty with anything other than `.DS_Store` and `.claude/settings.local.json`
- ADG-4 prompt file not at expected path (architect addresses; CC continues with diagnostic regardless)

---

## BLOCK 1 — Reference rule_set shapes (provided inline; CC includes verbatim in FINDINGS)

### Proven March substrate — rule_set `03bdd3e6` (BCL, $312,033 verified)

Per conversation history (`b69db4ab-f449-404a-9fa3-9822452d6e96`, March 14 2026, the session that activated rule_set `03bdd3e6`):

```
C1 Credit Placement:
  componentType: "matrix_lookup"
  matrixConfig: populated 6×5 grid per variant (Senior + Executive)

C2 Deposit Capture:
  componentType: "tier_lookup"
  tierConfig.tiers: 5 tiers per variant
    Senior: $0 / $120 / $250 / $400 / $550
    Executive: $0 / $80 / $180 / $300 / $420

C3 Cross Products:
  componentType: "scalar_multiply"
  rate: 25 (Senior), 18 (Executive)

C4 Regulatory Compliance:
  componentType: "tier_lookup"
  tierConfig.tiers: 2 tiers per variant
    Senior: 0 infractions = $150, ≥1 = $0
    Executive: 0 infractions = $100, ≥1 = $0
```

The proven engine path was `evaluateMatrixLookup(component.matrixConfig, metrics)` for C1 and `evaluateTierLookup(component.tierConfig, metrics)` for C2/C4. tierConfig.tiers and matrixConfig were populated with usable data.

---

## BLOCK 2 — Current rule_set shape on production (CC executes)

### CC paste block — Block 2

```bash
echo "=== Block 2: Current BCL rule_set shape ==="

cat > /tmp/diag-024-current-shape.ts <<'EOF'
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Get the active rule_set
const { data: ruleSets, error } = await supabase
  .from('rule_sets')
  .select('id, name, status, created_at, components, input_bindings')
  .eq('tenant_id', BCL_TENANT_ID)
  .eq('status', 'active')
  .order('created_at', { ascending: false });

if (error) { console.error('Query failed:', error); process.exit(1); }

console.log(`Active rule_sets for BCL: ${ruleSets?.length ?? 0}`);
console.log('---');

for (const rs of (ruleSets ?? [])) {
  console.log(`Rule set: ${rs.id}`);
  console.log(`Name: ${rs.name}`);
  console.log(`Created: ${rs.created_at}`);
  
  // Walk components and dump shape per component
  const variants = (rs.components as any)?.variants ?? [];
  for (const variant of variants) {
    console.log(`\n  Variant: ${variant.variantId}`);
    for (const comp of (variant.components ?? [])) {
      console.log(`    Component: ${comp.id} (${comp.name})`);
      console.log(`      componentType: ${JSON.stringify(comp.componentType)}`);
      console.log(`      tierConfig: ${JSON.stringify(comp.tierConfig)}`);
      console.log(`      matrixConfig: ${JSON.stringify(comp.matrixConfig)}`);
      console.log(`      calculationIntent.operation: ${JSON.stringify(comp.calculationIntent?.operation)}`);
      console.log(`      metadata.intent keys: ${Object.keys(comp.metadata?.intent ?? {}).join(',')}`);
    }
  }
  console.log('---');
}
EOF

cd web && npx tsx /tmp/diag-024-current-shape.ts && cd ..
```

Paste output verbatim into FINDINGS Block 2.

---

## BLOCK 3 — Importer code path trace (CC reads, no execution)

### Block 3.1 — Locate the import entry point

```bash
echo "=== Block 3.1: Import entry point and convertComponent ==="

# Find convertComponent
grep -nE "function convertComponent|const convertComponent|convertComponent\s*=" web/src/ -r --include="*.ts" | head -10

# Find bridgeAIToEngineFormat
grep -nE "function bridgeAIToEngineFormat|const bridgeAIToEngineFormat|bridgeAIToEngineFormat\s*=" web/src/ -r --include="*.ts" | head -10

# Find plan interpretation save path
grep -nE "interpretationToPlanConfig" web/src/ -r --include="*.ts" | head -10
```

### Block 3.2 — Read convertComponent for componentType assignment logic

```bash
echo "=== Block 3.2: Read convertComponent ==="

# Find the file containing convertComponent and dump it
CONVERT_FILE=$(grep -lE "function convertComponent|const convertComponent\s*=" web/src/ -r --include="*.ts" | head -1)
echo "File: $CONVERT_FILE"

# Show the full function — find the line, view +60 lines from there
START_LINE=$(grep -nE "function convertComponent|const convertComponent\s*=" "$CONVERT_FILE" | head -1 | cut -d: -f1)
echo "Function starts at line $START_LINE"
sed -n "${START_LINE},$(($START_LINE + 80))p" "$CONVERT_FILE"
```

### Block 3.3 — Trace componentType assignment

```bash
echo "=== Block 3.3: Where is componentType assigned ==="

# Find all places componentType is written (literal property assignment)
grep -nE "componentType:\s*'tier_lookup'|componentType:\s*'matrix_lookup'|componentType:\s*'scalar_multiply'|componentType:\s*'conditional_gate'|componentType:\s*'bounded_lookup'" web/src/ -r --include="*.ts"

# Check what calcMethod.type maps to in convertComponent
grep -nE "calcMethod\.type|calculationIntent\.operation|calcType" web/src/lib/compensation/ -r --include="*.ts" 2>/dev/null | head -20
```

### Block 3.4 — Where does tierConfig get populated (or not)

```bash
echo "=== Block 3.4: tierConfig population ==="

# Find writes to tierConfig
grep -nE "tierConfig:\s*\{|tierConfig\.tiers" web/src/ -r --include="*.ts" | head -20

# Find writes to matrixConfig
grep -nE "matrixConfig:\s*\{|matrixConfig\.rows|matrixConfig\.cols" web/src/ -r --include="*.ts" | head -20

# Find writes to metadata.intent
grep -nE "metadata:\s*\{\s*intent|intent:\s*\{[^}]*operation" web/src/ -r --include="*.ts" | head -20
```

Paste each section's output into FINDINGS Block 3.

---

## BLOCK 4 — Engine read paths (CC reads, no execution)

### Block 4.1 — Legacy dispatcher

```bash
echo "=== Block 4.1: Legacy dispatch in run-calculation.ts ==="

# Show the full switch on componentType
grep -nB 2 -A 8 "case 'tier_lookup'" web/src/lib/calculation/run-calculation.ts
echo "---"
grep -nB 2 -A 8 "case 'matrix_lookup'" web/src/lib/calculation/run-calculation.ts
echo "---"
grep -nB 2 -A 8 "case 'scalar_multiply'" web/src/lib/calculation/run-calculation.ts
echo "---"
grep -nB 2 -A 8 "case 'conditional_gate'" web/src/lib/calculation/run-calculation.ts
echo "---"
grep -nB 2 -A 8 "case 'bounded_lookup_1d'" web/src/lib/calculation/run-calculation.ts
echo "---"
grep -nB 2 -A 8 "case 'bounded_lookup_2d'" web/src/lib/calculation/run-calculation.ts
```

### Block 4.2 — evaluateTierLookup behavior with empty tiers

```bash
echo "=== Block 4.2: evaluateTierLookup ==="

EVAL_FILE=$(grep -lE "function evaluateTierLookup|const evaluateTierLookup\s*=" web/src/ -r --include="*.ts" | head -1)
echo "File: $EVAL_FILE"
START=$(grep -nE "function evaluateTierLookup|const evaluateTierLookup\s*=" "$EVAL_FILE" | head -1 | cut -d: -f1)
sed -n "${START},$(($START + 50))p" "$EVAL_FILE"
```

### Block 4.3 — evaluateMatrixLookup behavior

```bash
echo "=== Block 4.3: evaluateMatrixLookup ==="

EVAL_FILE=$(grep -lE "function evaluateMatrixLookup|const evaluateMatrixLookup\s*=" web/src/ -r --include="*.ts" | head -1)
echo "File: $EVAL_FILE"
START=$(grep -nE "function evaluateMatrixLookup|const evaluateMatrixLookup\s*=" "$EVAL_FILE" | head -1 | cut -d: -f1)
sed -n "${START},$(($START + 60))p" "$EVAL_FILE"
```

### Block 4.4 — Intent executor handlers for bounded_lookup_2d / bounded_lookup_1d

```bash
echo "=== Block 4.4: intent executor ==="

# Find the intent executor
INTENT_FILE=$(find web/src/lib/calculation -name "intent-executor*" 2>/dev/null | head -1)
echo "Intent executor: $INTENT_FILE"

if [ -n "$INTENT_FILE" ]; then
  echo "--- bounded_lookup_2d handler ---"
  grep -nB 2 -A 30 "bounded_lookup_2d" "$INTENT_FILE" | head -80
  echo "--- bounded_lookup_1d handler ---"
  grep -nB 2 -A 30 "bounded_lookup_1d" "$INTENT_FILE" | head -80
fi

# Also search for 'executeBoundedLookup' or similar
grep -nE "executeBoundedLookup|executeBounded2D|executeBounded1D|case 'bounded_lookup" web/src/lib/calculation/ -r --include="*.ts" | head -20
```

### Block 4.5 — Authority dispatch (Decision 151 / HF-188)

```bash
echo "=== Block 4.5: Decision 151 authority routing ==="

# Find the per-component authority decision
grep -nE "INTENT_AUTHORITATIVE|Decision 151|HF-188|isIntentAuthoritative|sole authority" web/src/app/api/calculation/run/route.ts
grep -nE "INTENT_AUTHORITATIVE|Decision 151|HF-188" web/src/lib/calculation/ -r --include="*.ts"
```

Paste each section's output into FINDINGS Block 4.

---

## BLOCK 5 — Structural verdict (CC tabulates from Blocks 2/3/4)

### Block 5.1 — Tabulate importer output → engine read

CC fills in this table from the evidence collected in Blocks 2-4. No new investigation; only synthesis.

```
Per-component analysis (CC fills in from evidence):

  Component           | Importer writes                | Legacy reads               | Intent reads
  --------------------|-------------------------------|----------------------------|----------------------------
  C1 Credit Placement | componentType=?               | tierConfig.tiers=?         | metadata.intent.outputGrid=?
                      | tierConfig=?                  | matrixConfig=?             | (intent op = ?)
                      | matrixConfig=?                |                            |
                      | metadata.intent=?             |                            |
  C2 Deposit Capture  | componentType=?               | tierConfig.tiers=?         | metadata.intent.outputs=?
                      | tierConfig=?                  | matrixConfig=?             | (intent op = ?)
                      | metadata.intent=?             |                            |
  C3 Cross Products   | componentType=?               | (legacy doesn't handle)    | metadata.intent.rate=?
                      | metadata.intent=?             |                            | (intent op = ?)
  C4 Regulatory Comp. | componentType=?               | tierConfig.tiers=?         | metadata.intent.condition=?
                      | metadata.intent=?             |                            | (intent op = ?)

Authority dispatch:
  - Decision 151 list of intent-authoritative types: [from Block 4.5]
  - Does C1's componentType appear in the list? Yes/No
  - Does C2's componentType appear in the list? Yes/No
  - Does C3's componentType appear in the list? Yes/No
  - Does C4's componentType appear in the list? Yes/No
```

### Block 5.2 — Structural verdict statement

CC produces a verbatim statement of one of these three findings:

- **Finding A:** Importer writes shape X. Legacy reads shape X correctly. Intent executor reads shape X correctly. The mismatch is elsewhere (specify where).
- **Finding B:** Importer writes shape X. Legacy reads shape Y (where Y ≠ X for some components). Intent executor reads shape X correctly. The mismatch is in legacy dispatch for components not on the intent-authoritative list.
- **Finding C:** Importer writes shape X. Legacy reads shape Y. Intent executor reads shape Z (where Z ≠ X for some components). The mismatch is bilateral.

CC may also report **Finding D — None of the above; evidence is incomplete or contradictory** — and enumerate what further evidence would be needed.

CC does NOT propose remediation. Architect interprets the finding and decides the next step.

---

## PHASE — Author FINDINGS and commit

### Author `docs/diagnostics/DIAG-024_FINDINGS.md`

Required sections:

1. **DIAGNOSTIC SCOPE** — predecessor (CLT-197 BCL October calc on rebuilt substrate produced $19,280 vs ~$44,590 expected), substrate state (origin/main post-CLT-197 merge SHA).
2. **BLOCK 1 — REFERENCE RULE_SET SHAPES** — verbatim from the architect-provided block above.
3. **BLOCK 2 — CURRENT RULE_SET SHAPE** — script output verbatim.
4. **BLOCK 3 — IMPORTER CODE PATH** — outputs from sections 3.1–3.4.
5. **BLOCK 4 — ENGINE READ PATHS** — outputs from sections 4.1–4.5.
6. **BLOCK 5.1 — IMPORTER → ENGINE TABLE** — the four-component tabulation filled in.
7. **BLOCK 5.2 — STRUCTURAL VERDICT** — Finding A, B, C, or D verbatim.
8. **NO REMEDIATION SECTION** — explicit note that disposition is architect-side; CC produces evidence only.

### Phase Commit and push

```bash
git add docs/vp-prompts/DIAG-024_IMPORTER_ENGINE_ALIGNMENT.md \
        docs/diagnostics/DIAG-024_FINDINGS.md \
        docs/completion-reports/DIAG-024_COMPLETION_REPORT.md
git commit -m "DIAG-024: importer-engine alignment diagnostic — evidence pack only, no remediation"
git push origin main
git log -1 --format='COMMIT_SHA=%H'
```

Paste commit SHA in architect-channel reply.

---

## PHASE GATE

| # | Criterion | Pass condition |
|---|---|---|
| G1 | All 5 blocks present in FINDINGS with verbatim evidence | grep -cE "^## BLOCK" >= 5 |
| G2 | Block 5.1 table filled in for all 4 components | All `?` placeholders replaced |
| G3 | Block 5.2 reports Finding A, B, C, or D explicitly | Finding letter and rationale present |
| G4 | No remediation proposals | grep for "fix", "remediation", "should", "recommend" returns 0 in FINDINGS body (only allowed in headers/section titles for the "NO REMEDIATION SECTION" header) |
| G5 | Commit pushed to origin/main | Commit SHA pasted |

**HALT and report if:**
- Block 2 DB query errors
- Any code file Block 3 or 4 references is not found on substrate (would indicate audit-relevant gap)
- Block 5.1 table cannot be filled because a row's evidence is missing

---

## ANTI-PATTERN CHECKS

CC self-attests in completion report:

- [ ] No code modifications
- [ ] No database modifications
- [ ] No remediation proposals
- [ ] All evidence pasted verbatim, not summarized
- [ ] Block 5.1 table filled from Blocks 2/3/4 evidence only — no inference from architect-provided Block 1
- [ ] Block 5.2 finding stated explicitly, not implied
- [ ] Korean Test PASS

---

## CC AUTONOMY

Report at:
- (a) Any HALT condition during ADG or any block
- (b) Phase Commit close with FINDINGS SHA
- (c) Any block where evidence is missing or contradictory (per Finding D path)

CC executes Blocks 2 → 3 → 4 → 5 sequentially. Block 1 is provided inline; CC includes verbatim. Block 5 is synthesis from Blocks 2/3/4.

---

*DIAG-024 · Importer-engine alignment diagnostic · Predecessor: CLT-197 BCL October calc $19,280 vs ~$44,590 expected on rebuilt substrate · Successor: architect disposition decision (no fix authored in this directive) · 2026-04-27 · Decision 95 informational (100% reconciliation gate is referenced, not enforced in DIAG) · SR-44 N/A · Standing Rules 25, 26, 27, 34, 36, 51v2 N/A*
