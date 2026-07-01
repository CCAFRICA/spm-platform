# HF-370 — Comprehensive import repair (ULTRACODE) — Completion Report

Five objectives, five reviewable PRs (do NOT merge — architect review + live UI/re-import verification, SR-44). Governing law throughout: **Decision 158** (the model recognizes; deterministic code only constructs from the model's structured `identifies`/`data_nature`/`scope_role`/`nature_role`; never keyword-scan prose, never re-classify to overrule the model, never default from a list, never add/consult a registry) and **sequence-independence** (a file's result is identical regardless of import order).

| Obj | PR | Summary |
|-----|-----|---------|
| O3 Import visibility + observatory | #647 | wire the live Ingestion observatory + activate the stuck-job watchdog cron |
| O4 Atom/signal telemetry | #648 | surface per-column model recognition + tier/resolver in the import UI |
| O2 Phantom entities | #649 | entity creation from model recognition only + row-index guard |
| O1 Sequence-independence | #650 | identifier atoms re-comprehend per sheet (no order-dependent scope) |
| O5 Clean Slate | #651 | cover the full tenant footprint + schema-drift guard + disposition of every table |

Reconnaissance ran as a parallel workflow (one reader per objective) + targeted verification; every change site was read and pasted before editing (no blind edits).

---

## OBJECTIVE 3 — Import visibility + process observatory (PR #647)

### Current behavior (pasted evidence)
- **Failure recording WORKS.** `lib/sci/job-failure.ts:recordCommitFailureOnJob` sets `status='failed'` + `error_detail` + `completed_at`; `execute-bulk/route.ts` catch calls it. `components/sci/ImportProgress.tsx` polls the live `processing_jobs` and renders failed jobs with their `error_detail` (not a spinner).
- **Watchdog existed but was NOT scheduled.** `app/api/import/sci/dispatch-jobs/route.ts` reclaims jobs stuck > `STALE_CLASSIFYING_MS=5min` (`reclaimPatch` → terminal `failed` after `MAX_RETRIES`), but `vercel.json` `crons` contained **only** `finalize-sweep` → stuck `classifying`/`committing` jobs hung forever.
- **Observatory data is LIVE, not mock (no HALT).** `app/api/platform/observatory/route.ts?tab=ingestion` queries real `processing_jobs`; the `cancel-job` POST sets `status='failed'`, `retry_count=99 (>> MAX_RETRIES)`. `components/platform/IngestionTab.tsx` renders the live worker queue + a working kill switch. BUT `IngestionTab` was **orphaned** — never imported into `PlatformObservatory` (grep found it referenced only in its own file), so it was unreachable in the UI.

### ADR
Do NOT ship a mock surface (3C HALT) — the surface is live, only unwired. Wire the existing live component; activate the existing watchdog. No new classifier/registry.

### Changes + proof
- `PlatformObservatory.tsx`: added the **Ingestion** tab (lazy import + TabId + TABS + render).
- `vercel.json`: scheduled `dispatch-jobs` `*/5 * * * *` — already in middleware `INTERNAL_WORKER_PATHS` + `isInternalCronCaller`, so **no HF-361-class 401** (verified in `middleware.ts:68`).
- Build green; dev serves `localhost:3000`. **Architect UI (3A/3C):** Observatory → Ingestion shows live jobs; cancel flips status to failed; a forced failure surfaces as an import error.

---

## OBJECTIVE 4 — Atom & signal telemetry (PR #648)

### Current behavior (regression, 4A)
Backend emits per-unit `tier`, `resolver` (flywheel vs LLM), `knownCount`/`novelCount`, `injectedBindings`, and per-column `scope_role`/`nature_role` in `classificationTrace.headerComprehension.interpretations`. The UI **hid** most of it: `SCIProposal.tsx` showed `tier`/`novelCount` only in the *failed*-unit panel (L234-237); per-column recognition was not shown at all.

### ADR
UI-only, additive; surface the model's already-emitted recognition (Decision 158 — no re-derivation).

