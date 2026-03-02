# OB-134: SCI Phase 2 — Spatial Negotiation + Field-Level Claims — Completion Report

## Date: 2026-03-01
## Branch: dev
## Type: Overnight Batch

---

## Commits

| # | Hash | Phase | Description |
|---|------|-------|-------------|
| 1 | `7710b8f` | Prompt | Commit prompt — SCI Phase 2: Spatial Negotiation |
| 2 | `48ea862` | Phase 0 | Diagnostic — claim resolution, agent scoring, field analysis |
| 3 | `bd9745c` | Phase 1 | Architecture decision — Round 2 negotiation + field-level claims |
| 4 | `f623668` | Phase 2 | Negotiation engine — Round 2 scoring, field affinities, PARTIAL claims |
| 5 | `85cd317` | Phase 3 | Analyze API integration — Round 2 replaces Phase 1 |
| 6 | `15d91bd` | Phase 4 | Execute PARTIAL claims — field filtering + shared field routing |
| 7 | `3a6c83e` | Phase 5 | Proposal UI — split-field view + negotiation log |
| 8 | `2cd2be4` | Phase 6 | Build verification — clean build, regression pass |

---

## Files Modified

| File | Phase | Change |
|------|-------|--------|
| `web/src/lib/sci/negotiation.ts` | P2 | **NEW** — Round 2 negotiation engine with field affinities, absence boost, split detection |
| `web/src/lib/sci/sci-types.ts` | P2,P4 | FieldAffinity, NegotiationResult, NegotiationLogEntry types; PARTIAL metadata on proposals + executions |
| `web/src/app/api/import/sci/analyze/route.ts` | P3 | negotiateRound2() replaces scoreContentUnit + resolveClaimsPhase1; PARTIAL → two ContentUnitProposals |
| `web/src/app/api/import/sci/execute/route.ts` | P4 | filterFieldsForPartialClaim() — strips rawData to owned + shared fields |
| `web/src/components/sci/SCIExecution.tsx` | P4 | Passes claimType/ownedFields/sharedFields to execute; strips ::split for sheet lookup |
| `web/src/components/sci/SCIProposal.tsx` | P5 | Split icon, owned/shared field sections, "How did I decide?" negotiation log |

**Total: 6 files (5 modified, 1 new) across 4 implementation phases**

---

## Hard Proof Gates

| # | Gate | Criterion | Status | Evidence |
|---|------|-----------|--------|----------|
| PG-01 | Build exits 0 | npm run build clean | **PASS** | Build completed with 0 errors |
| PG-02 | Round 1 scoring unchanged | scoreContentUnit still works | **PASS** | negotiation.ts imports and calls scoreContentUnit() |
| PG-03 | FULL claims backward compatible | Clear winners still get FULL | **PASS** | Split only when gap < 0.25 AND runner-up owns >= 30% fields |
| PG-04 | PARTIAL claims generate two units | Mixed-content tab → two ContentUnitProposals | **PASS** | analyze/route.ts lines 89-128: pushes two units with partnerContentUnitId |
| PG-05 | Field affinity rules defined | 8 rules mapping signals → agents | **PASS** | FIELD_AFFINITY_RULES in negotiation.ts: ID, name, date, amount, target, rate, categorical, sequential |
| PG-06 | Absence boost implemented | +10% when 2+ competitors < 20% | **PASS** | applyAbsenceBoost() with ABSENCE_BOOST=0.10, ABSENCE_THRESHOLD=0.20 |
| PG-07 | Entity ID always shared | Join key fields in sharedFields | **PASS** | computeFieldAffinities(): isShared = field.nameSignals.containsId |
| PG-08 | Execute filters PARTIAL fields | rawData stripped to owned + shared | **PASS** | filterFieldsForPartialClaim() preserves allowedFields + _metadata keys |
| PG-09 | Proposal UI shows split view | Split icon + owned/shared sections | **PASS** | SCIProposal.tsx: Split icon (violet), "My fields", "Shared with partner" |
| PG-10 | Negotiation log displayable | "How did I decide?" expandable | **PASS** | showNegotiationLog toggle, monospace log with stage + message |
| PG-11 | LAB CL regression | $6,540,774.36 | **PASS** | `Consumer Lending: 100 results, $6540774.36` |
| PG-12 | LAB DG regression | $601,000.00 | **PASS** | `Deposit Growth: 48 results, $601000.00` |
| PG-13 | Korean Test | 0 domain vocabulary | **PASS** | All 6 OB-134 files: 0 matches |
| PG-14 | No auth files modified | Middleware unchanged | **PASS** | `git diff --name-only | grep auth: 0 matches` |

**Hard gates: 14/14 PASS**

---

## Soft Proof Gates

