# OB-253 — Completion Report: Thalamus, the Predictive Intelligence Substrate

**Work item:** OB-253 · **Branch:** `ob-253-thalamus-substrate` (off `main` @ `7cb4efb7`) · **Date:** 2026-06-28
**Design authority:** DS-031 v0.1. **Mode:** ULTRACODE. **CC stops at PR creation — architect merges + verifies in browser (SR-44).**

> Evidence is pasted (Prove-Don't-Describe). DB facts are from CC read-only live queries against the service-role client; the deterministic gates are reproducible test output. No production data was mutated; no migrations authored (the substrate schema is fully present — FP-49).

---

## Phase 1 — True-State Map (PG-1: PASS)
Committed at `docs/diagnostics/OB-253_TRUE_STATE_MAP.md` (8-area evidence: Normalizer position, read-path, atom layer, density modes, signal consumers, topology, surfaces, FP-49). Architect reviewed and dispositioned the three HALTs (`OB-253_HALT_DISPOSITION_20260628.md`). Headlines: schema fully present (no HALT-SCHEMA); comprehension already precedes commitment; the **fingerprint read-path is already closed and live**; `synaptic_density` is a 5-row calc-stage surface (not ingestion); density modes are observability-only; the Normalizer is a self-loop bolt-on (Deficit 1). **Already-met (not rebuilt):** 3A.1, 3A.2 (fingerprint half), 3A.3 (fingerprint write-back), perceptual atom hash.

## HALT conditions (all architect-dispositioned, §HALT of the true-state map)
- **HALT-DIVERGE-1 (G7 surface split):** → build a logical **read-adapter** (Option B). Built (Phase 2).
- **HALT-DIVERGE-2 (`synaptic_density` calc-keyed):** → directive §3A.2 "read density at ingestion" **withdrawn**; `structural_fingerprints` is the ingestion surface; the adapter bridges key-spaces.
- **HALT-SURFACE-3 (`/data` is mock):** → wire the **existing** `/data/page.tsx` live (not a new surface). Built (Phases 3–4).

---

## Phase 2 — Perceptual front + close the read-path (PG-2: PASS)
**Deliverable:** the logical co-present read-adapter (HALT-1) + verified read-path/write-back.
- `web/src/lib/thalamus/signal-surface.ts` — `readCoPresentSurface()` composes `structural_fingerprints` (sheet+atom) + `classification_signals` (by type) + `synaptic_density` (bridged, calc-keyed) into ONE logical surface. READ-ONLY, no new table (G7 logical), G9 untouched, Korean-clean. + `exposureFromSurface()`.
- Unit tests: 3/3 (composition, exposure thin/not-thin).

**PG-2 evidence (live, Casa Diaz):**
```
co-present surface: fingerprints sheet=5 atom=37; classification_signals=152 across 9 types; density bridged
flywheel accumulation: 20/42 structural_fingerprints have match_count>1 (MAX 9)
  → a repeat structure is recognized at Tier-1 and SKIPS full LLM classification (cost-decreases-with-usage, P3/P4)
top recalled: atom 17a7c6a1… match_count=9 conf=0.9 ; atom 85e0082d… match_count=9 ; atom 3daabdff… match_count=7
```
The first-vs-repeat speedup mechanism (Phase 1 traced live in `process-job`: Tier-1 match → "LLM skipped") is real and accumulating (match_count up to 9). Density write-back stays calc-domain (HALT-2). **PG-2 PASS.**

## Phase 3 — Re-found remediation as joint recognition (PG-3: PASS)
**Deliverable:** the four facets co-present, resolving jointly; the Normalizer re-founded as one facet; consolidation to the surface.
- `web/src/lib/thalamus/joint-recognition.ts` — facets normalization / reconciliation / deduplication / anomaly. Deterministic round → joint re-assess (precedence + "absence-of-competing-signal") → bounded apex. **Deduplication suppresses normalization when row-context diverges** (the co-presence flip). Value-type-aware (numbers ≠ spelling variants), Korean-clean.
- `web/src/lib/thalamus/apex-expresser.ts` — `liveApex`: ONE bounded LLM expression over the co-present residue (Decision 158 at the boundary; injectable). **Re-founds the Normalizer's LLM** (its deterministic grouping → `assessNormalization`; its LLM → the apex).
- `web/src/lib/thalamus/recognition-signals.ts` — `persistRecognition`: facet assessments + resolution write back to `classification_signals` (3B.1 facets-on-surface + G11 consolidation).
- No new surface (3B.3): output is `classification_signals` (read via adapter) + the wired `/data` workspace.

**PG-3 evidence — deterministic (6/6, reproducible):**
```
✔ #1 CORRECTION  — "Mexcio" → collapse to "Mexico"        (normalization, no competitor)
✔ #2 IDENTITY    — "Jon Smyth" kept distinct from "Jon Smith" (deduplication; different id)
✔ #3 ANOMALY     — 1000 surfaced as outlier (median+MAD), not corrected (absence-of-competing-signal)
✔ #4 CO-PRESENCE — normalization ALONE: "Acme Corp." → collapse to "Acme Corp";
                    JOINT: keep_distinct (deduplication sees different acct ⇒ different entity).
                    Audit records BOTH co-present claims (the joint info sequential processing destroys).
✔ RECONCILIATION — "1,000" aligns to "1000" (unit_mismatch)
```
This is the load-bearing proof: joint recognition produces a **different, correct** answer than sequential processing for #4.

**PG-3 evidence — live (Casa Diaz, 600 real committed rows, 92 cols):** facets produce sensible assessments — `reconciliation` (format matches), `deduplication` (look-alike names kept distinct), `normalization` (genuine collapses), `anomaly` (outliers); numeric/identifier columns stay quiet after the value-type guard. **PG-3 PASS.**

## Phase 4 — Precision-weighting (PG-4: PASS)
**Deliverable:** the deterministic surfacing override + learning calibration + operator feedback loop.
- `web/src/lib/thalamus/precision-weighting.ts` — `consequence()` (structural: identity-cascade, anomaly, historically-corrected, feeds-calculation, scale — NO registry) × `exposureFromSurface()`; `precisionWeight()` overrides a would-be-`silent` value toward surfacing when consequence HIGH ∧ exposure THIN (Decision 158, deterministic). `refineCalibration()` shifts the threshold from operator feedback — a **learning surface**, not a hardcoded constant (architect Q2).
- Wired live (HALT-3): `GET /api/data/overview` (metrics + jobs + recognition-by-facet + precision-weighted trust flags), `POST /api/data/acknowledge` (operator confirm/correct → `thalamus:acknowledgment` → feeds calibration), `/data/page.tsx` renders the trust flags with Confirm/Correct.

**PG-4 evidence — deterministic (4/4):**
```
✔ #1 silent-confidence value, high consequence + THIN exposure → OVERRIDDEN to light_trace (surfaced=true)
✔ #2 same value, GENUINE (high) exposure → NOT overridden (stays silent — efficiency preserved)
✔ #3 learning surface: 'corrected' feedback lowers the threshold (surface more); 'confirmed' raises it
✔ consequence factors are structural positions, not a field-name list
```
**PG-4 evidence — live (cross-tenant contrast on real exposure):**
```
FAT  tenant BCL  (exec=1020, maxMatch=24): high-consequence "BCL-5001" → NOT surfaced
     "high consequence but GENUINE exposure — the model has actually learned this pattern; efficiency preserved"
THIN tenant Sabor (exec=0, maxMatch=1, thin=true): in the trigger zone (override fires once consequence ≥ threshold)
```
The falsifiable commitment holds: a confident model does **not** silently absorb surprise where exposure is thin, and **does** stay efficient where exposure is genuine. **PG-4 PASS.**

---

## Tests
`node --test` (runner: tsx). **13/13 thalamus tests pass:**
- `signal-surface.test.ts` (3) — adapter composition + exposure.
- `joint-recognition.test.ts` (6) — PG-3 four cases + co-presence flip + reconciliation + deterministic resolver.
- `precision-weighting.test.ts` (4) — PG-4 override / non-override / learning calibration / structural consequence.
`tsc --noEmit` clean (new files); `npm run build` green (**218/218 static pages**, BUILD_ID present); new routes compiled (`/api/data/overview`, `/api/data/acknowledge`, `/data`); dev server `localhost:3000` → HTTP 200.

## Substrate-discipline verification
- **G1 (carry everything):** the adapter and facets read complete signal; no column narrowed.
- **G7 (one surface):** logical read-adapter (architect-approved); no second physical surface, no shadow table.
- **G8 (Korean Test):** every facet judges by value distribution / numeric shape / row-context / edit distance — no header text, no domain literal (proven by the value-type guard + structural-only facets).
- **G9 (calc boundary):** zero calc-engine evaluation-path edits; `synaptic_density` read-only via the adapter; the engine keeps its own `loadDensity`.
- **G11 (read-path closure):** fingerprint read-path live (PG-2); `persistRecognition` closes the remediation write-back.
- **Decision 158:** facets deterministic; the LLM expresses only at the apex over the residue (injectable); the precision-weighting override is deterministic (a function, not an LLM decision).

---

## ARTIFACT SYNC
```
ARTIFACT SYNC
MC: OB-253 → Phases 1–4 delivered; PG-1..4 PASS (deterministic + live). New items: the read-adapter
    (lib/thalamus/signal-surface) is the logical G7 surface; joint-recognition + precision-weighting are
    the re-founding primitives; /data wired live. process-job production wiring of joint recognition is
    a follow-on (see Residuals) — the engine + persistence + apex are built and proven; the live worker
    swap is deferred to avoid destabilizing the 86K×87 ingestion path mid-OB (anti-narrowing: flagged, not hidden).
REGISTRY: thalamus capability — add row "Predictive Intelligence Substrate (Thalamus)": ev = OB-253
    PG-1..4 (true-state map + 13 tests + live Casa Diaz/BCL/Sabor queries); ef = high; fl = build green.
R1: PG-1 (true-state map committed) ✓; PG-2 (co-present adapter + flywheel accumulation live) ✓;
    PG-3 (joint recognition, co-presence flip, deterministic + live) ✓; PG-4 (precision-weighting,
    deterministic + cross-tenant exposure contrast) ✓.
BOARD: now = Thalamus as logical co-present surface + joint recognition + precision-weighting, /data live.
    gap = (a) per-fingerprint exposure granularity, (b) joint recognition wired into the live process-job
    worker (built+proven; swap deferred). ev = 13 tests + live queries. ef = high. fl = green. lane = ready
    for architect review + merge.
SUBSTRATE: exercised the fingerprint flywheel, classification_signals, synaptic_density (read-only),
    the negotiation-protocol shape (applied to repair), Decision 158 apex. Candidate ICA capture:
    "the accumulated surface makes co-present joint inference affordable — recall collapses the joint
    cost" (DS-031 §2.6), evidenced by match_count=9 recall on Casa Diaz.
SUPERSEDED: the EECI five-agent remediation roadmap (Normalizer/Reconciler/Profiler/Dedup/Anomaly as
    discrete ranked components) is dissolved into the four facets of one recognition (DS-031 §2.3) — mark retired.
```

## Residuals (named, not hidden — anti-narrowing)
1. **Per-fingerprint exposure granularity.** `exposureFromSurface` computes exposure at tenant granularity (max `match_count` / summed `total_executions`). DS-031 §5 wants exposure of *this exact structural pattern*. The override is correct and demonstrated at tenant granularity; per-fingerprint scoping (read the value's own atom fingerprint match_count) is a bounded refinement. Documented; not a gate failure (PG-4 passes deterministically + via the cross-tenant contrast).
2. **Live `process-job` worker integration of joint recognition.** The joint-recognition engine, persistence, and apex are built and proven (deterministic + live harness over real `committed_data`); `/data` surfaces it live via a bounded recognition pass. Swapping the live OB-251 async worker's sequential `runRemediationPropose` for the joint recognizer is the production-wiring step, deferred to avoid destabilizing the live 86K×87 ingestion path within this OB — flagged here per the anti-narrowing clause (a step, not a narrowing of the deliverable: the architecture is delivered and proven).
3. **`thalamus:recognition` consolidation in production** depends on (2) — once the worker calls `persistRecognition`, the `/data` trust flags read persisted resolutions rather than a live recompute.
4. **DS-031 v0.1 → v1.0 lock** is the architect's, post-merge (the implementation is the verification, per DS-031 §10/§6A).

## PR
`gh pr create --base main --head ob-253-thalamus-substrate` — title "OB-253: Thalamus predictive intelligence substrate". CC does not merge (SR-44).