### Changes + proof
`components/sci/SCIProposal.tsx`: (1) a **Tier-N · resolver · N known** chip on every unit card; (2) an expanded **"Column recognition (model)"** table — per-column `scope_role`/`nature_role`/confidence from the trace. Build green. **Architect UI (4B/4C):** each sheet card shows its tier/resolver + expandable per-column recognition live and at completion.

---

## OBJECTIVE 2 — Phantom-entity misclassification (PR #649)

### Current behavior (root cause, pasted)
`execute-bulk/route.ts processEntityUnit`: `idSourceField = idBinding?.sourceField ?? findHcEntityIdColumn(...)` — the heuristic `entity_identifier` binding **first**, the model only as fallback. That binding comes from `negotiation.ts inferRoleForAgent` (L351-462) which assigns `entity_identifier` via **cardinality (L391) / sequential-integer (L399-404) / first-column (L435)** heuristics (a Decision-158 violation), and via local prose-regexes (`natureIsIdentifier` L38-39). So a `#` row-ordinal or a rate-table band label (`<70%`, `≥120%`) can be bound as the entity id and spawn phantom entities. **No row-index guard** here (unlike `entity-resolution.ts:390 looksLikeRowIndex`).

### ADR
The entity id must be a **model-recognized** entity identifier (`findHcEntityIdCandidates`: `scope_role==='entity' && nature_role==='identifier'`). A `#`/band label is never in that set. Honor the binding **iff it is a model candidate** (preserves `ID_Empleado`-vs-`ID_Gerente` disambiguation → no roster regression); else the model wins; the model-absent fallback is row-index-guarded. No heuristic, no cardinality, no first-column.

### Changes + proof
`execute-bulk/route.ts` (id selection rewritten), `entity-resolution.ts` (`looksLikeRowIndex` exported). **7 unit tests** (`hf370-entity-creation.test.ts`) — `#` and band labels are not candidates; roster binding honored (no `ID_Gerente` regression); heuristic `#` overridden by the model; Plan-General shape → no entity id → 0 entities. 248/248 SCI, build green. **Architect live (2A/2B):** re-import → `Plan General` reference/plan + 0 entities; entity count = 85 (not 96); no band-label entities.

---

## OBJECTIVE 1 — Sequence-independent, Decision-158 classification (PR #650)

### Current behavior (pasted)
- **1B:** the classifier `expression-classifier.ts deriveClassificationFromExpression` reads `scope_role`/`nature_role` by **equality** against the fixed primitive set (`structural-primitives.ts`); grep for `MEASURE_NATURE`/`TEMPORAL_NATURE`/`ENTITY_SCOPE`/`TXN_SCOPE`/`IDENTIFIER_NATURE` → **zero** (deleted HF-368). No classification word list survives.
- **1C gap:** the atom flywheel (`atom-flywheel.ts`) caches `scope_role` per value-fingerprint and reuses it across sheets, last-write-wins, with conflict detection on `data_nature` only (`resolveAtomRole`), **not** `scope_role`. The fingerprint is context-free but `scope_role` for an identifier is sheet-contextual → a roster's entity id and a lookup's reference key with the same fingerprint pollute each other's scope → **classification depends on import order**.

### ADR
A reactive scope-conflict detector still leaves a first-collision order-dependence window (→ HALT per the HARD FACT). Instead: **identifier atoms are never warm-claimed** — since `scope_role` for an identifier is the sheet-contextual, classification/resolution-critical field, it must be decided per-sheet, not inherited. Non-identifier atoms (measure/temporal/name/categorical — scope affects no outcome) still claim. A fully-known **sheet** reuses its context-complete sheet-level fingerprint, so an identical re-import stays cheap (1C). Reads the model's bare primitive only.

### Changes + proof
`atom-flywheel.ts knownAtomHashes` excludes `nature_role==='identifier'` / `scope_role∈{entity,transaction}`. **4 unit tests** (`hf370-sequence-independence.test.ts`) — identifier/entity/transaction atoms excluded; measure/temporal/name/categorical still claimed; the same identifier atom is never claimed regardless of a prior sheet's cached scope. 245/245 SCI, build green. **Architect live (1A):** Datos alone vs plan→roster→Datos vs roster→Datos→plan → Datos = transaction, `ID_Empleado` = identifier, every time.

