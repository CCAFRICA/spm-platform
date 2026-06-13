ARCHITECTURE DECISION RECORD — OB-203 Phase 6B, Phase D (D.1 surface selection)
================================================================================
Where the per-session import telemetry record lives, and the write/read mechanics
that satisfy the Phase D invariant (Amendment 2 §2). Section B gate; committed
BEFORE any implementation code, beside prior ADRs (HF-281/283/284 pattern).
Authored against the six-reader evidence sweep of 2026-06-12 (derive inventory,
panel vocabulary, write-path sites, consumer enumeration, DS-020 vocabulary,
migration conventions) — file:line citations throughout are from that sweep and
were spot-verified live.

PROBLEM
-------
Phase D invariant (Amendment 2 §2): every number on the import in-progress and
completion surfaces derives from a durable per-session telemetry record that is
incrementally updated by the work itself; display read cost is O(1) in stored
data volume; no polling path executes a data-table scan; the heavy derive
(`deriveImportTelemetry`) executes exactly once per session, at settle, as the
audit. Today one `?telemetry=1` poll executes FIVE table reads every 2s
(session-state/route.ts:28+38 → comprehension-state-service.ts:337/371/380/393),
the last an exact COUNT over `committed_data` on a JSONB-extraction predicate
(`metadata->>proposalId`) across 325k+ rows — DIAG-062 A5, the saturation source
that stretched entity round-trips to 9-23s and killed the warm witness at the
300s boundary. Five distinct pollers hit the endpoint (page.tsx:72/112,
SCIProposal.tsx:361, SCIExecution.tsx:166/205, ImportTelemetryPanel.tsx:61,
ImportReadyState.tsx:63 one-shot); during execute, three concurrent 2s polls run
on one screen.

OPTIONS (Section B template lines per option)
---------------------------------------------
Option A — NEW dedicated table `import_session_telemetry` (one row per
  tenant_id + import_session_id) + atomic-increment Postgres function; all
  import-surface pollers re-pointed to the single-row read.          [CHOSEN]
  - Scale test 10x: yes — increment is O(1)/event piggybacked on writes already
    occurring (per pulse / per unit decision, never per row); panel read is one
    PK-indexed row regardless of tenant size; 2B-row import = ~4M pulse
    increments amortized into 4M pulse writes already happening.
  - AI-first: no hardcoding — record is keyed by opaque unitId; no sheet-name,
    language, or shape enumeration anywhere (Korean Test holds).
  - Transport: no row data through HTTP bodies; counters only.
  - Atomicity: single-statement INSERT ... ON CONFLICT DO UPDATE with additive
    expressions + key-scoped jsonb merge; concurrent callers serialize on the
    row lock; no lost counts.
Option B — session-scoped counter row inside `classification_signals`, updated
  in place via read-modify-write.
  - REJECTED: (1) signals are structurally per-unit append-only events — the
    schema row is one signal (sheet_name, classification, structural_fingerprint
    per row; SCHEMA_REFERENCE_LIVE 20 cols), and the whole read side is an
    insert-only reducer ordered by created_at/seq (reduceSessionState,
    comprehension-state-service.ts:216-266); hot in-place UPDATE breaks the
    surface's append semantics. (2) PostgREST cannot express `SET x = x + n`,
    so "update in place" means read-modify-write — lost updates under the
    concurrent unit processing D.2 explicitly mandates against. (3) Amendment 2
    D.1 pre-authorizes the dedicated table on exactly the per-unit finding.
Option C — append per-event counter signals to `classification_signals`;
  panels aggregate per poll.
  - REJECTED: read cost grows with events-per-session — at TMB scale a 2B-row
    import emits ~4M pulse events, so every 2s panel tick aggregates millions of
    rows: the exact A5 class reintroduced, and a per-event-row × unbounded-
    frequency cell in the D.4 contract — a HALT-3 violation by design.
Option D (examined, not a full option) — `processing_jobs.chunk_progress` jsonb.
  - REJECTED: per-FILE job semantics (NOT NULL file_storage_path; one row per
    upload, not per comprehension session); the queued-jobs spine is the
    out-of-scope INF-001 arc (directive §6); and it still needs the same
    function DDL for atomic increments, so it saves nothing.

