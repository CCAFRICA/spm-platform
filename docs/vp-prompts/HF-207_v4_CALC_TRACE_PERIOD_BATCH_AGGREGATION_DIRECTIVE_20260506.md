# HF-207 v4 — Calc Trace: Period/Batch Aggregation + Tenant Context Completion

**Status:** DIRECTIVE — premise corrected at Phase 0 grep, ready for CC dispatch
**Date:** 2026-05-06
**Version:** v4 (supersedes v3; removes §3.1 — VARIANT-DIAG block already tenant-agnostic; corrects premise §1.1 against empirical code state)
**Originating concern:** Trace insufficient for empirical reconciliation without UI dependency (period and batch aggregation gap)
**Defect class:** Diagnostic substrate lacks reconciliation-grade aggregation emission
**Scope:** TRACE LAYER ONLY — no calc semantic changes, no API surface changes
**Substrate bindings:** T1-E905 Prove Don't Describe, T2-E46 Reconciliation-Channel Separation, T1-E953 Decision-Implementation Gap Pattern, T5-E1064 Procedural Theater Minimization

---

## VERSION HISTORY

- **v1 (initial draft):** 4 architect approval gates pending
- **v2 (gates locked):** N=3 with parameterization, JSON.stringify for grep, always-emit batch_complete, code-side scan gate, AUD-005 refresh bundled as Phase 0
- **v3 (paths corrected):** File paths corrected against AUD-005 (`web/` prefix and `calculation/` directory). §5.4 framing corrected for single-period-per-call architecture
- **v4 (premise corrected):** §3.1 VARIANT-DIAG eliminate-hardcoded-names removed entirely — empirically refuted at Phase 0 grep. Current code (route.ts:1391-1422) is already first-3 dynamic via runtime `entityMap.get(eid).display_name`. The BCL names appearing in six-period traces are runtime artifacts, not compile-time constants.

---

## ARCHITECT-CHANNEL META-NOTE — THIRD DISCIPLINE FAILURE CAPTURED

The HF-207 chain has now produced three architect-channel discipline failures, in escalating order of consequence:

| # | Failure | Caught at | Severity |
|---|---------|-----------|----------|
| 1 | Substrate property (tenant-agnosticism) assumed but not specified in HF-202/203/204 chain | Architect review of six-period BCL trace | Medium — drove HF-207 origination |
| 2 | File paths asserted from session-memory pattern matching (v1, v2) | Architect AUD-005 verification at v2 review | Low — caught before CC dispatch |
| 3 | Code-state claim ("hardcoded entity names") asserted from runtime trace evidence alone, without code verification (v1, v2, v3) | CC §5.1 grep at Phase 0 | **High — would have driven CC to implement procedural theater per T5-E1064 if not caught** |

**Failure 3 root cause analysis:** Three entity names appearing across six trace runs of the same tenant is exactly what runtime resolution from `entityMap.get(eid).display_name` would produce — the names persist because tenant and entity ordering persist, not because the code embeds them. The architect-channel mistakenly read tenant-stable runtime values as code-level constants.

