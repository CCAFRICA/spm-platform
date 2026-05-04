# HF-198 — Korean Test Verdict (Decision 154 closure verification)

**Date:** 2026-05-04
**Substrate:** AUD-004 v3 §2 E6 + Decision 154 (Korean Test extended to operation/primitive vocabulary)
**Verdict scope:** OB-196 closure — operation primitive vocabulary + signal_type vocabulary

---

## 1. Korean Test (AP-25 / Decision 154) — verdict surfaces

### 1.1 Operation primitive dispatch sites

```
$ grep -rn "'matrix_lookup'|'tier_lookup'|'tiered_lookup'|'flat_percentage'|'conditional_percentage'" web/src/ --include='*.ts' --include='*.tsx'
(zero matches)
```

**Verdict:** PASS. Zero hardcoded legacy operation literals at any dispatch site
across `web/src/`. F-005 invariant holds platform-wide.

### 1.2 Type-equality switch arms in calculation/compensation surfaces

```
$ grep -rn "type === '" web/src/lib/calculation web/src/lib/compensation --include='*.ts'
web/src/lib/calculation/synaptic-surface.ts:56:  if (synapse.type === 'anomaly') surface.stats.anomalyCount++;
web/src/lib/calculation/synaptic-surface.ts:57:  if (synapse.type === 'correction') surface.stats.correctionCount++;
```

**Verdict:** PASS. Two matches in `synaptic-surface.ts` test synapse signal
types ('anomaly', 'correction') — these are post-calculation observability
counters, NOT operation primitive dispatch. Audit-trail-exempt category.

### 1.3 Signal-type vocabulary (HF-198 E3 registry)

Every operative signal_type registered in `web/src/lib/intelligence/signal-registry.ts`
follows Decision 154 prefix vocabulary (`classification:* | comprehension:* |
convergence:* | cost:* | lifecycle:*`). Verified by negative test suite gate
8.1 (HF-198 §8 in `web/__tests__/round-trip-closure/run.ts`):

```
8.1 classification:outcome follows Decision 154 prefix vocabulary           PASS
8.1 classification:human_correction follows Decision 154 prefix vocabulary  PASS
8.1 comprehension:plan_interpretation follows Decision 154 prefix vocabulary PASS
8.1 comprehension:header_binding follows Decision 154 prefix vocabulary     PASS
8.1 convergence:calculation_validation follows Decision 154 prefix vocabulary PASS
8.1 convergence:reconciliation_outcome follows Decision 154 prefix vocabulary PASS
8.1 convergence:reconciliation_comparison follows Decision 154 prefix vocabulary PASS
8.1 convergence:dual_path_concordance follows Decision 154 prefix vocabulary PASS
8.1 cost:event follows Decision 154 prefix vocabulary                       PASS
8.1 lifecycle:assessment_generated follows Decision 154 prefix vocabulary   PASS
8.1 lifecycle:transition follows Decision 154 prefix vocabulary             PASS
8.1 lifecycle:stream follows Decision 154 prefix vocabulary                 PASS
8.1 lifecycle:briefing follows Decision 154 prefix vocabulary               PASS
8.1 lifecycle:synaptic_consolidation follows Decision 154 prefix vocabulary PASS
8.1 lifecycle:user_action follows Decision 154 prefix vocabulary            PASS
```

**Verdict:** PASS. 15/15 signal_type identifiers conform to Decision 154
prefix vocabulary.

### 1.4 Foundational primitive identifiers (snake_case structural)

Verified by negative test suite gate 8.2:

```
8.2 bounded_lookup_1d is structural identifier (snake_case lowercase)      PASS
8.2 bounded_lookup_2d is structural identifier (snake_case lowercase)      PASS
8.2 scalar_multiply is structural identifier (snake_case lowercase)        PASS
8.2 conditional_gate is structural identifier (snake_case lowercase)       PASS
8.2 linear_function is structural identifier (snake_case lowercase)        PASS
8.2 piecewise_linear is structural identifier (snake_case lowercase)       PASS
8.2 scope_aggregate is structural identifier (snake_case lowercase)        PASS
8.2 aggregate is structural identifier (snake_case lowercase)              PASS
8.2 ratio is structural identifier (snake_case lowercase)                  PASS
8.2 constant is structural identifier (snake_case lowercase)               PASS
8.2 weighted_blend is structural identifier (snake_case lowercase)         PASS
8.2 temporal_window is structural identifier (snake_case lowercase)        PASS
```

**Verdict:** PASS. 12/12 foundational primitives conform to structural
identifier discipline.

---

## 2. E5 / E3 / E6 negative tests (extended 38-test suite)

The 38-test negative suite from PR #350 (OB-196 Phase 3) is extended in this PR
with HF-198 E5/E3/E6 cases. Run output:

```
$ cd web && npx tsx __tests__/round-trip-closure/run.ts
1. Round-trip identity preservation (componentResults blob)
2. Trace-level identity preservation (ExecutionTrace.componentType)
3. Adversarial input — structured failures
4. Graceful-degradation labels (no silent fallthrough)
5. Registry sanity (foundational identifiers only)
6. HF-198 E5 plan-comprehension emitter shape
7. HF-198 E3 signal-type registry
8. HF-198 E6 Korean Test verdict at registry

HF-198 + OB-196 round-trip + signal-registry tests: 103 pass, 0 fail
```

103 / 103 tests pass.

### Section 6 — E5 plan-comprehension emitter shape (5 cases)
- 6.1 `comprehension:plan_interpretation` registered ✓
- 6.2 lookup returns declaration ✓
- 6.3 signal_level === L2 ✓
- 6.4 declared_readers includes convergence-service ✓
- 6.5 declared_writers includes plan-comprehension-emitter ✓

### Section 7 — E3 signal-type registry (19 cases)
- 7.1 (×15) — every operative signal_type registered
- 7.2 — every registered signal_type has ≥1 declared reader
- 7.3 — `register()` throws on zero declared readers (E3 invariant)
- 7.4 — `assertRegistered()` throws `SignalNotRegisteredError` on unregistered
- 7.5 — F-011 closure: `convergence:dual_path_concordance` has declared reader

### Section 8 — E6 Korean Test verdict at registry (27 cases)
- 8.1 (×15) — every signal_type follows Decision 154 prefix vocabulary
- 8.2 (×12) — every foundational primitive identifier is structural

---

## 3. Final verdict — Decision 154 closure

| Surface | Korean Test verdict |
|---|---|
| Operation primitive dispatch sites (legacy literals) | PASS — zero hits |
| Operation primitive identifiers (foundational set) | PASS — structural |
| Signal-type vocabulary (HF-198 E3 registry) | PASS — Decision 154 prefix |
| Synaptic-surface type-equality (audit-trail) | EXEMPT — observability counters |
| Negative test suite (E5/E3/E6 cases) | PASS — 103/103 |

**Overall verdict: YES.** Platform passes Korean Test for operation vocabulary
and signal-type vocabulary. Decision 154 closure verification produced.

The 38-test negative suite from PR #350, extended with E5/E3/E6 cases in this
PR, is the regression infrastructure that catches future drift.
