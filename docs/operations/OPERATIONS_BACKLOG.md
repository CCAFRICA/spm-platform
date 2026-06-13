# Operations Backlog

Standing list of operational / future-work items recorded by the architect for later scheduling.
One entry per item. Newest at top. An entry graduates to its own OB directive when scheduled.

---

## BL-001 — Observatory atom-flywheel panel

- **Recorded:** 2026-06-11 (architect, SR-43 closure disposition)
- **Category:** Feature (Observatory)
- **Status:** Backlog — **build as a standalone OB after OB-203 Phase 4 ships**
- **Blocker:** depends on the OB-203 **Phase 4 signal vocabulary + trace queries** (the panel consumes them; cannot start until Phase 4 lands the vocabulary).
- **Scope:** an Observatory panel that renders, for the atom-flywheel / comprehension layer:
  - recognition **tier distribution** (sheet Tier-1/2/3 + atom known/novel split),
  - **atoms-known trend** (accumulation over imports),
  - **ambiguity rate** (ambiguous-atom fraction; first datapoints ~24–30% from OB-203 Phase 2),
  - **confidence calibration** (claimed roleConfidence vs realized outcome),
  - **comprehension cost curve** (LLM calls / bounded-residue size vs novelty — the DI-2 witness).
- **Design home:** Addendum-9 Observatory spec.
- **Source:** OB-203 Phase 2 EPG-2.4 / SR-43 evidence (`docs/vp-prompts/OB-203_COMPLETION_20260610.md`).

---

## BL-003 — Completion-screen redesign (Wayfinder / Health / IAP Action Proximity)

- **Recorded:** 2026-06-11 (architect, OB-203 Phase 5 D11) — BL-002 is Format Coverage Expansion (architect registry, recorded earlier 2026-06-11); this entry takes the next free number BL-003.
- **Category:** Design + Feature (import completion experience)
- **Status:** Backlog — **needs a design-spec pass** before build
- **Source:** OB-203 Phase 5 CLT findings (D10 truthfulness fixes shipped; the full redesign is out of Phase 5 scope)
- **Scope:** the post-import completion screen (`ImportReadyState`) re-designed against the Wayfinder /
  Health / IAP Action Proximity principles — coherent next-action proximity, session health at a glance,
  wayfinding to the right next step (calculate / configure plan / import more) per tenant state.
- **Design homes:** DS-013, DS-003.
- **Note:** Phase 5 D10 already made the screen *truthful* (full unit set incl. excluded/failed; plan-aware
  panels). BL-003 is the holistic redesign, not the truthfulness fix.

---

## BL-004 — Tenant Landing Experience Rework — IAP / Action Proximity / Intuitive Actions

- **Recorded:** 2026-06-12 (architect, CLT finding — tenant landing page)
- **Category:** Design + Feature (tenant landing / home)
- **Status:** Backlog — **complete rework**; **Experience-First Gate required** (five sections authored before any build)
- **Finding (FAILS IAP):** status-report layout with **no Intelligence surfaced** (the platform knows plan / roster /
  data states but offers no synthesis or recommendation); **Action Proximity violated** (three redundant Import CTAs,
  an undifferentiated link stack); **placeholder values rendered** ("None" / "—" — the D10 class); functions indiscernible.
- **Scope:** rework the tenant landing as an Intelligence-Action-Proximity surface — synthesis + the right next action
  per tenant state (plan/roster/data health → recommendation), differentiated actions, no placeholder rendering.
- **Gate:** Experience-First — five sections before build.
- **Design homes:** DS-013, DS-003, TMR Addendum 8.
- **Cross-ref:** the D10-class placeholder-rendering fix ("None"/"—" suppressed when no data) is an **already-ratified
  pattern** (OB-203 Phase 5 D10) and may be cited here.
- **Note:** NOT OB-203 scope.

---

## BL-005 — Import Progress as Innovation Telemetry

- **Recorded:** 2026-06-12 (architect, D14 adjacent)
- **Category:** Feature + Experience (import progress / Progressive Performance demonstration)
- **Status:** ✅ **PROMOTED INTO OB-203 SCOPE & IMPLEMENTED (2026-06-12, §2)** — the witness operator must
  observe the platform's real work live (four runs were adjudicated blind). Built: `deriveImportTelemetry`
  (durable-spine-derived; no client tally), `ImportTelemetryPanel` (analyze + execute), `OB203_VERBOSE`
  env-gated trace layer. Counters shaped to DS-020 `SynapticSurface.stats` (§3c). Remaining Observatory
  panel (BL-001) still backlog.
- **Scope:** the import progress surface becomes a quantified demonstration of Progressive Performance, with
  live counters sourced from the Phase 4 signal vocabulary: atoms recognized vs learned, LLM calls made vs
  bypassed-by-memory, fingerprints matched/stored, signals emitted. The import is no longer a spinner — it is
  a real-time telemetry of the platform's intelligence compounding.
