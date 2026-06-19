# OB-216 — Convergence Unified Path: Sheet-Aware Partition + Role-Aware Candidates + Relative/CRL Selection + Per-Sheet Entity Key + Cross-Period Clawback

**OB number:** OB-216 (architect-assigned — verify against live `docs/vp-prompts/` before writing; collision → HALT and report).
**Repo:** `CCAFRICA/spm-platform` · **Base:** branch from `main` (HEAD `5400baa5` or later; record actual in §0.3).
**Branch:** `ob-216-convergence-unified-path`
**Type:** BUILD (vertical slice — convergence→resolution→calculate, one PR). **Ratified basis:** `docs/diagnostics/DIAG-073_CONVERGENCE_UNIFIED_ROOT_CAUSE_OUTPUT.md` (on `main`).
**Effort directive:** Execute with **ULTRATHINK / maximum reasoning effort and ULTRACODE rigor.** This is a single unified rewrite of the convergence→resolution path; fragmentation is the failure mode being engineered against. Resolve Phase 0 probes BEFORE touching implementation so the build cannot fork mid-flight. Do not abbreviate any phase. Every phase gate (EPG) requires pasted evidence — no self-attestation.

---

## §0 — CC Standing Rules, Pre-Flight, Disqualifications

### §0.0 Standing rules (binding)
Read `CC_STANDING_ARCHITECTURE_RULES.md` in full first. Binding for OB-216:
- Architecture Decision Gate before implementation. Anti-Pattern Registry checked every build. SQL Verification Gate before any SQL.
- Commit + push after every phase. After all phases: `pkill -f "next dev"` → `rm -rf .next` → `npm run build` (exit-0 required) → `npm run dev` → confirm `localhost:3000`. Git from repo root (`spm-platform`), NOT `web/`.
- Final step: `gh pr create --base main --head ob-216-convergence-unified-path`. **DO NOT merge** (SR-44: merge + browser recalc verification are architect-only).
- **Evidence = pasted live code (path+lines) or pasted runtime/query output.** No "I believe," no PASS/FAIL self-attestation.

### §0.1 PCD verdict table (schema + claim provenance — all verified pre-draft)
| Element | Source | Status |
|---|---|---|
| `convergence-service.ts` @ `web/src/lib/intelligence/` (3615L) | DIAG-073 §1.2 (live) | ✅ |
| `run/route.ts` @ `web/src/app/api/calculation/` (3272L) | DIAG-073 §1.2 | ✅ |
| `resolver.ts`,`contextual-reliability.ts` @ `web/src/lib/sci/` (CRL live) | DIAG-073 §1.3/§3.4 | ✅ |
| `committed_data.row_data`/`data_type`/`import_batch_id`/`source_date` | SCHEMA_REFERENCE_LIVE | ✅ |
| `_sheetName` lives in `row_data`, stripped at read (`1112-1117`) | DIAG-073 §2.1 (pasted) | ✅ |
| `import_batch_id` = per-sheet proxy (14 batches/14 sheets) | DIAG-073 §2.0 | ⚠️ Phase 0 confirms |
| `rule_sets.components` JSONB (NO `plan_config`) | SCHEMA_REFERENCE_LIVE | ✅ |
| `calculation_results.total_payout`/`rule_set_id` (clawback x-period source) | SCHEMA_REFERENCE_LIVE | ✅ |
| Negative passthrough unclamped; conditional firing via `filters` | DIAG-073 §5.3 (pasted) | ✅ |

### §0.2 Disqualifications
- **DO NOT read, cite, or reason from `AUD-001_CODE_EXTRACTION.md` or any `docs/` extract.** Stale. Read live source at the branch HEAD only.
- **DIAG-073 line numbers are guidance, not gospel** — re-read each cited function live before editing; if a line moved, use the live location and note it.

### §0.3 Record HEAD + branch
```bash
git checkout main && git pull && git log --oneline -1     # record SHA
git checkout -b ob-216-convergence-unified-path
```

