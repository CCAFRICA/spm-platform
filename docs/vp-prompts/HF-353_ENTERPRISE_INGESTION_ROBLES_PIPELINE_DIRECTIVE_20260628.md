# HF-353 — Enterprise Ingestion + Robles Distribution Pipeline Completion

**Directive file (VP):** `docs/vp-prompts/HF-353_ENTERPRISE_INGESTION_ROBLES_PIPELINE_DIRECTIVE_20260628.md`
**Date:** 2026-06-28 · **Category:** HF (structural-class correction) · **Mode:** ULTRACODE `/effort` (autonomous)
**Repo:** VP `CCAFRICA/spm-platform` · **Branch:** `hf-353-enterprise-ingestion-robles` (NEW branch from main HEAD `2363b440`)
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt (DD-11).

---

## §0 — CC STANDING RULES HEADER

`CC_STANDING_ARCHITECTURE_RULES.md` binds throughout. Load-bearing: **SR-2** (scale by design), **D158** (LLM recognizes, code constructs), **Korean Test (D154)**, **C2** (fail loud), **Carry Everything (T1-E902)**, **Validation Premise Law**, **Vertical Slice Rule**. **SR-43/SR-44** (architect merges).

**First action:** write this directive and commit.

**Execution authority (ULTRACODE):** CC owns the entire execution path. CC halts only on premise failures (§4). Difficulty is not a halt condition.

---

### §0.1 — ANTI-SCOPE-NARROWING ENFORCEMENT (binding)

This directive contains 4 defect clusters. All 4 are in scope. CC does not defer any to a future HF. The four are interconnected — resolving any one in isolation is insufficient because Robles cannot calculate without all four.

---

## §1 — PROBLEM STATEMENT

### §1.1 — The capability being unlocked

Robles Maquinaria must complete the compensation lifecycle: import → comprehend → converge → calculate → results. Four blockers prevent this. Two are Robles-specific (hierarchy edges, cross-component binding). Two are enterprise-class (OOM on large files, client re-submission during long operations). All four must be resolved for the distribution tenant to produce its first calculation.

### §1.2 — The four blockers

**BLOCKER A — OOM on high row × column files (enterprise-class, SR-2)**

Production evidence (2026-06-28):
```
Header comprehension completed in 65635ms via 4 column-batch(es) of ≤25 (87 cols)  ← HF-350 WORKS
Vercel Runtime Error: instance was killed because it ran out of available memory     ← COMMITMENT OOM
```

HF-350 fixed the HC crash. The OOM is downstream — `commitContentUnit` builds the full Supabase insert payload for all rows at once. 86,608 rows × 87 columns of JSONB `row_data` exceeds Vercel's 2GB memory limit. This blocks any file where `rows × columns` product exceeds ~5M cells.

**The general property:** committed_data row insertion is chunked. The commit function processes rows in bounded batches (CC determines the batch size — the constraint is that peak memory stays well under 2GB). Each chunk is inserted independently. Entity resolution, fingerprinting, and post-commit construction run after all chunks are committed. The chunking is transparent to every downstream consumer — `committed_data` rows are identical regardless of whether they were inserted in one batch or twenty.

**BLOCKER B — Hierarchy edge construction from merged-header sheets (Robles-specific)**

Production evidence:
```
[OB-248 P-I1] hierarchy sheet "entity" detected (Personal→Jerarquia) but no edge type recognized — edges skipped (C2: provide a relationship column)
```

The Jerarquia sheet committed (HF-351 F3 fix worked — the guard no longer refuses it). But `constructHierarchyEdges` cannot identify the source, target, and relationship type columns because all columns are named `__EMPTY`, `__EMPTY_1`, etc. (SheetJS rendering of merged header cells). The column VALUES are comprehended correctly by HC — the issue is the construction code reading column NAMES instead of the HC comprehension output.

**The general property:** hierarchy edge construction reads the HC comprehension output (column roles: identifier, name, reference/relational pointer, categorical) to identify source, target, and type columns — not column names. A sheet with `__EMPTY` column names but correctly-comprehended roles produces edges identically to a sheet with proper column names. Korean Test: column name matching is prohibited; role-based identification is structural.