- **Design homes:** DS-013, DS-003, Addendum 9.
- **Feeds:** BL-001 (Observatory atom-flywheel panel — same vocabulary/trace surface).
- **Note:** distinct from the D14 progress-counter fix (mechanical); BL-005 is the telemetry experience.

---

## INF-001 — Ingestion at Scale: Loading Dock Architecture

- **Recorded:** 2026-06-12 (architect; surfaced by OB-203 run-3/run-4 502s)
- **Category:** Infrastructure (ingestion execution model)
- **Status:** Backlog — **before any million-row tenant commitment; after OB-203 arc close**
- **Trigger:** run-3 and run-4 both 502'd on a Small Supabase instance committing the ~162k-row Ventas
  sheet (chunk 8/81, then 11/81). The exposure is architectural, not a tuning miss: **execute runs inside
  the request lifecycle with no queueing, backpressure, or bounded concurrency** — 81 chunks + the signal
  storm saturate the instance with zero load management.
- **Required (proof-of-scale gate):**
  - imports as **queued jobs**, off the request lifecycle (Vercel 300s maxDuration is not a job runtime);
  - **bounded global concurrency across tenants** (one tenant's bulk cannot starve others);
  - **chunked transactional writes** — the D16 unit-atomic contract (rollback on partial, per-unit
    durability) is the SEED of this;
  - **progress from durable session state** — the Phase-3 spine IS the job ledger (already the substrate
    the in-progress strip and completion screen read);
  - **retry / resume** per the "Persist, Release, Read Back" successor.
- **Governing litmus (DS-020, quoted verbatim):** *"Would this work for 150K entities in a single run? If
  a synaptic operation requires per-entity AI calls, it fails. If it requires per-entity synchronous
  writes, it fails. If it's pure data + batch I/O, it passes."* D16's pulsed writes are pure batch I/O
  (no per-entity AI, no per-entity synchronous write) → they PASS the litmus; INF-001 is the machinery to
  run that passing shape at scale, not a license to violate it.
- **Compute-tier upgrade — SR-34 STANDING (confirmed 2026-06-12):** NO tier upgrade. No hardware bypass for
  an inefficient write path; Small stands as the discipline canary. Recorded as HEADROOM only — explicitly
  **NOT the fix** (a bigger instance moves the ceiling, it does not add load management). Tier decisions
  live in this item at proof-of-scale, with measured numbers.
- **Seeded by:** D16 (chunk-500 + 200ms pacing + unit-atomic rollback) — interim headroom under the
  current ceiling; INF-001 is the durable replacement.
- **D16.1 closed the CORRECTNESS defect inside OB-203 (2026-06-12), NOT here:** the outage-mid-commit
  class now self-heals — read-side visibility gate (consumers count only completed/NULL-batch rows),
  batch-state reconciliation (stale `processing` → `failed`, no eternal lying state), and synchronous
  orphan reclamation (a reconciled/failed batch's rows deleted when the host is healthy). What remains in
  INF-001 is ONLY the GENERALIZED background machinery: queued jobs off the request lifecycle, bounded
  cross-tenant concurrency, a scheduler/sweeper daemon, and full transactional writes. Correctness no
  longer waits on this item.

---

## BL-006 — Derived-detection strengthening (aggregation under partial vocabulary overlap)

- **Recorded:** 2026-06-12 (architect, D15.2c — accepted-for-witness, named follow-up)
- **Category:** Engine (workbook-graph role derivation / classification)
- **Status:** Backlog — manual assign at proposal is the designed interim remedy.
- **Problem:** pre-aggregated RECAP sheets (Resumen_Mensual, Resumen_Producto) are structurally identical
  to raw per-period/per-entity transactions (repeated dimension + measures + temporal), so they classify
  `transaction`. The workbook graph's `derived` role is the intended discriminator but does not fire: it
  requires atom-hash overlap with a larger fact (Ventas) at >2× rows, and recaps carry AGGREGATE vocabulary
  (`venta_neta`, `margen_pct`) that does not hash-match the raw fact's columns.
- **STAKES:** a recap typed `transaction` is a **DOUBLE-COUNTING hazard** — if calc aggregates the recap
  rows beside the raw Ventas fact, the same revenue is counted twice. The interim guard is the human
  assigning `reference` at the proposal; this item makes the platform catch it.
- **Direction:** strengthen derived-detection to recognize aggregation-of-a-fact under PARTIAL vocabulary
  overlap (shared dimension columns + measure-name family + rowcount ratio), not atom-hash identity alone.
  Structural, no enumerated recap names (Korean Test).
