# OB-211 Remediation Campaign — Orchestration Plan

**Date:** 2026-06-14 · **Orchestrated by:** CC (ultracode) · **Number:** OB-211 (collision gate PASS — `git log --all | grep -iE 'OB-211'` = no matches; #511 confirmed on main).
**Governing loop (CC-owned, per item, every item):** TEST → VERIFY → RCA → RESOLVE → RE-VERIFY → architect SR-44 (production render confirm) → merge. No item is "done" until its check passes AND the architect confirms the render. CC produces all evidence; the architect ratifies, does not hunt.

---

## The two disciplines this campaign carries

1. **Leverage, do not create** (HALT-GENERAL). The foundations exist: #508 (regime model), #509 (field-identity → attainment value), #510 (capture-and-react signal path), the design-system primitives (`web/src/components/design-system/*`), the cockpit components (`CycleIndicator`/`PulseMetrics`/`QueuePanel`), the signal path (`captureStreamSignal`→`writeSignal`). The OB-210 keystone (`InsightNarrative.tsx` + `insight-narrative.ts`) is the one genuine build already landed. The only further genuine builds are newly-discovered gaps. Everything else is composition/wiring.
2. **Read-before-assume** (Phase 0 operationalizes it). The inventory is VERIFIED against live code/main before any resolution scopes. RCA traces actual code paths, never theorizes from logs (the human-as-debugger anti-pattern, Rule 24).

---

## Phase 0 — the CLT audit workflow (cost-paid-once)

One read-only fan-out that TESTS every inventory item A1–G3 against main + (where mechanically possible) live, and produces the VERIFIED findings table: **Expected · Test method · Actual · Pass/Fail · Evidence (pasted) · RCA pointer · HALT-0 flag**. This is the evidence base; it REPLACES assumption-based scope.

- Each audit agent is scoped to one item or a tight file-tree cluster, runs its own grep/trace, pastes evidence, and returns a structured finding.
- **HALT-0:** any item whose pass/fail can only be settled by an authenticated browser render is flagged `architect-SR-44-required` — code-level verdict is recorded, production verdict is deferred to the architect. No blind production pass/fail.
- Output: `docs/completion-reports/CLT_PRODUCTION_VERIFICATION_OB211_20260614.md`. The FAIL list (code-level) = the resolution scope.

## The RCA workflow

For every FAIL, a trace-the-root-cause pass (read the code path, not the logs) producing root cause + fix location. The dimensions that have bitten this project are the RCA lenses: wrong-rule-set (`selectedBatch.ruleSetId`), cross-tenant write, right-by-luck (scale_factor/filters — the #509 finding), dead-handler (zero callers), stale-override (a later push clobbers an earlier one — the A1 class), inline-not-generalized (one-off handler where a reusable prop is dead).

---

## §1A — Resolution workstreams (grouped by disjoint file trees for parallelism)

| WS | Scope | Items | Primary file trees |
|---|---|---|---|
| **WS-1 ROUTING** | tenant entry lands /stream (HF-292 dispatch) | A1 | `components/platform/ObservatoryTab.tsx`; convergence: `contexts/tenant-context.tsx` ✓, `middleware.ts` ✓ |
| **WS-2 DECIDE SURFACES** | narrative on /stream, compose cards from design-system, expand-default + #510 adaptive react, DS-003 rules, Simulate→WhatIfSlider, generalize drill-down | B1–B4 + rest of Unit A | `app/stream/page.tsx`, `components/intelligence/*`, `components/design-system/*`, `lib/results/insight-narrative.ts` |
| **WS-3 DEAD CONTROLS** | audit-and-wire sweep; disposition every control (WIRE / DISABLE+tooltip / REMOVE); generalize the inline drill handler | C1–C3 | `components/intelligence/*`, `components/design-system/*`, transaction-table, dashboards |
| **WS-4 PERSONA SURFACES** | Manager /results (heatmap, regime-aware, **owns AccelerationCards action-wiring**); Individual /results (goal-gradient, regime-aware, entity-from-identity) | D1–D2 + G1 | `app/operate/results/*`, `components/results/*` |
| **WS-5 FINANCIAL + COCKPIT** | FM pattern-application (on committed_data ✓); cockpit composition on /operate | D3–D4 | `components/financial/*`, `app/operate/page.tsx`, `components/navigation/mission-control/*` |
| **WS-6 CONSOLIDATION** | /insights repoint to primitives, then `git rm` the duplicates | F1 | `app/insights/*`, charts/analytics dup components |

Scale items (G2/G3) fold into the WS that renders the hero/trend.

### Collision resolution (stated, binding)
WS-3 (dead controls on `AccelerationCards`) ↔ WS-4 (Manager surface uses `AccelerationCards`). **WS-4 owns `AccelerationCards` action-wiring** (Recognize→`agent_inbox`; Coach/Intervene→`audit_logs`+`agent_inbox`). WS-3 owns every other dead control. WS-3 does not touch `AccelerationCards` action handlers.

### FP-49 write contracts (read live columns first)
- Signal writes via `captureStreamSignal`→`writeSignal` (no `.insert`, no registry; open-vocabulary `signal_type` per AP-26).
- Action writes: `audit_logs.profile_id` + `agent_inbox`.
- Module gating: `tenants.features`.

---

## The adversarial sweep

One sweep over the resolution batch (WS-2..6 diffs), per-unit-batch not per-file, verifying: wrong-rule-set · cross-tenant write · right-by-luck computation · Korean Test (zero domain literals, open-vocabulary signals, no registry) · scale (server COUNT, not rendered-length). Every HIGH fixed + re-verified.

## Merge strategy

Per-workstream branches to `main`, dependency order, each gated on `tsc --noEmit` 0 + build exit 0 + the adversarial sweep + **architect SR-44 render verification**. Never push to main directly; CC does not merge — the architect SR-44-gates each PR.

- **PR-1 `ob-211-phase0-foundation`** (this increment): this plan + the Phase 0 CLT (the evidence base). Docs-only.
- **PR-2 `ob-211-ws1-routing`** (this increment): WS-1 / A1 — the HF-292 root fix. Code; SR-44-gated render.
- **PR-3…N:** WS-2 (establishes the surface pattern) → then {WS-3, WS-4, WS-5, WS-6} (disjoint, parallelizable). Each its own branch + PR, each architect-SR-44-gated. Phase 0's verified findings scope each.

## Why staged, stated honestly

The per-item architect SR-44 gate is the directive's own model — "shipped" means "renders," and each surface is a real render the architect must see before the next composes on it. Ultracode pays the understand (Phase 0) + adversarial cost once; the workstreams then apply the keystone pattern and resolve at root. A 6-workstream remediation is not one safe atomic merge.

---

*OB-211 Remediation Orchestration Plan · 2026-06-14 · vialuce.ai*
