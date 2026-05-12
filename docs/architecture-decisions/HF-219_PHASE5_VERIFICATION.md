# HF-219 Phase 5 — Direct Subscription + Emission Path Verification

## R3b: Consumer subscription pattern (already direct)

Audit of consumers that previously declared themselves readers via `signal-registry`:

| Consumer | File:line | Query pattern (verbatim) |
|---|---|---|
| `convergence:dual_path_concordance` (HF-218 Component 4b tenant-adaptive threshold) | `convergence-service.ts:~1860` | `.eq('tenant_id', tenantId).eq('signal_type', 'convergence:dual_path_concordance').order('created_at', { ascending: false }).limit(RECENT_N)` |
| `convergence:withinRun` (OB-197 G11 observation) | `convergence-service.ts:230` | `.eq('tenant_id', tenantId).eq('calculation_run_id', calculationRunId).order('created_at', ...)` |
| `convergence:crossRun` (OB-197 G11 observation) | `convergence-service.ts:241` | `.eq('tenant_id', tenantId).order('created_at', ...)` |
| `loadMetricComprehensionSignals` (HF-196 Phase 3 D153 cutover) | `convergence-service.ts:775` | `.eq('tenant_id', tenantId).eq('signal_type', 'comprehension:plan_interpretation')` |
| `lookupPriorSignals` (SCI agent priors) | `lib/sci/classification-signal-service.ts:153` | `.eq('tenant_id', tenantId).order('created_at', ...)` |
| `computeClassificationDensity` | `lib/sci/classification-signal-service.ts:356` | `.eq('tenant_id', tenantId)` |
| `recallVocabularyBindings` (HC vocabulary recall) | `lib/sci/classification-signal-service.ts:546` | `.eq('tenant_id', tenantId).not('vocabulary_bindings', 'is', null)` |
| `loadSignalsForTenant` (5-level reliability) | `lib/sci/contextual-reliability.ts:67` | `.eq('tenant_id', tenantId)` |
| `fetchSignals` (AI metrics) | `lib/intelligence/ai-metrics-service.ts:96` | `.eq('tenant_id', tenantId).limit(5000)` |

**All consumers query `classification_signals` directly with SQL pattern-matching WHERE clauses. Zero registry consultation. R3b is structurally complete pre-HF-219; HF-219 verifies the property.**

## R3c: Emission path unconditional (post-Phase 4)

Audit of every operative `writeSignal` call site:

```
web/src/app/api/reconciliation/compare/route.ts:158
web/src/app/api/reconciliation/run/route.ts:131
web/src/app/api/ai/assessment/route.ts:179
web/src/app/api/calculation/run/route.ts:1440, 2009, 2085, 2119, 2177, 2231, 2651, 2668, 2932
web/src/app/api/approvals/[id]/route.ts:168
web/src/lib/intelligence/classification-signal-service.ts:78
web/src/lib/intelligence/convergence-service.ts:401, 2135
web/src/lib/sci/signal-capture-service.ts:51
web/src/lib/sci/fingerprint-flywheel.ts:253
web/src/lib/sci/classification-signal-service.ts:105
web/src/lib/calculation/calculation-lifecycle-service.ts:456
web/src/lib/ai/training-signal-service.ts:58, 105
```

All 24 call sites route through `web/src/lib/intelligence/canonical-signal-writer.ts:writeSignal` (post-HF-219 Phase 4: removed `isRegistered` gate from `writeSignal` lines 273-281; removed batch-level `isRegistered` gate from `writeSignalBatch` lines 363-373; removed `lookup`-derived `confidence_required` from `validateSignal` body).

**Emission is unconditional on signal_type string. Zero registry consultation. R3c is structurally complete post-Phase 4.**

## Net effect

HF-219 Phase 4 already accomplished the structural changes that Phase 5 was scoped to enforce. The pre-existing codebase pattern was correct — consumers already used direct SQL queries; emission was the only registry-gated surface. Removing the gate at Phase 4 closes the eradication.

No additional refactoring required at Phase 5.
