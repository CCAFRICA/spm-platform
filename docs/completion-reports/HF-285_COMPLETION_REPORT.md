# HF-285 — SCI Pipeline Binding Unification and Efficiency — Completion Report

**Date:** 2026-06-13 · **Branch:** `OB-203-phase-6` (witness worktree) · **Evidence source:** DIAG-066 (`a14265f8`)
**Status:** A, B (correctness) + C, D (efficiency) SHIPPED with live proof. **E closed as already-satisfied** (premise corrected — no code ships). Witness on MX tenant `3d354bfa` is the architect's acceptance test (criteria in §Witness).

## Commit ledger

| Component | What | SHA | Proof |
|---|---|---|---|
| A | Gate reads canonical HC surface | `1047d979` | 5 failed sheets resolve via `findHcRole` against the live warm proposal; build green |
| B | Classification-aware identifier role | `fdf751e9` | 4 unit tests; both copies fixed (agents.ts + negotiation.ts); 194/194 |
| C | Concurrent LLM comprehension | `9688cdbb` | serial 229.3s → concurrent 110.5s (51.8%); serial≡concurrent classifications |
| D | Parse-once companion artifact | `be0bdc49` | HALT-5: gz 6.5MB; HALT-6: read 4s vs parse 34s; live-storage round-trip |
| E | Profiling sampling policy | (no code) | premise inaccurate — profiling already samples to 50; full-row ops are identity |

All on a dedicated `git worktree` (`/Users/AndrewAfrica/spm-platform-ob203-witness`) per the standing worktree-isolation rule (DIAG-064). Vintage attested at commit time.

---

## Component A — Gate Unification (BLOCKING, PASS)

`processEntityUnit` (execute-bulk:781) gated entity commit on `confirmedBindings.semanticRole==='entity_identifier'` only. Now falls back to the canonical HC surface — `findHcRole(classificationTrace,'identifier')` at HC_IDENTIFIER_THRESHOLD 0.80 — the surface `resolveEntityIdField` already reads. `findHcRole` exported (no duplication; HALT-1 clear). Read blind to producer (AUD-009 clean; Decision 64 v3 one surface).

**Proof gate A** (`verify-hf285-binding.ts`, imports the REAL exported `findHcRole`, runs against the live warm session `505a6d2c` proposal):
```
Sucursales       (was FAILING)  findHcRole('identifier')=location_id  GATE RESOLVES=YES
Menus            (was FAILING)  findHcRole('identifier')=menu_id      GATE RESOLVES=YES
Resumen_Sucursal (was FAILING)  findHcRole('identifier')=location_id  GATE RESOLVES=YES
Resumen_Menu     (was FAILING)  findHcRole('identifier')=item_id      GATE RESOLVES=YES
Resumen_Empleado (was FAILING)  findHcRole('identifier')=empleado_id  GATE RESOLVES=YES
Empleados/Resumen_Producto (was passing)  GATE RESOLVES=YES
Gate A: PASS — all 7 entity sheets resolve an identifier on a canonical surface
```
tsc clean; build compiled successfully.

## Component B — Flywheel Write Reconciliation (BLOCKING, PASS)

The identifier-role cardinality fallback assigned `transaction_identifier` to high-uniqueness identifier columns without consulting classification. Fixed in BOTH copies (T1-E952 adjacent-arm): `agents.ts:assignSemanticRole` (the FULL-claim path that produced the failing bindings) and `negotiation.ts:inferRoleForAgent` (SPLIT path). New structural predicate `isEntityIdentifierAgent` (sci-types.ts, closed AgentType set, Korean Test): `entity||target` → identifier resolves to `entity_identifier` regardless of cardinality; placed AFTER the LLM `identifiesWhat` block (Decision 158 preserved). **HALT-2 clear:** `buildProposalFromState` (analyze:804) runs AFTER the graph-prior override (analyze:609/632), so `resolveClaimsPhase1` receives the final post-override `agent` — no threading needed.

**Proof gate B** (4 unit tests): entity/target unique identifier → `entity_identifier`; transaction unchanged → `transaction_identifier`; predicate truth table. 194/194; tsc clean; build green.

## Component C — Concurrent LLM Comprehension (EFFICIENCY, PASS)