CHOSEN: Option A. REJECTED: B (append-surface corruption + lost updates),
C (scale-contract violation), D (wrong identity + out-of-scope arc).

D.1 GATE ENTRY (the amendment-required paragraph)
-------------------------------------------------
The session telemetry record lives in a NEW dedicated table
`public.import_session_telemetry`, one durable row per (tenant_id,
import_session_id), written exclusively through a new single-statement
atomic-increment function `public.increment_import_session_telemetry`.
`classification_signals` was examined first per A1's evidence and is
structurally per-unit: every row is one append-only signal event, and every
reader is an insert-only reducer — there is no session-scoped single-fetch row,
and in-place counter updates would corrupt the spine's append contract.
Amendment 2 D.1 pre-authorizes the dedicated table on exactly this finding.
The D.2 atomicity mandate (additive expressions, concurrency-safe) is
unattainable through PostgREST query syntax on ANY surface — supabase-js cannot
express `SET x = x + n` — so function DDL is required under every option and
**HALT-4 is declared with this commit** regardless of table choice; the
dedicated table costs nothing beyond the migration already required. RPC is a
new app-runtime pattern for this codebase (zero `.rpc(` in web/src; generated
Functions type block empty) — named here as ADR-significant novelty, justified
because the alternative is either lost counts (read-modify-write) or a
scale-contract violation (append-and-aggregate).

RECORD SHAPE AND THE EXACTNESS REFINEMENT (D.2 mechanism, named for review)
---------------------------------------------------------------------------
The evidence forces one refinement to D.2's "additive expressions" mechanism.
Three write-path behaviors make naive global additive counters diverge from
truth: (1) terminal `bound` is double-emitted by design (execute-bulk:426
per-unit stream + :527 end-of-run safety batch — today's reducer dedupes by
latest-state); (2) retry-unit creates a SECOND import_batches row for the same
unit in the same session (expected-rows would double-count); (3) D16 unit-atomic
rollback (commit-content-unit.ts:438-479) deletes a unit's committed rows after
pulses already landed. Decision 95 requires the settle audit to return EQUAL,
so the record stores:
- ADDITIVE columns only for genuinely append-only quantities:
  `total_signals_written` (bigint), `signals_per_type` (jsonb, per-key additive
  merge) — the DS-020 SynapticSurface.stats pair (totalSynapsesWritten /
  synapsesPerType, spec vocabulary; ImportTelemetry already anchors to it at
  comprehension-state-service.ts:300-304).
- PER-UNIT LATEST-STATE snapshots for everything unit-scoped: `unit_states`
  jsonb keyed by opaque unitId, value = {sheetName, state, tier, knownCount,
  novelCount, failureClass, classification, confidence, injectedBindings,
  expectedRows, rowsCommitted, pulsesTotal, pulsesLanded, updatedAt} —
  assignment-merged (`||`, key-scoped, latest wins), idempotent under
  re-emission/retry/rollback by construction, exactly mirroring the dedup
  semantics the derive already implements (seenUnits set, first-comprehended
  wins; comprehension-state-service.ts:351-364).
- `conclusion` jsonb (settle summary) and `audit` jsonb (settle-time audit
  verdict), each written once, COALESCE-protected.
Every panel number is then either a stored value or a presentation fold over
the ONE fetched row (sum/count over unit_states values — O(units-per-session)
CPU on one row, no second query). This honors the design principle's intent —
"no display path may recompute session truth by scanning data tables"; a fold
over one fetched row is not a data-table scan, and read cost stays O(1) in
stored data volume. Flagged explicitly for architect disposition at the HALT-4
gate: if literal per-counter columns are preferred over unit_states projections,
the RPC gains a p_deltas parameter and compensating decrements at the rollback/
retry sites — at the cost of exactness-by-convention instead of
exactness-by-construction.

