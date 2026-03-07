# OB-161 Completion Report: Contextual Reliability Resolution

**Decision 110 — Bayesian Classification Intelligence**

---

## Summary

Replaced competitive agent scoring (developer-assigned weights + HF-101 hardcoded overrides) with Contextual Reliability Resolution (CRR): Bayesian inference where signal source authority derives from empirical evidence.

### Files Changed
| File | Action |
|------|--------|
| `web/src/lib/sci/seed-priors.ts` | NEW — Cold-start reliability hierarchy |
| `web/src/lib/sci/contextual-reliability.ts` | NEW — 5-level CRL (fingerprint → category → boundary → global → seed) |
| `web/src/lib/sci/resolver.ts` | NEW — Bayesian posterior classification (CRRes) |
| `web/src/lib/sci/agents.ts` | MODIFIED — Removed HF-101 overrides, HC signals now additive |
| `web/src/lib/sci/synaptic-ingestion-state.ts` | MODIFIED — Removed hasHCReferenceOverride |
| `web/src/app/api/import/sci/analyze/route.ts` | MODIFIED — classifyContentUnits → resolveClassification |

---

## Evidentiary Gates

### EG-1: CRR Resolver Exists and Is Wired

```
src/lib/sci/resolver.ts:56:export async function resolveClassification(
src/lib/sci/resolver.ts:24:import { contextualReliabilityLookup, resetCRLCache } from './contextual-reliability';
src/app/api/import/sci/analyze/route.ts:16:import { resolveClassification } from '@/lib/sci/resolver';
src/app/api/import/sci/analyze/route.ts:179:      await resolveClassification(
```

### EG-2: Zero Hardcoded Overrides

```bash
grep -rn "hc_override|override_reference|reference_floor|reference_contradict|hasHCReferenceOverride" web/src/lib/sci/ --include="*.ts"
# Output: (empty — zero results)
```

### EG-3: Seed Priors Defined

```typescript
const SEED_PRIOR_TABLE: SeedPrior[] = [
  { sourceType: 'hc_contextual',        reliability: 0.85 },
  { sourceType: 'structural_signature', reliability: 0.80 },
  { sourceType: 'prior_signal',         reliability: 0.75 },
  { sourceType: 'promoted_pattern',     reliability: 0.75 },
  { sourceType: 'entity_overlap',       reliability: 0.70 },
  { sourceType: 'tenant_context',       reliability: 0.65 },
  { sourceType: 'structural_heuristic', reliability: 0.60 },
  { sourceType: 'r2_negotiation',       reliability: 0.55 },
];
```

### EG-4: CRL Hierarchical Levels

```
contextual-reliability.ts implements:
Level 1 (fingerprint): Exact structural fingerprint match
Level 2 (category):    Relaxed fingerprint bucket match
Level 3 (boundary):    Classification boundary context (competing agents)
Level 4 (global):      All tenant signals
Level 5 (seed):        Cold-start seed prior from seed-priors.ts
```

### EG-5: Bayesian Posterior Computation

```typescript
// resolver.ts:362-427
function computePosteriors(signals, crlResults): PosteriorResult[] {
  // P(C | signals) ∝ P(C) × ∏ P(signal_i | C)
  // Log-space computation prevents underflow
  // Supporting signals: likelihood = reliability * strength
  // Contradicting signals: inverse likelihood
  // Normalized to sum to 1
}
```

### EG-6: Build Clean

```
npm run build → success
Zero compilation errors. Pre-existing dynamic route warnings only.
```

---

## Deviation Notes

1. **Controlling specification**: `Vialuce_Contextual_Reliability_Resolution_Specification.md` does not exist in the repository. Implementation derived from OB-161 requirements and standard Bayesian inference theory.

2. **Signal source accuracy**: CRL currently uses system-wide accuracy (human_correction_from presence) as a proxy for source-type-specific accuracy. As the flywheel matures with more signals, per-source-type accuracy tracking can be added.

---

## Architecture

### Before (HF-101 pattern)
```
Structural heuristics → hardcoded HC floor (0.80) → hardcoded TX penalty (-0.30) → winner
```

### After (CRR)
```
Signal producers (agents, HC, signatures, priors, tenant context)
  ↓
Signal extraction (normalized ClassificationSignals)
  ↓
CRL lookup (empirical reliability per source type per structural context)
  ↓
Bayesian posterior computation (P(C) × ∏ likelihood)
  ↓
Highest posterior wins
```

### Key Properties
- **No hardcoded weights in resolution**: All authority derives from CRL
- **Self-improving**: CRL returns empirical accuracy when data exists, seed priors when cold
- **Korean Test compliant**: Zero field-name matching in resolver
- **Backward compatible**: Posteriors flow back into AgentScore.confidence for existing UI
- **Diagnostic logging**: `[SCI-CRR-DIAG]` shows posteriors and CRL levels per sheet
