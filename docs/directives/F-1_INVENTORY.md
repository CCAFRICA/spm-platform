# F-1 Inventory — Writer Sites Outside OB-197 Directive Scope

**Source:** OB-197 completion report §F-1 finding.
**As of:** Branch `ob-197-signal-surface-rebuild` HEAD `1afa7504`, after migration 024 applied live + Phase 2 vocabulary alignment of the directive's 8 sites.
**Schema state:** CHECK constraint `classification_signals_signal_type_vocabulary_chk` is **live** in production. Every writer below currently produces silent INSERT failures (each is wrapped in a `.catch(...)` that swallows the error) when its code path executes.
**Capture method:**
```bash
grep -rnE "signalType:\s*['\"][^'\"]+['\"]|signal_type:\s*['\"][^'\"]+['\"]|signalType:\s*\`[^\`]*\\\$\\{" web/src
grep -rnE "startsWith\('training:'\)|startsWith\('sci:'\)" web/src
```
Filtered to writes (literals in INSERT-bearing positions or template literals into `persistSignal`) and reads (filters on legacy prefixes). Type-definition lines in `web/src/lib/sci/sci-signal-types.ts` are excluded (they are TypeScript discriminated-union member types preserved in `signal_value.sci_internal_type` per OB-197 Phase 2; never become DB `signal_type` directly). Read-side filters that pass-through caller-supplied `signalType` (`signals/route.ts`, `data-service.ts`, `signal-persistence.ts:140`) are excluded — they don't bind a literal.

---

## Writers (12 — all currently rejected by CHECK constraint)

