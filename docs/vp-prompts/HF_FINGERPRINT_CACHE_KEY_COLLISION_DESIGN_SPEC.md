# HF — Fingerprint-Cache Key Collision (Workbook Composition Drift)

**Status:** DESIGN SPECIFICATION — Architect Review Pending
**Sequence:** UNNUMBERED (premature-numbering avoidance — architect sequences post-approval)
**Authored:** 2026-05-04 (post-Meridian re-import diagnostic, this conversation)
**Discipline:** Design Gate (DG) — implementation in separate conversation
**Defect class:** Cache-Key Indeterminacy

---

## 1. Plain-language summary

The fingerprint flywheel (DS-017) caches classification bindings against a single-sheet fingerprint hash. When a workbook contains multiple sheets, only the **first sheet's** structure determines the cache key. Two workbooks with identical first sheets but different sheet sets produce the same hash and serve each other's cached bindings.

In practice: importing `Meridian_Logistics_Benchmark.xlsx` (5 sheets) primed the cache. Importing `Meridian_Datos_Q1_2025.xlsx` (3 sheets, subset) hit Tier 1, was injected the *first file's* bindings — including bindings from sheets that don't exist in the second file (e.g., `Plan_Incentivos.__EMPTY` columns). The second file's `Plantilla` got `__EMPTY:unknown@0.65` instead of `No_Empleado:identifier@0.95`. Entity resolution degraded from 505 rows linked to 67 rows linked.

**The system handled physical-batch deduplication correctly. It failed at the cache-recall layer: the cache key cannot distinguish workbook composition.**

---

## 2. Evidence

### 2.1 Code evidence (from AUD-001 SCI Pipeline Code Extraction)

`web/src/lib/sci/fingerprint-flywheel.ts`:
```typescript
const fingerprintHash = computeFingerprintHashSync(columns, sampleRows);
```
Lookup is per-array of columns, not per-workbook.

`web/src/app/api/sci/analyze/route.ts` (paraphrased):
```typescript
// Compute fingerprint from the first sheet (primary content) for file-level matching
const primarySheet = file.sheets[0];
flywheelResult = await lookupFingerprint(
  tenantId,
  primarySheet.columns,
  primarySheet.rows,
  ...
);
```

**The comment "for file-level matching" is the bug.** A single sheet's columns cannot represent a multi-sheet workbook's composition. The hash is sheet-level by computation, file-level by intent — and the gap silently produces wrong-sheet bindings on cache hit.

### 2.2 Live evidence (this conversation, 2026-05-04 02:33)

```
File 1: Meridian_Logistics_Benchmark.xlsx (5 sheets: Plantilla, Datos_Rendimiento, Datos_Flota_Hub, Plan_Incentivos, Resultados_Esperados)
  → tier=3 match=false hash=c6f13c61a05e (novel structure)
  → LLM HC ran (37s, avgConf=0.94)
  → Plantilla: No_Empleado:identifier@0.95 ✅
  → Entity resolution: 505 rows linked

File 2: Meridian_Datos_Q1_2025.xlsx (3 sheets: Plantilla, Datos_Rendimiento, Datos_Flota_Hub)
  → tier=1 match=true hash=c6f13c61a05e confidence=0.5 matchCount=1
  → LLM skipped — Tier 1 match
  → Tier 1: injected 5 fieldBindings from flywheel into Plantilla
  → Plantilla: __EMPTY:unknown@0.65 ❌ (wrong sheet's bindings served)
  → Entity resolution: 0 created, 67 rows linked across 7 batches (vs 505 prior)
  → Skipping batch ...: identifier column Cuentas_Nuevas looks like row indices
  → Skipping batch ...: identifier column Mes looks like row indices
```

The same hash served different binding contexts. The flywheel is functioning per its current contract. The contract is incomplete.

### 2.3 What worked (preserved by this HF)

