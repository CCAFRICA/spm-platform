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
- **Status:** Backlog — **Experience-First Gate required**
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
- **Compute-tier upgrade:** recorded as HEADROOM only — explicitly **NOT the fix** (a bigger instance
  moves the ceiling, it does not add load management).
- **Seeded by:** D16 (chunk-500 + 200ms pacing + unit-atomic rollback) — interim headroom under the
  current ceiling; INF-001 is the durable replacement.
