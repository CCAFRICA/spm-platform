# HF-102 Completion Report: CRR Bayesian Likelihood Fix

**Supporting evidence must increase the posterior, not decrease it.**

---

## EG-1: Corrected computePosteriors Function

```typescript
// resolver.ts:377-438
const EVIDENCE_SCALE = 3.0;
const N_CLASSES = CLASSIFICATION_TYPES.length; // 5

function computePosteriors(signals, crlResults): PosteriorResult[] {
  for (const classification of CLASSIFICATION_TYPES) {
    let logPosterior = Math.log(prior);  // log(0.20) = -1.609

    // Supporting: BF = 1 + α × reliability × strength
    // Always > 1.0 → log > 0 → INCREASES posterior
    for (const signal of supportingSignals) {
      const w = reliability * signal.strength;
      const bayesFactor = 1 + EVIDENCE_SCALE * w;
      logPosterior += Math.log(bayesFactor);
    }

    // Contradicting: BF = 1 / (1 + α × r × s / (N-1))
    // Always < 1.0 → log < 0 → DECREASES posterior
    for (const signal of contradictBySource) {
      const w = reliability * signal.strength;
      const bayesFactor = 1.0 / (1 + EVIDENCE_SCALE * w / (N_CLASSES - 1));
      logPosterior += Math.log(bayesFactor);
    }
  }
  // Normalize to sum to 1
}
```

## EG-2: Traced Math for Datos_Rendimiento

### BEFORE (Bug):
```
Transaction: logP = -1.609 + log(0.57) + log(0.153) + log(0.68) + log(0.85)
           = -1.609 + (-0.562) + (-1.877) + (-0.386) + (-0.163)
           = -4.597  →  raw = 0.0101  →  normalized ≈ 2%  ✗ WRONG

Target: logP = -1.609 + log(0.30) + log(0.70) + log(0.66)
      = -1.609 + (-1.204) + (-0.357) + (-0.416)
      = -3.586  →  raw = 0.0278  →  normalized ≈ 50%  ✗ WRONG
```

### AFTER (Fixed):
```
Transaction (3 supporting signals):
  prior = log(0.20) = -1.609
  struct_heuristic(tx, 0.95): BF = 1+3×0.57 = 2.71,  log = +0.997
  hc_contextual(tx, 0.18):   BF = 1+3×0.153 = 1.459, log = +0.378
  struct_signature(tx, 0.85): BF = 1+3×0.68 = 3.04,  log = +1.112
  contradict(target@0.50):    BF = 1/1.225 = 0.816,   log = -0.203
  total logP = +0.675  →  raw = 1.964  →  normalized ≈ 82%  ✓ CORRECT

Target (1 supporting signal):
  prior = log(0.20) = -1.609
  struct_heuristic(target, 0.50): BF = 1+3×0.30 = 1.90, log = +0.642
  contradict(tx struct@0.95):     BF = 1/1.4275 = 0.700, log = -0.357
  contradict(tx sig@0.85):        BF = 1/1.51 = 0.662,   log = -0.412
  total logP = -1.736  →  raw = 0.176  →  normalized ≈ 7%  ✓ CORRECT
```

**Transaction wins at ~82% vs target at ~7%.** Before: tx=2%, target=50%.

## EG-3: SCI-CRR-DIAG Lines

Requires browser import — see PV-3 in production verification.

Expected after fix:
```
[SCI-CRR-DIAG] sheet=Plantilla posteriors=[entity=XX%, ...]
[SCI-CRR-DIAG] sheet=Datos_Rendimiento posteriors=[transaction=XX%, ...]
[SCI-CRR-DIAG] sheet=Datos_Flota_Hub posteriors=[reference=XX%, ...]
```

## EG-4: Mathematical Validation — Monotonic Increase

### More signals = higher posterior:
```
1 signal:  logP = -1.609 + 0.997 = -0.612  →  raw = 0.542
2 signals: logP = -0.612 + 0.378 = -0.234  →  raw = 0.791  (INCREASED)
3 signals: logP = -0.234 + 1.112 = +0.878  →  raw = 2.406  (INCREASED)
```

### Higher reliability = more influence:
```
r=0.60, s=0.50: w=0.30, BF=1.90, log=0.642
r=0.85, s=0.50: w=0.425, BF=2.275, log=0.822  (0.822 > 0.642)
```

### Higher strength = more influence:
```
r=0.60, s=0.50: w=0.30, BF=1.90, log=0.642
r=0.60, s=0.95: w=0.57, BF=2.71, log=0.997  (0.997 > 0.642)
```

## EG-5: Build Output

```
ƒ Middleware                                  75 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
Exit code: 0
```

---

## Root Cause

`computePosteriors()` used `likelihood = reliability × strength` as an absolute value.
Since both factors are ≤ 1.0, the product is always ≤ 1.0, making `log(likelihood) ≤ 0`.
Every supporting signal subtracted from the log posterior. The agent with the most
evidence (transaction with 3 signals) was penalized the most.

## Fix

Replaced raw product with Bayes Factor (likelihood ratio):
- Supporting: `BF = 1 + α × w` where `w = reliability × strength`
- Contradicting: `BF = 1 / (1 + α × w / (N-1))`
- `α = 3.0`: derived from first principles (perfect evidence quadruples odds)
- No hardcoded floors, penalties, or dataset-specific tuning
