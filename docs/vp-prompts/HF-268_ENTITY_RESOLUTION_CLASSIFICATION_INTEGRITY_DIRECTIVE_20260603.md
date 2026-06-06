# HF-268 — Entity-Resolution & Classification Integrity

## §0 — Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Anti-Pattern Registry checked every build. Architecture Decision Gate: this HF modifies EXISTING surfaces (entity resolution, flywheel injection, HC-pattern classification) — no new tables, agents, or pipeline stages. Drafting per `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

EVIDENTIARY GATES: every phase requires pasted code, terminal output, or query results. No self-attestation. No "should now work."

Commit + push after each phase. Build gate before completion report.

---

## §1 — Problem Statement

One meta-class, three instances: **a downstream mechanism produces wrong output by overriding or dropping the authoritative structural/HC signal.** This is the same class HF-267 addressed (the plan_workbook_signature override); these are adjacent instances on the entity-resolution and classification surfaces. Witnessed on a clean CRP re-import (2026-06-03): the tenant ended with **202 entities where there should be ~32**.

**A1 — Flywheel cherry-picks bindings (registry/cherry-pick pattern, AUD-009).** Sales files imported with fresh Header Comprehension carried 11 column bindings including `sales_rep_id:reference_key`. A later structurally-identical sales file (`07_CRP_Sales_20260216_20260228`, fingerprint `4efbcb34e912`) hit a Tier-1 flywheel match and the injection carried only **5 of 11 bindings** — `sales_rep_id` (the reference_key) was dropped. Evidence: `[SCI-FINGERPRINT] Tier 1: injected 5 fieldBindings` vs the fresh-HC files' 11 roles. The flywheel cache (HF-254 native-columnRole injection) replayed an incomplete binding set. Carry Everything (T1-E902 v2) must apply to the flywheel cache.

**A2 — Entity key falls back to the event identifier (corrupting defect).** With `sales_rep_id` dropped, `commitContentUnit` selected `transaction_id` as `entity_id_field`, and `resolveEntitiesFromCommittedData` created **170 entities from transaction IDs**. Evidence: `commitContentUnit: transaction ... entity_id_field="transaction_id"` then `Entity Resolution: 170 created`. On a transaction-classified unit, the `identifier` column (`transaction_id`) is the EVENT ID, not an entity; the `reference_key` column (`sales_rep_id`) is the entity pointer. Entity resolution must bind a transaction to its `reference_key` and NEVER create entities from a transaction's `identifier`. When the reference_key is absent, leave `entity_id` null (Decision 92 / OB-183 — the engine resolves at calc time); do not fabricate entities from event IDs. This is the field-identity principle in the HF-263 lineage (cross-key-space integrity).

**B — Quota classified transaction, not target (HC-PATTERN over-broad).** The HC-PATTERN `event_transactions_temporal` rule fired on "HAS measure + HAS temporal" and classified the quota `transaction@85%`, overriding the CRR Bayesian (`entity=43%, target=30%`). The quota has `idRepeatRatio=1.00` (one row per entity). The historical pattern logic distinguished transaction (`idRepeatRatio > 1.5`) from target (`idRepeatRatio ≤ 1.5`); the current `event_transactions_temporal` pattern dropped that guard, so a quota (whose temporal column is a period/effective-date marker, not a transaction timestamp) is misclassified. The fix restores the discriminant: measure + temporal with `idRepeatRatio ≤ 1.5` is a target.

**Restoration goal:** CRP re-imports to ~32 entities (not 202); the quota classifies `target`; sales files link to existing entities (0 created) and never spawn entities from transaction IDs; BCL and Meridian regress clean.

---

## §2 — Substrate-Bound Discipline Applications

**Field Identity / HF-263 lineage (cross-key-space integrity):** A2 enforces it. A column's field_identity is contextual to its unit's classification — `identifier` on an ENTITY unit is a person (create entities); `identifier` on a TRANSACTION unit is an event ID (never create entities); `reference_key` is the entity pointer. Entity creation must respect this. The phantom-entity defect is the cross-key-space error (binding the event ID-space to the entity-space) in a new form.