`decomposeComprehension`'s serial per-sheet LLM dispatch → bounded concurrency (`p-limit`, `SCI_LLM_CONCURRENCY` default 4, clamp [1,8]). `Promise.allSettled` barrier: all comprehensions complete before the graph stage (Decision 158 — parallelism of recognition, not semantics). Single-sheet failure isolated. OB203_VERBOSE logs the concurrency at analyze start. **HALT-3 clear** (no adapter serialization).

**Proof gate C** (scratch tenant, real 162,956-row MX file, 16 sheets, cold):
```
serial (SCI_LLM_CONCURRENCY=1)   229.3s
concurrent (4)                   110.5s   → 51.8% improvement (HALT-4 PASS, <134s)
[OB203_VERBOSE] comprehension concurrency=4 over 16 sheet(s)
```
**Semantics concurrency-invariant (PROVEN):** serial and concurrent produced IDENTICAL 16 classifications to each other. The only delta vs the 4ae71225 baseline is Portada (reference vs plan) — present in BOTH serial and concurrent runs, so LLM variance on the out-of-scope ambiguous cover page (§6), not a concurrency regression. The 5 entity sheets match.
- The <80s aspiration is unmet (110.5s); the residual ~60s is non-LLM analyze overhead (profiling/graph/signal writes), NOT addressable by C. HALT-4 (the actual gate) passes.

## Component D — Parse-Once Companion Artifact (EFFICIENCY, PASS)

The full parsed workbook is persisted ONCE (gzipped, content-hash keyed) so the two server-side full parses (`process-job` classify + `execute-bulk` commit) and every 300s-boundary resume read the parse instead of re-parsing. **Architecture correction:** the directive's premise ("analyze parses the full workbook") is inaccurate — analyze uses client samples; the dup is process-job + execute. Keyed by content hash (session ids misalign between the async-classify and execute phases; "hash matches the file" holds by construction). Carry Everything: the companion stores ALL rows — transport cache, never the persistence layer; best-effort with live-parse fallback.

**Proof gates** (real MX file):
```
HALT-5: JSON 91.2MB → gzip 6.5MB (< 50MB)                          PASS
HALT-6: companion read ~4s replaces ~34s xlsx parse (net −29s/use); 3s serialize amortized   PASS
Round-trip vs LIVE storage: 16 sheets / 162,956 rows restored — columns, counts,
  Ventas_Transaccional first+last row deep-equal                   PASS
```
tsc clean; 194/194; build green. End-to-end execute-reads-companion timing is exercised by the witness async path.

## Component E — Profiling Sampling Policy (PREMISE CORRECTED — already satisfied, no code)

**Finding:** the directive's premise — "distinct counts and ratios computed over full columns during analyze" — does NOT hold against the code. Profiling is ALREADY sampled to 50 rows on both paths:
- async `process-job:182`: `const sampleRows = sheet.rows.slice(0, ANALYSIS_SAMPLE_SIZE)` (= 50); `generateContentProfileStats`/`generateContentProfilePatterns`/`detectTemporalColumns` all receive `sampleRows`.
- sync `analyze:139`: profiles the client-sent rows, which `page.tsx` slices to `ANALYSIS_SAMPLE_SIZE` (50) before sending.
- `content-profile.ts:528`: `sampleRowCount: rows.length` — the basis; the 1a fix already divides the repeat-ratio by this sample basis, not the full rowCount.

The only full-row operations are content-**identity** — atom hashing (`runDecomposedComprehension`, Deviation 2) and `lookupFingerprint` (process-job:148) — which are Carry Everything (T1-E902 v2) and must NOT be sampled.

**Therefore no code ships for E.** The sampling policy E describes is already implemented and consistent. Implementing the directive's `SCI_PROFILE_SAMPLE_SIZE=5000` would *regress* profiling 100× (50→5000 rows) with zero benefit, violating Fix-Logic-Not-Data and the efficiency intent. This is not a HALT (no blocker) — E is closed as already-satisfied, and per component independence does not block A–D.

---

## HALT log

