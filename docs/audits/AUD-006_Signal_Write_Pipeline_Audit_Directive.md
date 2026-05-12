# AUD-006 — Signal-Write Pipeline Comprehensive Audit

**Status:** ACTIVE
**Type:** Read-only multi-dimensional audit; zero source modifications
**Repository:** `CCAFRICA/spm-platform`
**Branch policy:** create branch `aud-006-signal-write-pipeline-audit` from `main` for the audit report file ONLY; no source modifications
**Output location:** `docs/audits/AUD-006_Signal_Write_Pipeline_Audit.md` (per AUD-004 v3 Section 11 + AUD-005 convention)
**Sequence:** AUD-006 (predecessors: AUD-001 SCI Pipeline, AUD-004 v3 Universal Calculation Primitive remediation, AUD-005 Calc-Execution Live Reference)
**Predecessor diagnostics in this defect arc:** DIAG-035 (PR #377), DIAG-036 (PR #378), DIAG-037 (PR #379), DIAG-038 (PR #382 squash-merged)
**Predecessor behavioral changes in this defect arc:** HF-214 Phase 1 (PR #380, 7ca17c4a), HF-214 Phase 2 (PR #381, squash-merged 5418f4f4), HF-215 (PR #383, efca0d3a)
**Substrate baseline:** locked Decision 30 v2, Decision 64 v2, Decision 153, Decision 154, Decision 155; AUD-004 substrate extensions E1-E6 LOCKED 2026-04-27; T1-E906 (Closed-Loop Intelligence), T1-E907 (Fix Logic Not Data), T1-E910 (Korean Test), T1-E931 (Locked Decision Immutability), T1-E947 (Reasoning-Scope Binding Specificity)

---

## Architect-channel context

The platform's signal-write pipeline has been the surface of multiple sequential DIAGs and HFs in the c4 magnitude defect arc. Each DIAG addressed a single dimension; each HF was scoped to a single fix shape. The aggregate effect has produced:

- HF-214 Phase 2 B1 prompt amendment that broke pre-existing `anthropic-adapter:974` `/100` normalizer (DIAG-038 finding)
- HF-215 revert of B1 that did not change calculation values (post-revert empirical observation)
- Comprehension signals persisting at 0.9999 (writer-clamp boundary) instead of 0.95 (B2-normalized value), indicating B2 normalization does NOT propagate to plan-comprehension-emitter call site
- 30 globally exact-1.0 confidence rows from bypass writers (DIAG-038 Section 4) that escape the writer-side clamp entirely
- c4 magnitude defect at `route.ts:1793/1798` remains untouched

Architect determination: fragmented DIAGs caused drift. AUD-006 is a comprehensive multi-dimensional audit of the signal-write pipeline to surface every interaction, every defect class, every reader sensitivity, and every substrate violation across the entire pipeline. Output is read-only evidence; the architect dispositions remediation post-audit.

---

## Standing Rules (apply throughout)

This directive operates under **CC Standing Architecture Rules v2.1+**.

- **Rule: Read-only.** Zero modifications to any file under `web/` or any other source path. Only the audit report file is created and committed.
- **Rule 24 (SR-34: No Bypass).** If any audit surface is blocked or returns ambiguous results, halt and surface to architect-channel. Do not work around.
- **Rule (Korean Test, T1-E910).** Grep patterns use structural value-range or schema-name vocabulary, not domain-specific literals.
- **Rule: Verbatim evidence.** Every claim is supported by pasted command output, source code excerpt with line numbers, or SQL result. No narrative claims. No interpretation. No recommendation framing.
- **Rule: Build upon, do not duplicate.** AUD-001 findings F-001/F-002/F-003 on `signal-persistence.ts` predate seeds-eradication. AUD-006 verifies their current status against AUD-004 v3 closure claims (E1-E6 LOCKED) — does not re-author them.
- **Rule: Halt on threshold conditions** (enumerated below).

### Halt conditions

CC halts and surfaces to architect-channel BEFORE proceeding to subsequent dimensions if any of the following occur:

1. Any signal writer that bypasses `persistSignal`/`persistSignalBatch` is identified writing values that violate Decision 30 v2 (confidence ∈ [0.0, 1.0])
2. Any reader of `classification_signals.confidence` is found that produces materially different output for `confidence=0.9999` vs `confidence=1.0` AND that reader operates on data persisted via the clamp path
3. Decision 64 v2 read-before-derive obligation (E3 from AUD-004 v3) is empirically violated by any writer/reader pair on the live signal surface
4. AUD-001 finding F-001 (persistSignal getClient() failure) is empirically still active in current `main` (would mean E1-E6 closure claim is incorrect)
5. N2 (signal-type registry) from AUD-004 v3 deliverables is implemented but inconsistent with the live `signal-persistence.ts` write surface
6. The data path from `interpretation.components[i].confidence` to `persistSignal` cannot be traced empirically (would mean a transformation occurs in code CC cannot identify)

---

## Section 0 — File inventory (calc-execution-style header per AUD-005 convention)

CC produces this section first as the audit's establishing file inventory.

### Step 0.1 — Capture commit SHA

```bash
cd /path/to/spm-platform
git fetch origin
git checkout main
git pull origin main
git rev-parse HEAD
git log origin/main --oneline | head -30
```

Capture verbatim output. Record the short SHA in audit report header.

### Step 0.2 — Inventory signal-write pipeline files

```bash
wc -l web/src/lib/ai/signal-persistence.ts
wc -l web/src/lib/compensation/plan-comprehension-emitter.ts
wc -l web/src/lib/compensation/ai-plan-interpreter.ts
wc -l web/src/lib/ai/providers/anthropic-adapter.ts
wc -l web/src/lib/intelligence/convergence-service.ts
wc -l web/src/lib/intelligence/classification-signal-service.ts
ls -la web/src/lib/intelligence/signal-registry.ts 2>/dev/null || echo "FILE_NOT_PRESENT: signal-registry.ts"
ls -la web/src/lib/ai/training-signal-service.ts 2>/dev/null
```

### Step 0.3 — Inventory all writers of `classification_signals`

```bash
cd /path/to/spm-platform
grep -rn "from('classification_signals')\|classification_signals" web/src/ --include="*.ts" --include="*.tsx" | grep -v "test\|spec\|__tests__"
grep -rn "persistSignal\|persistSignalBatch\|writeClassificationSignal" web/src/ --include="*.ts" --include="*.tsx" | grep -v "test\|spec\|__tests__"
grep -rn "\.insert.*signal_type\|signal_type.*insert" web/src/ --include="*.ts" --include="*.tsx" | grep -v "test\|spec\|__tests__"
```

Capture verbatim. Every match is a candidate writer site.

---

## DIMENSION 1 — Writer surface inventory (every code path that writes to classification_signals)

### Step 1.1 — Categorize writers

For each writer site identified in Step 0.3, capture:
- File path + line range
- Function name
- Signal_type(s) written
- Write path: `persistSignal` / `persistSignalBatch` / `writeClassificationSignal` / direct `.insert()` / other
- Confidence value source: literal / variable / AI response / computed
- Awaited or fire-and-forget

```bash
# For each candidate writer, paste surrounding 20 lines
sed -n '<line-20>,<line+20>p' <file>
```

### Step 1.2 — Verify AUD-001 F-001 status

AUD-001 F-001 (persistSignal getClient() failure) was claimed closed by AUD-004 v3 E1+E4 substrate extensions. Empirically verify on current main:

```bash
grep -n "getClient\|dynamic import\|await import" web/src/lib/ai/signal-persistence.ts
grep -n "createClient\|createServiceRoleClient" web/src/lib/ai/signal-persistence.ts
sed -n '1,80p' web/src/lib/ai/signal-persistence.ts
```

Capture verbatim. Verdict per the empirical evidence: getClient() pattern present (active F-001) OR replaced with argument-passing pattern (closed).

### Step 1.3 — Verify AUD-001 F-002 (dual write architecture) status

AUD-001 F-002 noted two parallel signal write architectures (`signal-persistence.ts` JSONB path vs `classification-signal-service.ts` dedicated columns). AUD-004 v3 did not name F-002 explicitly in closure map.

```bash
grep -n "signal_value\|signalValue" web/src/lib/ai/signal-persistence.ts
grep -n "INSERT INTO classification_signals\|.from('classification_signals').insert" web/src/lib/intelligence/classification-signal-service.ts
diff <(grep -E "supabase\.from\('classification_signals'\)\.insert" web/src/lib/ai/signal-persistence.ts) <(grep -E "supabase\.from\('classification_signals'\)\.insert" web/src/lib/intelligence/classification-signal-service.ts)
```

Capture verbatim. Verdict: dual architecture present (active F-002) OR consolidated to single write interface (closed).

### Step 1.4 — Find all bypass writers (direct .insert() calls)

```bash
grep -rnE "\.from\(['\"]classification_signals['\"]?\)\.insert" web/src/ --include="*.ts" --include="*.tsx"
```

For each bypass writer, paste surrounding 30 lines including the data shape being inserted, with attention to the `confidence` field source.

### Step 1.5 — Verdict table (Dimension 1)

| Writer site | File:line | Signal_type | Write path | Confidence source | Subject to A clamp |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | Y/N |

---

## DIMENSION 2 — Transformation surface inventory (every site that mutates confidence between AI response and DB persistence)

### Step 2.1 — Identify all confidence transformation sites

```bash
grep -rnE "\.confidence\s*[\/\*]|confidence\s*=" web/src/lib/ --include="*.ts"
grep -rn "normalizeConfidence\|clamp.*confidence\|confidence.*clamp" web/src/ --include="*.ts"
grep -rnE "Math\.min\(.*Math\.max|/100\b|\* 100" web/src/lib/ai/ web/src/lib/compensation/ web/src/lib/intelligence/ --include="*.ts"
```

Capture verbatim.

### Step 2.2 — Verbatim trace: AI response → ai-plan-interpreter B2 → plan-comprehension-emitter

The architect-channel hypothesis from post-HF-215 empirical evidence: B2 normalizes values 95→0.95 in `ai-plan-interpreter.ts`, but `plan-comprehension-emitter.ts` receives unnormalized values (95) which then trigger the writer-side clamp to 0.9999.

**Capture verbatim source:**

```bash
# B2 implementation
sed -n '200,260p' web/src/lib/compensation/ai-plan-interpreter.ts

# B2 call sites (where normalizeConfidence is invoked)
grep -n "normalizeConfidence\|interpretation\.components.*confidence\|interpretation\.confidence" web/src/lib/compensation/ai-plan-interpreter.ts

# What ai-plan-interpreter.ts returns and to whom
grep -n "return\|export.*function\|export.*class" web/src/lib/compensation/ai-plan-interpreter.ts | head -30

# plan-comprehension-emitter.ts full body
cat web/src/lib/compensation/plan-comprehension-emitter.ts

# Caller of plan-comprehension-emitter
grep -rn "PlanComprehensionEmitter\|plan-comprehension-emitter\|emitComprehensionSignals\|emitComprehension" web/src/ --include="*.ts"
```

Capture verbatim. The audit MUST identify: does the data structure passed to `plan-comprehension-emitter` contain B2-normalized values OR pre-B2 raw values? If it contains pre-B2 values, where in the call chain is the divergence?

### Step 2.3 — Anthropic-adapter:974 /100 normalizer (pre-existing)

```bash
sed -n '965,985p' web/src/lib/ai/providers/anthropic-adapter.ts
grep -rn "response\.confidence\|AIResponse\.confidence" web/src/ --include="*.ts"
```

Capture verbatim. Identify every consumer of `response.confidence` (the post-/100 value) AND every consumer of `result.confidence` (the raw AI value before /100).

### Step 2.4 — Writer-side clamp (HF-214 Phase 2 A)

```bash
sed -n '50,90p' web/src/lib/ai/signal-persistence.ts
sed -n '120,160p' web/src/lib/ai/signal-persistence.ts
```

Capture verbatim. Confirm clamp present in BOTH `persistSignal` and `persistSignalBatch`. Verify Korean Test compliance (no schema-precision string references).

### Step 2.5 — Transformation interaction matrix

| Transformation | File:line | Input | Output | Fires on signal_type | Path that uses output |
|---|---|---|---|---|---|
| B1 (AI prompt) | anthropic-adapter.ts:408 | (prompt instruction) | AI emits 0-100 (post-HF-215) | all AI responses with confidence | result.confidence |
| anthropic-adapter:974 /100 | anthropic-adapter.ts:973-975 | result.confidence | response.confidence | all positive AI confidences | response.confidence consumers |
| B2 normalizeConfidence | ai-plan-interpreter.ts:222-232 | raw confidence | normalized confidence | plan_interpretation only | (?) |
| A writer clamp (single) | signal-persistence.ts:62-76 | signal.confidence | clamped confidence | all persistSignal callers | DB row |
| A writer clamp (batch) | signal-persistence.ts:135-149 | s.confidence per row | clamped per row | all persistSignalBatch callers | DB rows |

CC fills the `(?)` cells empirically — what code path consumes B2's normalized output, and does that path reach `plan-comprehension-emitter`?

---

## DIMENSION 3 — Reader surface inventory (every consumer of classification_signals.confidence)

### Step 3.1 — Enumerate readers

```bash
grep -rnE "\.from\(['\"]classification_signals['\"]?\)\.select" web/src/ --include="*.ts" --include="*.tsx"
grep -rn "signal\.confidence\|classification_signals.*confidence" web/src/ --include="*.ts" --include="*.tsx"
```

For each reader, paste:
- File:line
- Function name
- Threshold or comparison logic
- Output difference at confidence=0.9999 vs confidence=1.0
- Output difference at confidence=0.95 vs confidence=0.9999

### Step 3.2 — Per-reader behavioral matrix

| Reader | File:line | Operation | 0.95 vs 0.9999 | 0.9999 vs 1.0 |
|---|---|---|---|---|
| ... | ... | threshold ≥X / sort / display / etc. | SAME / DIFFERENT | SAME / DIFFERENT |

### Step 3.3 — Verify E3 read-before-derive (AUD-004 v3)

E3 (Decision 64 v2 extension): every signal_type written must have at least one declared reader before the next calculation run.

```bash
# Find SignalRegistry.persistSignal warnings about unregistered signal_types
grep -rn "not registered\|signal_type.*registered\|SignalRegistry" web/src/ --include="*.ts"
```

Empirical evidence from logs in this conversation: `signal_type 'classification:ai_document_analysis' not registered` and `signal_type 'comprehension:ai_plan_interpretation' not registered` warnings are firing in production.

| Signal_type | Writer site | Has declared reader (E3 obligation) | Empirical persistence count (Meridian) |
|---|---|---|---|
| comprehension:plan_interpretation | plan-comprehension-emitter.ts:103 | (verify) | 10 (post-HF-215) |
| comprehension:ai_plan_interpretation | (find) | NO (per log warning) | 1 (post-HF-215) |
| classification:ai_document_analysis | (find) | NO (per log warning) | 1 (post-HF-215) |
| classification:outcome | (find) | (verify) | 3 |
| convergence:dual_path_concordance | (find) | (verify) | 3 |
| cost:event | (find) | (verify) | 2 (clamped to 0.9999) |
| comprehension:header_binding | (find) | (verify) | (count) |

CC populates from `grep` results plus database state.

---

## DIMENSION 4 — Decision 30 v2 contract compliance (confidence ∈ [0.0, 1.0])

### Step 4.1 — Writers producing exact 1.0

```bash
grep -rnE "confidence:\s*1\.0\b|confidence:\s*1\b" web/src/ --include="*.ts" --include="*.tsx"
```

For each match, paste:
- File:line
- Write path (persistSignal? bypass?)
- Subject to A clamp (Y/N)

### Step 4.2 — Writers producing values that could exceed 1.0

```bash
# Producers that compute confidence
grep -rnE "confidence:\s*[a-zA-Z_].*[\+\-\*\/]" web/src/ --include="*.ts" --include="*.tsx"
grep -rnE "confidence\s*=\s*.*[\+\-\*\/]" web/src/ --include="*.ts" --include="*.tsx"
```

For each match, paste 10 surrounding lines. Trace whether the computation could produce values > 1.0 without explicit clamping or normalization.

### Step 4.3 — Database state empirical verification

```sql
-- All distinct (signal_type, source) writers and their confidence ranges
SELECT
  signal_type,
  count(*) AS row_count,
  min(confidence) AS min_conf,
  max(confidence) AS max_conf,
  avg(confidence)::numeric(8,6) AS avg_conf,
  count(*) FILTER (WHERE confidence = 0.9999) AS clamp_boundary_count,
  count(*) FILTER (WHERE confidence = 1.0) AS exact_one_count,
  count(*) FILTER (WHERE confidence > 1.0) AS over_one_count,
  count(*) FILTER (WHERE confidence < 0) AS negative_count
FROM classification_signals
WHERE confidence IS NOT NULL
GROUP BY signal_type
ORDER BY signal_type;
```

Capture verbatim output.

```sql
-- All exact 1.0 rows: which tenant, which signal_type, which path
SELECT
  signal_type,
  count(*) AS row_count,
  array_agg(DISTINCT tenant_id) AS tenants,
  min(created_at) AS earliest,
  max(created_at) AS latest
FROM classification_signals
WHERE confidence = 1.0
GROUP BY signal_type
ORDER BY signal_type;
```

```sql
-- Exact 0.9999 rows (clamp fired)
SELECT
  signal_type,
  count(*) AS row_count,
  array_agg(DISTINCT tenant_id) AS tenants,
  min(created_at) AS earliest,
  max(created_at) AS latest
FROM classification_signals
WHERE confidence = 0.9999
GROUP BY signal_type
ORDER BY signal_type;
```

### Step 4.4 — Decision 30 v2 compliance verdict per writer

| Writer | Signal_type | Empirical confidence range | Decision 30 v2 compliant |
|---|---|---|---|
| ... | ... | [min, max] | Y / N / unknown |

---

## DIMENSION 5 — AUD-004 v3 substrate extension verification (E1-E6 LOCKED 2026-04-27)

### Step 5.1 — E1 (canonical declaration surface) verification

```bash
ls -la web/src/lib/intelligence/signal-registry.ts 2>/dev/null
ls -la web/src/lib/intelligence/signal-types-registry.ts 2>/dev/null
grep -rn "signalTypeRegistry\|SIGNAL_TYPE_REGISTRY\|signalRegistry" web/src/ --include="*.ts"
```

Verdict: N2 (signal-type registry per AUD-004 v3 Section 5) implemented OR not.

### Step 5.2 — E2 (dispatch surface integrity) verification

```bash
grep -n "structured.*failure\|StructuredFailure\|throw new.*Signal" web/src/lib/ai/signal-persistence.ts
grep -n "console\.warn.*persist\|console\.error.*persist" web/src/lib/ai/signal-persistence.ts
```

Verdict: signal-write failures observable (E2 compliant) OR silent (E2 violation).

### Step 5.3 — E3 (read-before-derive structurally partitioned) verification

```bash
grep -rn "L1.*reader\|L2.*reader\|L3.*reader\|signal level\|signalLevel" web/src/ --include="*.ts"
grep -rn "comprehension.*reader\|classification.*reader\|convergence.*reader" web/src/ --include="*.ts"
```

Verdict: read-coupling rules per L1/L2/L3 implemented OR not.

### Step 5.4 — E4 (round-trip closure) verification

```bash
grep -rn "metadata\.intent\|round.?trip" web/src/ --include="*.ts" | head -20
```

(Out of AUD-006 scope per architect's exclusion of calc-execution; cite AUD-005 for calc-execution surfaces. Verify only that signal-write surface does not violate E4.)

### Step 5.5 — E5 (closed-loop intelligence) verification

```bash
grep -rn "loadMetricComprehensionSignals\|loadComprehensionSignals\|comprehension.*load" web/src/ --include="*.ts"
```

Verdict: convergence reads comprehension signals before deriving (E5 compliant) OR convergence isolated from plan-agent comprehension (E5 violation).

### Step 5.6 — E6 (Korean Test for operation vocabulary) verification

```bash
# Korean Test compliance check on signal-write code
grep -rn "comprehension.*plan_interpretation\|comprehension.*ai_plan_interpretation\|comprehension.*header_binding" web/src/lib/ai/ web/src/lib/compensation/ web/src/lib/intelligence/ --include="*.ts"
```

Empirical observation in this conversation's logs: `signal_type 'comprehension:ai_plan_interpretation' not registered` indicates two distinct comprehension signal_types in use, both non-domain-vocabulary. Verify Korean Test compliance.

### Step 5.7 — AUD-004 v3 substrate extension closure verdict

| Extension | LOCKED | Implementation present in signal-write surface | AUD-006 finding |
|---|---|---|---|
| E1 (canonical declaration / N2 registry) | 2026-04-27 | (verify) | (closed / latent / open) |
| E2 (dispatch surface integrity) | 2026-04-27 | (verify) | (closed / latent / open) |
| E3 (read-before-derive partitioned) | 2026-04-27 | (verify) | (closed / latent / open) |
| E4 (round-trip closure) | 2026-04-27 | (out of AUD-006 scope) | (cite AUD-005) |
| E5 (closed-loop intelligence) | 2026-04-27 | (verify) | (closed / latent / open) |
| E6 (Korean Test for operations) | 2026-04-27 | (verify) | (closed / latent / open) |

---

## DIMENSION 6 — Cross-cutting interactions across HF-214 Phase 2 + HF-215 state

### Step 6.1 — B1/B2/A interaction matrix

For each (writer, signal_type) pair from Dimension 1, trace empirically:
1. Where does the AI response originate?
2. Does the value pass through B2 normalizeConfidence?
3. Does it pass through anthropic-adapter:974 /100?
4. Does it pass through A writer clamp?
5. What value lands in `classification_signals.confidence`?

```bash
# For comprehension:plan_interpretation specifically
grep -A 20 "PlanComprehensionEmitter\|emitComprehensionSignals" web/src/lib/compensation/plan-comprehension-emitter.ts
grep -A 20 "PlanComprehensionEmitter\|emitComprehensionSignals" web/src/app/api/import/sci/execute/route.ts
```

Trace from AI response → to disk for at least 3 distinct signal_types:
- `comprehension:plan_interpretation`
- `comprehension:ai_plan_interpretation`
- `cost:event`

### Step 6.2 — HF-214 Phase 2 logs ingestion review

The architect uploaded post-HF-215 reimport logs in this conversation. Empirical evidence to cite in audit:
- Line 21:04:58.397 through 21:04:58.399: B2 fired 11 times (10 components + 1 interpretation-level)
- Line 21:04:58.621: writer clamp fired 10 times on `comprehension:plan_interpretation` from raw value 95/90 → 0.9999
- Line 21:04:58.395 + earlier: writer clamp fired 1 time on `cost:event` from raw value 1 → 0.9999
- Line 21:03:54.330: SignalRegistry warning on `classification:ai_document_analysis` not registered

These empirical observations are the audit's anchor. CC quotes verbatim.

### Step 6.3 — Calculation surface impact

Per HF-215 Section 5 prediction vs actual: confirm whether HF-215 changed any calculation outputs. CC compares per-entity values across:
- DIAG-038 noted post-Phase-2 batches (Antonio López = 1,302 / 1,302 / 1,602 across Jan/Feb/Mar)
- Post-HF-215 batches captured in this conversation's logs (Antonio López = 1,302 / 1,302 / 1,602 across Jan/Feb/Mar)

```sql
SELECT
  cb.id AS batch_id,
  cb.created_at,
  cb.period_id,
  count(*) AS entity_count,
  sum(cr.total_payout) AS grand_total
FROM calculation_batches cb
JOIN calculation_results cr ON cr.calculation_batch_id = cb.id
WHERE cb.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND cb.created_at > NOW() - INTERVAL '24 hours'
GROUP BY cb.id, cb.created_at, cb.period_id
ORDER BY cb.created_at;
```

Capture verbatim. Compare DIAG-038 batch totals to current state.

### Step 6.4 — Cross-cutting verdict

| Interaction | Empirical evidence | Defect class |
|---|---|---|
| B2 normalizes; plan-comprehension-emitter writes raw | clamp fired 10× on comprehension:plan_interpretation post-HF-215 | B2 normalization does not propagate to writer (F-AUD-006-001) |
| A clamp masks Decision 30 v2 violations silently for cost:event | 2 cost:event rows at 0.9999 | A clamp is silent on contract violations (F-AUD-006-002) |
| 30 globally exact-1.0 rows bypass A clamp | DIAG-038 §4.4 | bypass-writer asymmetry (F-AUD-006-003) |
| HF-215 produced no calculation change | per-entity values identical pre/post | revert was substrate-correct but did not address c4 magnitude (out of AUD-006 scope) |

---

## DIMENSION 7 — Findings catalog (P0 / P1 / P2 / P3)

CC populates this dimension from Dimensions 1-6 evidence. Each finding gets a structured table per AUD-001 / AUD-004 v3 convention:

```
### F-AUD-006-NNN: [finding title]

| Attribute | Value |
|-----------|-------|
| Severity | P0 / P1 / P2 / P3 |
| Files | (file paths) |
| Impact | (what breaks, who is affected) |
| Empirical evidence | (verbatim quote of code, log, or SQL) |
| Root cause | (structural diagnosis) |
| Substrate violation | (which Decision/T1 entry/AUD-004 extension is violated, if any) |
| Closure path | (which substrate extension or HF would close this) |
```

Severity rubric:
- **P0:** silent contract violation, schema-bypass write, reader sensitivity that produces incorrect calculation output
- **P1:** observable defect that masks upstream issues (e.g., clamp firing on writes that should not need clamping)
- **P2:** architectural inconsistency without immediate impact (e.g., dual write paths)
- **P3:** documentation drift, dead code, naming inconsistency

CC produces the catalog without prescribing remediation. The architect dispositions post-audit.

---

## DIMENSION 8 — Closure verification against AUD-001 + AUD-004 v3

### Step 8.1 — AUD-001 finding closure status

| AUD-001 finding | AUD-001 severity | AUD-004 v3 closure claim | AUD-006 empirical verdict |
|---|---|---|---|
| F-001 (persistSignal getClient() failure) | P0 | E1 + E4 | (verify) |
| F-002 (dual write architecture) | P1 | (not in closure map) | (verify) |
| F-003 (14 fire-and-forget swallowed failures) | P1 | (not in closure map) | (verify) |
| F-004 (eligibleRoles ['sales_rep', 'optometrista']) | P1 | (Korean Test) | (verify in signal-write surface only) |
| F-018 (plan save tenant isolation) | P0 | (DS-014 separate work) | (out of AUD-006 scope) |
| F-019 (calc run tenant isolation) | P0 | (DS-014 separate work) | (out of AUD-006 scope) |

CC verifies each in-scope AUD-001 finding empirically.

### Step 8.2 — AUD-004 v3 N2 (signal-type registry) implementation status

```bash
ls -la web/src/lib/intelligence/signal-registry*.ts 2>/dev/null
ls -la web/supabase/migrations/*signal*registry*.sql 2>/dev/null
ls -la web/supabase/migrations/*registry*.sql 2>/dev/null
```

Verdict: N2 implemented in main / pending / partial.

### Step 8.3 — AUD-004 v3 N3 (SCI emission constraint substrate) implementation status

```bash
grep -rn "C1.*persistence-before-declaration\|C2.*structural-identification\|C3.*resolution-chain" web/src/ --include="*.ts"
grep -rn "SCIEmissionConstraint\|sci.*emission.*constraint" web/src/ --include="*.ts"
```

Verdict: N3 implemented / pending / partial.

---

## Section 9 — Audit report structure (CC writes this file)

CC writes `docs/audits/AUD-006_Signal_Write_Pipeline_Audit.md`:

```markdown
# AUD-006 — Signal-Write Pipeline Comprehensive Audit

**Generated at commit:** [SHA from Phase 0]
**Generated by:** [this directive]
**Source repo:** CCAFRICA/spm-platform
**Generated date:** [ISO date]
**Scope:** signal-write pipeline (writers, transformations, readers, contract compliance, substrate extension verification, cross-cutting interactions). Excludes: c4 magnitude defect (route.ts:1793/1798 — separate calculation-engine concern), calc-execution surfaces (covered by AUD-005), convergence binding production.
**Substrate baseline:** Decisions 30 v2, 64 v2, 153, 154, 155 LOCKED; AUD-004 v3 E1-E6 LOCKED 2026-04-27; T1-E906/E907/E910/E931/E947.
**Predecessors:** AUD-001 (signal pipeline pre-seeds-eradication), AUD-004 v3 (universal calculation primitive remediation), AUD-005 (calc-execution live reference)
**This audit's defect arc context:** DIAG-035 → DIAG-036 → DIAG-037 → HF-214 Phase 1 → DIAG-038 → HF-214 Phase 2 → HF-215 (revert)

---

## Executive Summary

[CC writes a one-paragraph factual summary citing the count of P0/P1/P2/P3 findings. NO interpretation, NO recommendation.]

| Severity | Count | Key area |
|---|---|---|
| P0 | [N] | [domains] |
| P1 | [N] | [domains] |
| P2 | [N] | [domains] |
| P3 | [N] | [domains] |

---

## Section 0 — File inventory

[Phase 0 output verbatim]

## Section 1 — DIMENSION 1: Writer surface inventory

[Step 1.5 verdict table fully populated, with verbatim source excerpts]

## Section 2 — DIMENSION 2: Transformation surface inventory

[Step 2.5 transformation matrix fully populated]

## Section 3 — DIMENSION 3: Reader surface inventory

[Step 3.2 reader behavior matrix + Step 3.3 E3 verification]

## Section 4 — DIMENSION 4: Decision 30 v2 contract compliance

[Step 4.4 verdict table + Step 4.3 SQL output verbatim]

## Section 5 — DIMENSION 5: AUD-004 v3 substrate extension verification

[Step 5.7 verdict table for E1-E6]

## Section 6 — DIMENSION 6: Cross-cutting interactions

[Step 6.4 cross-cutting verdict + Step 6.2 log evidence verbatim + Step 6.3 SQL verbatim]

## Section 7 — DIMENSION 7: Findings catalog

[Each finding with structured table per AUD-001/AUD-004 v3 convention]

## Section 8 — DIMENSION 8: Closure verification

[Step 8.1 AUD-001 closure verdict + Step 8.2/8.3 N2/N3 status]

## Section 9 — Findings summary by file

| File | Findings | Severity |
|---|---|---|
| `signal-persistence.ts` | F-AUD-006-NNN | (severities) |
| `plan-comprehension-emitter.ts` | F-AUD-006-NNN | (severities) |
| ... | ... | ... |

---

## Section 10 — Halt conditions evaluation

| Halt condition | Triggered? | Evidence |
|---|---|---|
| 1. Bypass writer violates Decision 30 v2 | Y/N | (citation) |
| 2. Reader produces different output at 0.9999 vs 1.0 on persisted clamp data | Y/N | (citation) |
| 3. E3 read-before-derive empirically violated | Y/N | (citation) |
| 4. AUD-001 F-001 still active in main | Y/N | (citation) |
| 5. N2 implemented but inconsistent with live signal-persistence.ts | Y/N | (citation) |
| 6. Data path AI response → persistSignal cannot be traced | Y/N | (citation) |

---

## Section 11 — Architect disposition pending

This audit is read-only. CC has produced evidence; CC produces NO recommendations and NO remediation framing. The architect dispositions remediation post-audit.

---

## Section 12 — At-close verification

- [ ] All 8 dimensions executed
- [ ] All halt conditions evaluated and reported in Section 10
- [ ] Zero source files modified outside the audit report
- [ ] All evidence captured verbatim (no interpretation, no narrative, only structured tables and verbatim excerpts)
- [ ] Findings catalog (Section 7) populated with structured tables per AUD-001/AUD-004 v3 convention
- [ ] AUD-001 closure verification complete (Section 8)
- [ ] N2 + N3 implementation status complete (Section 8)
- [ ] "AUDIT" appears in H1 title and filename matches `docs/audits/AUD-006_Signal_Write_Pipeline_Audit.md`
- [ ] PR opened with `--base main --head aud-006-signal-write-pipeline-audit`
```

---

## What this directive does NOT do

- ❌ NO source file modifications
- ❌ NO PR creation that modifies any source file
- ❌ NO substrate amendments
- ❌ NO IRA invocation
- ❌ NO remediation framing in CC output
- ❌ NO interpretation of findings beyond severity classification
- ❌ NO assertion that any finding is good or bad
- ❌ NO addressing the c4 magnitude defect at `route.ts:1793/1798` (calculation-engine, not signal-pipeline)
- ❌ NO addressing calc-execution surfaces (covered by AUD-005)
- ❌ NO addressing convergence binding production (separate surface)
- ❌ NO duplicating AUD-001 findings; AUD-006 verifies their current status against AUD-004 v3 closure claims

CC produces evidence. The architect dispositions.

---

## Closing checklist (CC verifies before final commit)

1. ☐ Only `docs/audits/AUD-006_Signal_Write_Pipeline_Audit.md` is created (`git status` shows exactly this one new file)
2. ☐ `git diff main..HEAD --stat` confirms only the audit report file
3. ☐ All 8 dimensions executed in order
4. ☐ Halt conditions evaluated; if any triggered, audit report Section 10 captures which one(s)
5. ☐ All source code excerpts captured verbatim with file paths and line numbers
6. ☐ All SQL output captured verbatim
7. ☐ Findings catalog uses structured table per AUD-001/AUD-004 v3 convention
8. ☐ Section 5 verdict table addresses each E1-E6 extension empirically
9. ☐ Section 6 cites verbatim log evidence from this conversation's defect arc
10. ☐ Section 8 explicitly verifies AUD-001 in-scope findings (F-001, F-002, F-003) and N2/N3 status
11. ☐ No interpretation, no narrative, no recommendation in any section
12. ☐ Filename and H1 title match `AUD-006_Signal_Write_Pipeline_Audit`
13. ☐ PR opened against main

CC then:

```bash
git add docs/audits/AUD-006_Signal_Write_Pipeline_Audit.md
git commit -m "AUD-006: Signal-write pipeline comprehensive audit (read-only, 8 dimensions, post-seeds-eradication)"
git push -u origin aud-006-signal-write-pipeline-audit
gh pr create --base main --head aud-006-signal-write-pipeline-audit --title "AUD-006: Signal-write pipeline comprehensive audit" --body "Read-only multi-dimensional audit of the signal-write pipeline. Zero source modifications. Builds on AUD-001 (pre-seeds-eradication, partially closed by AUD-004 v3 E1-E6 LOCKED 2026-04-27) and complements AUD-005 (calc-execution scope). Excludes: c4 magnitude defect, calc-execution surfaces, convergence binding production. Output: docs/audits/AUD-006_Signal_Write_Pipeline_Audit.md"
```

End of directive.
