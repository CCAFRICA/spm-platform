# DIAG-043: HF-223 Implementation Surface Verification Against Current Codebase

**Type:** Targeted code verification (read-only, no modification)
**Predecessors:** DIAG-041 (comprehensive code audit, pre-HF-222), AUD-005 (calc execution live reference, commit 5314c365)
**Purpose:** Verify that the three code surfaces required for HF-223 (IntentModifier type, applyModifiers executor function, plan_interpretation LLM prompt) are unchanged at current HEAD relative to DIAG-041 extractions. Surface any delta. Read the current operative code verbatim at each surface so HF-223 can be drafted against verified current state, not stale DIAG-041 snapshots.
**Output:** Single consolidated file at `docs/diagnostics/DIAG-043_HF223_SURFACE_VERIFICATION_OUTPUT.md`

## Standing rules (read first, every CC turn)

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. All rules apply.

Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Execute every phase sequentially. Commit after each phase. Push after each commit.

## Phase 0 -- Repo orientation and output file scaffold

Confirm working directory is the VP repo root (`spm-platform`, not `vialuce-governance`).

```bash
pwd
git log --oneline -3
git rev-parse HEAD
```

Expected: HEAD is at or after squash merge `70bf9c2a` (HF-222). If HEAD is on a feature branch, switch to main first:

```bash
git checkout main
git pull origin main
```

Create the output file:

```bash
mkdir -p docs/diagnostics
cat > docs/diagnostics/DIAG-043_HF223_SURFACE_VERIFICATION_OUTPUT.md << 'EOF'
# DIAG-043 -- HF-223 Implementation Surface Verification Output

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Branch:** main
**HEAD commit:** $(git rev-parse HEAD)
**Predecessor:** DIAG-041 (pre-HF-222 code audit)
**Scope:** Three surfaces: IntentModifier type, applyModifiers function, plan_interpretation prompt

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No design proposals.

EOF
```

```bash
git add docs/diagnostics/DIAG-043_HF223_SURFACE_VERIFICATION_OUTPUT.md
git commit -m "DIAG-043 Phase 0: output file scaffold"
git push origin main
```

Paste `git log -1 --oneline` output verbatim.

## Phase 1 -- IntentModifier type definition

### 1.1 Locate and read the current type

```bash
grep -n "IntentModifier" web/src/lib/calculation/intent-types.ts
```

Read the full type union definition. DIAG-041 Phase 5.5 extracted lines 203-207. Read the current lines at whatever range the grep returns:

```bash
sed -n '<start>,<end>p' web/src/lib/calculation/intent-types.ts
```

Append the verbatim output under `## Phase 1 -- IntentModifier type definition (current)` in the output file.

### 1.2 Delta assessment

```bash
echo "DIAG-041 extracted lines 203-207. Current extraction above."
echo "Fields present in cap discriminant:"
echo "  - modifier"
echo "  - maxValue" 
echo "  - scope"
echo "Does applyTo field exist? (grep result):"
grep -c "applyTo" web/src/lib/calculation/intent-types.ts
```

Append under `## Phase 1.2 -- Delta from DIAG-041`.

### 1.3 All consumers of IntentModifier

```bash
grep -rn "IntentModifier\|\.modifier\b.*cap\|mod\.maxValue\|mod\.minValue\|mod\.modifier" \
  web/src/lib/calculation/ web/src/app/api/calculation/ \
  --include="*.ts" 2>&1 | head -60
```

Append verbatim under `## Phase 1.3 -- IntentModifier consumers`. This inventory is required so HF-223 knows every site that reads IntentModifier fields and may need to handle the new applyTo field.

```bash
git add docs/diagnostics/DIAG-043_HF223_SURFACE_VERIFICATION_OUTPUT.md
git commit -m "DIAG-043 Phase 1: IntentModifier type verification"
git push origin main
```

## Phase 2 -- applyModifiers and executeIntent

### 2.1 Verify applyModifiers unchanged

```bash
grep -n "function applyModifiers" web/src/lib/calculation/intent-executor.ts
```

Read the full function body from the function signature through the closing brace:

```bash
sed -n '<start>,<end>p' web/src/lib/calculation/intent-executor.ts
```

Append verbatim under `## Phase 2.1 -- applyModifiers function body (current)`.

### 2.2 Verify executeIntent call site for applyModifiers

```bash
grep -n "applyModifiers" web/src/lib/calculation/intent-executor.ts
```

For each hit, read 5 lines of context:

```bash
grep -n -B2 -A5 "applyModifiers" web/src/lib/calculation/intent-executor.ts
```

Append verbatim under `## Phase 2.2 -- applyModifiers call sites in executeIntent`.

Key question this answers: at the call site where applyModifiers is invoked (DIAG-041 Phase 3.5 showed line 683: `outcome = applyModifiers(outcome, intent.modifiers, entityData, modifierLog)`), is the resolved input value (pre-operation) still accessible in the local scope? Or has it been consumed by executeOperation and only the post-operation outcome remains?

### 2.3 executeScalarMultiply -- input value accessibility

```bash
grep -n "function executeScalarMultiply" web/src/lib/calculation/intent-executor.ts
```

Read the full function:

```bash
sed -n '<start>,<end>p' web/src/lib/calculation/intent-executor.ts
```

Append verbatim under `## Phase 2.3 -- executeScalarMultiply (current)`.

