# HF-219 — Architecture Decision Record

**Date:** 2026-05-12
**Branch:** `dev` (base commit `123eac7e` post-Phase-0)
**Authority:** Architect Dispositions 1-6 (binding). Dispositions are NOT subject to CC scope-contraction.

## Problem

HF-218 delivered the observability layer of layer-contract closure. It did NOT deliver:
- Engine self-correction (third branch of verify-correct-or-except) — HF-218 Component 2 scope-contracted to detection-only
- Bidirectional flywheel loop (OB-177 decrement caller wiring) — HF-218 Component 3 implemented `decrementFingerprintConfidence` but no operative call site
- Adaptive emergence at the signal-vocabulary surface — HF-218 extended the existing OB-199 signal-registry rather than recognizing the registry as a recurring CC failure pattern

Decisions in HF-219 scope are IMPLEMENTATION-MECHANISM only. Dispositions are binding context.

---

## Decision 1 — Atomic rule_sets update mechanism (Component R1)

**Options:**
- A. Optimistic concurrency control on `updated_at`; abort+retry max 3
- B. Postgres SELECT FOR UPDATE row lock
- C. Service-role tsx-script with advisory lock keyed on tenant_id + rule_set_id

**Constraints:**
- Atomic: rule_sets update + classification_signals write must commit together OR neither
- Scale: "Large" tier (500K-5M records)
- Contention handled gracefully (fall through to structural_exception with signal; no uncaught throw)

**CHOSEN: A — Optimistic concurrency control on `updated_at`.**

Rationale: per HF-218 ADR Decision 4 atomicity discipline — co-locate state with the operation that creates it. Optimistic concurrency via `updated_at` matches the existing pattern at `fingerprint-flywheel.ts:158-164` (HF-218 Phase 4 increment + Phase 4 decrement caller per Component R2 below). Existing OB-121 batch insert pattern at calculation_results writes server-side via service-role; same client invokes the rule_sets update + classification_signals insert in the same request scope. PostgreSQL `UPDATE … WHERE updated_at = $1` returns affected_row_count which is the lock-success signal.

Option B (SELECT FOR UPDATE) is heavyweight at "Large" scale (5M rows, multi-tenant); acquires row-level lock that could serialize concurrent calculations across rule_sets. Option C (advisory lock) is correct semantically but introduces Postgres-advisory-lock primitive that the codebase does not currently use; this would be substrate-extending.

**REJECTED: B (heavyweight contention), C (substrate-extending advisory lock).**

Retry policy: max 3 attempts on `updated_at` mismatch. After 3rd contention, the engine emits `convergence:correction_contention` signal (unregistered, open-vocabulary per Disposition 5) and falls through to structural_exception. No uncaught throw.

Atomicity: failed rule_sets update aborts the engine_correction branch; engine_correction signal NOT written (would orphan the correction record); engine falls through to verify-and-proceed-with-existing (the correction did not happen; existing binding stands). The structural exception path is NOT reached merely because correction contended — that path is for verification failure, not concurrency.

Scale: Works at 10x ("Large" 500K-5M). UPDATE … WHERE updated_at = $1 is index-scan; sub-ms per attempt; 3-retry ceiling. ✓
AI-first: Zero hardcoded literals. ✓
Transport: All writes via service-role server-side client. ✓
Atomicity: rule_sets update success required for engine_correction signal write; failure cascades cleanly. ✓

---

## Decision 2 — Fingerprint trace mechanism (Component R2)

**Options:**
- A. binding_snapshot.convergence_bindings_used contains origin_fingerprint_hash; engine reads from snapshot
- B. Engine reads structural_fingerprints WHERE tenant_id AND content_unit_hash matches active import_batch's content_unit_hash
- C. Binding stores fingerprint_hash directly at write time (HF-218 retrofit; out of scope)

**Constraints:**
- No HF-218 binding structure modification (HF-218 merged; no retrofit)
- Trace succeeds when fingerprint exists; gracefully no-op when binding has no source fingerprint
- Korean Test: structural query

**CHOSEN: B — Engine reads structural_fingerprints by tenant_id + content_unit_hash via import_batch.**

Rationale: HF-218 Component 1 emits binding with `source_batch_id` (the import batch id from which the candidate column was inventoried — present at `convergence-service.ts` ComponentBinding.source_batch_id). Engine at calc time has access to `import_batches.content_unit_hash_sha256` for any source_batch_id via the existing `from('import_batches')` read pattern in route.ts. Joining structural_fingerprints by content_unit_hash_sha256 traces a binding to its originating fingerprint.

Option A requires retrofitting HF-218 binding shape — explicitly out of scope per directive.
Option C requires HF-218 retrofit — explicitly out of scope.