**Carry Everything, Express Contextually (T1-E902 v2):** A1 enforces it for the flywheel cache. The cache must carry ALL bindings, not a cherry-picked subset. Dropping the reference_key on replay is the prohibited persistence-time narrowing, applied to the flywheel store.

**Decision 108 (HC Override Authority):** B enforces it. HC's structural signal (`idRepeatRatio`, the role assignments) is authoritative; a coarse HC-PATTERN heuristic must not override the target/transaction distinction HC's structural profile already encodes.

**Decision 92 / OB-183 (calc-time entity resolution):** A2 relies on it. A transaction row with no resolvable entity reference leaves `entity_id` null and is resolved at calc time — fabricating entities at import is the violation.

**Korean Test:** All three fixes use structural signals (`structuralType`, `idRepeatRatio`, field_identity role) — zero language-specific literals.

---

## §3 — Phase 1: A2 — Entity Resolution Must Not Create Entities From Event Identifiers

This is the corrupting defect. Fix it first.

**P1.1 — Read the entity_id_field selection.** In `web/src/lib/sci/commit-content-unit.ts`, paste the logic that selects `entity_id_field` (the column used as the entity key for committed_data rows). Identify the precedence: does it prefer `reference_key`, and what does it fall back to when no reference_key/entity_identifier binding is present? Paste the exact selection block.

**P1.2 — Read entity creation.** In `web/src/lib/sci/entity-resolution.ts`, paste `resolveEntitiesFromCommittedData`'s entity-creation logic and how it determines which committed_data rows / which column produce new entities. Identify whether it creates entities from a transaction unit's rows keyed on the `entity_id_field`, regardless of whether that field is an `identifier` (event ID) or a `reference_key` (entity pointer).

**P1.3 — Implement the field-identity guard.** The entity key for a non-entity unit (transaction/target/reference) must be a `reference_key`-role column (the entity pointer) — NEVER an `identifier`-role column (which, on a transaction, is the event ID). Specifically:

- In the `entity_id_field` selection: for a transaction/target/reference classification, select the column whose field_identity `structuralType === 'reference_key'` as the entity key. Do NOT fall back to an `identifier`-role column. (An entity-classified unit continues to use its `identifier` column — that IS the person; this path is unchanged.)
- When no `reference_key` column exists on a non-entity unit: set `entity_id_field` to null / leave `entity_id` null. The engine resolves at calc time (Decision 92/OB-183). Do NOT create entities.
- In `resolveEntitiesFromCommittedData`: entities are created only from (a) entity-classified units' identifier columns and (b) reference_key values that point to entities. NEVER from a transaction/target unit's identifier column.

Derive the role from the field_identities metadata already on committed_data (the same `structuralType` HF-263 uses). Korean Test: structuralType only.

**HALT-1:** `commitContentUnit`'s `entity_id_field` selection does not have access to field_identity `structuralType` at the selection point (it selects from `confirmedBindings.semanticRole` instead). If so, paste the actual selection inputs (semanticRole values like `entity_identifier` vs a reference role) and adapt: the entity key for a transaction must be the binding that points to entities (the reference role), not the event identifier. Paste the actual binding roles available for a transaction unit and HALT before guessing the mapping.

**HALT-2:** The entity-classified roster path also flows through this selection, and the change would stop the roster from creating entities from its `employee_id` identifier. The roster MUST continue to create entities from its identifier (employee_id IS the person). If the fix cannot distinguish "identifier on entity unit (create)" from "identifier on transaction unit (do not create)", paste how the unit's classification is available at the creation site and HALT — the discriminant is the unit's classification, not the column alone.

**HALT-3:** Removing the identifier-fallback would leave a legitimately entity-less transaction with no entity key and the engine cannot resolve it at calc time (no reference_key, no roster match). If calc-time resolution requires the import-time entity_id_field even for the null case, paste the calc-time resolver's dependency (OB-183 `entityIdFieldFromMeta`) and HALT — the null path must still record which column is the reference, just not create entities from a wrong one.

Commit: `HF-268 P1 (A2): entity resolution binds transactions to reference_key, never creates entities from event identifiers (HF-263 field-identity lineage)`

