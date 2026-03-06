# OB-160C Completion Report: Agent Scoring + Synaptic Ingestion State

## Korean Test Audit

### Removed from Scoring Weights
| Signal | Agent | Before | After |
|--------|-------|--------|-------|
| `has_structural_name` | Entity | `p.patterns.hasStructuralNameColumn \|\| p.fields.some(f => f.nameSignals.looksLikePersonName)` | `p.patterns.hasStructuralNameColumn` |

### Not in Scoring (Observation Text Only)
nameSignals references remain in semantic binding functions (lines 434-500). These generate observation/binding text for the UI. They do NOT affect scoring weights. This is compliant per spec: "nameSignals may still exist in observation text."

### Verification
```
grep -n "nameSignals" agents.ts (scoring weights lines 25-100): ZERO hits
grep -n "containsTarget\|containsAmount\|containsRate" agents.ts (scoring weights): ZERO hits
```

## Header Comprehension Signals

### applyHeaderComprehensionSignals (agents.ts)
| Agent | ColumnRole | Signal | Weight | Direction |
|-------|------------|--------|--------|-----------|
| Transaction | temporal | hc_temporal_columns | +0.10 | boost |
| Transaction | measure | hc_measure_heavy | +0.08 | boost (>40% measure ratio) |
| Entity | name | hc_name_column | +0.10 | boost |
| Entity | attribute | hc_attribute_heavy | +0.08 | boost (>30% attribute ratio) |
| Entity | temporal | hc_temporal_not_roster | -0.10 | penalty (>=2 temporal) |
| Target | temporal | hc_temporal_not_targets | -0.10 | penalty |
| Reference | reference_key | hc_reference_key | +0.15 | boost |

All signals are ADDITIVE. When `headerComprehension` is null, scoring works on structural signals only.

### Signature Reinforcement (signatures.ts)
| Signature | HC Condition | Boost |
|-----------|-------------|-------|
| Transaction | temporal >= 1 | +0.05 |
| Transaction | measure >= 3 | +0.05 |
| Entity | name >= 1 | +0.05 |
| Entity | attribute >= 2 | +0.03 |
| Target | temporal == 0 | +0.05 |
| Target | measure >= 2 | +0.03 |
| Reference | reference_key >= 1 | +0.05 |
| Plan | (none) | (plan data rarely has meaningful headers) |

All signatures fire on structural signals ALONE. HC is a bonus, not a requirement.

## Scoring Flow Consolidation

### Before (fragmented, two negotiateRound2)
```
analyze/route.ts
  -> negotiation.ts:negotiateRound2(profile)         # EXPORTED orchestrator
    -> agents.ts:scoreContentUnit(profile)
      -> agents.ts:detectSignatures
      -> agents.ts:scoreAgent per agent
      -> agents.ts:negotiateRound2(scores, profile)  # LOCAL, different function!
    -> field affinity + split analysis
```

### After (single pipeline through SynapticIngestionState)
```
analyze/route.ts
  -> createIngestionState(tenantId, fileName, profiles)
  -> classifyContentUnits(state)
    -> detectSignatures                    # Step 1
    -> computeAdditiveScores               # Step 2 (additive + signature floors)
    -> applyHeaderComprehensionSignals     # Step 3 (ADDITIVE — null safe)
    -> applyRound2Negotiation              # Step 4 (with trace recording)
    -> computeFieldAffinities + split      # Step 5-6
    -> resolution                          # Step 7
    -> trace recording                     # Step 8
  -> buildProposalFromState(state, fileSheets)
```

ONE flow. Classification trace recorded for every content unit.

## Files Created
- `web/src/lib/sci/synaptic-ingestion-state.ts` — SynapticIngestionState, ClassificationTrace, classifyContentUnits, buildProposalFromState

## Files Modified
- `web/src/lib/sci/agents.ts` — Korean Test fix, applyHeaderComprehensionSignals, computeAdditiveScores
- `web/src/lib/sci/signatures.ts` — Header comprehension reinforcement
- `web/src/lib/sci/negotiation.ts` — Exported field affinity functions for consolidated pipeline
- `web/src/app/api/import/sci/analyze/route.ts` — Uses consolidated pipeline

## Commits
- `3836d05` — Phase 0: Diagnostic
- `a967603` — Phase 1: Synaptic Ingestion State + Classification Trace
- `a87e704` — Phase 2: Korean Test cleanup + header comprehension signals
- `afd1f85` — Phase 3: Consolidated scoring pipeline
- `76218f5` — Phase 4: Signature reinforcement

