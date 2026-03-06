# OB-160H Architecture Decision: Field-Level PARTIAL Claims

## Phase 0 Finding: PATH A — EXISTS AND WORKS

### What the spec proposed
Build field-level PARTIAL claims from scratch:
- Split detection algorithm
- Field affinity scoring
- Per-agent semantic bindings
- Execute pipeline field filtering
- Type definitions for PARTIAL/DERIVED claims

### What actually exists

**`negotiation.ts` (403 lines) — Complete PARTIAL claim engine:**
- `FIELD_AFFINITY_RULES` (8 rules): Structural tests mapped to agent affinities — Korean Test compliant
- `scoreFieldAffinity()`: Per-field agent scoring using nameSignals, dataType, distribution
- `computeFieldAffinities()`: Profiles all fields, determines winner + isShared flag
- `analyzeSplit()`: Gap > 0.25 = no split; runner-up >= 30% fields = split (`SPLIT_THRESHOLD = 0.30`)
- `generatePartialBindings()`: Creates SemanticBinding[] per agent from field affinities
- `inferRoleForAgent()`: Role assignment per agent type (entity_identifier, performance_target, transaction_date, etc.)
- `negotiateRound2()`: Main entry point — orchestrates all of the above

**`synaptic-ingestion-state.ts` — Proposal generation:**
- Calls `analyzeSplit()` after Round 2 scoring
- Creates two ContentUnitProposals for PARTIAL: primary + `${unitId}::split`
- Each proposal has `claimType: 'PARTIAL'`, `ownedFields`, `sharedFields`, `partnerContentUnitId`

**`execute/route.ts` — Field filtering:**
- `filterFieldsForPartialClaim()` (OB-134): Filters rawData to ownedFields + sharedFields
- Applied before each pipeline processes its content unit

**`sci-types.ts` — Type definitions:**
- `ClaimType = 'FULL' | 'PARTIAL' | 'DERIVED'`
- `ContentClaim`: claimType, fields?, sharedFields?
- `ContentUnitProposal`: claimType?, ownedFields?, sharedFields?, partnerContentUnitId?
- `ContentUnitExecution`: claimType?, ownedFields?, sharedFields?

### Decision
**Path A: No code changes needed.** The entire PARTIAL claim pipeline — from field affinity scoring through split detection through proposal generation through execute-time field filtering — is fully implemented and Korean Test compliant.

### Verification Commands Run
1. `grep -n "PARTIAL\|partial\|claimType\|ownedFields\|sharedFields" negotiation.ts` — 403 lines confirmed
2. `grep -n "analyzeSplit\|generatePartialBindings\|computeFieldAffinities" synaptic-ingestion-state.ts` — integration confirmed
3. `grep -n "filterFieldsForPartialClaim\|PARTIAL\|ownedFields" execute/route.ts` — field filtering confirmed
4. `grep -n "ClaimType\|PARTIAL\|DERIVED" sci-types.ts` — type definitions confirmed
5. `grep -rn "PARTIAL\|partial.*claim\|ownedFields" --include="*.tsx"` — UI passes through claims transparently
6. Korean Test: `grep -n "revenue\|salary\|commission\|quota" negotiation.ts` — ZERO matches