---

## OBJECTIVE 5 — Clean Slate (PR #651)

### Current behavior (live migration scan, 5A)
39 tenant-scoped tables (carry `tenant_id`); 5 foundational/global (no `tenant_id`: `foundational_patterns`, `domain_patterns`, `promoted_patterns`, `platform_settings`, `tenants`). `CLEAN_SLATE_CATEGORIES` cleared only ~15 → the rest lingered.

### ADR
Clear every tenant-scoped table except a documented KEEP set; make coverage **schema-derived so it cannot drift**; never touch foundational stores.

### Changes + proof
- Expanded `CLEAN_SLATE_CATEGORIES` with all tenant-scoped **leaf** tables in the proven `DELETE_TENANT_TABLES` order (no new FK hazard): `calculation_batches`; `rule_set_lifecycle_events`, `plan_interpretation_runs`; `ingestion_configs`, `file_objects`; `surface_bindings`, `synaptic_density`, `comprehension_artifacts`, `intelligence_artifacts`, `ai_call_metrics`, `agent_invocations`.
- **Authoritative disposition** of every tenant-scoped table: CLEARED / KEEP (`profiles`, `profile_scope`, `usage_metering`, `audit_logs`) / CASCADE-cleared / ARCHITECT_REVIEW.
- **Schema-drift guard test** (`hf370-clean-slate-coverage.test.ts`) parses the migrations for every `tenant_id` table and FAILS if any is undispositioned (5A cannot-drift); asserts no foundational table is in a clear set (5B); KEEP/CLEAR disjoint. 4 tests + 245 SCI, tsc clean, build green.
- Every DELETE is `.eq('tenant_id')` (`deleteTenantScoped`) — 5D.

### Explicit report (NOT silent narrowing) — ARCHITECT_REVIEW subset
Tenant-scoped but **not** auto-added to the destructive selectable Clean Slate, flagged for architect FK sign-off (SR-44): `reference_data`/`reference_items`/`alias_registry` (NO-ACTION FK chain — needs alias→items→data order + live FK verification), `periods` (inbound `period_id` FKs + category-requires topology), `import_batches` (a **deliberate** existing preservation — cockpit reads live `committed_data`), and workflow/user state (`reconciliation_sessions`, `approval_requests`, `disputes`, `agent_inbox`, `user_journey`). These ARE cleared by Delete Tenant; adding them to a NO-ACTION-FK destructive op requires live verification.

---

## Global HALT conditions — status
- Scope narrowing → **none silent**: every objective delivered; the O5 FK-hazardous subset is explicitly reported for architect sign-off, not dropped.
- Registry / word list / keyword scan → **none introduced**; O1 confirmed the classifier word lists are already deleted; O2 removed a heuristic path; all new reads are model bare-primitive equality.
- Residual cross-file / import-order dependence → **closed** for the classification/resolution-critical field (O1).
- Observatory mock data → **not mock** (O3): live `processing_jobs`.
- Clean Slate touching a no-`tenant_id` table → **guarded** (O5 drift test asserts foundational exclusion).
- **HALT-2 (reported, not blocking):** after Datos classifies transaction, if convergence still yields 0 bindings, that is the separate convergence field-matching / percent-scale gap (`cumplimiento`→`Cumplimiento_Colocacion`, `calidad`→`Indice_Calidad_Cartera`) — a distinct finding, not expanded here.

## Architect handoffs (SR-44 live verification)
1. Observatory → Ingestion tab live jobs + cancel (O3, 3A/3C).
2. Import UI per-column recognition + tier/resolver (O4, 4B/4C).
3. Re-import ordering invariant + entity count = 85 + Plan General reference/0-entities (O1/O2, 1A/2A/2B).
4. Clean Slate on a disposable tenant → tenant tables 0, second tenant + foundational unchanged (O5, 5B/5C).
5. Disposition of the O5 ARCHITECT_REVIEW subset (destructive scope decision).

Calculated totals, where produced by a live re-import, are the architect's to record verbatim (reconciliation-channel separation).