COUNTER VOCABULARY MAPPING (panel contract → record)
----------------------------------------------------
ImportTelemetry (comprehension-state-service.ts:305-320) remains the client
contract — panels do not change shape. Projection from the record:
  totalSignalsWritten        ← total_signals_written (additive)
  signalsPerType             ← signals_per_type (additive per key)
  sheets.total               ← count(unit_states keys)
  sheets.comprehended        ← count(units in comprehended/classified/bound/
                               resolved/failed_interpretation) [same set as
                               derive lines 373-375]
  fingerprints.recognizedTier1 / storedNew ← count(units tier==1) / (tier==3)
  atoms.claimedFromMemory / novelComprehended ← sum(knownCount) / sum(novelCount)
  llm.made / bypassedByMemory ← count(tier==3) / count(tier==1)
  fieldBindingsInjected      ← sum(injectedBindings)
  units.committed / total    ← count(state=='bound') / count(keys)
  rows.committed / total     ← sum(rowsCommitted) / sum(expectedRows)
  perUnit[]                  ← unit_states values {sheetName, expectedRows,
                               committed: state=='bound'}
  pulses.committed / total   ← sum(pulsesLanded) / sum(pulsesTotal) [stored at
                               write time from the commit path's own chunking —
                               retires the duplicated PULSE_SIZE=500 re-derive
                               at comprehension-state-service.ts:324]