**Substrate-level lesson:** T1-E905 (Prove Don't Describe) cuts both ways. Asserting a code-level claim from runtime evidence requires that the runtime evidence be sufficient to disambiguate code-level mechanisms. Three names across six runs of one tenant is NOT sufficient evidence to claim hardcoding — multi-tenant trace evidence OR direct code inspection is required.

CC's Phase 0 grep verification — running §5.1 BEFORE patch implementation rather than after — is the correct procedural shape. This pattern (run verification gates pre-patch, not just post-patch) is candidate for substrate elevation.

---

## 1. Empirical evidence (corrected)

### 1.1 ~~Tenant coupling defect~~ — REFUTED at Phase 0

v1/v2/v3 of this directive claimed the `[VARIANT-DIAG]` trace block emitted hardcoded entity names. CC §5.1 Phase 0 grep against current HEAD f6e3dca1 returned ZERO matches across all three patterns (Spanish proper names, BCL tenant UUID, role identifiers) in the calc-execution surface trio.

Direct inspection of `route.ts:1391-1422` confirmed the VARIANT-DIAG block uses `entityMap.get(eid)?.display_name` — runtime resolution from Supabase, tenant-agnostic by construction. The names visible in six-period BCL traces are runtime artifacts of which tenant ran the calc, not code-level coupling.

**§3.1 of v3 (eliminate hardcoded names) is removed from this v4 directive.** No semantic gap to close. Refactoring the existing `if (diagCount >= 3) break` to `Array.from(materializedState.entries()).slice(0, N)` would be cosmetic-only and constitutes procedural theater per T5-E1064.

### 1.2 Reconciliation emission gap — VALID

The trace emits per-entity totals:
```
Gabriela Vascones Delgado: 1,505 | intent=1,505 ✓
Carlos Mauricio Reyes Vega: 1,025 | intent=1,025 ✓
```

But emits NO period-level grand total in a structured form. Current `COMPLETE` addLog (route.ts:2212) emits `total=${grandTotal}` scalar only — no per-entity breakdown, no period label structured, no JSON-parseable structure for downstream tooling.

For a calc system whose primary correctness gate is reconciliation against ground truth, this is a Prove Don't Describe (T1-E905) violation: the trace does not emit empirical evidence in a structured form sufficient for the proof.

### 1.3 Cross-call batch defect

Per AUD-005 §3.1, the `POST /api/calculation/run` endpoint accepts a single-period payload `{ tenantId, periodId, ruleSetId }`. Each HTTP call is structurally single-period; there is no in-handler multi-period iteration.

**The trace defect:** every HTTP call lacks a uniform terminal aggregation sentinel. Six-period BCL validation = 6 separate HTTP calls = 6 separate trace streams. Without a terminal sentinel emission per call, downstream tooling (grep, log parsers, reconciliation scripts) cannot reliably identify call boundaries.

Solution: emit a `runCalculation:period_complete` line per call (the period IS the batch in this architecture). Always-emit `runCalculation:batch_complete` as a terminal sentinel for log-shape consistency, forward-compatible with future architectural changes that might introduce in-handler iteration.

### 1.4 Tenant context completeness — needs CC verification

Existing `[CalcTrace] context` line at calc start emits `tenantId, periodId, periodLabel, ruleSetId, ruleSetName, calcBatchId`. CC must verify whether `tenantName` is currently emitted; add if missing. Required for log-based diagnostics across multiple concurrent tenants.

---

## 2. Phase 0 — AUD-005 refresh (PRECEDES patch implementation)

**Rationale:** AUD-005 baseline at commit `5314c365` is stale relative to current main (`f6e3dca1`, post-HF-206 merge `eaf5ac5c`). HF-206 modified the OB-118 merge precedence guard. Per DIAG-034 refresh discipline, AUD-005 must be regenerated before any patch grounds against its line references.

**Phase 0 deliverable:**

1. Regenerate `AUD-005_CALC_EXECUTION_LIVE_REFERENCE_f6e3dca1.md` from current HEAD using the same generation procedure as 5314c365
2. Verify regenerated file contains:
   - Updated line references for `web/src/app/api/calculation/run/route.ts` calc handler (post-HF-206 OB-118 merge guard)
   - Current `web/src/lib/calculation/intent-executor.ts` surface
   - Current `web/src/lib/calculation/run-calculation.ts` surface
   - Confirmation that the existing `[CalcTrace] context` emission site is locatable
   - Confirmation that the existing per-period `COMPLETE` addLog site (currently route.ts:2212) is locatable
   - Confirmation that the API handler exit point before `NextResponse.json(...)` is locatable
3. Mark `AUD-005_CALC_EXECUTION_LIVE_REFERENCE_5314c365.md` as superseded by adding header:
   ```markdown
   # ⚠️ DEPRECATED — superseded by AUD-005_CALC_EXECUTION_LIVE_REFERENCE_f6e3dca1.md
   # This snapshot is retained for historical reference only.
   # Refresh reason: HF-206 (OB-118 merge precedence reversal) modified calc-execution surface.
   ```
4. Phase 0 commit message: `DIAG-035: AUD-005 refresh f6e3dca1 (post-HF-206)`

**Phase 0 verification gate:** Architect or CC confirms regenerated AUD-005 contains the HF-206 guard pattern at expected line range AND locates all three Phase 1 emission sites. Upon confirmation, Phase 1 proceeds.

**Phase 0 §5.1 grep verification:** ALREADY RUN by CC at v3 review, returned ZERO matches across all three patterns. Result preserved as pre-patch baseline. Re-run post-patch to confirm no regression.

---

## 3. Phase 1 — Patch implementation directive

### 3.1 Period-complete emission

After all entities complete for the period (which IS the batch in current single-period-per-call architecture), emit a single summary line. **Format uses `JSON.stringify` for `perEntityTotals` for grep-parseability:**

```typescript
const perEntityTotals: Record<string, number> = {};
let grandTotal = 0;
for (const [entityId, result] of perEntityResults.entries()) {
  perEntityTotals[entityId] = result.intentTotal;
  grandTotal += result.intentTotal;
}

addLog(
  `[CalcAPI] [CalcTrace] runCalculation:period_complete` +
  ` | period=${periodLabel}` +
  ` | tenantId=${tenantId}` +
  ` | entitiesCalculated=${perEntityResults.size}` +
  ` | grandTotal=${grandTotal}` +
  ` | perEntityTotals=${JSON.stringify(perEntityTotals)}`
);
```

**Site:** Immediately before the existing `COMPLETE` addLog at route.ts:2212 (verify exact line against refreshed AUD-005). This places `period_complete` after all entity calculations have completed, before the API handler returns.

**Note on entity key choice:** `perEntityTotals` keys SHOULD be entity external IDs (e.g., `BCL-5003`) rather than UUIDs, matching the convention at `runCalculation:entity_start entity=BCL-5003`. This makes log-to-ground-truth reconciliation direct.

**Note on existing COMPLETE line:** The existing `total=${grandTotal}` scalar emission may be retained for backward compatibility with any current log consumers, OR removed if no consumers depend on it. CC's call based on grep across the broader codebase for log consumers. If retained, it must follow `period_complete`, not precede it (so `period_complete` is the structurally complete summary).

### 3.2 Batch-complete emission (always emit, terminal sentinel)

After `period_complete` emits, **always emit `batch_complete`** as a terminal sentinel before the API handler returns:

```typescript
addLog(
  `[CalcAPI] [CalcTrace] runCalculation:batch_complete` +
  ` | batchId=${calcBatchId}` +
  ` | tenantId=${tenantId}` +
  ` | ruleSetId=${ruleSetId}` +
  ` | periodsCalculated=1` +
  ` | crossPeriodGrandTotal=${grandTotal}` +
  ` | perPeriodGrandTotals=${JSON.stringify({ [periodLabel]: grandTotal })}`
);
```

**Always-emit rationale:** A downstream parser/grep operator expects a uniform terminal line at every calc batch end. In the current single-period-per-call architecture, `batch_complete` reduces to a near-duplicate of `period_complete` — that's acceptable redundancy for log-shape consistency. If a future architectural change introduces in-handler multi-period iteration, `batch_complete` becomes meaningfully distinct without trace-format change.

**Site:** Immediately after `period_complete` emission, before `NextResponse.json(...)` return. CC must locate exact line via refreshed AUD-005.

### 3.3 Tenant context emission completeness

CC must verify whether the existing `[CalcTrace] context` emission site (per AUD-005) currently emits `tenantName`. Reference evidence from trace output: `2026-05-06 18:01:19.917 [info] [CalcAPI] [CalcTrace] context tenantId=b1c2d3e4-... periodId=... periodLabel=2025-10 ruleSetId=... ruleSetName=Plan de Comisiones — Banca Minorista 2025-2026 calcBatchId=...`

The trace excerpt shows `ruleSetName` but does NOT show `tenantName`. If verification confirms `tenantName` is missing from the context emission, add it:

```typescript
addLog(
  `[CalcAPI] [CalcTrace] context` +
  ` tenantId=${tenantId}` +
  ` tenantName=${tenantName ?? "(unknown)"}` +
  ` periodId=${periodId}` +
  ` periodLabel=${periodLabel}` +
  ` ruleSetId=${ruleSetId}` +
  ` ruleSetName=${ruleSetName}` +
  ` calcBatchId=${calcBatchId}`
);
```

If `tenantName` is already emitted, no change required for this section.

---

## 4. Out of scope (deferred or separate concerns)

- **VARIANT-DIAG refactor** (REMOVED from this directive — premise refuted at Phase 0; existing code is already tenant-agnostic)
- **Pass 4 derivation efficiency** (deferred to OB-185 follow-on; HF-206 Shape A guard makes this non-urgent)
- **Trace verbosity controls** (HF-204 chose always-on; HF-207 preserves that decision)
- **Trace persistence beyond Vercel runtime logs** (separate substrate concern)
- **Calc semantics** (HF-207 modifies trace output only; no convergence/intent-executor changes)
- **In-handler multi-period iteration** (would require API surface change; out of trace-layer scope)
- **Runtime per-tenant noise-budget configurability for VARIANT-DIAG sample size** (would require runtime config infrastructure; out of trace-layer scope)

---

## 5. Verification gate (5-item, scope reduced)

Before merging HF-207, CC must produce the following evidence:

### 5.1 Code-side scan (regression prevention gate)

CC re-runs the following greps post-patch to confirm no regression introduced compile-time tenant identifiers:

```bash
# Hardcoded BCL entity names (Spanish proper names from flat data)
grep -nE "Gabriela|Vascones|Carlos Mauricio|Reyes Vega|Mauricio Sebastián|Ochoa Ibarra|Laura Elena|Suárez|Marcela Alejandra|Andrade Quinde" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/intent-executor.ts \
  web/src/lib/calculation/run-calculation.ts

# Hardcoded BCL tenant UUID
grep -nE "b1c2d3e4-aaaa-bbbb-cccc-111111111111" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/intent-executor.ts \
  web/src/lib/calculation/run-calculation.ts

# Hardcoded role values when used as compile-time identifiers (not test data)
grep -nE "Ejecutivo Senior|\"Ejecutivo\"" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/intent-executor.ts \
  web/src/lib/calculation/run-calculation.ts
```

**Pass condition:** All three greps continue to return ZERO matches in production code paths (matching pre-patch baseline established at v3 review). Matches in `__tests__/` directories or fixture files are acceptable.

**Note:** This gate already pre-passed at v3 review. Re-running post-patch confirms HF-207 patch did not introduce regressions.

### 5.2 Tenant-agnosticism runtime gate (regression prevention)

Run calc on Meridian or CRP tenant. VARIANT-DIAG lines must continue to emit for actual entities present in that tenant (current behavior; this gate confirms no regression).

**Evidence required:** Meridian (or CRP) calc trace excerpt showing `[VARIANT-DIAG] <Meridian-or-CRP-entity-name>: ...` lines for first 3 entities.

### 5.3 Period-complete emission gate

For any calc, single trace line emits at period boundary showing grand total. Sum of per-entity totals visible in trace must equal `grandTotal`.

**Evidence required:** Trace excerpt showing `runCalculation:period_complete | ... | grandTotal=<X> | perEntityTotals={...}` and arithmetic confirmation that sum of `perEntityTotals` values equals `X`.

### 5.4 Batch-complete emission gate (single-period reality)

Current API surface is single-period-per-HTTP-call. For a single calc invocation (any period), `batch_complete` MUST emit after `period_complete`. For two separate calc invocations (e.g., Oct 2025 + Nov 2025 separately), each invocation MUST emit a well-formed `period_complete` + `batch_complete` pair.

**Evidence required:**
- (a) Single invocation trace excerpt showing both `period_complete` and `batch_complete` lines
- (b) Two-invocation trace excerpts (any two periods) each containing well-formed `period_complete` + `batch_complete` pair
- (c) Arithmetic confirmation: in each invocation, `crossPeriodGrandTotal` equals the single period's `grandTotal` (since `periodsCalculated=1`)

### 5.5 No regression gate

Existing per-entity per-component traces preserved; no removal of HF-204 diagnostic surface. Specifically:
- `[CalcTrace] resolveMetricsFromConvergenceBindings:*` lines still emit per component
- `[CalcTrace] resolveColumnFromBatch:exit` lines still emit per metric resolution
- `[CalcTrace] executeBoundedLookup1D:execution` and `executeBoundedLookup2D:execution` still emit
- `[CalcTrace] runCalculation:component_complete` still emits per component
- Per-entity total `<name>: <total> | intent=<total> ✓` still emits per entity
- VARIANT-DIAG block continues to emit first-3 entities dynamically (unchanged)

**Evidence required:** Diff comparison between pre-HF-207 and post-HF-207 trace output for the same calc. Only additions (period_complete, batch_complete, optionally tenantName in context); no removals.

---

## 6. Architect approval gates (LOCKED, scope reduced)

Original four gates from v1, locked at v2:

| Gate | Decision | v4 status |
|------|----------|-----------|
| 1. VARIANT-DIAG sample size N | N=3 with `VARIANT_DIAG_SAMPLE_SIZE` constant | **REMOVED** — §3.1 not applicable; existing code is already first-3 dynamic |
| 2. Period-complete format | Pipe-delimited matching existing style; `perEntityTotals` via `JSON.stringify` | Preserved |
| 3. Batch-complete location | Calc API handler exit before `NextResponse.json(...)`; always emit as terminal sentinel | Preserved |
| 4. Verification gate | 5-item gate including code-side scan | Preserved as regression-prevention gate (pre-passed at Phase 0) |

Plus staleness handling: **AUD-005 refresh bundled as Phase 0** (DIAG-035), preceding patch implementation.

Plus path corrections (v3): monorepo paths use `web/` prefix and `calculation/` directory.

Plus single-period-per-call architectural reality (v3): §5.4 verification gate is multi-invocation evidence rather than single-invocation multi-period.

Plus premise correction (v4): §3.1 VARIANT-DIAG eliminate-hardcoded-names removed entirely; existing code already tenant-agnostic per Phase 0 grep.

---

## 7. Failure-mode acknowledgment

Three architect-channel discipline failures captured across v1 → v4:

**Failure 1: Substrate-property assumption gap (v1 origin).** The HF-202 → HF-203 → HF-204 design chain failed to specify tenant-agnosticism as a substrate property. Decision-Implementation Gap (T1-E953). Caught at architect review of six-period BCL trace. Drove HF-207 origination.

**Failure 2: Path assertion without verification (v1/v2 origin, corrected v3).** v1 and v2 of this directive asserted file paths drafted from session-memory pattern-matching rather than verified against AUD-005. PCD-discipline failure. Caught at architect AUD-005 verification at v2 review.

**Failure 3: Code-state claim from runtime evidence (v1/v2/v3 origin, corrected v4).** v1/v2/v3 of this directive claimed VARIANT-DIAG hardcoded entity names based on three names appearing across six BCL trace runs. T1-E905 misapplication: runtime evidence was insufficient to support a code-level claim. Caught at CC §5.1 Phase 0 grep BEFORE patch implementation.

**Substrate-level lessons captured:**
- Diagnostic infrastructure directives must explicitly specify tenant-agnosticism as a constraint
- Verification gates must include compile-time identifier scans
- Architect-channel must verify file paths against AUD-005 before asserting them in directives
- Architect-channel must NOT assert code-level claims from runtime evidence alone — multi-tenant runtime evidence OR direct code inspection is required
- Verification gates should be runnable PRE-patch as a check on directive premises, not just POST-patch as a validation of implementation

The CC behavior of running §5.1 Phase 0 grep BEFORE patching, and HALTing when premise §1.1 was empirically refuted, is the correct procedural shape. This is a closed-loop discipline win.

---

## 8. Substrate candidates (VG-side, deferred to promotion wave)

**Pattern: Diagnostic-Substrate Tenant-Agnosticism Constraint** (preserved from v3)

Diagnostic infrastructure that emits trace, log, or audit data MUST treat tenant-specific identifiers (names, IDs, labels) as inputs read from runtime state, never as compile-time constants. Verification: code-side grep + multi-tenant runtime evidence.

**Pattern: Architect-Channel Path-Assertion Discipline** (preserved from v3)

Architect-channel directives that reference specific file paths MUST verify paths against current AUD-005 before assertion. If AUD-005 is not accessible at directive draft time, paths must be marked "verify against AUD-005" rather than asserted directly.

**Pattern: Architect-Channel Code-State-Claim Evidence Discipline** (NEW in v4)

Architect-channel directives that make claims about code state (e.g., "X is hardcoded", "Y does not exist", "Z fires under condition Q") MUST ground those claims in evidence sufficient to disambiguate code-level mechanisms. Runtime trace evidence from a single tenant is necessary but NOT sufficient for code-state claims — multi-tenant runtime evidence OR direct code inspection (via AUD-005 or equivalent) is required.

**Anti-pattern:** Reading tenant-stable runtime values (entity names, IDs, role strings that persist across runs of one tenant) as code-level constants. Persistence-across-runs is a property of tenant data stability, not code coupling.

**Pattern: Pre-Patch Verification Gate Discipline** (NEW in v4)

Verification gates designed for post-patch validation may also be valuable as PRE-patch directive premise checks. Running the §5.1-style code-side scan BEFORE patch implementation provides architect-channel directive premise validation, catching directive-state mismatches before they drive procedural theater.

**Rationale:** CC's HALT at Phase 0 grep — running §5.1 pre-patch and catching the premise refutation — saved a procedural theater patch from shipping. This pattern (pre-patch directive premise verification) is generalizable beyond HF-207.

---

## END OF v4 DIRECTIVE

**Awaiting architect "go" to dispatch as single PR (Phase 0 + Phase 1).**
