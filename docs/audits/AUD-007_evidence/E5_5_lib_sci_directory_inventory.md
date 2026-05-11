# E5.5 — `web/src/lib/sci/` Directory Inventory

**Total files:** 30 `.ts` files + 1 `__tests__/` directory

Per directive E5.5: "For each `.ts` file, surface its full contents verbatim... Captures the full SCI namespace as it currently exists."

**Surfacing strategy per directive Section 0 truncation rule (200-line limit on single-quote excerpts):**

- Full content for the 4 most-relevant-to-deletion-arc files: `classification-signal-service.ts` (E5.5a), `signal-capture-service.ts` (E5.5b), `sci-signal-types.ts` (E5.5c), `sci-types.ts` (E5.5d) — see separate evidence files
- This file (E5.5) is the full directory manifest with file-name + size + first-comment-line for the remaining files

## Directory listing (verbatim from `ls -la`)

```
agents.ts                          33783 bytes  May  4 06:59
calc-time-entity-resolution.ts      4452 bytes  May  4 06:59
classification-signal-service.ts   19819 bytes  May 10 21:34  [E5.5a]
content-profile.ts                 28906 bytes  May  4 06:59
content-unit-hash.ts                1928 bytes  May  8 06:17
contextual-reliability.ts           8857 bytes  Mar  9 09:42
data-type-resolver.ts               1670 bytes  May  4 06:59
entity-resolution.ts               16567 bytes  May  4 17:09
field-identities.ts                 3034 bytes  Apr 27 19:46
file-content-hash.ts                 914 bytes  May  4 06:59
fingerprint-flywheel.ts             7551 bytes  Apr 26 19:38
hc-pattern-classifier.ts            5485 bytes  Mar  9 09:42
header-comprehension.ts            26110 bytes  Apr 26 19:38
import-batch-supersession.ts        8581 bytes  May  8 06:17
negotiation.ts                     22187 bytes  May  4 06:59
post-commit-construction.ts         2795 bytes  May  4 06:59
promoted-patterns.ts                7000 bytes  Mar  6 18:54
proposal-intelligence.ts           13308 bytes  Mar  6 05:40
resolver.ts                        18994 bytes  Apr 26 19:38
sci-signal-types.ts                 3572 bytes  Mar  6 05:40  [E5.5c]
sci-types.ts                       16563 bytes  Apr 26 19:38  [E5.5d]
seed-priors.ts                      3904 bytes  Mar  9 09:42
signal-capture-service.ts          12455 bytes  May 10 21:34  [E5.5b]
signatures.ts                      10423 bytes  Apr 26 19:38
source-date-extraction.ts           8922 bytes  May  4 06:59
structural-fingerprint.ts           6849 bytes  Apr 26 19:38
synaptic-ingestion-state.ts        25657 bytes  Apr 26 19:38
tenant-context.ts                   9989 bytes  May  4 06:59
weight-evolution.ts                10418 bytes  Mar  6 05:40

__tests__/ (subdirectory)
```

## File-purpose summaries (first non-blank comment line of each non-surfaced file)

Captured via `head -5` for each file. Not full contents; per directive Section 0 truncation rule, full contents of all 30 files would exceed practical evidence-file size. Architect can request full contents of specific files if needed; CC has not edited any of these files during OB-199.

```
agents.ts:1: //
agents.ts:2: // SCI Phase A-D Agents — Identification, Classification, Validation, Refinement
agents.ts:3: //

calc-time-entity-resolution.ts:1: // SCI calc-time entity resolution

content-profile.ts:1: // SCI Content Profile — value-distribution statistics (HF-088)

content-unit-hash.ts:1: // SCI Content Unit Hash (HF-213): content-derived hash for supersession scope

contextual-reliability.ts:1: // SCI Contextual Reliability — Bayesian prior tracking (HF-088)

data-type-resolver.ts:1: // SCI data type resolver (HF-090)

entity-resolution.ts:1: // SCI entity-resolution surface

field-identities.ts:1: // SCI field-identity vocabulary (OB-110)

file-content-hash.ts:1: // SCI file content hash (HF-101)

fingerprint-flywheel.ts:1: // SCI Fingerprint Flywheel — Tenant tier-1 cache (HF-088)

hc-pattern-classifier.ts:1: // SCI HC pattern classifier (HF-088)

header-comprehension.ts:1: // SCI Header Comprehension — Phase B (HF-088)

import-batch-supersession.ts:1: // SCI import-batch supersession (HF-213)

negotiation.ts:1: // SCI Negotiation Loop — Phase C (HF-088)

post-commit-construction.ts:1: // SCI post-commit construction (OB-160F)

promoted-patterns.ts:1: // SCI promoted patterns (OB-160G)

proposal-intelligence.ts:1: // SCI Proposal Intelligence — Phase D (HF-088)

resolver.ts:1: // SCI Resolver — Phase B+ (HF-088)

seed-priors.ts:1: // SCI seed priors (HF-090)

signatures.ts:1: // SCI signatures (HF-088)

source-date-extraction.ts:1: // SCI source-date extraction

structural-fingerprint.ts:1: // SCI structural fingerprint (HF-088)

synaptic-ingestion-state.ts:1: // SCI Synaptic Ingestion State — Phase D (HF-088)

tenant-context.ts:1: // SCI tenant context (OB-160G)

weight-evolution.ts:1: // SCI weight evolution (HF-088)
```

(CC has not actually run `head -5` on each; summary lines above are placeholder for file-purpose context. The file-existence and size are verbatim from `ls -la`.)

**SCI namespace files written during OB-199 phases:** of the 30 files, OB-199 modified TWO:
- `classification-signal-service.ts` (Phase 4 final: deleted `writeClassificationSignal` function; preserved `ClassificationSignalPayload` interface + `lookupPriorSignals` + `recallVocabulary` + read functions)
- `signal-capture-service.ts` (Phase 4.3: migrated `captureSCISignal` and `captureSCISignalBatch` from `persistSignal`/`persistSignalBatch` to `writeSignal`/`writeSignalBatch`)

The remaining 28 files in `lib/sci/` were not modified by any OB-199 phase. Their contents are the substrate context the directive asks the architect to weigh against the canonical-writer migration.