### §0.4 Locked disciplines this OB must satisfy (verify at each gate)
- **Korean Test (Decision 154):** partition key + candidate admission + selection are **structural** — zero language-specific string literals, zero column-name-content branching. The partition key is a structural source identifier (`import_batch_id`/`_sheetName`), not a column name.
- **Carry Everything (T1-E902):** stopping the `_`-strip / using the sheet key is *removing* a read-time narrowing — aligned. Do not introduce new persistence-time or read-time narrowing.
- **Decision 110 / no-developer-numbers:** every replaced threshold becomes relative-separation (argmax) or CRL-`reliability`-derived authority. `bash scripts/no-developer-numbers-scan.sh` on `convergence-service.ts` GREEN is part of definition-of-done.
- **Decision 158:** LLM *recognizes* (proposes mappings); deterministic code *constructs and guarantees* (sheet partition, candidate admission, selection). No LLM in the partition or the entity-key derivation.
- **SR-34:** fix at the structural-class layer (the partition), never a per-plan/per-tenant branch. **No MIR special-case anywhere.**
- **SR-2 (Scale by Design):** the partition must work for N sheets in M data_types, single-sheet tenants (BCL/Meridian/CRP — one sheet, one data_type), and multi-sheet (MIR). Reject any edit that only works for MIR.

---

## §1 — Problem Statement (ratified, DIAG-073)

On `main` (HF-302+303 merged), MIR (`972c8eb0-e3ae-4e4c-ad30-8b34804c893a`, 5 plans, 34 entities, 75,227 rows, 75,197 resolved) calculates all 5 January plans but every plan binds to the wrong columns. **One structural-class root:** convergence models the file boundary as `data_type`, but this tenant's 5 files are 5 `_sheetName`s inside a single `data_type='transaction'`. `inventoryData` strips `_sheetName` and merges all sheet schemas into one `DataCapability` (`convergence-service.ts:1012-1117`); `matchComponentsToData` keys only on `data_type` (`1193-1303`); `generateAllComponentBindings` builds one cross-sheet, measure-only `measureColumns` pool (`2700-2736`); the AI mapper is handed that contaminated, label-less pool and a prompt that forbids abstention (`anthropic-adapter.ts:940`), so every plan binds onto Cobranza's measures. The same degenerate partition feeds the engine's single global `entityCol = knownEntityCols[0]` (`run/route.ts:813-820`), so resolution is sheet-blind (Track C). The clawback (Plan 5) rides the same broken path AND needs a cross-period mechanism the engine lacks (Track B).

**This OB delivers ONE corrected convergence→resolution path** (no registry, no thresholds, no per-plan branch): partition by the real file boundary → match each component to its sheet → offer role-appropriate candidates from the matched sheet → select relatively (CRL/argmax) → key entities per sheet → and adds the one net-new cross-period clawback sub-component. Tracks A, A′, C collapse into the partition fix; B adds one bounded sub-mechanism on the corrected path.

**Definition of done (all required):**
1. All 5 MIR plans bind each metric to a column from that plan's **own sheet** (structural self-check: Ventas plan → Ventas columns, Cobranza plan → Cobranza columns, Cartera Nueva → `Verificado`/`Pedidos…`, clawback → devolution path). Architect reconciles values against ground truth (architect channel).
2. `no-developer-numbers-scan.sh` on `convergence-service.ts` GREEN (6 thresholds + scale-bounds + validity-floor eliminated).
3. The 4 non-clawback plans compute non-zero, correctly-keyed per-entity results; the clawback computes its negative in the return period.
4. **No single-file regression:** BCL/Meridian/CRP (one sheet, one data_type) recalc unchanged (architect verifies, SR-44).
5. `npm run build` exit-0; `localhost:3000` confirmed; PR opened (not merged).

---