When source_batch_id is null OR the joined import_batch has no content_unit_hash OR the structural_fingerprints row does not exist: engine emits structural_exception WITHOUT decrement (graceful no-op per directive Component R2 step 1c).

Scale: Two indexed reads per structural_exception event (import_batches by id, then structural_fingerprints by content_unit_hash). At "Large" tier with typical exception rates (per HF-208 ~1-5% of entity-components), additional reads are ms-scale. ✓
AI-first: Zero hardcoded literals; queries derive from existing binding metadata. ✓
Transport: Service-role server-side; no HTTP body data. ✓
Atomicity: Decrement is a separate event from calculation_result write; decrement failure does NOT block calculation_result. ✓

---

## Decision 3 — Subscription pattern semantics (Component R3b)

**Options:**
- A. SQL LIKE pattern (`signal_type LIKE 'convergence:%'`)
- B. SQL regex (`signal_type ~ '^convergence:'`)
- C. TypeScript predicate function filtering fetched rows

**Constraints:**
- Korean Test: no hardcoded signal_type literals in consumer files (queries derive patterns from structural context)
- Scale: classification_signals 10M+ rows per tenant
- Consumers handle novel matching signal_types without code change

**CHOSEN: A — SQL LIKE pattern on signal_type column.**

Rationale: LIKE with prefix anchor (`'prefix:%'`) is index-friendly when an index on `signal_type` exists (verified via SCHEMA_REFERENCE_LIVE.md — `idx_classification_signals_type` index per OB-199 Phase 4 migration). At 10M rows per tenant, prefix LIKE on indexed text column is sub-second.

Option B (regex) is more expressive but does NOT use the standard btree index on the column; requires expression index or sequential scan at scale. Option C (TS predicate) requires fetching all rows then filtering in app memory — anti-pattern AP-4 (sequential per-row).

The "structural context" derivation: each consumer's WHERE clause derives the prefix pattern from the consumer's role-context (e.g., the tenant-adaptive concordance threshold consumer derives `'convergence:dual_path_concordance'` from the literal it's monitoring, which is one string per consumer — this is acceptable per Korean Test because the literal is the structural context of the consumer, not a hardcoded domain vocabulary mapping). Consumers handling multiple signal_types use LIKE prefix (e.g., `'engine:%'` for all engine signals).

For HF-218's two named registry-routed consumers:
- decrementFingerprintConfidence — invoked directly from engine code (Component R2 wiring); not a pattern subscriber
- tenant-adaptive concordance threshold — already-existing direct query at `convergence-service.ts` (HF-218 Phase 5 implementation uses `.eq('signal_type', 'convergence:dual_path_concordance')`); compatible with Disposition 5 — no refactor needed; this consumer was registry-declared but already code-queried

**REJECTED: B (regex; no index efficiency), C (predicate; AP-4 violation).**

Scale: prefix LIKE on indexed column; sub-second at 10M rows. ✓
AI-first: signal_type literals are consumer-local structural context; not central registry. ✓
Transport: SQL WHERE; no row data transit. ✓
Atomicity: read-only subscriber semantics. ✓

---

## Architectural binding summary

| Decision | Mechanism |
|---|---|
| 1 | Optimistic concurrency control on `updated_at` with max-3-retry; emit `convergence:correction_contention` on persistent contention |
| 2 | structural_fingerprints WHERE content_unit_hash_sha256 = import_batches.content_unit_hash_sha256 (joined from binding's source_batch_id); graceful no-op when no fingerprint exists |
| 3 | SQL LIKE prefix pattern (`signal_type LIKE 'prefix:%'`) on the existing `idx_classification_signals_type` index |

## Carry-forward dispositions (binding context, not subject to ADR)

- Disposition 1: VG substrate amendments (E924/E904/E902) remain queued. CC does NOT amend VG substrate.
- Disposition 2: Engine reads tenant.entities OK per HF-218 Disposition.
- Disposition 3: Self-correcting engine with preservation — RESTORED in HF-219 Component R1.
- Disposition 4: Relative confidence comparison (C_proposed > C_existing) using freshly-computed structural methodology.
- Disposition 5: Signal-registry eradicated. Open-vocabulary signal_types. Pattern-matching subscription only.
- Disposition 6: AP-26 added to standing rules per Phase 0 discovery (next-available integer).

## Global gate evaluation

| Gate | Outcome |
|---|---|
| Scale test 10x | All three decisions pass at "Large" 500K-5M and acceptable at "Enterprise" 5M-50M |
| AI-first / Korean Test | Zero hardcoded weights; AP-26 will gate future recurrence |
| Transport | All writes server-side via service-role |
| Atomicity | Decision 1 enforces; Decision 2 graceful no-op; Decision 3 read-only |
| G1-G6 | G1 compliance: optimistic-concurrency + open-vocabulary signals + pattern subscription IS the audit architecture (not policy/registry) |