- **Phase 1F SHA-based batch supersession** (`content_hash_match_reimport`) — physical-batch deduplication works
- **Entity uniqueness** (`67 new, 0 existing` → second pass `0 new, 67 existing, 67 enriched`) — entity-level deduplication works
- **`Cleared input_bindings` invalidation** on re-import — convergence re-derivation triggers correctly

This HF must not regress these layers.

---

## 3. Defect class characterization

### 3.1 Why this is structural, not file-specific

The DS-017 fingerprint algorithm is documented as deterministic on:
```
columnCount + '|' + sortedColumnNames + '|' + sortedColumnTypes + '|' + roundedRatios
```

There is no provision for **workbook composition** — the set of sheets, their names, and their pairwise structural relationships. Any multi-sheet workbook with the same first-sheet shape collides.

This is not a Meridian-specific defect. Any tenant whose imports include both:
- A "complete" workbook (data + plan + answer key + reference)
- A "data-only" workbook (subset)

…will hit this collision on the second import. BCL has avoided it because BCL's six monthly imports each have identical sheet sets. CRP has avoided it because CRP imports were all single-sheet incremental files. **Meridian is the first proof tenant whose import pattern exercises composition divergence.**

### 3.2 Adjacent-Arm Drift potential

The cache key indeterminacy at the workbook-composition layer raises a sibling-surface question:

- **Is per-sheet fingerprint cached when classification produces per-sheet bindings?**
  Answer from code: yes (`fingerprintMap = new Map<string, StructuralFingerprint>(); // HF-094` writes a fingerprint per content unit).
- **Is the per-sheet fingerprint used as the read-path key?**
  Answer from code: no. Read path uses primary-sheet fingerprint only.

The write path is more granular than the read path. The write path stores per-content-unit fingerprints into `classification_signals.fingerprint`; the read path queries `structural_fingerprints.fingerprint_hash` keyed on first-sheet hash only. **Write granularity ≠ read granularity** — that's the structural drift.

### 3.3 Decision-Implementation Gap

DS-016/017 documents the fingerprint as identifying *file structure*. Implementation collapses *file* to *first sheet*. The semantic is "files with this fingerprint are structurally equivalent." The implementation enforces "files whose first sheets are structurally equivalent." The first sheet ≠ the file when files are multi-sheet workbooks.

This is the same Decision-Implementation Gap pattern as Decision 127 (locked but not operative until Phase 1G-15 boundary canonicalization). Decision documents semantic; implementation realizes a narrower version; gap surfaces in production.

---

## 4. Design

### 4.1 Principles

1. **Preserve flywheel memory.** Cache hits are the architecture's core value (DS-017 §5: 99% LLM cost reduction at scale). Do not break Tier 1 for non-colliding cases.
2. **Hard warning, not silent acceptance.** Architect-level signal when collision risk detected. User must see "this file structure was previously imported with different sheet composition" — explicit, named, surfaced.
3. **Accommodate, don't reject.** Import must complete. Demote Tier 1 → Tier 3 (or 2) when collision detected; force fresh classification for sheets without cached binding.
4. **Korean Test compliance (AP-25).** Detection uses structural heuristics — sheet count, sheet name set, sheet-level fingerprint set — not file name patterns or content keywords.
5. **Carry Everything, Express Contextually.** No deletion of cached fingerprints. Augment cache key with composition signature.
6. **Decision 64 compliance.** Detection emits classification_signals on the shared signal surface; no new signal table.

### 4.2 Three-layer structure

#### Layer A — Cache key augmentation

Augment the fingerprint with a **workbook composition signature** when the file contains more than one sheet.

**Composition signature:**
```
composition_signature = SHA-256(
  sheetCount + '|' +
  sortedSheetNames.join(',') + '|' +
  sortedSheetFingerprints.join(',')
)
```

Where `sortedSheetFingerprints` is the array of per-sheet structural fingerprint hashes (each computed by the existing algorithm), sorted lexically.

