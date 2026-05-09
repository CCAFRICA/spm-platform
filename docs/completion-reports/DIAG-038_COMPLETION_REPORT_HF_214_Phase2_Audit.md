# DIAG-038 COMPLETION REPORT — HF-214 Phase 2 Audit and Ratio-by-100 Scaling Location

**Date:** 2026-05-09T20:06:01Z
**Branch:** `diag-038-hf-214-phase2-audit`
**Type:** Read-only diagnostic; zero source modifications
**Predecessor:** HF-214 Phase 2 (PR #381, squash-merge commit `5418f4f4`)

---

## Section 1 — Phase 2 commit verification

### 1.1 Commits on main

`git log origin/main --oneline | head -10` (verbatim):

```
5418f4f4 HF-214 Phase 2: Confidence convention contract enforcement (#381)
7ca17c4a HF-214 Phase 1: Signal persistence diagnostic instrumentation (logging-only) (#380)
eec1a618 Merge pull request #378 from CCAFRICA/diag-036-metric-population-orphan-probe
8716618d DIAG-036: Metric population path + post-seeds-eradication orphan inventory Phase 0 read-only probe
95d80180 Merge pull request #377 from CCAFRICA/diag-019-c4-magnitude-probe
c4627a56 DIAG-035: c4 Fleet Utilization magnitude Phase 0 read-only probe
b074f82f Merge pull request #376 from CCAFRICA/hf-213-atomic-supersession-resolver-closure
4850a1f4 HF-213 Phase 7: Completion report. CLOSED pending architect merge.
f3fb277b HF-213 Phase 6: Regression evidence captured (Meridian). Architect-channel reconciliation: PASS per scope. C4 magnitude carry-forward (HF-214 candidate, separate defect class, not HF-213 scope).
e5a44e74 HF-213 Phase 5: Build + lint + test + typecheck — all gates PASS (...)
```

**Observation:** PR #381 was squash-merged. The original Phase 2 commits `72571889` (initial Phase 2 implementation) and `b26ece05` (Section 6 SHA backfill) are NOT in main's linear history; the squash commit `5418f4f4` is the on-main artifact. Both original commits remain resolvable as git objects (orphan refs from the deleted feature branch); `git show` works on each. This is the standard merge style for this repo (every prior HF/DIAG PR was squash-merged the same way — see `eec1a618`/`95d80180`/`b074f82f` etc.).

### 1.2 Files modified per Phase 2 commit

`git show --name-status 72571889`:

```
A	docs/completion-reports/HF-214_Phase2_COMPLETION_REPORT_Confidence_Convention_Enforcement.md
M	web/src/lib/ai/providers/anthropic-adapter.ts
M	web/src/lib/ai/signal-persistence.ts
M	web/src/lib/compensation/ai-plan-interpreter.ts
```

`git show --name-status b26ece05`:

```
M	docs/completion-reports/HF-214_Phase2_COMPLETION_REPORT_Confidence_Convention_Enforcement.md
```

`git show --stat 5418f4f4` (squash commit, on-main artifact):

```
commit 5418f4f420b0262da74d1a5cacc02442501dfe41
Author: CCAFRICA <259441702+CCAFRICA@users.noreply.github.com>
Date:   Sat May 9 06:11:24 2026 -0700

    HF-214 Phase 2: Confidence convention contract enforcement (#381)
    [...]
```

### 1.3 Full diffs (`7ca17c4a..origin/main`)

**`web/src/lib/ai/providers/anthropic-adapter.ts`** — single-line replacement at line 408:

```diff
@@ -405,7 +405,7 @@ NUMERIC PARSING RULES:
 IMPORTANT GUIDELINES:
 1. Documents may be in ANY language. Preserve original language labels in component names and metric labels.
 2. Extract worked examples if present - these are critical for validation.
-3. Return confidence scores (0-100) for each component and overall.
+3. Return confidence scores as a decimal probability ratio between 0.0 and 1.0 for each component and overall (e.g., 0.95 means high confidence; 0.50 means uncertain). Do NOT emit integer percentages such as 95 or 90 — emit ratio form 0.95 and 0.90 instead.
 4. If a table has different values for different employee types/classifications, create SEPARATE components for each.
```

**`web/src/lib/compensation/ai-plan-interpreter.ts`**:

```diff
@@ -210,11 +210,27 @@ export class AIPlainInterpreter {
       components: this.normalizeComponents(parsed.components),
       requiredInputs: this.normalizeRequiredInputs(parsed.requiredInputs),
       workedExamples: this.normalizeWorkedExamples(parsed.workedExamples),
-      confidence: Number(parsed.confidence) || 0,
+      confidence: this.normalizeConfidence(parsed.confidence, 'interpretation.confidence', 0),
       reasoning: String(parsed.reasoning || ''),
     };
   }
 
+  // HF-214 Phase 2 (B2): structural normalization for AI-emitted confidence values.
+  // Confidence is a decimal probability ratio in [0, 1]. Values > 1 are treated as
+  // percentage-encoded and rescaled by /100; values < 0 clamp to 0. Original-vs-normalized
+  // divergence is logged so upstream prompt drift is observable.
+  private normalizeConfidence(raw: unknown, fieldPath: string, fallback: number): number {
+    const original = Number(raw);
+    if (!Number.isFinite(original)) return fallback;
+    let normalized = original;
+    if (normalized > 1) normalized = normalized / 100;
+    if (normalized < 0) normalized = 0;
+    if (normalized !== original) {
+      console.warn(`[AIPlanInterpreter] confidence normalized: field=${fieldPath} original=${original} normalized=${normalized}`);
+    }
+    return normalized;
+  }
+
@@ -243,7 +259,7 @@ export class AIPlainInterpreter {
         calculationIntent: c.calculationIntent && typeof c.calculationIntent === 'object'
           ? c.calculationIntent as Record<string, unknown>
           : undefined,
-        confidence: Number(c.confidence) || 50,
+        confidence: this.normalizeConfidence(c.confidence, `interpretation.components[${index}].confidence`, 0.5),
         reasoning: String(c.reasoning || ''),
       };
       return comp;
```

**`web/src/lib/ai/signal-persistence.ts`** — clamp insertion in both `persistSignal` and `persistSignalBatch`; success path / catch blocks unchanged. Full diff is captured at `/tmp/diag038-phase1-diff-signal.txt` and matches the verbatim block in HF-214 Phase 2 Completion Report Section 2.3+2.4 (PR #381).

### 1.4 Verdict

| Item | Status |
|---|---|
| Commit `72571889` resolvable | Y (git object present; orphan ref from deleted feature branch) |
| Commit `b26ece05` resolvable | Y (same) |
| Either commit on main's linear history | N (squash-merged; squash commit `5418f4f4` is the on-main artifact) |
| Files modified by 72571889 + b26ece05 match HF-214 Phase 2 completion report | Y |
| Substantive content present on main | Y (via `5418f4f4`) |

---

## Section 2 — Live source file state

### 2.1 anthropic-adapter.ts

`wc -l`: 1238 lines.

Live line 408 verbatim:

```typescript
3. Return confidence scores as a decimal probability ratio between 0.0 and 1.0 for each component and overall (e.g., 0.95 means high confidence; 0.50 means uncertain). Do NOT emit integer percentages such as 95 or 90 — emit ratio form 0.95 and 0.90 instead.
```

`grep -nE "0-100|0\.0.*1\.0|decimal.*ratio|integer.*percent" web/src/lib/ai/providers/anthropic-adapter.ts` (verbatim, abbreviated):

```
83:  "confidence": 0-100,
97:  ... "confidence": 0-100 }
99:  "confidence": 0-100,
111:  "confidence": 0-100,
179:      "confidence": 60-100,
408:3. Return confidence scores as a decimal probability ratio between 0.0 and 1.0 for each component and overall (...)
688:2. Provide confidence scores (0-100) for each mapping
700:    ... "confidence": 0-100 }
702:  "confidence": 0-100,
724:  "confidence": 0-100,
735:  "confidence": 0-100,
746:  "confidence": 0-100,
766:  "confidence": 0-100
774:  "confidence": 0-100
790:- confidence: 0.0 to 1.0
842:  "confidence": 0-100,
1070:      "confidence": 0-100,
1080:  "confidence": 0-100,
1101:  ... "confidence": 0-100, ...
1107:  "overallConfidence": 0-100,
1125:  "mappings": [{ ..., "confidence": 0-100, ...
1131:  "overallConfidence": 0-100,
1182:Provide your assessment as a JSON object with "assessment" (text with line breaks) and "confidence" (0-100).`;
1189:Provide your response as a JSON object with "narrative" (text) and "confidence" (0-100).`;
```

Within the `plan_interpretation` template (lines 185–593), only line 408 mentions confidence-format, and it is the post-Phase-2 ratio-form. All other `(0-100)` occurrences are in OTHER templates: `file_classification` (lines 73-86), `sheet_classification` (87-101), `field_mapping` (103-114), `field_mapping_second_pass` (115-184), `workbook_analysis` (595-664), `import_field_mapping` (666-693), `entity_extraction` (695-704), `anomaly_detection` (706-727), `recommendation` (728-748), and other templates downstream. **HF-214 Phase 2 amended only the `plan_interpretation` template; other templates retain `(0-100)` mandates.**

### 2.2 ai-plan-interpreter.ts

`wc -l`: 616 lines.

Live lines 213, 218–232, 262 verbatim:

```typescript
213:      confidence: this.normalizeConfidence(parsed.confidence, 'interpretation.confidence', 0),
...
218:  // HF-214 Phase 2 (B2): structural normalization for AI-emitted confidence values.
219:  // Confidence is a decimal probability ratio in [0, 1]. Values > 1 are treated as
220:  // percentage-encoded and rescaled by /100; values < 0 clamp to 0. Original-vs-normalized
221:  // divergence is logged so upstream prompt drift is observable.
222:  private normalizeConfidence(raw: unknown, fieldPath: string, fallback: number): number {
223:    const original = Number(raw);
224:    if (!Number.isFinite(original)) return fallback;
225:    let normalized = original;
226:    if (normalized > 1) normalized = normalized / 100;
227:    if (normalized < 0) normalized = 0;
228:    if (normalized !== original) {
229:      console.warn(`[AIPlanInterpreter] confidence normalized: field=${fieldPath} original=${original} normalized=${normalized}`);
230:    }
231:    return normalized;
232:  }
...
262:        confidence: this.normalizeConfidence(c.confidence, `interpretation.components[${index}].confidence`, 0.5),
```

`grep -n "normalizeConfidence|\.confidence|Number\(.*confidence\)|/100" web/src/lib/compensation/ai-plan-interpreter.ts`:

```
161:      console.log('Confidence:', (response.confidence * 100).toFixed(1) + '%');
178:        console.log(`  ${i + 1}. ${comp.name} (${comp.type}) - ${comp.confidence}% confidence`);
182:      console.log('Overall confidence:', interpretation.confidence);
213:      confidence: this.normalizeConfidence(parsed.confidence, 'interpretation.confidence', 0),
220:  // percentage-encoded and rescaled by /100; values < 0 clamp to 0. Original-vs-normalized
222:  private normalizeConfidence(raw: unknown, fieldPath: string, fallback: number): number {
226:    if (normalized > 1) normalized = normalized / 100;
262:        confidence: this.normalizeConfidence(c.confidence, `interpretation.components[${index}].confidence`, 0.5),
```

### 2.3 signal-persistence.ts

`wc -l`: 242 lines.

`grep -nE "SignalPersistence] (Failed to persist|Batch failed|signal_type=|row=|confidence clamped)" web/src/lib/ai/signal-persistence.ts` (verbatim):

```
73:      console.warn(`[SignalPersistence] confidence clamped: original=${original} clamped=${clamped} signal_type=${signal.signalType} metric_name=${String(metricName)} component_index=${String(componentIndex)}`);
92:      console.error('[SignalPersistence] Failed to persist signal:', error.message, '| signal_type:', signal.signalType, '| tenant:', signal.tenantId);
98:      console.error(`[SignalPersistence] signal_type=${signal.signalType} confidence=${String(signal.confidence)} metric_name=${String(metricName)} component_index=${String(componentIndex)} signal_value_truncated=${svTruncated}`);
137:    console.warn (... clamped warning, batch path ...)  -- actually at line 147
147:          console.warn(`[SignalPersistence] confidence clamped: original=${original} clamped=${clamped} signal_type=${s.signalType} metric_name=${String(metricName)} component_index=${String(componentIndex)}`);
169:      console.error('[SignalPersistence] Batch failed:', error.message, '| count:', signals.length, '| tenant:', signals[0]?.tenantId);
177:        console.error(`[SignalPersistence] row=${i} signal_type=${s.signalType} confidence=${String(s.confidence)} metric_name=${String(metricName)} component_index=${String(componentIndex)} signal_value_truncated=${svTruncated}`);
```

**Clamp lines (62–76 single, 135–149 batch) precede inserts (77, 164).** **Phase 1 catch-block lines (91–100 single, 168–179 batch) byte-identical to HF-214 Phase 1 (PR #380).** No domain or language literals; only `Math.min`, `Math.max`, value `0.9999`, and `[SignalPersistence]` log marker.

### 2.4 Verdict

| Item | Status |
|---|---|
| B1 (line 408 amendment) present | Y |
| B2 (`normalizeConfidence`) present at correct call sites (213, 262) | Y |
| A clamp present in `persistSignal` | Y (lines 62-76, before insert at 77) |
| A clamp present in `persistSignalBatch` | Y (lines 135-149, before insert at 164) |
| Phase 1 catch-block instrumentation byte-identical to PR #380 | Y |
| No domain-specific or language-specific literals | Y |

---

## Section 3 — Reader audit on `classification_signals.confidence`

### 3.1 Files referencing `classification_signals` (24 files)

```
web/src/app/api/ai/calibration/route.ts
web/src/app/api/ai/metrics/route.ts
web/src/app/api/import/sci/trace/route.ts
web/src/app/api/ingest/classification/route.ts
web/src/app/api/platform/observatory/route.ts
web/src/app/api/signals/route.ts
web/src/contexts/session-context.tsx
web/src/lib/agents/agent-memory.ts
web/src/lib/ai/signal-persistence.ts
web/src/lib/ai/training-signal-service.ts
web/src/lib/data/persona-queries.ts
web/src/lib/data/platform-queries.ts
web/src/lib/intelligence/ai-metrics-service.ts
web/src/lib/intelligence/classification-signal-service.ts
web/src/lib/intelligence/convergence-service.ts
web/src/lib/sci/classification-signal-service.ts
web/src/lib/sci/contextual-reliability.ts
web/src/lib/sci/header-comprehension.ts
web/src/lib/sci/seed-priors.ts
web/src/lib/signals/briefing-signals.ts
web/src/lib/signals/stream-signals.ts
web/src/lib/supabase/data-service.ts
web/src/lib/supabase/database.types.ts
web/src/scripts/clear-tenant.ts
```

### 3.2 Per-reader behavioral audit (readers of `classification_signals.confidence`)

**Reader: `classifyAction` in `ai-metrics-service.ts:133-135` (verbatim)**

```typescript
if (signal.confidence !== null) {
  if (signal.confidence >= 0.95) return 'accepted';
  if (signal.confidence < 0.3) return 'rejected';
}
```

- Behavioral analysis: threshold-based action classification (`>=0.95` → accepted; `<0.3` → rejected).
- Output for `confidence=0.9999` vs `confidence=1.0`: SAME (both `>=0.95` → 'accepted').

**Reader: `computeCalibrationMetrics` in `ai-metrics-service.ts:208-235`**

Top bucket definition: `{ range: '0.95-1.00', min: 0.95, max: 1.01 }`. Bucket assignment via `s.confidence >= b.min && s.confidence < b.max`.

- Output for `confidence=0.9999` vs `confidence=1.0`: SAME (both fall into the same `[0.95, 1.01)` bucket).

**Reader: `persona-queries.ts:692-718`**

```typescript
if (src === 'user_confirmed' || (s.confidence != null && s.confidence >= 0.95)) { ... }
else if (s.confidence != null && s.confidence < 0.3) { ... }
```

- Output for `0.9999` vs `1.0`: SAME (both `>=0.95`).

**Reader: `classification-signal-service.ts:236-260` (sort + threshold)**

```typescript
// Then by confidence
if (b.confidence !== a.confidence) return b.confidence - a.confidence;
// Then by recency
return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
...
if (best.confidence >= threshold) { ... }   // threshold default 0.85
```

- Output for `0.9999` vs `1.0`: same threshold gate (both `>=0.85`); sort tiebreak edge case — when one signal at clamped 0.9999 sorts vs another at unclamped 1.0, the 1.0 sorts strictly above; if both clamped to 0.9999 they tie and recency breaks. Behavioral effect: marginal sort-order change in the rare two-signal-with-clamp-bordering case.

### 3.3 Other `0.9999` and near-1.0 hardcode sites

**`grep -rn "0\.9999"` (verbatim):**

```
web/src/lib/ai/signal-persistence.ts:68:      const clamped = Math.min(Math.max(original, 0), 0.9999);
web/src/lib/ai/signal-persistence.ts:142:        const clamped = Math.min(Math.max(original, 0), 0.9999);
```

**Only the two new HF-214 Phase 2 clamp sites use `0.9999`. No prior usage anywhere in the codebase.**

**`grep -rnE "0\.99([^0-9]|$)" web/src/`** (writers producing values at clamp boundary, verbatim):

```
web/src/lib/intelligence/ai-metrics-service.ts:126: * - confidence >= 0.99 with user_corrected → corrected
web/src/lib/intelligence/classification-signal-service.ts:14: * - user_corrected: 0.99 (user provided explicit correction)
web/src/lib/intelligence/classification-signal-service.ts:156: * Escalates confidence to 0.99.
web/src/lib/intelligence/classification-signal-service.ts:170:    confidence: 0.99,
web/src/lib/ai/training-signal-service.ts:112:      confidence: action === 'accepted' ? 0.95 : action === 'corrected' ? 0.99 : 0,
```

**Writers producing exactly `1.0` (now subject to clamp → 0.9999):**

```
web/src/app/api/import/sci/execute/route.ts:432:              confidence: 1.0,
web/src/app/api/approvals/[id]/route.ts:175:      confidence: 1.0,
web/src/app/data/import/enhanced/page.tsx:611:      return { targetField: field.id, confidence: 1.0 };
web/src/components/forensics/ComparisonUpload.tsx:135:        confidence: 1.0,
web/src/lib/sci/content-profile.ts:91:  if (nonNull.length === 0) return { dataType: 'text', confidence: 1.0, ... };
web/src/lib/agents/reconciliation-agent.ts:127:    return { classification: 'match', confidence: 1.0, evidence: { reason: 'within_tolerance' } };
web/src/lib/forensics/trace-builder.ts:135:      confidence: 1.0,
web/src/lib/forensics/trace-builder.ts:147:      confidence: 1.0,
web/src/lib/forensics/trace-builder.ts:161:        confidence: 1.0,
web/src/lib/canvas/graph-service.ts:316:      confidence: 1.0,
web/src/lib/canvas/graph-service.ts:339:      confidence: 1.0,
web/src/lib/calculation/calculation-lifecycle-service.ts:464:    confidence: 1.0,
```

**Reader sensitivity at clamp boundary** (`grep -rnE "confidence\s*(===|==|>=|<=|>|<)\s*1[^0-9]|...== 1\.0"`):

```
web/src/components/forensics/ExecutionTraceView.tsx:179:              {trace.confidence >= 1 ? 'Deterministic' : `${(trace.confidence * 100).toFixed(0)}%`}
```

**Behavioral analysis of ExecutionTraceView.tsx:179:**
- `confidence=1.0` displays "Deterministic"
- `confidence=0.9999` displays `${(0.9999 * 100).toFixed(0)}%` = "100%"
- **DIFFERENT output strings.**
- However: this reader operates on `trace.confidence` (an in-memory value constructed by `lib/forensics/trace-builder.ts:135/147/161` — local trace data, never persisted to `classification_signals` table). The HF-214 Phase 2 clamp does NOT affect this reader because the clamp fires on writes to `classification_signals`; `trace.confidence` is never written there.

### 3.4 Other clamp / normalizer sites

**`Math.min(Math.max(...))` clamps:**

```
web/src/components/design-system/ProgressRing.tsx:29:      setAnimatedPct(Math.min(Math.max(pct, 0), 100));
web/src/lib/ai/signal-persistence.ts:68:      const clamped = Math.min(Math.max(original, 0), 0.9999);
web/src/lib/ai/signal-persistence.ts:142:        const clamped = Math.min(Math.max(original, 0), 0.9999);
```

**`/100` normalizers (compensation/intelligence/ai paths):**

```
web/src/lib/ai/file-classifier.ts:62:    const confidence = data.confidence / 100; // Convert to 0-1
web/src/lib/ai/file-classifier.ts:152:  const confNorm = classification.confidence / 100;
web/src/lib/ai/providers/anthropic-adapter.ts:974:      ? result.confidence / 100
web/src/lib/compensation/ai-plan-interpreter.ts:226:    if (normalized > 1) normalized = normalized / 100;
```

**Critical interaction site — `anthropic-adapter.ts:973-975` (verbatim):**

```typescript
const confidence = typeof result.confidence === 'number' && result.confidence > 0
  ? result.confidence / 100
  : 0;
```

- This pre-existing producer-side normalizer ALWAYS divides by 100 unconditionally when the AI returns a positive confidence number.
- Pre-Phase-2 (AI emits 95 percent): `95 / 100 = 0.95` (correct ratio).
- Post-Phase-2 with B1 (AI emits 0.95 ratio per amended prompt): `0.95 / 100 = 0.0095` (under-divided 100x).
- The result is stored on `AIResponse.confidence` (top-level), distinct from `AIResponse.result.confidence` (raw AI value, untouched).
- B2 (`ai-plan-interpreter.ts:213, 262`) reads `parsed.confidence` (= `response.result.confidence`, raw); B2's normalization correctly produces ratio form.
- Consumers of the affected `response.confidence`:
  ```
  web/src/app/api/interpret-import/route.ts:99:      confidence: response.confidence * 100,
  web/src/app/api/analyze-workbook/route.ts:187:      confidence: response.confidence * 100,
  web/src/app/api/ai/classify-file/route.ts:78:      confidence: response.confidence * 100, // Return as 0-100
  web/src/app/api/import/sci/execute/route.ts:1345,1596:      planConfidence: response.confidence,
  web/src/lib/ai/training-signal-service.ts:73:      confidence: response.confidence,
  ```

### 3.5 Verdict

| Item | Status |
|---|---|
| Total files referencing `classification_signals` | 24 |
| Readers of `classification_signals.confidence` audited | 5 functional sites |
| Readers where output for `0.9999` differs behaviorally from `1.0` | 0 (all threshold gates use `>=0.85`/`>=0.95`/`>=0.99`; both pass) |
| In-memory readers with `>= 1.0` literal sensitivity | 1 (`ExecutionTraceView.tsx:179` — operates on `trace.confidence`, NOT `classification_signals.confidence`) |
| Other `0.9999` hardcode sites | 0 (only the two new HF-214 Phase 2 clamp sites) |
| Other `Math.min(Math.max(...))` clamp sites | 1 (`ProgressRing.tsx:29` — UI percentage clamp 0–100, unrelated to confidence convention) |
| Other `/100` normalizer sites | 4 (file-classifier × 2; anthropic-adapter:974; ai-plan-interpreter:226 — the new B2) |

---

## Section 4 — Database state

### 4.1 Comprehension signal persistence

`classification_signals` aggregated by `signal_type` for Meridian tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79` (verbatim):

```
classification:ai_document_analysis: count=1 min=0.95 max=0.95 avg=0.9500
classification:outcome: count=3 min=0.85 max=0.9 avg=0.8833
comprehension:ai_plan_interpretation: count=1 min=0.0093 max=0.0093 avg=0.0093
comprehension:plan_interpretation: count=10 min=0.9 max=0.95 avg=0.9400
convergence:dual_path_concordance: count=3 min=0 max=0 avg=0.0000
cost:event: count=2 min=0.9999 max=0.9999 avg=0.9999
lifecycle:synaptic_consolidation: count=15 min=null max=null avg=n/a
```

### 4.2 Distinct (signal_type, confidence) values for Meridian tenant

```
classification:ai_document_analysis	confidence=0.95	count=1
classification:outcome	confidence=0.9	count=2
classification:outcome	confidence=0.85	count=1
comprehension:ai_plan_interpretation	confidence=0.0093	count=1
comprehension:plan_interpretation	confidence=0.95	count=8
comprehension:plan_interpretation	confidence=0.9	count=2
convergence:dual_path_concordance	confidence=0	count=3
cost:event	confidence=0.9999	count=2
```

### 4.3 Confidence distribution buckets (Meridian tenant)

```json
{
  "null_count": 15,
  "exact_0": 3,
  "range_0_to_05": 1,
  "range_05_to_09": 1,
  "range_09_to_09999": 13,
  "exact_09999_clamp": 2,
  "over_09999": 0,
  "exact_1": 0
}
```

### 4.4 Global confidence buckets across all tenants

```json
{
  "exact_09999": 2,
  "exact_1": 30,
  "gt_09999_lt_1": 0,
  "gt_1": 0,
  "total": 73
}
```

### 4.5 Verdict

| Item | Value |
|---|---|
| `comprehension:plan_interpretation` row count (Meridian) | 10 (matches HF-214 Phase 2 §5 prediction; B2 worked) |
| Meridian rows with `confidence = 1.0` | 0 (clamp prevents 1.0 entries) |
| Meridian rows with `confidence > 0.9999` | 0 (clamp working) |
| Meridian rows with `confidence = exact 0.9999` (clamp fired) | 2 — both `cost:event` signal_type |
| Meridian rows with `confidence = 0.0093` | 1 — the `comprehension:ai_plan_interpretation` signal_type (DIAG-037 noted this is a separate signal_type from `comprehension:plan_interpretation`) |
| Global rows with `confidence = exact 0.9999` | 2 (= the Meridian `cost:event` rows) |
| Global rows with `confidence = exact 1.0` | 30 (writers producing exact 1.0; either pre-Phase-2 historical OR signal writes that bypass `persistSignal`/`persistSignalBatch`) |

**Empirical observations:**

1. The `comprehension:plan_interpretation` write succeeded post-Phase-2 (10 rows persisted; convention violation closed).
2. Phase 2's writer-side clamp empirically fired on 2 `cost:event` rows — at least one writer of that signal_type was producing values > 0.9999 prior to clamp insertion.
3. The `comprehension:ai_plan_interpretation` row at confidence=0.0093 is empirically consistent with the anthropic-adapter.ts:974 `/100` over-division: a value 0.93 (ratio per B1 prompt) divided by 100 again → 0.0093. (Distinct signal_type from `:plan_interpretation`; written via a different code path.)
4. 30 rows globally at exactly 1.0 — these are not subject to the new clamp (they pre-date Phase 2, OR they are written via direct `supabase.from('classification_signals').insert(...)` calls that bypass the `persistSignal`/`persistSignalBatch` API).

---

## Section 5 — Per-entity calculation comparison (pre/post Phase 2)

### 5.1 Calculation runs identified

`calculation_runs` table does NOT exist in the live schema (Postgrest returned `PGRST205`). The calculation lineage tables are `calculation_batches` and `calculation_results`.

Full Meridian `calculation_batches` history (verbatim, all 3 rows):

```
[POST] 2026-05-09T13:17:15.630152+00:00 batch=7ca6e1bb-030a-4929-924a-231e7e189984 rule_set=cf64da66 period=2d8cdd6a state=PREVIEW entities=67 total_payout=57534
[POST] 2026-05-09T13:17:08.650278+00:00 batch=226cf1b7-9074-4740-a3f9-997e79c55525 rule_set=cf64da66 period=831b4b0a state=PREVIEW entities=67 total_payout=53559
[POST] 2026-05-09T13:17:01.511235+00:00 batch=49dc50c7-88a2-43c4-b477-ab65c62c2dd8 rule_set=cf64da66 period=d4055e06 state=PREVIEW entities=67 total_payout=55909
```

Phase 2 merge cut-line: `2026-05-09T13:11:24Z`.

**All three Meridian batches are POST-Phase-2** (created 5–6 minutes after the squash-merge). No pre-Phase-2 baseline exists in the database.

### 5.2 Per-entity comparison

**Cannot be performed.** No pre-Phase-2 batch exists for the same `(tenant_id, rule_set_id, period_id)` triple in `calculation_batches`. Per directive Phase 5.1: "If two calculation_runs flanking the merge cannot be identified for the same tenant + rule_set_id + period_id, halt and surface to architect-channel."

The three POST-Phase-2 batches each compute a different period (`2d8cdd6a`, `831b4b0a`, `d4055e06`) — no two batches share the same `period_id` to enable a same-period pre/post comparison.

### 5.3 Aggregate comparison

**Cannot be performed** for the same reason as 5.2.

The three POST-Phase-2 batches show:

| Run | Created at | Period | Entity count | total_payout |
|---|---|---|---|---|
| Batch `7ca6e1bb` | 2026-05-09T13:17:15Z | `2d8cdd6a` | 67 | 57,534 |
| Batch `226cf1b7` | 2026-05-09T13:17:08Z | `831b4b0a` | 67 | 53,559 |
| Batch `49dc50c7` | 2026-05-09T13:17:01Z | `d4055e06` | 67 | 55,909 |

### 5.4 Component-level change counts

**Cannot be computed.** No pre-Phase-2 baseline.

### 5.5 Halt-condition status (Phase 5)

| Condition (per directive Phase 5.1) | Status |
|---|---|
| Two batches flanking merge for same `(tenant, rule_set, period)` | NOT FOUND — only POST-Phase-2 batches exist; no PRE-Phase-2 baseline in the database |

CC documents this empirical condition in the report; CC does not interpret what the absence of pre-Phase-2 baseline data means. Architect dispositions.

---

## Section 6 — Ratio-by-100 scaling location

### 6.1 Multiplication-by-100 sites in calc/compensation paths

`grep -rn '\* 100|\*100' web/src/lib/calculation/ web/src/app/api/calculation/` (verbatim):

```
web/src/lib/calculation/engine.ts:103:  const attainmentPercentage = quotaAmount > 0 ? (attainedAmount / quotaAmount) * 100 : 0;
web/src/lib/calculation/engine.ts:113:  const ytdPercentage = ytdQuota > 0 ? (ytdAttained / ytdQuota) * 100 : 0;
web/src/lib/calculation/run-calculation.ts:752:        resolvedMetrics[metricName] = v * 100;
web/src/lib/calculation/run-calculation.ts:1395:          metrics[key] = value * 100;
web/src/lib/calculation/results-formatter.ts:175:      inputDetails['Attainment'] = `${(step.inputs.attainment * 100).toFixed(1)}%`;
web/src/lib/calculation/results-formatter.ts:291:        legacyResult.COMP_A_ATTAINMENT = inputs.attainment ? inputs.attainment * 100 : 0;
web/src/lib/calculation/results-formatter.ts:297:        legacyResult.COMP_B_ATTAINMENT = inputs.attainment ? inputs.attainment * 100 : 0;
web/src/app/api/calculation/run/route.ts:599:          addLog(`HF-181: ... ${(matchRate * 100).toFixed(0)}%) ...`);
web/src/app/api/calculation/run/route.ts:1793:            metrics[key] = value * 100;
web/src/app/api/calculation/run/route.ts:1798:              metrics[key] = value * 100;
web/src/app/api/calculation/run/route.ts:2066:  const concordanceRate = (intentMatchCount / calculationEntityIds.length) * 100;
web/src/app/api/calculation/run/route.ts:2221: ... ((intentMatchCount / calculationEntityIds.length) * 100).toFixed(1) + '%' ...
web/src/app/api/calculation/run/route.ts:2460: ... ((intentMatchCount / calculationEntityIds.length) * 100).toFixed(1) + '%' ...
```

### 6.2 scale_factor application sites

```
web/src/app/api/calculation/run/route.ts:1175:    scale_factor?: number;
web/src/app/api/calculation/run/route.ts:1213:      if (numBinding.scale_factor) numValue = numValue !== null ? numValue * numBinding.scale_factor : null;
web/src/app/api/calculation/run/route.ts:1214:      if (denBinding.scale_factor) denValue = denValue !== null ? denValue * denBinding.scale_factor : null;
web/src/app/api/calculation/run/route.ts:1244:      if (actualBinding.scale_factor) actualValue *= actualBinding.scale_factor;
web/src/app/api/calculation/run/route.ts:1258:        if (targetBinding.scale_factor && targetValue !== null) targetValue *= targetBinding.scale_factor;
web/src/lib/intelligence/convergence-service.ts:91:  scale_factor?: number;
web/src/lib/intelligence/convergence-service.ts:454:      const scaleFactor = detectBoundaryScale(ruleSet.components, comp.index);
web/src/lib/intelligence/convergence-service.ts:463:        scale_factor: scaleFactor,
... (other convergence-service references continue)
```

### 6.3 Ratio-handling code paths (verbatim excerpts)

**`route.ts:1201-1228` — convergence-binding ratio resolution:**

```typescript
1201:    // HF-111: Ratio input — resolve both numerator and denominator
1202:    if (numBinding?.source_batch_id && numBinding?.column &&
1203:        denBinding?.source_batch_id && denBinding?.column) {
1204:      const rawNumValue = resolveColumnFromBatch(...);
1207:      const rawDenValue = resolveColumnFromBatch(...);
1211:      let numValue = rawNumValue;
1212:      let denValue = rawDenValue;
1213:      if (numBinding.scale_factor) numValue = numValue !== null ? numValue * numBinding.scale_factor : null;
1214:      if (denBinding.scale_factor) denValue = denValue !== null ? denValue * denBinding.scale_factor : null;
1220:      if (numValue !== null && denValue !== null && denValue !== 0) {
1221:        metrics[expectedMetrics[0]] = numValue / denValue;
1222:      }
1227:      return result;
1228:    }
```

The ratio resolution at line 1221 produces a pure ratio (`numerator / denominator`). NO `* 100` here.

**`route.ts:1789-1801` — band-aware ×100 scaling (the DIAG-035 finding):**

```typescript
1789:        for (const [key, value] of Object.entries(metrics)) {
1790:          const bandMax = bandMaxByMetric[key];
1791:          if (bandMax !== undefined && bandMax > 10 && value > 0 && value < 10) {
1792:            // Metric is in decimal range but band expects percentage → scale ×100
1793:            metrics[key] = value * 100;
1794:          } else if (bandMax === undefined) {
1795:            // No band references this metric — fall back to semantic type detection
1796:            // (handles derived metrics and other non-band-referenced inputs)
1797:            if (inferSemanticType(key) === 'attainment' && value > 0 && value < 10) {
1798:              metrics[key] = value * 100;
1799:            }
1800:          }
1801:        }
```

**This is the ratio-by-100 site.** When a metric is a ratio (in decimal/0-10 range) and the band expects percentage scale (>10), the metric is multiplied by 100 before band lookup.

**`intent-executor.ts:299-310` — scalar_multiply (verbatim):**

```typescript
299: function executeScalarMultiply(
300:   op: ScalarMultiply,
301:   data: EntityData,
302:   inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
303:   trace: Partial<ExecutionTrace>
304: ): Decimal {
305:   const inputValue = resolveValue(op.input, data, inputLog, trace);
306:   const rateValue = typeof op.rate === 'number'
307:     ? toDecimal(op.rate)
308:     : resolveValue(op.rate, data, inputLog, trace);
309:   return inputValue.mul(rateValue);
310: }
```

Pure `inputValue × rateValue`. **No `* 100` in scalar_multiply.**

### 6.4 Phase 2 commit overlap

Phase 2 commits (`72571889` + `b26ece05`) modified only:

```
docs/completion-reports/HF-214_Phase2_COMPLETION_REPORT_Confidence_Convention_Enforcement.md
web/src/lib/ai/providers/anthropic-adapter.ts
web/src/lib/ai/signal-persistence.ts
web/src/lib/compensation/ai-plan-interpreter.ts
```

The ratio-by-100 scaling sites are at:

```
web/src/app/api/calculation/run/route.ts:1793   (band-aware × 100)
web/src/app/api/calculation/run/route.ts:1798   (semantic-type fallback × 100)
web/src/lib/calculation/run-calculation.ts:752  (similar pattern)
web/src/lib/calculation/run-calculation.ts:1395 (similar pattern)
```

**None of these files were modified by HF-214 Phase 2.**

### 6.5 Verdict

| Item | Value |
|---|---|
| File containing the c4-relevant ratio-by-100 multiplication | `web/src/app/api/calculation/run/route.ts:1793` and `:1798` |
| Phase 2 modified `route.ts` | N |
| Phase 2 modified `run-calculation.ts` | N |
| Phase 2 modified `intent-executor.ts` | N |
| HF-214 Phase 2 affects the ratio-handling surface | N |

---

## Section 7 — Halt conditions evaluation

| Halt condition (per directive) | Triggered? | Notes |
|---|---|---|
| 1. Phase 2 commits not on main, or content differs from Phase 2 completion report | N | Squash-merged; commit `5418f4f4` on main contains the equivalent diff |
| 2. Phase 2 source modifications not present in live source files | N | All three source mods (B1, B2, A) verified live |
| 3. Reader of confidence treats `0.9999` ≠ `1.0` | N (for `classification_signals.confidence` readers); 1 in-memory reader sensitive (`ExecutionTraceView.tsx:179` reads `trace.confidence`, not classification_signals) | See Section 3.5 |
| 4. Ratio-by-100 in code path PR #381 modified | N | The ratio-by-100 sites are in `route.ts` and `run-calculation.ts`; neither was modified by Phase 2 |
| 5. Per-entity values bit-identical pre/post Phase 2 | UNDECIDABLE — no pre-Phase-2 baseline in database (only POST-Phase-2 batches exist) | See Section 5 |
| 6. Per-entity values changed in unexpected components | UNDECIDABLE — same as 5 | See Section 5 |

---

## Section 8 — Summary tables

### 8.1 What HF-214 Phase 2 changed

| Change | Live confirmation |
|---|---|
| AI prompt amended (B1) | `anthropic-adapter.ts:408` — "Return confidence scores as a decimal probability ratio between 0.0 and 1.0 ... Do NOT emit integer percentages such as 95 or 90 — emit ratio form 0.95 and 0.90 instead." |
| Response normalizer added (B2) | `ai-plan-interpreter.ts:222-232` — `private normalizeConfidence(raw: unknown, fieldPath: string, fallback: number): number { ... if (normalized > 1) normalized = normalized / 100; ... }` |
| Writer clamp added (A) | `signal-persistence.ts:62-76` (single) + `:135-149` (batch) — `Math.min(Math.max(original, 0), 0.9999)` with warning log |

### 8.2 What HF-214 Phase 2 did NOT change

| Surface | Confirmation |
|---|---|
| `web/src/app/api/calculation/run/route.ts` ratio handling | NOT modified by PR #381 |
| `web/src/lib/calculation/intent-executor.ts` scalar_multiply | NOT modified by PR #381 |
| `web/src/lib/calculation/run-calculation.ts` × 100 sites | NOT modified by PR #381 |
| `web/src/lib/intelligence/convergence-service.ts` | NOT modified by PR #381 |
| `web/src/lib/compensation/plan-comprehension-emitter.ts` | NOT modified by PR #381 |
| `classification_signals` schema (migration files) | NOT modified by PR #381 |
| `web/src/lib/ai/providers/anthropic-adapter.ts:973-975` `/100` normalizer | NOT modified by PR #381 (pre-existing code) |
| Other prompt templates inside `anthropic-adapter.ts` (file_classification, sheet_classification, field_mapping, workbook_analysis, import_field_mapping, entity_extraction, anomaly_detection, recommendation, etc.) | NOT modified by PR #381 — `(0-100)` mandates remain |

### 8.3 Empirical impact on calculation surface

| Metric | Value |
|---|---|
| Pre-Phase-2 calculation_batches in DB for Meridian | 0 |
| Post-Phase-2 calculation_batches in DB for Meridian | 3 (different periods: `2d8cdd6a`, `831b4b0a`, `d4055e06`) |
| Grand total delta pre/post | UNDECIDABLE (no pre-Phase-2 baseline) |
| c0/c1/c2/c3/c4 component change count | UNDECIDABLE (no pre-Phase-2 baseline) |

### 8.4 Empirical impact on signal surface

| Metric | Value |
|---|---|
| `comprehension:plan_interpretation` rows pre-Phase-2 (Meridian) | 0 (per DIAG-037) |
| `comprehension:plan_interpretation` rows post-Phase-2 (Meridian) | 10 |
| Confidence range of `comprehension:plan_interpretation` rows | [0.9, 0.95] (correct ratio form) |
| Rows with `confidence = exact 0.9999` (clamp fired, Meridian) | 2 (`cost:event` signal_type) |
| Rows with `confidence = exact 0.9999` (clamp fired, global) | 2 |
| Rows with `confidence = exact 1.0` (Meridian) | 0 |
| Rows with `confidence = exact 1.0` (global) | 30 (pre-Phase-2 historical OR signals written via direct `supabase.from(...).insert()` bypassing `persistSignal`) |
| Rows with `confidence > 0.9999` AND `< 1.0` (global) | 0 |
| `comprehension:ai_plan_interpretation` rows (Meridian, distinct signal_type) | 1 at `confidence=0.0093` (consistent with `anthropic-adapter.ts:974` `/100` over-division when AI emits ratio per amended B1 prompt) |

---

## Section 9 — At-close verification

- ☑ All 7 phases executed (Phase 5 documented "no pre-Phase-2 baseline" empirically; partial-result documented per directive)
- ☑ All halt conditions evaluated and reported (Section 7)
- ☑ Zero source files modified outside the completion report (`git status` shows only this completion report file as new)
- ☑ All evidence captured verbatim (no interpretation, no narrative, only structured tables and verbatim excerpts)
- ☑ Section 8 tables fully populated
- ☑ "COMPLETION REPORT" appears in H1 title and filename
- ☐ PR opened with `--base main --head diag-038-hf-214-phase2-audit` (populated post-PR-creation)