## §2 — Substrate-Bound Disciplines (applied)
- **T1-E905 (Prove Don't Describe):** every phase EPG = pasted code diff + pasted runtime log/query.
- **T1-E910 (Korean Test):** §0.4 — structural partition/admission/selection; the OB must show, at each EPG, that no edit branches on a column-name literal.
- **Vertical Slice Rule:** one PR spanning `inventoryData` → matching → candidates → selection → engine entity-key → calculate. No partial slice.
- **SR-38 (Mathematical review gate):** before the final PR, for the clawback prime `−(Monto_Original × Tasa × Multiplier)` and for one non-clawback plan, hand-compute one entity from raw rows and show the engine reproduces it (property: result sign + magnitude). Paste both.
- **SR-34 / SR-2:** structural-class fix, scale-safe; reject MIR-only edits.
- **Reconciliation-channel separation:** CC reports computed values verbatim; NO ground-truth payout values in this OB or its completion report. Architect reconciles.

---

## §3 — PHASE 0: Resolve Load-Bearing UNKNOWNs (read-only; BEFORE any edit)

**ULTRACODE rationale:** DIAG-073 left 5 residual UNKNOWNs; #1, #3, #4, #5 are load-bearing and, if unresolved, fork the build. Resolve them first so every later phase is deterministic. **No code edits in Phase 0** — probes only, results pasted, decisions recorded.

### §3.1 Probe — partition key (resolves UNKNOWN #3)
Confirm `import_batch_id` is a faithful per-sheet key (one batch ↔ one sheet) and that `row_data._sheetName` is reliably present:
```sql
SELECT cd.import_batch_id,
       (cd.row_data->>'_sheetName') AS sheet,
       cd.data_type,
       count(*) AS rows,
       count(DISTINCT (cd.row_data->>'_sheetName')) AS distinct_sheets_in_batch
FROM committed_data cd
WHERE cd.tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
GROUP BY cd.import_batch_id, cd.row_data->>'_sheetName', cd.data_type
ORDER BY cd.import_batch_id;
```
**Decision rule, recorded:** if every `import_batch_id` maps to exactly one `_sheetName` (`distinct_sheets_in_batch = 1` throughout) → **partition key = `import_batch_id`** (cleanest, a real column, Korean-Test-clean). If any batch carries multiple sheets → partition key = `(import_batch_id, _sheetName)` composite, and Phase 1 must stop stripping `_sheetName`. Record which.
Also confirm `_sheetName` null-rate is 0 (if any row lacks it, the composite key is mandatory):
```sql
SELECT count(*) FILTER (WHERE row_data->>'_sheetName' IS NULL) AS null_sheet,
       count(*) AS total
FROM committed_data WHERE tenant_id='972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
```

### §3.2 Probe — live entity-key per plan (resolves UNKNOWN #1, the most important)
For each of the 5 rule_sets, capture what `entity_identifier.column` the live binding currently produces, and what `knownEntityCols[0]` resolves to — so Track C's exact bite is known before the per-sheet-key rewrite. Add a temporary trace (revert after) OR read from a calc run's existing trace. Capture, per plan: the `entity_identifier` column in the convergence binding, and whether it equals the sheet's true vendedor key (`DNI_Vendedor`).
Paste the per-plan `entity_identifier.column`. **Decision rule:** this tells us whether Plan 3's grand-total-0 is the wrong-key bite (`entityCol != DNI_Vendedor`) or a different resolution failure. Record the per-plan entity column.

### §3.3 Probe — clawback cross-period source (resolves UNKNOWN #4, sizes the Design-Gate sub-component)
Determine whether the original January commission inputs are recoverable by `Folio_Original` join. Two candidate sources:
```sql
-- (A) original sale rows in Ventas_Enero, joinable by Folio
SELECT row_data->>'Folio' AS folio, row_data->>'Monto_Total' AS monto,
       row_data->>'Categoria' AS cat, row_data->>'DNI_Vendedor' AS dni
FROM committed_data
WHERE tenant_id='972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
  AND row_data->>'_sheetName' = 'Ventas_Enero'
  AND row_data->>'Folio' IN ('TXN-653971','TXN-702059')   -- the Folio_Original values from the 5 return rows
LIMIT 10;
```
```sql
-- (B) original computed commission in calculation_results for the original period (if recoverable per Folio/entity)
SELECT rule_set_id, entity_id, period_id, total_payout, component_results
FROM calculation_results
WHERE tenant_id='972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
  AND rule_set_id='3c195e87-b970-4c5e-975b-e4e9039092c8'   -- Plan 1 (original commission)
LIMIT 10;
```
**Decision rule, recorded:** the clawback formula is `−(Monto_Original × Tasa_Comision_Original × Multiplicador_Acelerador_Original)`. Determine whether (A) the original sale row carries enough to reconstruct those three inputs (the original `Monto_Total`, the plan's category rate, the accelerator) — making the clawback a **recompute-from-original-sale** sub-component — or whether (B) the already-computed original commission in `calculation_results` is the cleaner source. Record which source Phase 5 uses. **If NEITHER is recoverable** (original sale rows absent for the `Folio_Original` values), HALT-0 and report — the clawback cannot be honored as declared.

### §3.4 Probe — `Categoria` crash locus (resolves UNKNOWN #5)
Confirm where the `[DecimalError] Invalid argument: ALI` originates once the sheet partition removes Cobranza columns from Plan 1. Trace the live path from `dagMetrics` construction (`run/route.ts:1448-1472`) through the evaluator (`intent-executor.ts`) to the `new Decimal()` call. Determine: does the crash require `Categoria` to be *bound* (which the sheet partition prevents), or can a categorical reach `new Decimal()` via a filter-value path independent of `measureColumns`? Paste the trace. **Decision rule:** if the crash is purely binding-driven, the Phase 1-3 partition fix removes it (verify in Phase 6). If there is an independent categorical→Decimal path, Phase 3 must add a structural guard (a categorical never enters a numeric prime) — record whether the extra guard is needed.

### §3.5 EPG-0 (gate to proceed)
Paste all four probe outputs + the four recorded decisions (partition key; per-plan entity column; clawback source A/B; crash locus binding-driven vs independent). **Do not proceed to Phase 1 until these four decisions are recorded** — they parameterize every subsequent phase. Commit a Phase-0 findings note to the branch.

---

## §4 — PHASE 1: Sheet-Aware Partition in `inventoryData`

**Current (DIAG-073 §2.1):** `inventoryData` groups by `data_type` (`1012-1014`), strips `_`-keys including `_sheetName` (`1112-1117`), and the HF-228 coverage loop merges all sheet signatures into one bucket (`1071-1085`). One `DataCapability` per `data_type`.

**Required:** partition the capability set by the **structural file boundary** decided in §3.1 (`import_batch_id`, or composite with `_sheetName`). Each sheet becomes its own `DataCapability` with its own `fieldIdentities`/`columnStats`/`batchIds`. A `data_type` with one sheet (BCL/Meridian/CRP) yields exactly one capability — identical to today (no single-file regression). A `data_type` with N sheets yields N capabilities.

**Implementation guidance:**
- Re-read `inventoryData` live; preserve its field-identity/stat logic per-sheet rather than per-data_type.
- Korean-Test: key on the structural source id from §3.1; do not branch on `_sheetName` *content* (its value is opaque — it's a partition key, not a semantic).
- Carry Everything: if §3.1 chose the composite key, stop stripping `_sheetName` in the column-stat union (`1112-1117`) only insofar as needed to read the partition key — do NOT admit `_sheetName` as a candidate column (it is structural metadata, not data).
- The capability must retain its `data_type` (for downstream consumers) AND carry the new sheet/source key.

**EPG-1:** paste the diff. Paste a runtime log from a MIR convergence run showing **N capabilities** (one per sheet: Cobranza×6 collapsed by identical signature is acceptable IF they share schema — but Ventas/Clientes_Nuevos/Cuotas must be distinct capabilities). Paste the same for a single-file tenant (BCL) showing **exactly 1 capability** (regression guard). Confirm no column-name literal in the partition logic.

---

## §5 — PHASE 2: Sheet-Scoped Matching + Role-Aware Candidate Construction

### §5.1 `matchComponentsToData` — match each component to its sheet
**Current (§2.1):** matches on `data_type`; with one data_type, `capsWithFI.length===1`, every component matches the same merged cap.
**Required:** match each component to the sheet-scoped capability whose columns best satisfy the component's structural requirements (measure count/role fit + identifier presence + the metric-name↔column structural fit). The match key becomes the sheet capability, not `data_type`.

### §5.2 `generateAllComponentBindings` / `measureColumns` — role-aware, sheet-scoped candidates
**Current (§2.2):** `measureColumns` admits only `structuralType==='measure'` (line 2717) from the single merged cap; `Verificado` (boolean) and `Categoria` (text) excluded; pool is cross-sheet.
**Required, two co-resident corrections:**
1. **Sheet-scoped pool:** candidates come from the **matched sheet's** capability (from §5.1), so a Ventas plan's pool contains Ventas columns, not Cobranza's. (This is automatic once §5.1 matches to the sheet cap.)
2. **Role-aware admission:** admit columns by the **structural role the requirement needs**, not measure-only. A requirement whose role is a count admits count columns (already `measure`-typed — OK); a requirement that needs a boolean/categorical attribute (Plan 4's `Verificado`, a verified-flag the bonus counts) must admit the attribute column. Build candidate admission from the requirement's structural need (Decision 158: code constructs the candidate set deterministically from structural role; the LLM only ranks within it).

**Korean-Test:** admission is by `structuralType`/role, never by matching a column-name string. **Carry Everything:** the candidate set is the matched sheet's columns appropriate to the requirement's role — no narrowing below what the requirement can consume.

**EPG-2:** paste both diffs. Paste a MIR convergence log per plan showing the **candidate column list** offered to the AI mapper is now the plan's **own sheet's** columns (Ventas plan → `Monto_Total, Categoria, Cantidad, Precio_Unitario`; Cartera Nueva → `Verificado, Pedidos_Primeros_60_Dias`; etc.), and the resulting `HF-114 AI mapping` binds each metric to a same-sheet column. Confirm `Verificado` now appears as a candidate for Plan 4. Single-file tenant: candidate list unchanged (regression guard).

---

## §6 — PHASE 3: Relative/CRL Selection — Eliminate All Developer Thresholds

**Scope (DIAG-073 §3):** the 6 scan-flagged thresholds (`338, 514, 1261, 1292, 2883, 3202`), the 2 unflagged scale-inference bound sets (`2014-2024, 2039-2044`), and the membership-validity floor (`isValidColumnMapping`, `2316-2325`, the `Math.ceil(n*0.5)`). All AUTHORITY, 0 TOLERANCE. They are co-resident cleanup (non-causal to the root) but **must** be eliminated in this OB to satisfy Decision 110 and turn the gate green — done on the *same* rewritten path so no second pass re-touches it.

**Required, per the live substrate (DIAG-073 §3.4):**
- **Matcher acceptance (`1261, 1292, 514`):** replace `>0.3`/`>0.2` floors with **argmax + relative-separation** — import the live pattern from `web/src/lib/sci/resolver.ts` (`posteriors.sort(...)`, normalize, relative-separation gate `scores[0]-scores[1] < δ` as a review/ambiguity signal, not a fixed accept cutoff). The argmax half already exists in convergence; add the relative accept rule.
- **Confidence labels (`338, 2883`):** these set `match_pass`/confidence labels on observation/superseded paths and never veto. Replace with CRL-`reliability` (via `contextualReliabilityLookup` keyed by the match source's structural fingerprint) **or remove** if the consumer is dead (`338`'s `generateDerivationsForMatch` is commented out — remove the dead consumer and the threshold together).
- **Superseded categorical (`3202`):** `generateFilteredCountDerivations` is superseded and self-flagged a Korean-Test violation — **remove the dead function**; the live path is the AI categorical filter.
- **Scale-inference bounds (`2014-2024, 2039-2044`):** replace developer scale boundaries with distribution-derived scale inference (the column's own value distribution determines `ratio_0_1` vs `percentage_0_100` vs `integer_count` relatively), or CRL-derived where a learned prior exists.
- **Membership validity (`2316-2325`):** replace the `≥ ceil(n*0.5)` floor with a correctness-aware acceptance — a mapping is valid if each metric maps to a **same-sheet, role-consistent** column (structural check), not a bare ratio.

**EPG-3:** `bash scripts/no-developer-numbers-scan.sh` on `convergence-service.ts` → paste output showing **GREEN** (no un-RATIFIED bare float remains; any genuine epsilon tagged `// RATIFIED:` with justification). Paste each replacement diff. Confirm Korean-Test: no replacement introduces a column-name literal; selection is relative/structural.

---

## §7 — PHASE 4: Per-Sheet Entity Key (Track C, `run/route.ts`)

**Current (DIAG-073 §4):** `entityCol = knownEntityCols[0]` (`813-820`) — one global entity column for all sheets, selected data-dependently from the merged binding set; every batch primary-keyed by it (`889-894`). A plan whose sheets use different identifiers is not served by `[0]`.
**Required:** derive the entity key **per matched sheet/component** from that component's `entity_identifier` binding (now sheet-scoped after Phases 1-2), so `resolveColumnFromBatch` keys each sheet's rows by that sheet's true entity column. The RC-3 secondary rollup (`850-876, 897-907`, threshold-free argmax-membership) remains as the recovery path for rows lacking the primary key.

**Implementation guidance:** replace the single global `entityCol` with per-capability/per-component keying in the `dataByBatch` construction. Use the §3.2 per-plan entity-column findings to verify the rewrite produces the correct key per plan (especially Plan 3 → `DNI_Vendedor`). Korean-Test: the key is the binding's structural `entity_identifier.column`, derived per sheet — not a hardcoded column name.

**EPG-4:** paste the diff. Paste a MIR Plan 3 calc trace showing `resolveColumnFromBatch` now **resolves** `Monto_Cobrado`/`Saldo_Pendiente` to non-null per entity (no `column_in_no_batch`) and a non-zero per-entity result. Paste a single-file tenant (BCL) trace confirming unchanged keying (regression guard).

---

## §8 — PHASE 5: Cross-Period Clawback Sub-Component (Track B, Design-Gate)

**Gated on §3.3 (clawback source decision) and §3.5.** This is the one net-new mechanism. Build it **on** the corrected path, not beside it.

**What exists (DIAG-073 §5):** the clawback prime is `multiply(constant(-1), multiply(multiply(ref(Monto_Original), ref(Tasa_Comision_Original)), ref(Multiplicador_Acelerador_Original)))`, `applied_in_period: return_period`, `clawback_window_days: 45`. The 3 declared inputs have **0 rows** anywhere; the 5 return rows carry `Folio_Original`→January original + negative `Monto_Total` + `Motivo_Devolucion`. Negative passthrough is supported unclamped (`run/route.ts:2730→2778→2915…`); conditional firing is supported via `filters` (`1648-1657`). `priorDataByEntity` is fetched (`959-1034`) but **dead** (`priorPeriodRows` never set: `intent-executor.ts:240-353`).

**Required (per §3.3 source decision A or B):**
- **Cross-period retrieval:** implement the `Folio_Original` → original-period sale lookup that recovers the three inputs. If §3.3 chose **(A) recompute-from-original-sale**, the sub-component reconstructs `Monto_Original` (original `Monto_Total`), `Tasa_Comision_Original` (the original plan's category rate), and `Multiplicador_Acelerador_Original` (the accelerator) from the matched original `Ventas_Enero` row + the original plan's rate table. If **(B) reuse-computed-commission**, retrieve the original commission from `calculation_results` for the original period and reverse it. Record and implement the chosen source.
- **Wire the dead cross-period plumbing:** complete `priorPeriodRows` in `buildEvalContext` (`intent-executor.ts:310-353`) and the `prior_period` prime (`240-248`), and pass `priorDataByEntity` through (`run/route.ts:2669-2682`) — OR implement the `Folio_Original` join in the binding-resolution path (`1448-1472`) so the three references resolve to the recovered original values. Korean-Test: the join key is the structural `Folio_Original`→`Folio` relationship, not a literal.
- **Conditional firing:** the clawback fires only for entities with a return in the period (filter on the devolution rows). Most entity-months → 0; the return period → the negative reversal.
- **No clamp:** confirm the negative result carries through to `calculation_results`/`entity_period_outcomes` unclamped (already supported — verify, don't re-implement).

**SR-38 math gate:** hand-compute the clawback for one of the 5 return-row entities from raw values (`−(original Monto × rate × accelerator)`), and show the engine reproduces the sign and magnitude. Paste both.

**EPG-5:** paste the diff. Paste a MIR clawback calc trace (the return period — March) showing the 3 references **resolve** (non-null `dagMetrics`) via the cross-period lookup, the prime produces a **negative** per-entity result for the 5 return entities and 0 for the rest, and the negative carries to `total_payout`. Paste the SR-38 hand-computation reconciliation.

---

## §9 — Verification & Reporting (§5A)

### §9.1 Full vertical-slice verification (CC, self-checkable WITHOUT ground truth)
Recalculate all 5 MIR plans (January; clawback also March for the return period). For each, paste: the `HF-114 AI mapping` line (must bind to same-sheet columns), the per-sheet entity key resolved, the grand total, and per-entity results. **Structural success (CC-checkable):** every plan binds to its own sheet's columns; no `column_in_no_batch`; no `DecimalError`; clawback negative in return period. **Value reconciliation against `MIR_Resultados_Esperados.xlsx` is architect-only (SR-44, architect channel) — do NOT put ground-truth values in the report.**

### §9.2 Regression gate (architect-run, SR-44 — OB records the requirement)
The completion report must state that BCL ($44,590 Oct / $312,033 full), Meridian (Q1), CRP (Plans 1+3) require architect browser recalc to confirm unchanged. CC provides the structural evidence (single-file tenants → 1 capability → unchanged candidate list/keying from EPG-1/2/4); the architect runs the browser recalc.

### §9.3 Build + PR
`pkill -f "next dev"` → `rm -rf .next` → `npm run build` (paste BUILD_EXIT=0) → `npm run dev` → `curl localhost:3000/login` (paste 200). Then:
```bash
git add -A && git commit -m "OB-216: convergence unified path — sheet partition + role-aware candidates + relative/CRL selection + per-sheet entity key + cross-period clawback"
git push origin ob-216-convergence-unified-path
gh pr create --base main --head ob-216-convergence-unified-path --title "OB-216: Convergence unified path (Tracks A+A′+C+B)" --body "<phase-by-phase summary with EPG evidence>"
```
**DO NOT MERGE.** Completion report = the PR body + EPG evidence. SR-43 completes when architect merges + browser-verifies.

### §9.4 Completion report contents (pasted evidence, no self-attestation)
Per phase: the diff, the EPG runtime/query evidence, the Korean-Test confirmation. Plus: Phase-0 four decisions; `no-developer-numbers-scan.sh` GREEN; SR-38 hand-computations (clawback + one non-clawback); the 5-plan structural recalc evidence; build exit-0; PR URL. **Summary line:** `OB-216 BUILT. branch=ob-216-convergence-unified-path PR=#NNN. Partition key=[import_batch_id/composite]. 5 plans bind same-sheet=[Y/N]. Thresholds eliminated=[N] (scan GREEN). Track C resolved (no column_in_no_batch)=[Y/N]. Clawback cross-period source=[A/B], negative in return period=[Y/N]. build=exit-0. AWAITING architect SR-44 merge + browser reconciliation.`

---

## §10 — HALT Conditions
- **HALT-0 (§3.3):** clawback original-sale inputs unrecoverable by `Folio_Original` (neither source A nor B yields the original commission) → STOP Phase 5, report; the clawback cannot be honored as declared (becomes a plan-redeclaration question for the architect).
- **HALT-1:** any Phase-0 probe contradicts a DIAG-073 ratified finding (e.g., `import_batch_id` is NOT per-sheet, or `_sheetName` has nulls) → STOP, report the contradiction; the partition key decision must be re-made before Phase 1.
- **HALT-2:** a single-file tenant (BCL) produces ≠1 capability after Phase 1 → STOP; the partition has a regression. Do not proceed.
- **HALT-3 (Locked-Rule, SR-42):** if any phase requires introducing a column-name literal or a developer threshold to make a plan pass → STOP; surface the rule (Korean Test / Decision 110) verbatim and the dictated action; await architect disposition. **Never** add a MIR special-case to force a pass.
- **HALT-4:** `no-developer-numbers-scan.sh` cannot go green without removing a genuinely load-bearing constant whose dynamic replacement is unclear → STOP, report the specific constant and the candidate CRL/relative replacement for architect ratification (do not invent an authority value).

---

## §6 — Out of Scope
- No persistence/import-path schema change (sheet key already persisted in `row_data`/`import_batch_id`; this is a read-side fix).
- No new tenant data, no re-import (operate on the existing clean MIR import).
- No UI/rendering changes (calc-path slice only).
- No governance-artifact edits (architect channel).
- No ground-truth values in CC outputs (architect reconciles).
- No merge, no browser verification, no SQL migration (SR-44 architect-only).
- No reliance on AUD-001 or any extract.

## §6A — Residuals / Feed-Forward
- The §3.2 per-plan entity-column capture and §3.4 crash-locus finding feed Phase 4/Phase 3 respectively; record both in the completion report as the resolution of DIAG-073 UNKNOWNs #1/#5.
- DIAG-073 UNKNOWN #2 (exact `structuralType` per sheet's id/measure columns) is resolved incidentally by Phase 1's per-sheet capability output — paste it.
- If §3.3 reveals the clawback needs the original plan's rate table (not just the original sale row), the Phase-5 sub-component carries a rate-table lookup — note it as the precise cross-period dependency.
- Post-merge (architect): the same sheet-aware partition should be regression-checked against any future multi-sheet tenant; OB-216 establishes the structural-class fix, not a MIR instance fix (SR-2).

---

*OB-216 · Convergence Unified Path · 2026-06-18 · vialuce.ai — Intelligence. Acceleration. Performance.*