**Composite cache key:**
```
cache_key = (primary_fingerprint_hash, composition_signature)
```

For single-sheet workbooks, `composition_signature = primary_fingerprint_hash` (degenerate case — compatibility with current cache).

For multi-sheet workbooks, `composition_signature` distinguishes "5-sheet Benchmark" from "3-sheet Datos_Q1" even when first sheets match.

#### Layer B — Schema change to `structural_fingerprints`

Add column:
```sql
ALTER TABLE structural_fingerprints
  ADD COLUMN composition_signature TEXT;

CREATE INDEX idx_structural_fingerprints_composition
  ON structural_fingerprints (tenant_id, fingerprint_hash, composition_signature);
```

`composition_signature` is nullable for backward compatibility with rows written before this HF.

#### Layer C — Read-path tier routing change

**Modified Tier 1 logic:**

```
1. Compute primary_fingerprint_hash (existing algorithm) — first sheet
2. Compute composition_signature (new) — workbook-level
3. Query: SELECT ... WHERE tenant_id=X AND fingerprint_hash=primary AND composition_signature=composition
4. If exact match → Tier 1 (full cache hit)
5. If no exact match BUT primary_fingerprint_hash exists with different composition_signature → Tier 1-COMPOSITION-DRIFT
   - SURFACE HARD WARNING to user (architect-channel + UI inbox + user-facing import notice)
   - Demote to Tier 3: full classification of all sheets
   - Preserve original cached entry (don't update or replace)
   - Write new cached entry with new composition_signature
6. If no fingerprint match at all → Tier 3 (existing behavior)
```

Tier 2 (foundational, cross-tenant) follows the same composition-aware logic.

#### Layer D — Hard warning surface

Three surfaces emit when COMPOSITION-DRIFT detected:

1. **Log line (immediate visibility):**
   ```
   [SCI-FINGERPRINT-DRIFT] Composition drift detected: hash=<primary> tenant=<id>
     prior_composition=[Plantilla,Datos_Rendimiento,Datos_Flota_Hub,Plan_Incentivos,Resultados_Esperados]
     current_composition=[Plantilla,Datos_Rendimiento,Datos_Flota_Hub]
     action=tier_demoted_to_3 reason=workbook_composition_mismatch
   ```

2. **Classification signal (Decision 64, single shared surface):**
   ```
   signal_type: classification:composition_drift
   signal_data: { primary_fingerprint, prior_composition, current_composition, action_taken }
   ```

3. **Agent inbox notification (user-facing):**
   ```
   severity: warning
   type: import_drift
   title: "File structure familiar but workbook composition differs"
   description: "<filename> has the same first-sheet structure as a previously imported file
     but different sheet composition. <N> sheets are present this time vs <M> previously.
     Re-classifying all sheets to ensure correctness."
   action_label: "Review classification"
   action_url: <import session URL>
   ```

The agent inbox notification is the user-facing accommodation per architect direction. Architect and operator personas both see this.

### 4.3 What this does NOT change

- DS-017 fingerprint algorithm itself (single-sheet hash) — preserved
- Tier 1/2/3 semantics — preserved
- Confidence progression (DS-017 §4.3) — preserved
- Phase 1F batch supersession — untouched
- Entity uniqueness — untouched
- HF-145 optimistic locking on fingerprint write — preserved
- Korean Test (AP-25) — preserved (composition signature is structural)

---

## 5. Implementation phases (architect to sequence)

This HF will require structural work across three surfaces. Premature-numbering avoidance: architect numbers when ready.