| # | Gate | Criterion | Status | Evidence |
|---|------|-----------|--------|----------|
| SPG-01 | Split threshold tunable | SPLIT_THRESHOLD constant | **PASS** | `const SPLIT_THRESHOLD = 0.30` in negotiation.ts |
| SPG-02 | Negotiation log includes all stages | round1, absence_boost, field_analysis, split_decision, round2 | **PASS** | 5 stage types in NegotiationLogEntry |
| SPG-03 | Mixed content indicator in header | "Mixed content detected" when PARTIAL present | **PASS** | Violet text in proposal header bar |
| SPG-04 | Confidence language contextual | "This sheet has mixed content" for PARTIAL | **PASS** | SCIProposal.tsx: isPartial branch in confidence language |

**Soft gates: 4/4 PASS**

---

## Phase Summary

### Phase 0: Diagnostic
- `resolveClaimsPhase1()` always returns `FULL` — ClaimType 'PARTIAL'|'DERIVED' unused
- `scoreContentUnit()` scores independently — zero cross-agent awareness
- `generateContentProfile()` already produces per-field FieldProfile with nameSignals
- Analyze API: winner-takes-all, no negotiation
- Execute API: single agent per unit, no field filtering

### Phase 1: Architecture Decision
Three-stage claim resolution:
- Stage 1 (existing): Independent heuristic scoring
- Stage 2 (new): Spatial intelligence — absence boost + field affinity analysis
- Stage 3: FULL for clear winners, PARTIAL for mixed-content tabs

### Phase 2: Negotiation Engine (negotiation.ts)
- `negotiateRound2()` — main entry, returns NegotiationResult
- 8 field affinity rules: ID→entity, date→transaction, amount→transaction/target, etc.
- Absence boost: +10% when 2+ competitors score < 20%
- Split detection: PARTIAL when runner-up owns >= 30% of fields by affinity
- Entity ID fields always shared as join keys
- Full negotiation log for transparency

### Phase 3: Analyze API Integration
- Replaced `scoreContentUnit` + `resolveClaimsPhase1` with `negotiateRound2`
- PARTIAL claims → two ContentUnitProposals with ownedFields, sharedFields, partnerContentUnitId
- FULL claims unchanged

### Phase 4: Execute PARTIAL Claims
- `filterFieldsForPartialClaim()` strips rawData to owned + shared fields only
- Internal metadata keys (_sheetName, _rowIndex) preserved
- confirmedBindings filtered to match
- SCIExecution passes PARTIAL metadata through to API
- ::split suffix stripped for sheet data lookup

### Phase 5: Proposal UI
- Split icon (violet) for PARTIAL claims
- "My fields" section with semantic role descriptions
- "Shared with partner" section with Link2 icon and "(join key)" label
- "How did I decide?" expandable negotiation log in monospace
- "Mixed content detected" indicator in proposal header
- FULL claim UI unchanged

### Phase 6: Build Verification
- Clean build: 0 errors
- LAB regression: $8,498,311.77 total (unchanged)
- MBC regression: $3,245,212.66 total (unchanged)

---

## Regression Results

```
=== LAB (Consumer Advisors) ===
  CFG Insurance Referral Program 2024: 64 results, $366600.00
  Consumer Lending Commission Plan 2024: 100 results, $6540774.36
  Mortgage Origination Bonus Plan 2024: 56 results, $989937.41
  Deposit Growth Incentive — Q1 2024: 48 results, $601000.00
  TOTAL: 268 results, $8498311.77

=== MBC (Mexican Bank Co) ===
  Mortgage Origination Bonus Plan 2024: 42 results, $1046890.05
  Consumer Lending Commission Plan 2024: 75 results, $2073772.61
  Deposit Growth Incentive — Q1 2024: 75 results, $0.00
  Insurance Referral Program 2024: 48 results, $124550.00
  TOTAL: 240 results, $3245212.66
```

---

## Compliance

| Rule | Status |
|------|--------|
| Standing Rule 1: Push after every commit | PASS |
| Standing Rule 2: Build after every push | PASS |
| Standing Rule 4: Fix logic, not data | PASS — zero database modifications |
| Standing Rule 5: Commit prompt first | PASS — `7710b8f` |
| Standing Rule 6: Git from repo root | PASS |
| Standing Rule 7: Korean Test | PASS — zero domain vocabulary in OB-134 code |
| Standing Rule 8: No auth file modifications | PASS — zero auth files modified |
| Rule 25: Report before final build | PASS |
| Rule 26: Mandatory structure | PASS |
| Rule 27: Evidence = paste code/output | PASS |
| Rule 28: One commit per phase | PASS |

---

## Issues Found

**None blocking.** Architecture leveraged existing infrastructure:
- ContentProfile already had per-field FieldProfile with nameSignals — perfect for field affinity scoring
- ClaimType already included 'PARTIAL' in types — just never generated
- ContentClaim already had `fields` and `sharedFields` properties — just never populated
- Execute route's pipeline-per-classification pattern extended cleanly with field filtering

---

*"The agent doesn't just know what the data is. It knows which fields belong to whom."*
