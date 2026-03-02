# OB-138 Completion Report: SCI Proposal Intelligence UI

## What Changed

**Problem:** The SCI import proposal page showed classification labels and confidence percentages, but discarded the structural intelligence that agents compute. Users saw "I identified this as operational data (82%)" with no explanation of *why* or *what would change the decision*.

**Solution:** 3-layer progressive disclosure surfacing observations, verdicts, and falsifiability.

## What Was Built

### Phase 1: Intelligence Generation (`proposal-intelligence.ts`)
- New `generateProposalIntelligence()` function — pure deterministic, no AI calls
- Transforms existing scoring data (signals, field affinities, negotiation results) into structured intelligence:
  - **observations**: Discrete structural facts ("500 rows — high volume, typical of event records", "Date column detected")
  - **verdictSummary**: One-line natural language explanation ("This looks like operational data: has a date column, high row count typical of event data, and contains monetary values")
  - **whatChangesMyMind**: Falsifiable conditions ("If the date column contains birth dates, this is likely team roster data")

### Phase 2: Type Extensions (`sci-types.ts`)
- Added `observations: string[]`, `verdictSummary: string`, `whatChangesMyMind: string[]` to `ContentUnitProposal`

### Phase 3: API Integration (`analyze/route.ts`, `analyze-document/route.ts`)
- Both tabular and document analysis paths now generate and attach intelligence to every content unit
- Intelligence is generated from the existing negotiation result — zero additional processing cost

### Phase 4: UI Rewrite (`SCIProposal.tsx`)
- **Layer 1 (always visible):** Sheet name + classification badge with confidence color + verdict summary + warnings
- **Layer 2 (expandable "Observations"):** What the agent noticed + field mapping + action preview + document/partial claim details
- **Layer 3 (expandable "Deep Dive"):** What would change the decision + visual score bars for all 4 agents + negotiation decision log
- **ProposalSummaryBar:** File-level intelligence summary with confidence-aware status
- **ScoreBar:** Visual confidence comparison across all agents
- Maintained all existing functionality: confirm/change classification, fast path for high-confidence, PARTIAL claims, document plans

## Proof Gates

| # | Gate | Result |
|---|------|--------|
| PG-01 | `npm run build` exits 0 | PASS |
| PG-02 | Zero TypeScript errors | PASS — `Compiled successfully` |
| PG-03 | Korean Test | PASS — zero domain vocabulary in modified files |
| PG-04 | Intelligence fields populated | PASS — observations, verdictSummary, whatChangesMyMind generated for all content units |
| PG-05 | 3-layer UI renders | PASS — Layer 1 always visible, Layers 2+3 toggle independently |
| PG-06 | Fast path preserved | PASS — all high-confidence proposals still show streamlined view |
| PG-07 | PARTIAL claims render | PASS — owned/shared fields still display in Layer 2 |
| PG-08 | Document plans render | PASS — component extraction in Layer 2 |
| PG-09 | Classification override works | PASS — change/confirm flow unchanged |

## Files Modified

| File | Change |
|------|--------|
| `web/src/lib/sci/sci-types.ts` | Added observations, verdictSummary, whatChangesMyMind to ContentUnitProposal |
| `web/src/lib/sci/proposal-intelligence.ts` | **NEW** — Deterministic intelligence generator |
| `web/src/app/api/import/sci/analyze/route.ts` | Calls generateProposalIntelligence(), attaches to proposals |
| `web/src/app/api/import/sci/analyze-document/route.ts` | Adds intelligence fields to document proposals |
| `web/src/components/sci/SCIProposal.tsx` | Full rewrite: 3-layer intelligence display with ProposalSummaryBar |

## Architecture Decision

**Problem:** Rich structural analysis (30+ signals, field affinities, negotiation rounds) collapsed into "82% confidence".
**Decision:** Generate structured intelligence server-side from existing scoring data (zero additional cost). Surface via 3-layer progressive disclosure: verdict always visible, observations on-demand, deep dive for power users.
**Trade-off:** Slightly more data transmitted in the API response (~500 bytes per content unit). Acceptable given the intelligence value.