## Proof Gates

### Phase 1: Synaptic Ingestion State + Classification Trace
- PG-1: PASS — `SynapticIngestionState` interface defined with contentUnits, scoring state, resolutions, traces
- PG-2: PASS — `ClassificationTrace` interface defined with structuralProfile, headerComprehension, round1, signatureChecks, round2, tenantContextApplied, priorSignals, final result
- PG-3: PASS — `ContentUnitResolution` includes claimType ('FULL' | 'PARTIAL') and fieldAssignments for Phase H
- PG-4: PASS — `TenantContext` interface defined for Phase D
- PG-5: PASS — `createIngestionState` function exists
- PG-6: PASS — `npm run build` exits 0

### Phase 2: Korean Test Cleanup + Header Comprehension
- PG-7: PASS — `has_target_field` (+0.25 from containsTarget) was already removed in OB-159
- PG-8: PASS — `has_license_field` does not exist in scoring weights
- PG-9: PASS — `has_structural_name` uses `profile.patterns.hasStructuralNameColumn` only (no nameSignals fallback)
- PG-10: PASS — `applyHeaderComprehensionSignals` function exists, reads ColumnRole from headerComprehension
- PG-11: PASS — Transaction Agent gets +0.10 from LLM-identified temporal columns
- PG-12: PASS — Entity Agent gets -0.10 penalty from LLM-identified temporal columns (>=2)
- PG-13: PASS — Target Agent gets -0.10 penalty from LLM-identified temporal columns
- PG-14: PASS — Reference Agent gets +0.15 from LLM-identified reference_key columns
- PG-15: PASS — Zero Korean Test violations in agents.ts scoring weights (grep returns zero)
- PG-16: PASS — When headerComprehension is null, applyHeaderComprehensionSignals returns immediately
- PG-17: PASS — `npm run build` exits 0

### Phase 3: Consolidated Scoring Pipeline
- PG-18: PASS — `classifyContentUnits` function exists in synaptic-ingestion-state.ts
- PG-19: PASS — Single flow: signatures -> additive -> signature floors -> HC signals -> Round 2 -> field affinity -> resolution
- PG-20: PASS — ONE consolidated flow in synaptic-ingestion-state.ts (agents.ts local negotiateRound2 still exists for backward compat, not called from analyze route)
- PG-21: PASS — ClassificationTrace populated for every content unit
- PG-22: PASS — Trace includes round1, signatureChecks, round2, finalClassification
- PG-23: PASS — Analyze route uses createIngestionState -> classifyContentUnits -> buildProposalFromState
- PG-24: PASS — Proposal response format unchanged (ContentUnitProposal structure identical)
- PG-25: PASS — `npm run build` exits 0

### Phase 4: Signature Reinforcement
- PG-26: PASS — Transaction signature fires on structural signals alone (hasHighRepeat && hasTemporalDimension && isDataHeavy)
- PG-27: PASS — HC boosts Transaction confidence by up to +0.10 when temporal + measure confirmed
- PG-28: PASS — All 5 signatures work when headerComprehension is null (HC counts default to 0)
- PG-29: PASS — `npm run build` exits 0

### Phase 5: Build + Verify + PR
- PG-30: PASS — `npm run build` exits 0
- PG-31: Pending — localhost:3000 responds
- PG-32: PASS — Zero Korean Test violations in scoring weights
- PG-33: PASS — Single scoring flow through SynapticIngestionState
- PG-34: PASS — ClassificationTrace populated for every content unit
- PG-35: Pending — PR creation

## Implementation Completeness Gate

SCI Specification Layers 1-4:
- Layer 1: Content Profile (Phase A + B) — DELIVERED
- Layer 2: Agent Scoring (Phase C) — DELIVERED with Korean Test compliance + header comprehension
- Layer 3 Tier 1: Structural Heuristics (Phase C) — DELIVERED
- Layer 4: Negotiation through Synaptic Ingestion State (Phase C) — DELIVERED

Gap to full specification:
- Layer 3 Tier 2 (Tenant Context): Phase D
- Layer 3 Tier 3 (Prior Signals / Flywheel): Phase E
- Layer 4 PARTIAL Claims: Phase H (interfaces defined in Phase C)