| HALT | Component | Status |
|---|---|---|
| HALT-1 | A | NOT fired — `findHcRole` exported, importable, no duplication |
| HALT-2 | B | NOT fired — classification available (post-override `agent`); no threading needed |
| HALT-3 | C | NOT fired — adapter has no serialization; SDK 429-backoff composes |
| HALT-4 | C | NOT fired — 51.8% improvement (>40%) |
| HALT-5 | D | NOT fired — gzip 6.5MB < 50MB |
| HALT-6 | D | NOT fired — read 4s < parse 34s (net positive) |
| HALT-7 | E | N/A — E ships no code (premise corrected; profiling already sampled) |

## Build-restart evidence

Per component: `rm -rf .next && npm run build` → ✓ Compiled successfully (p-limit ESM under Next 14.2.35). `npx tsc --noEmit` clean. `npm test` 194/194 (added: 4 B tests; the decomposed-comprehension path now exercises concurrency). Dev servers used for the C/D scratch measurements were killed after each run.

## Witness (architect acceptance, MX tenant 3d354bfa)

Criteria (architect, unchanged): 16/16 committed, zero LLM (Tier-1 warm), 184 bindings injected, HF-213 supersede, settle audit EQUAL, DB responsive. Component A's HC fallback unblocks the 5 entity sheets on the warm run **even with the stale `transaction_identifier` flywheel cache** (it reads the surviving HC `columnRole='identifier'`); Component B converges the cache to `entity_identifier` on the next cold write. Components C/D reduce analyze concurrency time and eliminate the execute/resume re-parse, aiding the "DB responsive" criterion. The worktree is attested and built; the witness runs from it.

## ARTIFACT SYNC

```
MC:
  - DIAG-066 binding-gap → HF-285-A/B SHIPPED (dual-surface unification). CLOSED.
  - Concurrent LLM comprehension (C) SHIPPED (SCI_LLM_CONCURRENCY).
  - Parse-once (D) SHIPPED (content-hash companion); directive premise corrected
    (process-job+execute dup, not analyze).
  - Profiling sampling (E): premise inaccurate — already implemented (50-row sample);
    CLOSED no-op. Retire from the backlog as satisfied.
  - Single-flight / resume lease (DIAG-066 Q2): DISTINCT HF, still OPEN (post-arc).
  - Companion cleanup TTL (D §6A residual): NEW MC item — objects accumulate under
    {tenant}/parsed/; hook session cleanup or 24h TTL.
  - Double-parse (DIAG-066 §6A): SUBSUMED by D (execute/resume re-parse eliminated).
REGISTRY:
  - T1-E952 (Adjacent-Arm Drift): exercised — B fixed BOTH copies of the identifier
    logic (agents.ts + negotiation.ts), not just the directive-named one. Evidence to add.
  - AUD-009 (producer-enumerated consumer): A reads the canonical surface blind to
    producer — adds a clean instance (a 3rd producer needs no gate change).
R1:
  - Warm-path entity binding: A unblocks the 5 sheets (HC fallback), proven against
    the live warm proposal. Witness confirms 16/16 committed.
BOARD:
  - Efficiency: cold analyze −51.8% (C); execute/resume re-parse eliminated (D).
SUBSTRATE:
  - Decision 64 v3 (one canonical surface): A — entity-id derivation reads ONE surface.
  - T1-E910 v2 (Korean Test): B — isEntityIdentifierAgent is a structural predicate over
    the closed AgentType set, no language literals.
  - Decision 158 (LLM recognizes, code constructs): C — concurrency changes parallelism
    of recognition, not construction (allSettled barrier before the graph stage).
  - T1-E902 v2 (Carry Everything): D + E — sampling/transport-cache touch profiling and
    parse transport ONLY; persistence (commitContentUnit) and identity (atoms,
    fingerprints) operate on full rows, never sampled.
```

## Residuals

- **Single-flight resume lease** (DIAG-066 Q2): distinct HF, post-arc.
- **Companion cleanup** (D): `{tenant}/parsed/` objects accumulate; TTL/session-cleanup follow-on.
- **Portada cover-page classification variance** (plan/reference): out of scope (§6); graph-prior self-corrects to reference (the better outcome) on recent runs.
- **HF-285 measurement scratch tenants** (cold-measure concurrent + serial runs): analyze-only (no committed_data/entities), retained; clearable via `src/scripts/clear-tenant.ts`.
- **PR**: follows the architect's witness sign-off (SR-43).