### 2.4 executeOperation dispatcher -- what returns to executeIntent

```bash
grep -n "function executeOperation" web/src/lib/calculation/intent-executor.ts
```

Read the full function:

```bash
sed -n '<start>,<end>p' web/src/lib/calculation/intent-executor.ts
```

Append verbatim under `## Phase 2.4 -- executeOperation dispatcher (current)`.

### 2.5 modifierLog trace emission site

```bash
grep -n "modifierLog\|modifier.*before.*after\|trace.*modifiers" web/src/lib/calculation/intent-executor.ts
```

Append verbatim under `## Phase 2.5 -- Modifier trace emission sites`.

```bash
git add docs/diagnostics/DIAG-043_HF223_SURFACE_VERIFICATION_OUTPUT.md
git commit -m "DIAG-043 Phase 2: executor verification"
git push origin main
```

## Phase 3 -- Plan-interpretation LLM prompt

### 3.1 Locate the plan_interpretation prompt

```bash
grep -n "plan_interpretation" web/src/lib/ai/providers/anthropic-adapter.ts | head -10
```

### 3.2 Read the full prompt template

The plan_interpretation prompt in DIAG-041 Phase 5.4 started at line 207 and the cap example was at lines 600-613. Read the full prompt construction. Find the boundaries:

```bash
grep -n "plan_interpretation\|CRITICAL.*calculationIntent\|EXAMPLE.*calculationIntent\|modifiers.*cap\|modifier.*cap" \
  web/src/lib/ai/providers/anthropic-adapter.ts | head -20
```

Then read the modifier/cap-related section (50 lines around the cap example):

```bash
sed -n '<cap_example_start-20>,<cap_example_end+20>p' web/src/lib/ai/providers/anthropic-adapter.ts
```

Append verbatim under `## Phase 3.2 -- Plan-interpretation prompt cap/modifier section (current)`.

### 3.3 Read the full list of primitive examples in the prompt

The prompt instructs the LLM on the 7 primitives. Read the section that lists them:

```bash
grep -n "bounded_lookup_2d\|bounded_lookup_1d\|scalar_multiply\|conditional_gate\|piecewise_linear\|linear_function\|scope_aggregate\|ratio" \
  web/src/lib/ai/providers/anthropic-adapter.ts | head -30
```

For each primitive example block, read the surrounding context. This tells us what the LLM has been taught about scalar_multiply + ratio input specifically:

```bash
grep -n -A5 "scalar_multiply" web/src/lib/ai/providers/anthropic-adapter.ts | head -40
```

Append verbatim under `## Phase 3.3 -- Primitive examples in prompt (scalar_multiply focus)`.

### 3.4 Read the modifier instruction section

```bash
grep -n -B3 -A10 "modifier\|cap\|floor\|proration" web/src/lib/ai/providers/anthropic-adapter.ts | head -80
```

Append verbatim under `## Phase 3.4 -- Modifier instruction section in prompt`.

```bash
git add docs/diagnostics/DIAG-043_HF223_SURFACE_VERIFICATION_OUTPUT.md
git commit -m "DIAG-043 Phase 3: plan-interpretation prompt verification"
git push origin main
```

## Phase 4 -- Intent-transformer modifier passthrough

### 4.1 Verify transformer modifier handling unchanged

```bash
grep -n "modifier\|modifiers\|cap\|floor\|applyTo" web/src/lib/calculation/intent-transformer.ts | head -20
```

Read the modifier handling section (DIAG-041 Phase 4.3 transformation #6 was at lines 185-202):

```bash
sed -n '<modifier_section_start>,<modifier_section_end>p' web/src/lib/calculation/intent-transformer.ts
```

Append verbatim under `## Phase 4.1 -- Transformer modifier handling (current)`.

### 4.2 Transformer call sites in route.ts (verify line numbers post-HF-222)

```bash
grep -n "transformVariant\|transformFromMetadata" web/src/app/api/calculation/run/route.ts | head -10
```

Append verbatim under `## Phase 4.2 -- Transformer call sites in route.ts (current line numbers)`.

```bash
git add docs/diagnostics/DIAG-043_HF223_SURFACE_VERIFICATION_OUTPUT.md
git commit -m "DIAG-043 Phase 4: transformer verification"
git push origin main
```

## Phase 5 -- Completion

Append to the output file:

```bash
cat >> docs/diagnostics/DIAG-043_HF223_SURFACE_VERIFICATION_OUTPUT.md << 'EOF'

## Phase 5 -- DIAG-043 Complete

All four phases executed. Output file contains verbatim current-codebase extractions at HEAD for:
- IntentModifier type definition + all consumers
- applyModifiers function + call sites + input value accessibility
- executeScalarMultiply + executeOperation dispatcher
- Plan-interpretation prompt cap/modifier instruction section
- Intent-transformer modifier passthrough

CC does not interpret findings. Architect dispositions in architect channel.
EOF
```

```bash
git add docs/diagnostics/DIAG-043_HF223_SURFACE_VERIFICATION_OUTPUT.md
git commit -m "DIAG-043 Phase 5: complete"
git push origin main
```

Paste `git log -5 --oneline` verbatim (all five DIAG-043 commits should appear).

Kill dev server. `rm -rf .next`. `npm run build`. `npm run dev`. Confirm localhost:3000.

End of diagnostic.