| # | File | Line | Current literal | Proposed prefix-form | Reasoning |
|---|---|---|---|---|---|
| W-1 | `web/src/app/api/reconciliation/run/route.ts` | 132 | `'training:reconciliation_outcome'` | `'convergence:reconciliation_outcome'` | Reconciliation compares calc output vs. source-of-record — a convergence observation per DS-021 §3 Role 4 |
| W-3 | `web/src/app/api/reconciliation/compare/route.ts` | 159 | `'training:reconciliation_comparison'` | `'convergence:reconciliation_comparison'` | Same level as W-1 |
| W-5 | `web/src/app/api/calculation/run/route.ts` | 1864 | `'training:synaptic_density'` (default fallback in `??`) | `'lifecycle:synaptic_consolidation'` | Default fallback runs only when upstream `signal.signalType` is undefined; pattern-density updates are lifecycle events of pattern consolidation |
| W-6 | `web/src/app/api/calculation/run/route.ts` | 1877 | `'training:dual_path_concordance'` | `'convergence:dual_path_concordance'` | Concordance between AI path and deterministic path is a convergence observation (per DS-021 §3 Role 4) |
| W-7 | `web/src/app/api/ai/assessment/route.ts` | 180 | `'training:assessment_generated'` | `'lifecycle:assessment_generated'` | Assessment generation is a lifecycle event |
| W-8 | `web/src/app/api/approvals/[id]/route.ts` | 167 | `'training:lifecycle_transition'` | `'lifecycle:transition'` | Direct lifecycle event |
| W-9 | `web/src/app/data/import/enhanced/page.tsx` | 2252 | `'field_mapping'` | `'comprehension:header_binding'` | Field mapping = header binding (matches OB-197 directive's mapping for `signal-persistence.ts:48,96` per Phase 2A table) |
| W-10 | `web/src/lib/ai/training-signal-service.ts` | 39 | template ``` `training:${response.task}` ``` | `AI_TASK_LEVEL_MAP[response.task]` (typed `Record<AITaskType, string>`) | Architect Option A disposition: per-task semantic-level mapping per DS-021 §3 Role 4 (classification:* / comprehension:* / convergence:* / lifecycle:*). Map authored at top of `training-signal-service.ts`. See "W-10 AI_TASK_LEVEL_MAP" section below for the full mapping. |
| W-11 | `web/src/lib/ai/training-signal-service.ts` | 80 | `'training:user_action'` | `'lifecycle:user_action'` | User-action capture is a lifecycle event |
| W-12 | `web/src/lib/ai/training-signal-service.ts` | 110 | `'training:outcome'` | `'lifecycle:outcome'` | Generic outcome lifecycle event |
| W-13 | `web/src/lib/calculation/synaptic-surface.ts` | 204 | `'training:synaptic_density'` | `'lifecycle:synaptic_consolidation'` | Same as W-5; this is the upstream emitter that W-5 falls back to |
| W-14 | `web/src/lib/calculation/calculation-lifecycle-service.ts` | 457 | `'training:lifecycle_transition'` | `'lifecycle:transition'` | Same as W-8 |

### Reclassified — already aligned via OB-197 Phase 2 mapper (not in OB-198 scope)

The original F-1 enumeration listed three sites that were misdiagnosed as direct DB writers. They are inside `captureSCISignal({ signal: { signalType: <sci internal> } })` calls; the literal at the site is the `SCISignal` discriminated-union member, and `web/src/lib/sci/signal-capture-service.ts` `toPrefixSignalType()` maps it to a prefix-vocabulary value before INSERT. Changing the site literal would break TypeScript's discriminated-union typing.

| # | File | Line | Sci internal literal | DB-bound signal_type (mapper output) | Note |
|---|---|---|---|---|---|
| W-2 (reclassified) | `web/src/app/api/reconciliation/run/route.ts` | 161 | `'convergence_outcome'` | `'convergence:calculation_validation'` | captureSCISignal route — toPrefixSignalType produces convergence:calculation_validation / cost:event before INSERT. SCISignal union discriminator preserved at site (TypeScript requirement). No change. |
| W-4 (reclassified) | `web/src/app/api/reconciliation/compare/route.ts` | 195 | `'convergence_outcome'` | `'convergence:calculation_validation'` | Same as W-2. No change. |
| W-15 (reclassified) | `web/src/lib/ai/ai-service.ts` | 125 | `'cost_event'` | `'cost:event'` | captureSCISignal route — toPrefixSignalType produces cost:event before INSERT. SCISignal union discriminator preserved at site (TypeScript requirement). No change. |

### Cross-references between writers

- **W-5 / W-13 (synaptic):** `synaptic-surface.ts:204` is the upstream emitter; `calculation/run/route.ts:1864` is the orchestrator's default fallback when the upstream emission is missing. Both must change together to the same target so the fallback never produces a different value than the primary path.
- **W-8 / W-14 (lifecycle transition):** Two emitters of the same event type; both → `'lifecycle:transition'`.

### W-10 AI_TASK_LEVEL_MAP (architect-disposed Option A)

The W-10 dynamic-template approach (`comprehension:ai_${response.task}`) was rejected by the §1G HALT discipline because several `AITaskType` members are not unambiguously comprehension-level (DS-021 §3 Role 4). Architect disposition: structured `Record<AITaskType, string>` map at the top of `web/src/lib/ai/training-signal-service.ts` keyed by task, valued by prefix-form `signal_type`:

```ts
const AI_TASK_LEVEL_MAP: Record<AITaskType, string> = {
  // classification: Level 1 — "what kind?"
  file_classification:        'classification:ai_file_classification',
  sheet_classification:       'classification:ai_sheet_classification',
  document_analysis:          'classification:ai_document_analysis',
  // comprehension: Level 2 — "how does it behave?"
  field_mapping:              'comprehension:ai_field_mapping',
  field_mapping_second_pass:  'comprehension:ai_field_mapping_second_pass',
  import_field_mapping:       'comprehension:ai_import_field_mapping',
  header_comprehension:       'comprehension:ai_header_comprehension',
  plan_interpretation:        'comprehension:ai_plan_interpretation',
  workbook_analysis:          'comprehension:ai_workbook_analysis',
  entity_extraction:          'comprehension:ai_entity_extraction',
  // convergence: Level 3 — "what connects to what?"
  convergence_mapping:        'convergence:ai_convergence_mapping',
  anomaly_detection:          'convergence:ai_anomaly_detection',
  // lifecycle: platform output events
  recommendation:             'lifecycle:ai_recommendation',
  narration:                  'lifecycle:ai_narration',
  dashboard_assessment:       'lifecycle:ai_dashboard_assessment',
  natural_language_query:     'lifecycle:ai_natural_language_query',
};
```

W-10 (line 39) becomes: `signalType: AI_TASK_LEVEL_MAP[response.task]`. The `Record<AITaskType, string>` typing makes the map exhaustive — adding a new `AITaskType` member without extending the map produces a `tsc` error. No per-task branching beyond the map; the structured map IS the disposition.

---

## Reads (2 — currently dead-code post-Phase-2 because no row matches `training:` / `sci:` literally)

| # | File | Line | Current pattern | Proposed update |
|---|---|---|---|---|
| R-1 | `web/src/lib/ai/training-signal-service.ts` | 142 | `.filter(row => row.signalType.startsWith('training:'))` | Replace with: filter on the prefix vocabulary used by W-10/W-11/W-12 writers — `comprehension:ai_*`, `lifecycle:user_action`, `lifecycle:outcome`. Cleanest implementation: filter on `row.signalValue?.signalId` presence (the identifying feature of training-signal-service writes), since the prefix list is variadic |
| R-2 | `web/src/app/api/platform/observatory/route.ts` | 429 | `safeSignals.some(s => s.tenant_id === tid && s.signal_type.startsWith('sci:'))` | Replace with: filter on `signal_value.sci_internal_type` presence (preserved by `signal-capture-service.ts` `captureSCISignal/Batch` per OB-197 Phase 2) — that's the durable identifier of an SCI-originated signal under the new vocabulary |

### Other read-site filter sites (NOT NEEDED — pass-through callers, no literal binding)

These accept `signalType` as a parameter and pass it to `.eq('signal_type', signalType)`. Do not need changes; their callers will pass prefix-form values once the writers above are aligned:

- `web/src/app/api/signals/route.ts:44` — `query = query.eq('signal_type', signalType)` (route parameter pass-through)
- `web/src/lib/supabase/data-service.ts:433` — `query.eq('signal_type', options.signalType)` (option pass-through)
- `web/src/lib/ai/signal-persistence.ts:140` — `query.eq('signal_type', signalType)` (function-arg pass-through; already used with prefix-form values by post-OB-197 callers)

---

## Total

- **12 writer sites** require literal updates (11 static + 1 typed map for W-10)
- **2 reader sites** require filter-pattern updates
- **3 sites reclassified** — already aligned via OB-197 Phase 2 `toPrefixSignalType()` mapper (W-2, W-4, W-15); no change
- **Zero schema changes** — CHECK constraint is already live; OB-198 fixes writers/readers, not the constraint

---

## Risk if F-1 is not remediated before PR #353 merges

- Reconciliation `outcome` and `comparison` flows: silent failure
- Calculation orchestrator concordance + synaptic-density signals: silent failure
- AI assessment / approvals lifecycle / training-signal-service captures: silent failure
- AI service cost-event tracking: silent failure
- Cost dashboard, Foundational/Domain flywheel cold-start, training-signal lookup: dead reads (filter against zero rows)

The platform continues to *function* (signals are fire-and-forget; calculations don't depend on them) but the closed-loop intelligence OB-197 was meant to enable starts in a degraded state — exactly the regression OB-197 was meant to close.