**BLOCKER C — Cross-component convergence dependency (Robles-specific)**

Production evidence:
```
Minimo Garantizado:comision_ventas_devengada: LLM abstained
(No candidate column represents an already-accrued or post-cap salesperson commission output)
HF-281: Binding phase incomplete — calc aborted
```

The LLM correctly abstained. `comision_ventas_devengada` is the computed output of the vendedor cascade commission — it is not a raw data column. Mínimo Garantizado needs to compare the computed commission against a floor. The current convergence model binds each component independently to raw data columns. It has no mechanism for "bind this component's input to another component's computed output."

**The general property:** convergence recognizes when a component's required input is the computed output of another component in the same plan (a cross-component dependency). The binding emits a `component_reference` that names the source component, not a column binding. The engine evaluates components in dependency order — the referenced component's output is available as an input to the dependent component. This is a DAG ordering extension, not a new evaluation mode. No component-name registry (Korean Test) — the reference is by component index or structural role within the plan, not by a hardcoded name.

**BLOCKER D — Client re-submission during long-running operations (enterprise-class)**

Production evidence (both Robles plan imports):
```
HF-259 SINGLE-FLIGHT — plan interpretation blocked by an existing in-progress claim
```

The client-side import handler re-submits after ~60 seconds during legitimate long-running operations (plan interpretation took 83–85 seconds). HF-259 dedup catches it, but the user has no visibility into the re-submission or the progress.

**The general property:** the client does not re-submit during a legitimate in-progress operation. The progress indicator reflects "still processing" vs "failed" accurately. CC determines the mechanism (longer timeout, progress polling that distinguishes in-progress from failed, or suppression of the re-submit during active operations).

---

## §2 — CONSTRAINTS

- **SR-2.** Blocker A's chunking works for 10K, 100K, 500K rows without redesign. Blocker B's role-based edge construction works for any hierarchy sheet with any column names.
- **D158.** Blocker B: the LLM's comprehension of column roles governs edge construction — code reads the roles, not the column names. Blocker C: the LLM recognizes cross-component dependencies; code constructs the evaluation ordering.
- **Korean Test.** Blocker B: no column-name matching for source/target/type. Blocker C: no component-name matching for the cross-component reference.
- **Carry Everything.** Blocker A: all 86K rows are committed, none dropped. Chunking is a commitment strategy, not a data filter.
- **C2.** Blocker A: if a chunk fails, report which rows failed and halt (not silent partial commit). Blocker B: if edge construction cannot identify source/target/type from roles, fail loud with a diagnostic (already fires — the fix is making it succeed).
- **Progressive Performance.** Blocker A: second import of the same 87-column file is Tier 1 (all atoms cached, all fingerprints cached). The chunked commitment is transparent to the cache.

---

## §3 — PHASES (ULTRACODE `/effort` — autonomous)

CC determines the implementation strategy. Properties must hold at completion.

### §3.0 — EVIDENCE GATE (mandatory before any fix)

| Blocker | Required evidence | Question |
|---|---|---|
| **A** | Paste the `commitContentUnit` code path that builds the Supabase insert payload. Show where all rows are held in memory simultaneously. | **Where is the memory spike?** |
| **B** | Paste the `constructHierarchyEdges` code. Show how it identifies source, target, and type columns. Show what it reads (column names vs HC roles). | **Why does it fail on __EMPTY columns?** |
| **C** | Paste the convergence binding code for component inputs. Show how it resolves `comision_ventas_devengada` — where does the LLM abstention path lead? Show the engine's component evaluation order. | **Is there an existing dependency ordering mechanism?** |
| **D** | Paste the client-side import handler code. Show the timeout/retry logic. | **What triggers the re-submission?** |

ADR commitment before implementation: `docs/adr/HF-353_ADR.md`.

### §3.1 — PROPERTY ESTABLISHMENT

**PROPERTY P-A: Chunked row commitment.**
`commitContentUnit` processes rows in bounded batches. Peak memory stays under 2GB for any file size. CC determines the batch size and the chunking mechanism. All invariants preserved: entity resolution runs on the full committed set after all chunks land; the content unit's `row_count` reflects total rows; fingerprinting is unaffected (it runs on column structure, not row content).