---

## §4 — Phase 2: A1 — Flywheel Injection Carries All Bindings (Carry Everything)

**P2.1 — Read the flywheel storage + injection.** Find and paste the Tier-1 fieldBindings injection (HF-254 native-columnRole). Identify where bindings are STORED to the fingerprint and where they are INJECTED on a Tier-1 match. Determine why `07_CRP_Sales` received 5 bindings when the fresh-HC files had 11 — is the stored set incomplete (only bindings with a native columnRole were persisted), or does the injection filter to a subset?

```bash
grep -rn 'injected.*fieldBindings\|native columnRole\|HF-254\|Tier 1.*inject\|fieldBindings.*flywheel' web/src/lib/sci/ | head -20
```

**P2.2 — Implement Carry Everything for the cache.** The Tier-1 injection must carry the COMPLETE binding set for the matched structure, not a cherry-picked subset. Two acceptable shapes (choose based on what P2.1 reveals):
- If the stored set is incomplete (bindings dropped at store time): fix the store path to persist ALL bindings (every column's role), so replay carries them all.
- If the injection filters to a subset: remove the filter so all stored bindings inject.

The reference_key binding (the entity pointer) must NEVER be among the dropped bindings — but the fix is general (carry all), not a special-case for reference_key.

**HALT-4:** The flywheel intentionally stores only high-confidence or native-columnRole bindings for a reason (e.g. low-confidence bindings would poison replay). If carrying ALL bindings would inject low-quality bindings that degrade classification, paste the storage criterion and HALT — the fix may need to carry all STRUCTURAL roles (identifier/reference_key/measure/temporal) while still gating genuinely low-confidence ones, rather than a blanket "carry everything."

**HALT-5:** A Tier-1 match with an incomplete injected set should arguably fall back to fresh HC rather than proceed with partial bindings. If the cleaner fix is "incomplete injection → re-run HC" rather than "always carry all", paste the injection-completeness check point and HALT for architect disposition on which approach.

Commit: `HF-268 P2 (A1): flywheel Tier-1 injection carries complete binding set (Carry Everything — T1-E902 v2)`

---

## §5 — Phase 3: B — HC-PATTERN Target/Transaction Discriminant

**P3.1 — Read the HC-PATTERN classifier.** In the content-profile / HC-pattern module, paste the `event_transactions_temporal` pattern (and any sibling patterns: `entity_definition`, `repeated_measures_over_time`, `per_entity_benchmarks`/target, `lookup_table`/reference). Identify the conditions each fires on and whether `idRepeatRatio` gates the transaction vs target distinction.

```bash
grep -rn 'event_transactions_temporal\|repeated_measures\|per_entity_benchmarks\|idRepeatRatio\|hcPattern\|HC-PATTERN' web/src/lib/sci/ | head -20
```

**P3.2 — Restore the idRepeatRatio discriminant.** A file with measure + temporal must classify by `idRepeatRatio`:
- `idRepeatRatio > 1.5` (repeated entities over time) → transaction.
- `idRepeatRatio ≤ 1.5` (one row per entity) → target (the temporal column is a period/effective-date marker, not a transaction timestamp).

Modify the `event_transactions_temporal` pattern to require `idRepeatRatio > 1.5`, OR yield to the target pattern when `idRepeatRatio ≤ 1.5`. The quota (`idRepeatRatio=1.00`) must classify `target`.

**HALT-6:** Adding the `idRepeatRatio > 1.5` guard to `event_transactions_temporal` changes classification for every measure+temporal file across all tenants. If any known BCL or Meridian transaction file has `idRepeatRatio ≤ 1.5` (a low-repeat transaction file) and would now misclassify as target, paste the proof-tenant evidence and HALT — the discriminant needs refinement, not a blanket guard.

**HALT-7:** A target file legitimately has NO temporal column in some tenants (per_entity_benchmarks pattern: measure + NOT temporal). If the quota's `effective_date` should make it a "temporal target" distinct from a transaction, confirm the target pattern accepts a temporal column when `idRepeatRatio ≤ 1.5`. Paste both patterns and confirm the quota lands `target` (not falling through to Bayesian) before finalizing.

Commit: `HF-268 P3 (B): HC-PATTERN restores idRepeatRatio discriminant — measure+temporal+low-repeat = target (Decision 108)`

---

## §6 — Build Gate + Clean-Slate + Live Verification

**P6.1 — Build.**
```bash
rm -rf .next && npm run build
npm run dev
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

**P6.2 — Clean-slate CRP** (remove the 170 phantom entities + all CRP data). Architect-executed via the established per-tenant clean-slate SQL (now including `structural_fingerprints` and `plan_interpretation_runs`). CC states the expected post-clean state: 0 CRP entities.

**P6.3 — Live verification is architect-executed.** CC states expected outcomes:
- Roster CSV → `entity` (90%) → ~32 entities created/enriched (employee_id is the person — unchanged).
- Quota CSV → `target` (NOT transaction) → `monthly_quota` in committed_data; entity_ids match the roster's 24 (no new phantom entities).
- Sales files (including the flywheel-replay file `07`) → `transaction` → linked to existing entities, **0 entities created** (bound via `sales_rep_id` reference_key, never `transaction_id`).
- **Final CRP entity count ≈ 32, NOT 202.**
- BCL + Meridian re-import → entity counts and classifications unchanged from their verified-PASS state (regression).

CC does NOT run the imports or fabricate counts. The architect captures them.

---

## §7 — Reporting

Completion report: `docs/completion-reports/HF-268_ENTITY_RESOLUTION_CLASSIFICATION_INTEGRITY_COMPLETION.md` (NOT repo root).

Structure:
- P1 (A2): pasted `entity_id_field` selection + `resolveEntitiesFromCommittedData` before/after; confirmation a transaction binds to reference_key and never creates entities from an identifier; confirmation the roster (entity unit) still creates entities from its identifier.
- P2 (A1): pasted flywheel store/inject before/after; confirmation the complete binding set carries on Tier-1 replay.
- P3 (B): pasted HC-PATTERN before/after; confirmation the quota classifies target.
- Build gate output.
- HALT disposition log: HALT-1 through HALT-7, each CLEAR / TRIGGERED with evidence.
- Expected live-verification outcomes for the architect (entity counts, classifications).

Push. `gh pr create --base main --head dev --title "HF-268: Entity-resolution & classification integrity" --body "Fixes phantom-entity creation from transaction event IDs (A2 — entity resolution binds to reference_key, never identifier, per HF-263 field-identity lineage). Fixes flywheel cherry-pick dropping the reference_key binding on Tier-1 replay (A1 — Carry Everything). Fixes quota misclassified as transaction (B — HC-PATTERN restores idRepeatRatio discriminant). CRP regressed from 202 phantom entities to ~32."`

---

## §8 — Out of Scope

- Convergence binding and the calculation engine (whether the now-correctly-classified quota binds and reconciles CRP Plan 2's delta). That is the downstream convergence verification, separate.
- CRP Plan 3 intent-emission non-determinism (HF-266 §6A).
- The HF-183 entity-overlap boost order-dependency (HF-267 P4 / HALT-8) — separate scored-change HF.
- Agent scoring weight changes — if any fix would require changing agent weights, HALT for architect disposition.
- Auth/MFA redirect (separate SR-39 HF); CanonicalWriter retry/backoff (HF-260 ADR R2).

## §8A — Residuals

- If B's reclassification of the quota to `target` changes how it commits (target pipeline vs transaction pipeline) and the engine then can't see `monthly_quota`, that is a convergence-side follow-on (the import side is then proven correct) — and it may be CRP Plan 2's root cause, to verify after this HF.
- After this HF, the flywheel will have cached the bad 5-binding set for fingerprint `4efbcb34e912`. The clean-slate clears `structural_fingerprints`, so a fresh CRP import re-learns from complete HC. Confirm the re-learned fingerprint carries the full binding set.
- BCL + Meridian use rosters and transaction files; the A2 + B changes touch their paths. Their regression re-verification is mandatory before this HF is considered closed (architect-executed).