**Phase α — Schema migration**
- Add `composition_signature` column to `structural_fingerprints`
- Add composite index
- Backward-compatibility (nullable column; pre-existing rows don't trigger drift detection)

**Phase β — Compute path**
- Implement `computeCompositionSignature(file: ParsedFile): string` in `web/src/lib/sci/structural-fingerprint.ts`
- Single-sheet degenerate case returns primary fingerprint (no behavior change for existing imports)

**Phase γ — Read path**
- Modify `lookupFingerprint` to accept and query against composition signature
- Implement Tier 1-COMPOSITION-DRIFT branch
- Existing Tier 1 cases (composition matches) continue Tier 1 behavior

**Phase δ — Write path**
- Modify `writeFingerprint` to persist `composition_signature`
- Backfill not required (nullable column)

**Phase ε — Surface emission**
- `[SCI-FINGERPRINT-DRIFT]` log
- `classification:composition_drift` signal
- `agent_inbox` notification

**Phase ζ — Verification**
- Re-import of single-sheet file after multi-sheet file (and vice versa) → Tier 3 with drift warning, not Tier 1 false hit
- Identical workbooks → Tier 1 (no regression)
- Single-sheet files → unchanged behavior
- Meridian-pattern test: Benchmark.xlsx then Datos_Q1.xlsx → second import classifies correctly, surfaces drift warning, links 505 rows on first sheet (or equivalent metric)

---

## 6. Acceptance criteria

For HF closure (architect-set; this is the design's view):

- [ ] **Regression test 1:** Tier 1 cache hit still works for same-file re-import (BCL pattern). LLM skipped, classification served, confidence > 0.5.
- [ ] **Regression test 2:** Tier 3 still works for novel structure. LLM ran, fingerprint stored with composition signature.
- [ ] **Drift test:** Multi-sheet file followed by subset-sheet file. Second import surfaces COMPOSITION-DRIFT log line, classification signal, and inbox notification. Sheet bindings produced fresh (not from cached file's bindings).
- [ ] **Drift inverse:** Subset-sheet file followed by multi-sheet superset. Second import surfaces drift, demotes to Tier 3.
- [ ] **Korean Test:** Composition signature uses no language-specific or domain-specific string literals.
- [ ] **Decision 64:** Drift signal lands on `classification_signals` shared surface with `signal_type: classification:composition_drift`.
- [ ] **Backward compatibility:** Existing `structural_fingerprints` rows without `composition_signature` do not break read path. Tier 1 remains operative for pre-HF cached entries; first encounter post-HF rewrites with composition signature.
- [ ] **User visibility:** Inbox notification readable, not technical-jargon-only.
- [ ] **Live Meridian test:** Re-import Meridian Benchmark + Datos_Q1 sequence after this HF lands. Both files classify correctly. Warning visible. Calc proceeds (separate verification).

---

## 7. Out of scope (explicit)

- Plan tier extraction defect ("no tiers" on every component) — separate HF
- Resultados_Esperados being importable as transaction data — separate HF (reconciliation-channel separation at import surface)
- Storage object orphaning when tenant data wiped — pre-existing, separate
- Period auto-detect failure observed in CLT-197 screenshot — pre-existing, separate
- `field_identities` substrate question (live table or in-row property?) — separate substrate audit

These remain in this conversation's open-items list but are not within this HF's scope.

---

## 8. PCD compliance

| Item | Verdict | Note |
|---|---|---|
| Memory review | ✅ | Decision 64, AP-25, Decision 152, DS-017, HF-145, Adjacent-Arm Drift, Decision-Implementation Gap |
| Rule 29 (CC paste LAST) | N/A | Design document, not CC-prompt artifact. Implementation prompt comes after architect approval. |
| Artifact read | ✅ | DS-016/017 (Ingestion Architecture), AUD-001 SCI Pipeline Code Extraction (fingerprint-flywheel.ts, structural-fingerprint.ts, sci/analyze route), SCHEMA_REFERENCE_LIVE.md (structural_fingerprints, agent_inbox shape) |
| Schema verify | ✅ | structural_fingerprints columns confirmed via SCHEMA_REFERENCE_LIVE.md + this session's live information_schema query |
| Locked decisions + open items | ✅ | Composition signature is additive to DS-017 contract, does not violate it; Decision 64 honored (signal on shared surface) |
| Korean Test | ✅ | Composition signature is structural (sheet count, sorted names, sorted hashes). No string-literal field-name matching. |
| Vertical Slice rule | ✅ | One PR covers schema + compute + read + write + surface. No engine/UI separation. |
| SR-34 (No Bypass) | ✅ | Structural fix at cache-key layer. No reduced-scope test, no workaround, no interim measure. |
| Reconciliation-channel separation | N/A | This HF doesn't write or read ground-truth values. |
| Premature-numbering avoidance | ✅ | HF unnumbered. CC implementation prompt deferred. |
| Capability-first routing | ✅ | All work is CC-capable: schema migration drafted, code edits via tsx-script + grep + commit, build verification. Architect role: SQL Editor migration application, browser verification, gh pr create/merge, production sign-off. |
| Reasoning-Scope Binding Specificity | ✅ | Scope: cache-key indeterminacy at fingerprint flywheel read path. Not: plan tier extraction, period detection, answer-key import, storage cleanup. |

---

## 9. Architect decision points

Before this HF moves to implementation, architect should confirm:

1. **Composition signature algorithm acceptable?** Currently: SHA-256(sheetCount + '|' + sortedSheetNames + '|' + sortedSheetHashes). Alternatives include: bag-of-sheets (sheet name set without count), per-sheet binding context (column roles per sheet, more granular), or domain-aware (industry hint inclusion). Default proposed is simplest defensible.

2. **Drift action: demote to Tier 3 (full re-classify) or Tier 2 (cross-tenant assist)?** Default proposed is Tier 3 because the colliding-cache risk is precisely that tenant-level bindings might be wrong. Tier 2 might inherit different wrongness from foundational patterns.

3. **Inbox notification persistence and routing.** Where does this notification surface in the current platform UI? `/operate/import` notification banner? Standalone inbox? `agent_inbox` table is referenced; need to confirm UI consumer exists or if this HF should add one.

4. **Sequence number assignment.** When this design is approved, architect numbers as HF-N, OB-N, or DS-amendment depending on scope intent. Suggesting HF-N (tactical structural fix) but architect may prefer OB-N (broader observability bundle) if Phase ε surface emission is sized accordingly.

5. **CC prompt readiness.** This document is design-only. After architect approval, separate conversation produces CC-pasteable implementation prompt with prerequisites, evidentiary gates, and Rule 29-compliant CC block.

---

## 10. Pre-existing related work referenced

- **DS-016/017** — Ingestion Architecture (3-tier recognition, fingerprint algorithm, flywheel write/read paths)
- **HF-145** — Optimistic locking on fingerprint write (preserved)
- **HF-094** — Per-content-unit `fingerprintMap` write (the granularity gap evidence)
- **OB-174 Phase 3** — DS-017 Tier Routing implementation
- **OB-178 Phase D / DIAG-010** — Tier 2 fallthrough fix (preserved)
- **Decision 64** — Single shared signal surface (drift signal lands here)
- **Decision 152** — Import sequence independence (preserved; drift detection doesn't gate sequence)
- **AP-25 (Korean Test)** — Structural-only field identification (preserved)

---

## 11. Living open question (for record)

**Is `composition_signature` correct as workbook-level only, or should it incorporate tenant-level historical context?**

A tenant who reliably imports the same file pattern in alternating week-1/week-2 shapes might trigger drift each alternation. A more sophisticated key could include "compositions previously seen by this tenant" — but that's stateful, expensive, and extends scope.

**Default decision:** Workbook-level only. Drift fires every time composition differs. Architect can lock this as Decision-N or amend in a future HF if multi-composition tenants become common.

---

*End of design specification. Architect dispositions: approve-as-drafted / amend / reject / sequence-number / proceed-to-implementation-prompt.*
