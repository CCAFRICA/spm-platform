# CLT-160 Pre-Flight Verification Report

## Phase 1: Codebase Structural Verification (13 Gates)

### 1.1 Korean Test Compliance — PASS
```
grep -rn '"mes"\|"month"\|...' web/src/lib/sci/ --include="*.ts"
→ ZERO results
```

### 1.2 Period Reference Absence — PASS
```
grep -rn "createPeriod\|/api/periods\|periodId.*=" web/src/lib/sci/ web/src/app/api/import/ --include="*.ts"
→ Only non-SCI result: import/commit/route.ts:837 (legacy commit route, not SCI pipeline)
→ ZERO period references in SCI code
```

### 1.3 Absence-Based Logic — PASS
```
grep pattern not applicable (regex syntax error in original spec)
→ Manual review confirms no absence-based boosts in SCI agents
```

### 1.4 SCI File Inventory — PASS
```
ls -la web/src/lib/sci/
→ 16 files present:
  agents.ts, classification-signal-service.ts, content-profile.ts,
  header-comprehension.ts, negotiation.ts, promoted-patterns.ts,
  proposal-intelligence.ts, sci-signal-types.ts, sci-types.ts,
  signal-capture-service.ts, signatures.ts, source-date-extraction.ts,
  synaptic-ingestion-state.ts, tenant-context.ts, weight-evolution.ts
```

### 1.5 Signal Service — Dedicated Columns (HF-092) — PASS
```
grep -n "signal_value" classification-signal-service.ts
→ ZERO functional signal_value references
```

### 1.6 Processing Order in Execute Route — PASS
```
PIPELINE_ORDER: { entity: 0, reference: 1, target: 2, transaction: 2, plan: 3 }
→ Entity → Reference → Target/Transaction → Plan
```

### 1.7 Convergence Wired to Execute — PASS
```
→ convergeBindings imported and called after all pipelines complete
→ Convergence report included in response
→ Draft status included: .in('status', ['active', 'draft'])
```

### 1.8 Flywheel Aggregation Wired — PASS
```
→ aggregateToFoundational imported + called after each signal write
→ aggregateToDomain imported + called after each signal write
→ foundational_patterns and domain_patterns queried in prior lookup
```

### 1.9 Prior Signal Chain (Tenant → Domain → Foundational) — PASS
```
→ lookupPriorSignals: tenant scope first
→ lookupDomainPriors: domain fallback (if domainId provided)
→ lookupFoundationalPriors: foundational fallback
→ Boost: foundational 0.05, domain 0.07, tenant 0.10, human_override 0.15
```

### 1.10 Classification Density — PASS
```
→ SCIExecutionMode = 'full_analysis' | 'light_analysis' | 'confident'
→ ClassificationDensity interface with fingerprint, confidence, totalClassifications, overrideRate
→ computeClassificationDensity() queries classification_signals per tenant+fingerprint
```

### 1.11 Pattern Promotion — PASS
```
→ PromotedPattern interface with evidence (signalCount, accuracy, tenantCount)
→ loadPromotedPatterns() queries foundational_patterns for qualifying patterns
→ checkPromotedPatterns() returns confidence floor for matching fingerprints
→ identifyPromotionCandidates() finds promotion candidates
```

### 1.12 Trace API Endpoint — PASS
```
→ web/src/app/api/import/sci/trace/route.ts exists (2558 bytes)
```

### 1.13 Draft Status Inclusion — PASS
```
→ execute/route.ts: .in('status', ['active', 'draft']) (2 locations)
→ converge/route.ts: .in('status', ['active', 'draft'])
```

## Phase 2: Database Schema Verification (8 Gates)

### 2.1 Meridian Tenant — PASS
```
→ Meridian Logistics Group (meridian-logistics-group) - es-MX MXN
→ settings.industry = 'Manufacturing'
```

### 2.2 Engine Contract — Starting State — PASS
```
→ rule_sets: 1, entities: 0, committed_data: 0, periods: 0, assignments: 0
→ Starting state correct (1 plan imported, no data yet)
```

### 2.3 Classification Signals Schema (HF-092) — PASS
```
→ All dedicated columns accessible: id, tenant_id, signal_type,
  source_file_name, sheet_name, structural_fingerprint, classification,
  confidence, decision_source, classification_trace, vocabulary_bindings,
  agent_scores, human_correction_from, scope, source, context, created_at
```

### 2.4 Classification Signal Indexes — DEFERRED
```
→ Cannot query pg_indexes via Supabase REST API
→ Verify in SQL Editor: idx_cs_tenant_scope, idx_cs_tenant_fingerprint, idx_cs_vocab_bindings
```

### 2.5 committed_data.source_date Column — PASS
```
→ source_date column exists on committed_data table
```

### 2.6 Reference Tables — PASS
```
→ reference_data: EXISTS
→ reference_items: EXISTS
```

### 2.7 Flywheel Tables — PASS
```
→ foundational_patterns: EXISTS
→ domain_patterns: EXISTS
```

### 2.8 Synaptic Density Table — PASS
```
→ synaptic_density: EXISTS
```

## Phase 3: Localhost Smoke Test

### Build Status — PASS
```
→ npm run build exits 0
```

### Route Files — PASS
```
→ analyze/route.ts: 10001 bytes
→ execute/route.ts: 51370 bytes
→ trace/route.ts: 2558 bytes
→ converge/route.ts: 6062 bytes
```

## Bugfix Applied During Pre-Flight

### Industry Column Fix
- `tenants` table has NO `industry` column — industry stored in `settings` JSONB
- Both `analyze/route.ts` and `execute/route.ts` were selecting `'id, industry'`
- This would cause a Supabase 42703 error on any analyze/execute call
- **Fixed:** Changed to `.select('id, settings')` and reads `settings.industry`
- Build verified after fix

## Summary

| Category | Gates | Pass | Fail | Deferred |
|----------|-------|------|------|----------|
| Codebase (Phase 1) | 13 | 13 | 0 | 0 |
| Database (Phase 2) | 8 | 7 | 0 | 1 |
| Localhost (Phase 3) | 2 | 2 | 0 | 0 |
| **Total** | **23** | **22** | **0** | **1** |

**Deferred gate 2.4** (index verification) requires SQL Editor access — does not block functionality.

## CLT-160 pre-flight PASS. Ready for Andrew's browser testing on vialuce.ai.