SessionStateView (the cheap pollers' contract) projects from the same row:
units from unit_states (history: [] — its only consumer, page.tsx:75's
progress-tick detector, switches to the monotonic total_signals_written +
updated_at), isOpen from unit states. One row serves BOTH contracts; the D19
two-surfaces class closes by construction (Amendment D.3).

WRITE-TIME ACCUMULATION — TWO HOOKS, ZERO PER-CALLSITE WIRING
-------------------------------------------------------------
Hook 1 — the canonical signal funnel (canonical-signal-writer.ts inserts at
:295/:317/:395/:437): every signal batch carrying context.importSessionId fires
ONE fire-and-forget RPC with {signals_delta: N, signals_per_type: {...},
unit_states: patches derived from comprehension:unit_state /
comprehension:tier_resolution payloads}. This single hook covers analyze
(all emitUnitStates/fireSignal sites), execute terminal dispositions,
resolve-unit/retry-unit, the OB-174 process-job sibling (same funnel), and
Phase C's future entity-phase emissions — one observability spine, no
entity-specific vocabulary (HALT-1 disposition §3).
Hook 2 — the pulse path (commit-content-unit.ts): batch create :257 assigns the
unit's {expectedRows, pulsesTotal}; each 500-row pulse :432 assigns the unit's
{rowsCommitted: totalInserted, pulsesLanded: chunksCompleted} (one RPC per
pulse, never per row — D.2's stated rate); rollback :438-479 assigns
{rowsCommitted: 0, pulsesLanded: 0}; finalize :484 assigns the final row count.
Both hooks follow the established non-blocking discipline (emitUnitStates
precedent, '[OB-203][state]' loud-log-never-throw,
comprehension-state-service.ts:155-166): a telemetry write failure never fails
the import.

READ SIDE
---------
GET /api/import/sci/session-state fetches ONE row by (tenant_id,
import_session_id) and serves both contracts; `?telemetry=1` adds the
ImportTelemetry projection of the same row (no second query). All seven
consumers keep their endpoints and cadences (DD-7) — every poll becomes a
single-row PK read. No Realtime/SSE precedent exists in the codebase (grep
verified: none); Amendment D.3 explicitly sanctions polling the single row, so
no streaming novelty ships in this phase. `deriveImportTelemetry` is removed
from the route entirely and demoted to the auditor. The only other polling DB
read on the import surface — ImportProgress.tsx:62-70 polling processing_jobs
by session_id (OB-174 'processing' phase) — is O(files-in-session), independent
of stored data volume, and out of this phase's scope (noted, not touched).

SETTLE-TIME AUDIT (the demoted derive)
--------------------------------------
New idempotent endpoint POST /api/import/sci/settle-audit: guarded on
`audit IS NULL`, invoked from settleFromSurface completion
(SCIExecution.tsx:187) and from ImportReadyState mount (whichever fires first
wins; second is a no-op). It runs deriveImportTelemetry ONCE against the spine
(its only remaining caller), compares scanned truth to the accumulated record
field-by-field, writes {scanned, accumulated, divergent, fields} into `audit`
and the conclusion summary into `conclusion`, and on divergence emits platform
event 'data.import_telemetry_audit_divergence' (one new literal in the
existing data.* family, emitter.ts:19-52 union; insert path is untyped so no
schema change) and the completion screen renders the reconciliation flag —
truth-telling, not silent self-correction (Amendment D.3).

SCALE CONTRACT (D.4, instantiated)
----------------------------------
| Path              | Cost class            | Trigger frequency      | At 10^9 rows / 10^3 tenants |
|-------------------|-----------------------|------------------------|------------------------------|
| Counter RPC       | O(1) single-statement | per pulse / per signal batch / per unit decision | 2B-row import ≈ 4M pulses → 4M single-row upserts amortized into the 4M pulse writes already occurring |
| Panel read        | O(1) one PK row       | 1.5-2s polls (existing) | independent of data volume; N watchers = N single-row reads |
| Audit derive      | O(session data) scan  | ONCE per session at settle | bounded, never concurrent with display polling |
No per-row × unbounded-frequency cell exists. HALT-3 clean.

ANTI-PATTERN REGISTRY CHECK
---------------------------
AP-2/AP-4 (per-row/per-entity writes): none — increments per pulse/decision.
AP-8 (migration without execution): HALT-4/SR-44 path IS the compliant route —
architect applies via Dashboard SQL Editor; CC verifies post-application via
tsx script (authored with the migration). AP-12: uuid defaults, no Date.now
IDs. AP-13/18/19 (schema assumptions): table is defined in this change;
SCHEMA_REFERENCE_LIVE.md gains the new table post-application. AP-15/16
(progress feedback): this phase exists to strengthen it. AP-17 (two code
paths): one route, one record, both contracts projected from it. AP-26
(closed-vocabulary registries): signals_per_type is open-vocabulary jsonb keyed
by whatever signal_type emitters produce; unit_states keyed by opaque unitId;
no registration gates anything.

GOVERNING PRINCIPLES EVALUATION (G1-G6)
---------------------------------------
G1 — Standards: SOC1/SSAE 18 audit-trail posture (the fast surface is
self-auditing: accumulated counters verified against scanned truth once per
session, divergence durably recorded); ACID atomicity (single-statement
upsert serializes on the row lock — PostgreSQL row-level locking guarantees).
G2 — Architectural embodiment: the record IS the display truth (one row, one
fetch, both contracts) and the settle audit IS the reconciliation control —
not a policy to run checks, but a structure where the check is the only path
to `conclusion`. D19 (two panels disagree) is closed by construction: there is
only one surface to read.
G3 — Traceability: Amendment 2 §1-2 → this ADR → migration
20260612200000_ob203_phase6b_phase_d_import_session_telemetry.sql →
accumulator/route diffs in the Phase D EPG. An auditor can verify the chain
without reading source.
G4 — Discipline: database systems — materialized aggregate maintenance
(write-time rollup vs read-time aggregation; Gray & Reuter, Transaction
Processing 1993: maintain hot aggregates with the transaction, audit with the
batch). Control theory (Wiener 1948): measure at the source, at event time —
the importing process possesses every number at the instant it becomes true
(Amendment §1 verbatim).
G5 — Abstraction: counters are structural (units, pulses, rows, signals) —
domain-, language-, and tenant-agnostic; the same record shape serves any
import in any vertical. The research (aggregate maintenance) applies to any
domain Vialuce enters.
G6 — Innovation boundary: nothing speculative — single-row counter upserts and
once-per-period reconciliation audits are textbook OLTP; the only codebase
novelty (first app-runtime RPC) is forced by a documented PostgREST limitation
and named above.

HALT-4 DECLARATION AND POST-APPLICATION SEQUENCE
------------------------------------------------
Migration authored and committed with this ADR:
`web/supabase/migrations/20260612200000_ob203_phase6b_phase_d_import_session_telemetry.sql`
(table + jsonb_add_counters + increment_import_session_telemetry + RLS per
HF-283 conventions + transactional assertion block). Architect applies via
Dashboard SQL Editor (SR-44). Verification script committed alongside:
`web/scripts/verify-ob203-phase-d-telemetry.ts` (additive exactness, concurrent
increment burst = exact count, unit-patch assignment semantics, cleanup) — CC
runs it post-application and pastes output before any implementation code
ships. Implementation order after verification: database.types.ts (table +
Functions block), accumulator module + Hook 1 + Hook 2, session-state route
re-point, settle-audit endpoint + derive demotion, page.tsx tick-detector
switch, then the D.5 EPG live run (panels move continuously; telemetry=1
full-scan absent from logs; audit equality pasted; no display query >2s).