**PROPERTY P-B: Role-based hierarchy edge construction.**
`constructHierarchyEdges` reads the HC comprehension output for the hierarchy sheet. It identifies: the source column (role=identifier or reference), the target column (role=reference/relational pointer), and optionally the type column (role=categorical). Column NAMES are not read. If the HC output doesn't contain a reference/relational pointer role, fail loud with the specific roles present. The existing Robles Jerarquia HC output shows: `identifier@0.82`, `name@0.88`, `categorical@0.90`, `reference/relational pointer@0.88`, `categorical@0.87` — the reference/relational pointer IS recognized. The construction code just needs to read it.

**PROPERTY P-C: Cross-component binding.**
Convergence detects when a required input token does not map to any raw data column AND matches the semantic description of another component's computed output in the same plan. In that case, convergence emits a `component_reference` binding (not a column binding). The engine evaluates the referenced component first, then provides its output as the dependent component's input. The evaluation order is a topological sort of component dependencies within the plan. CC determines the binding format and the ordering mechanism.

**PROPERTY P-D: Client-side timeout resilience.**
The client import handler does not re-submit during an active, in-progress operation. CC determines the mechanism. The user sees accurate progress state during long-running operations.

### §3.2 — PROOF GATES

**PG-1 — 87-column × 86K-row file imports successfully.** The JDE ERP file (`Abril_00001_1 demo REF.xlsx`) imports without OOM. All 86,608 rows committed to `committed_data`. Paste the commit log showing row count and no memory error.

**PG-2 — Robles Jerarquia produces hierarchy edges.** After the fix, reimport `RM_Organigrama_Q1_2025.xlsx`. The Jerarquia sheet produces `entity_relationships` edges. Paste the edge count and sample edges showing source_entity, target_entity, and relationship_type.

**PG-3 — Robles convergence completes (no abstention).** The Mínimo Garantizado component's `comision_ventas_devengada` input resolves via cross-component reference to the vendedor cascade commission output. Convergence does not abort. Paste the binding log showing all components bound.

**PG-4 — Robles calculation produces non-zero results.** Calculate Robles for January 2025. Grand total is non-zero. Report per-variant totals verbatim. The architect reconciles against GT.

**PG-5 — No client re-submission on Robles plan import.** Reimport the Robles plan PDF. The HF-259 single-flight warning does NOT appear. Paste the import log showing a single interpretation run.

**PG-6 — BCL/Meridian neutrality (HALT-CALC).** BCL $312,033, Meridian $556,985 unchanged.

**PG-7 — Progressive Performance.** Second import of the 87-column file is Tier 1 (all atoms cached). Paste the atom residue log showing `known=87/87 novel=0`.

---

## §4 — HALT CONDITIONS

- **HALT-CALC.** BCL $312,033, Meridian $556,985, MIR Plan 2 = 210,000 moves. Stop.
- **HALT-COLLISION.** In-flight work on main modifies the same code surfaces. Stop.
- **HALT-DATA-LOSS.** Chunked commitment produces fewer `committed_data` rows than the parsed row count. Stop immediately — data loss is never acceptable.

---

## §5 — REPORTING DISCIPLINE

**Completion report:** `docs/completion-reports/HF-353_COMPLETION_REPORT.md`

Per Rules 25–28: summary, investigation evidence (§3.0), ADR, per-property evidence, proof gate results (PG-1 through PG-7), HALT conditions, ARTIFACT SYNC.

---

## §6 — OUT OF SCOPE

- MIR Plans 3/4 divergence — convergence-binding interpretation gap, separate from these blockers.
- Tenant Management surface — separate OB (drafted in a parallel conversation).
- Lifecycle Cockpit stale state after clean slate — separate from these blockers.
- DS-016 full async ingestion architecture — HF-353 solves the immediate memory ceiling with chunked commitment; DS-016's per-file worker isolation is a larger architectural change.

---

## §6A — RESIDUALS

None. All four blockers are in scope. Robles must calculate after this HF.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*HF-353 — Enterprise Ingestion + Robles Distribution Pipeline Completion*
*File IS the prompt. No §7. No tail summary. CC reads end-to-end and executes.*
