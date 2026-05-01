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

## Writers (15 — all currently rejected by CHECK constraint)

| # | File | Line | Current literal | Proposed prefix-form | Reasoning |
|---|---|---|---|---|---|
| W-1 | `web/src/app/api/reconciliation/run/route.ts` | 132 | `'training:reconciliation_outcome'` | `'convergence:reconciliation_outcome'` | Reconciliation compares calc output vs. source-of-record — a convergence observation per DS-021 §3 Role 4 |
| W-2 | `web/src/app/api/reconciliation/run/route.ts` | 161 | `'convergence_outcome'` | `'convergence:calculation_validation'` | Aligns with `toPrefixSignalType()` mapping for sci `convergence_outcome` so direct callers and sci-mapped callers land on the same `signal_type` |
| W-3 | `web/src/app/api/reconciliation/compare/route.ts` | 159 | `'training:reconciliation_comparison'` | `'convergence:reconciliation_comparison'` | Same level as W-1 |
| W-4 | `web/src/app/api/reconciliation/compare/route.ts` | 195 | `'convergence_outcome'` | `'convergence:calculation_validation'` | Same as W-2 |
| W-5 | `web/src/app/api/calculation/run/route.ts` | 1864 | `'training:synaptic_density'` (default fallback in `??`) | `'lifecycle:synaptic_consolidation'` | Default fallback runs only when upstream `signal.signalType` is undefined; pattern-density updates are lifecycle events of pattern consolidation |
| W-6 | `web/src/app/api/calculation/run/route.ts` | 1877 | `'training:dual_path_concordance'` | `'convergence:dual_path_concordance'` | Concordance between AI path and deterministic path is a convergence observation (per DS-021 §3 Role 4) |
| W-7 | `web/src/app/api/ai/assessment/route.ts` | 180 | `'training:assessment_generated'` | `'lifecycle:assessment_generated'` | Assessment generation is a lifecycle event |
| W-8 | `web/src/app/api/approvals/[id]/route.ts` | 167 | `'training:lifecycle_transition'` | `'lifecycle:transition'` | Direct lifecycle event |
| W-9 | `web/src/app/data/import/enhanced/page.tsx` | 2252 | `'field_mapping'` | `'comprehension:header_binding'` | Field mapping = header binding (matches OB-197 directive's mapping for `signal-persistence.ts:48,96` per Phase 2A table) |
| W-10 | `web/src/lib/ai/training-signal-service.ts` | 39 | template ``` `training:${response.task}` ``` | template ``` `comprehension:ai_${response.task}` ``` | AI response captures task interpretation. Comprehension level per DS-021 §3 Role 4. The dynamic part is `response.task` (one of `AITaskType` enum values: `file_classification`, `field_mapping`, `plan_interpretation`, etc.); preserving dynamic component preserves task differentiation |
| W-11 | `web/src/lib/ai/training-signal-service.ts` | 80 | `'training:user_action'` | `'lifecycle:user_action'` | User-action capture is a lifecycle event |
| W-12 | `web/src/lib/ai/training-signal-service.ts` | 110 | `'training:outcome'` | `'lifecycle:outcome'` | Generic outcome lifecycle event |
| W-13 | `web/src/lib/calculation/synaptic-surface.ts` | 204 | `'training:synaptic_density'` | `'lifecycle:synaptic_consolidation'` | Same as W-5; this is the upstream emitter that W-5 falls back to |
| W-14 | `web/src/lib/calculation/calculation-lifecycle-service.ts` | 457 | `'training:lifecycle_transition'` | `'lifecycle:transition'` | Same as W-8 |
| W-15 | `web/src/lib/ai/ai-service.ts` | 125 | `'cost_event'` | `'cost:event'` | Direct mapping; aligns with `toPrefixSignalType()` for sci `cost_event` |

### Cross-references between writers

- **W-2 / W-4 / sci `convergence_outcome` mapping:** `signal-capture-service.ts` `toPrefixSignalType()` (committed in Phase 2) maps sci internal `convergence_outcome` → `'convergence:calculation_validation'`. Direct callers (W-2, W-4) align to that target so **dual paths converge on the same `signal_type`**, allowing a single read-side filter.
- **W-5 / W-13 (synaptic):** `synaptic-surface.ts:204` is the upstream emitter; `calculation/run/route.ts:1864` is the orchestrator's default fallback when the upstream emission is missing. Both must change together to the same target so the fallback never produces a different value than the primary path.
- **W-8 / W-14 (lifecycle transition):** Two emitters of the same event type; both → `'lifecycle:transition'`.

### W-10 dynamic prefix — task enumeration

`response.task` is typed `AITaskType` (per `web/src/lib/ai/types.ts`). Enumerating its values gives the actual `signal_type` set written by W-10:

```
comprehension:ai_file_classification
comprehension:ai_field_mapping
comprehension:ai_plan_interpretation
comprehension:ai_header_binding
comprehension:ai_anomaly_detection
…(all AITaskType enum members)
```

OB-198 should grep `web/src/lib/ai/types.ts` for the union and confirm every member maps cleanly to the `comprehension:` prefix; HALT if any member's semantic level diverges (e.g., would belong in `cost:` or `lifecycle:` instead).

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

- **15 writer sites** require literal updates (14 static + 1 dynamic template)
- **2 reader sites** require filter-pattern updates
- **Zero schema changes** — CHECK constraint is already live; OB-198 fixes writers/readers, not the constraint

---

## Risk if F-1 is not remediated before PR #353 merges

- Reconciliation `outcome` and `comparison` flows: silent failure
- Calculation orchestrator concordance + synaptic-density signals: silent failure
- AI assessment / approvals lifecycle / training-signal-service captures: silent failure
- AI service cost-event tracking: silent failure
- Cost dashboard, Foundational/Domain flywheel cold-start, training-signal lookup: dead reads (filter against zero rows)

The platform continues to *function* (signals are fire-and-forget; calculations don't depend on them) but the closed-loop intelligence OB-197 was meant to enable starts in a degraded state — exactly the regression OB-197 was meant to close.
