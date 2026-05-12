# AUD-006 — Addendum: Inventory Corrections from OB-199 Execution

**Companion to:** `docs/audits/AUD-006_Signal_Write_Pipeline_Audit.md`
**Authored:** 2026-05-10 during OB-199 execution
**Discovery context:** OB-199 (Canonical Signal-Write Surface Implementation) halt conditions at Phase 1 step 5 and Phase 4 step 1
**Authority:** This addendum amends AUD-006's empirical inventory. AUD-006 findings F-AUD-006-001 through F-AUD-006-010 stand. AUD-006's structural conclusions stand. The addendum corrects empirical-completeness defects in AUD-006's writer-surface and reachability inventories that surfaced during OB-199 execution against AUD-006's findings.
**Substrate basis:** T1-E912 (Principle-Rule Coherence and the Supersession Surface); T1-E920 (Repeated Fix Failure Is a Pattern); T1-E905 (Prove, Don't Describe).

---

## Section 1 — Why this addendum exists

OB-199 executes DS-023 against AUD-006's empirical inventory. Two halt conditions during execution surfaced empirical-completeness gaps in AUD-006:

- **Phase 1 step 5 halt:** AUD-006 §2.4 declared B2 normalization "dead code on production path." OB-199 verification surfaced production callers AUD-006 missed.
- **Phase 4 step 1 halt:** AUD-006 §1.1 + §1.2 enumerated 15 writer call sites. OB-199 verification surfaced 5 additional call sites + 1 unregistered signal_type.

AUD-006's structural conclusion — the multi-pathway signal-write defect — is reinforced by these findings, not weakened. More missed sites means more multi-pathway surface than the audit reported. DS-023's design obligations close the structural defect regardless of how the inventory is sized.

This addendum documents what was missed, the structural reason, and the corrected inventory.

---

## Section 2 — Blind-spot 1: AUD-006 §2.4 dead-code claim partially incorrect

### What AUD-006 §2.4 claimed

> `grep -rn "AIPlainInterpreter\|getAIInterpreter" web/src/ --include="*.ts" --include="*.tsx" | grep -v "ai-plan-interpreter.ts" | grep -v "\.test\|__tests__"`:
>
> ```
> (zero matches — empty output)
> ```
>
> No file outside `ai-plan-interpreter.ts` itself imports `AIPlainInterpreter` or calls `getAIInterpreter()`. The class is dead code in production.

### What is empirically true

`AIPlainInterpreter.validateAndNormalize` is reachable via a production code path:

```
app/api/import/sci/execute/route.ts:1273
  → bridgeAIToEngineFormat(rawResult, ...) [exported from ai-plan-interpreter.ts:575]
    → ai-plan-interpreter.ts:587: const normalized = interpreter.validateAndNormalizePublic(rawResult);
      → AIPlainInterpreter.validateAndNormalizePublic (line 195)
        → AIPlainInterpreter.validateAndNormalize (line 202)
          → calls normalizeConfidence at line 213 + 262
```

Also reachable via `app/api/import/sci/execute/route.ts:1527` (parallel single-unit plan import).

### Why §2.4 missed it

The grep filter `grep -v "ai-plan-interpreter.ts"` excluded the host file. `bridgeAIToEngineFormat` is an *exported* function inside `ai-plan-interpreter.ts` with external production callers; the internal call from `bridgeAIToEngineFormat` to `validateAndNormalizePublic` lives inside the excluded file. The grep was constructed to answer "who calls `AIPlainInterpreter` from outside this file?" The correct question for production-reachability was "what is reachable from production routes anywhere, through any export chain?"

### Empirical correction

AUD-006 §2.4 must read:

> **B2 normalization is reachable via the rule_set engineFormat path** (`bridgeAIToEngineFormat` consumers at `route.ts:1273` and `:1527`) and **is not reachable via the signal-write emitter path** (`route.ts:1340-1346` consumes `response.result` directly, bypassing the class wrapper).
>
> The platform operates **two parallel AI-plan-interpretation processing paths** consuming the same AI response:
> 1. Signal-write surface (emitter via `response.result`): B2 bypassed; raw 95/90 values; A clamp fires.
> 2. Rule_set engineFormat surface (via `bridgeAIToEngineFormat`): B2 reached; normalized values stored in `rule_sets.components`.
>
> The dead-code claim for B2 was empirically false; the asymmetry claim (F-AUD-006-003) is empirically reinforced — two parallel paths over the same AI response produce divergent processing.

### Disposition (OB-199 Phase 1, Option b)

OB-199 closure path adopted Option (b) — refactor `bridgeAIToEngineFormat` to call `validateAndNormalizePlanInterpretation` as a standalone extracted function; delete the `AIPlainInterpreter` class wrapper. Both consumer paths now read ratio-form values from the single producer-side normalization site at the adapter (DS-023 §5.4). The class wrapper deletes legitimately; the structural validation logic survives as a standalone function. Single producer path; two consumers reading from one source.

Commit: 7dead762 (OB-199 Phase 1).

---

## Section 3 — Blind-spot 2: AUD-006 §1.1 inventory incomplete

### What AUD-006 §1.1 enumerated

15 writer call sites across §1.1 (subject to A clamp) and §1.2 (bypass writers), with `(verify)` placeholders next to multiple rows.

### What is empirically true

19 writer call sites + 1 function declaration. The five OB-199 surfaced at Phase 4 inventory:

| Site | Path | Signal_type | Audit gap class |
|---|---|---|---|
| training-signal-service.ts:126 | `recordOutcome()` method | `lifecycle:outcome` (unregistered) | Enumerated function had additional method writing unregistered identifier |
| intelligence/converge/route.ts:95 | `writeClassificationSignal` caller | `classification:outcome` | Caller of audited function not enumerated |
| intelligence/converge/route.ts:120 | `writeClassificationSignal` caller | `classification:outcome` | Caller of audited function not enumerated |
| import/sci/process-job/route.ts:354 | `writeClassificationSignal` caller | `classification:outcome` | Caller of audited function not enumerated |
| import/sci/analyze/route.ts:475 | `writeClassificationSignal` caller | `classification:outcome` | Caller of audited function not enumerated |

### Why §1.1 missed it

Two distinct mechanisms.

**Mechanism A — `(verify)` placeholders never closed.** AUD-006 §1.1 carried `(verify)` markers next to multiple writer rows (`classification-signal-service.ts:70`, `:125`; `calculation-lifecycle-service.ts:455`; `reconciliation/run/route.ts:130`; `compare/route.ts:157`; `ai/assessment/route.ts:178`; `approvals/[id]/route.ts:165`). The marker flagged "this row needs additional verification before the inventory is final." The verification step never executed. The inventory shipped with placeholders treated as confirmed entries.

**Mechanism B — caller enumeration stopped at function declaration.** AUD-006 §1.1 named `writeClassificationSignal` (at `sci/classification-signal-service.ts:91`) and named *one* caller (`route.ts:376` per the verbatim source excerpt at §1.2). The audit did not enumerate all callers of `writeClassificationSignal`. Four additional production callers existed across `intelligence/converge`, `import/sci/process-job`, `import/sci/analyze`, and `import/sci/execute`. The audit found the function, named one caller, and stopped.

### Empirical correction

AUD-006 §1.1 + §1.2 inventory must be expanded to 19 writer call sites + 1 function declaration:

**Direct `persistSignal` / `persistSignalBatch` callers (10):**
- web/src/lib/compensation/plan-comprehension-emitter.ts:111
- web/src/lib/ai/training-signal-service.ts:52, :96, **:126** (newly enumerated)
- web/src/lib/sci/signal-capture-service.ts:48, :101
- web/src/lib/intelligence/classification-signal-service.ts:70, :125
- web/src/lib/calculation/calculation-lifecycle-service.ts:455
- web/src/app/api/calculation/run/route.ts:2115, :2128
- web/src/app/api/reconciliation/run/route.ts:130
- web/src/app/api/reconciliation/compare/route.ts:157
- web/src/app/api/ai/assessment/route.ts:178
- web/src/app/api/approvals/[id]/route.ts:165

**Direct `.insert()` bypass writers (3):**
- web/src/lib/intelligence/convergence-service.ts:363
- web/src/lib/signals/briefing-signals.ts:67
- web/src/lib/signals/stream-signals.ts:66

**`writeClassificationSignal` callers (5):**
- web/src/app/api/import/sci/execute/route.ts:387 (originally enumerated)
- **web/src/app/api/intelligence/converge/route.ts:95** (newly enumerated)
- **web/src/app/api/intelligence/converge/route.ts:120** (newly enumerated)
- **web/src/app/api/import/sci/process-job/route.ts:354** (newly enumerated)
- **web/src/app/api/import/sci/analyze/route.ts:475** (newly enumerated)

**Function declaration (1):**
- web/src/lib/sci/classification-signal-service.ts:81 (the `writeClassificationSignal` function itself; deletes at OB-199 Phase 4 close after all 5 callers migrate)

### Disposition

OB-199 Phase 4 expanded inventory to 19 sites; all migrate to canonical writer per DS-023 §5.1. Final Phase 4 commit deletes `signal-persistence.ts` (all callers migrated) and `writeClassificationSignal` function (all 5 callers migrated). Coverage-trust property (§4.3) closes fully against the corrected inventory.

---

## Section 4 — Blind-spot 3: AUD-006 §3.2 unregistered-types count off by one

### What AUD-006 §3.2 enumerated

16 `ai_`-prefix signal_types in `AI_TASK_LEVEL_MAP` (training-signal-service.ts:18–39), zero overlap with the 15 registered types in `signal-registry.ts`.

### What is empirically true

17 unregistered signal_types in production. The additional one — `lifecycle:outcome` — is written by `training-signal-service.ts:126` (`recordOutcome()` method). It is not an `ai_`-prefix type; it predates `AI_TASK_LEVEL_MAP` consolidation. AUD-006 §3.2 enumerated only the `ai_`-prefix subset.

### Why §3.2 missed it

§3.2's enumeration was filtered to `AI_TASK_LEVEL_MAP` entries. `lifecycle:outcome` is written outside that map by a different method (`recordOutcome`) on the same service. The audit's enumeration was scoped to one source of unregistered identifiers (the map); the second source (the sibling method) was not surveyed.

This is structurally the same defect as Blind-spot 2 Mechanism B: enumeration stopped at the first identified source rather than enumerating all sources.

### Empirical correction

F-AUD-006-005 closure scope expands by one signal_type: `lifecycle:outcome` registers in `signal-registry.ts` as part of OB-199 Phase 2 (retroactive fix-up commit during Phase 4 disposition; see OB-199 commit train).

---

## Section 5 — Structural cause shared across all three blind-spots

The three blind-spots share a root: **AUD-006 constructed its empirical inventories by keyword grep against expected patterns, rather than by call-graph traversal.**

A keyword-grep inventory:
- Enumerates sites that match a known textual pattern.
- Stops at the first edge of the pattern.
- Misses transitive reachability through exports, function calls, and method dispatch.
- Treats `(verify)` markers as soft state rather than blocking gates.

A call-graph-traversal inventory:
- Anchors on the target (every direct reference to `classification_signals`).
- Walks every export of every file containing the target.
- Walks every caller of every such export, recursively.
- Treats the inventory as closed only when every walked edge resolves.

AUD-006 executed step 1 of call-graph traversal (find direct table references) but stopped before transitive expansion. The three blind-spots are operational consequences.

**This pattern is the wide-lens-vs-fragmented defect operating against the audit itself.** AUD-006 surfaced the multi-pathway defect by integrating eight dimensions of the signal-write surface — a wide-lens posture relative to the prior DIAG sequence. But within each dimension, the queries were fragmented (keyword grep, single-source enumeration, unverified `(verify)` placeholders). The audit's wide-lens conclusion stood; its empirical inventories within each dimension were fragmented.

Per T1-E920 (Repeated Fix Failure Is a Pattern): the wide-lens-vs-fragmented frame applies at every level. An audit that produces fragmented-within-dimension inventories will produce design specifications consuming those inventories that inherit the same blind-spots. DS-023 §7 closure map (built against AUD-006's inventory) was provisionally accurate; OB-199's halt-and-expand discipline corrected it in real time before the closure-map gaps shipped to production.

---

## Section 6 — AUD-006 findings status post-addendum

| Finding | Original status | Post-addendum status |
|---|---|---|
| F-AUD-006-001 (B2 dead code) | P0 | **Reclassified: not dead code; production-reachable via `bridgeAIToEngineFormat`.** Closure path unchanged: single producer normalization at adapter (DS-023 §5.4) makes B2 redundant. Closed by OB-199 Phase 1. |
| F-AUD-006-002 (clamp + bypass) | P0 | Stands. Bypass surface larger than enumerated; full surface migrates at OB-199 Phase 4. |
| F-AUD-006-003 (100x asymmetry) | P0 | **Reinforced.** The two-parallel-paths finding (Section 2 above) shows the asymmetry is structural, not just an emitter-vs-training-signal-service divergence. |
| F-AUD-006-004 (dual architecture) | P1 | Stands. Closed by OB-199 Phase 4. |
| F-AUD-006-005 (unregistered types) | P1 | **Scope expanded: 17 unregistered types, not 16.** `lifecycle:outcome` added; registered via OB-199 Phase 2 retroactive fix-up. |
| F-AUD-006-006 (historical 1.0 rows) | P1 | Stands. Closed by post-OB-199 wipe. |
| F-AUD-006-007 (lifecycle omits confidence) | P1 | Stands. Closed by registry `confidence_required: false` declarations. |
| F-AUD-006-008 (other prompt templates) | P2 | Stands. Out of DS-023 scope. |
| F-AUD-006-009 (B2 fallback semantic) | P2 | Closed by B2 class deletion (OB-199 Phase 1). |
| F-AUD-006-010 (cosmetic display drift) | P3 | Stands. Out of DS-023 scope. |
| (new) Inventory completeness defect | — | Documented in this addendum. Captured as IGF-substrate-candidate per architect direction. |

---

## Section 7 — Substrate-candidate (audit-completeness discipline)

A meta-finding from this addendum is candidate substrate material for IGF disposition. Pre-drafted here for architect-channel capture; not in OB-199 scope:

> **Audit-completeness discipline (substrate candidate):** Writer-surface, reader-surface, and call-site inventories produced by audit must be constructed by call-graph traversal: anchor on the target surface; walk every export of every file containing direct references; walk every caller of every such export, recursively, until every edge resolves. Keyword-grep inventories are diagnostic aids, not inventory mechanisms. `(verify)` placeholders in audit deliverables are blocking gates — the verification must close before the audit ships, not after. Audits that ship with unverified placeholders or keyword-grep-only inventories are subject to the wide-lens-vs-fragmented pattern at the dimension level even when the audit's overall posture is wide-lens.

Architect dispositions IGF capture pathway separately.

---

## Section 8 — At-close

AUD-006's wide-lens posture surfaced the multi-pathway defect that fragmented DIAGs had missed. Its empirical inventories within each dimension carried fragmented-within-dimension blind-spots. OB-199's halt-and-expand discipline corrected those inventories empirically during execution. DS-023's structural obligations close the defect against the corrected inventory.

Per T1-E912: AUD-006's structural finding (the multi-pathway defect) honors the principles it cites. AUD-006's empirical-inventory completeness was an applicability-without-coherence gap. This addendum closes the gap.

Per T1-E905: Every claim in AUD-006's original report that this addendum amends is replaced with empirically-traceable evidence (file:line, commit SHA, OB-199 halt artifact). Nothing is asserted without an evidence chain.

Per T1-E920: The audit-completeness defect, surfacing the same fragmented-perspective pattern at a different surface, qualifies as pattern rather than bug. The structural response is Section 7's substrate candidate, not another instance of the same fix-verify cycle.

---

*AUD-006 Addendum · Inventory Corrections from OB-199 Execution · 2026-05-10 · AUD-006 findings F-AUD-006-001 through F-AUD-006-010 stand with empirical refinements documented herein · Companion to docs/audits/AUD-006_Signal_Write_Pipeline_Audit.md · Substrate-candidate (audit-completeness discipline) deferred to IGF disposition*
