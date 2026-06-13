# DIAG-066: Warm-Path Entity Binding Gap

**Date:** 2026-06-13
**Type:** DIAG (read-only diagnostic — no code ships)
**Tenant:** MX Restaurant `3d354bfa-b298-48dd-88a0-9f8c5a00be4e`
**Session:** `505a6d2c-7b11-42a2-a11e-100c8a42afbd` (warm witness #7)
**Branch:** Run on current branch (OB-203-phase-6 or main — read-only, no commits to application code)
**Collision gate:** Before committing output, verify `ls docs/diagnostics/DIAG-066*` returns empty.

**Standing Rules:** `CC_STANDING_ARCHITECTURE_RULES.md` governs. SR-34 (no bypass). SR-44 (architect-only operations — this DIAG is CC-executable, read-only). Drafting discipline per `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**Substrate:** Decision 64 v3 (one canonical surface), T1-E910 v2 (Korean Test), Decision 158 (LLM recognizes, code constructs), T1-E952 (Adjacent-Arm Drift).

---

## §1 — Problem Statement

Warm witness execute (session `505a6d2c`) classified 16 sheets via Tier-1 fingerprint match (zero LLM, 18s analyze — PASS). Execute committed 11 of 16 units. Five entity-classified sheets failed with identical refusal: **"No entity identifier binding found."**

**Failed (entity-classified, not committed):**

| Sheet | Classification | Winner | Identifier role from HC-DIAG | Cold-run entity_id_field |
|---|---|---|---|---|
| Sucursales | entity@61% | graph-prior override | `location_id:identifier@0.85` | `location_id` |
| Menus | entity@61% | graph-prior override | `menu_id:identifier@0.85` | `menu_id` |
| Resumen_Sucursal | entity@63% | graph-prior override | `location_id:identifier@0.85` | `location_id` |
| Resumen_Menu | entity@60% | graph-prior override | `item_id:identifier@0.85` | `item_id` |
| Resumen_Empleado | entity@65% | graph-prior override | `empleado_id:identifier@0.95` | `empleado_id` |

**Succeeded (committed on warm):**

| Sheet | Classification | Winner | Identifier role from HC-DIAG | Warm entity_id_field |
|---|---|---|---|---|
| Empleados | entity@95% | CRR direct (no graph override) | `empleado_id:identifier@0.95` | `empleado_id` |
| Resumen_Producto | entity@62% | graph-prior override | `item_id:identifier@0.85` | `item_id` |
| Menu_Componentes | transaction@76% | graph-prior override | N/A (transaction) | N/A |
| Resumen_Mensual | transaction@73% | graph-prior override | N/A (transaction) | N/A |

The identifier column role was present in HC-DIAG output for ALL seven entity sheets — both the two that committed and the five that failed. The information existed on at least one surface; the commit path could not read it for five of seven.

**Phase B resume evidence:** The five failures reached `state=failed_interpretation` during the first execute invocation. The resume correctly skipped them as terminal.

**Concurrent hypothesis:** This is the same structural class as the warm-path roles fallback HF named in the DIAG-064 disposition — the warm path lacking a semantic derivation the cold path performs via LLM comprehension. The binding-surface question is whether `entity_id_field` is derived from a shape only the LLM-comprehension producer writes, making the flywheel injection a second surface that the consumer doesn't read.

**Defect-class lineage:** Decision 64 v3 violation candidate (dual-surface), AUD-009 risk (producer-enumerated consumer), T1-E952 (adjacent-arm — entity-id derivation works for 2/7 entity sheets on warm, fails at 5 sibling surfaces).

---

## §2 — Questions

This DIAG answers three questions. Each has an evidence-gathering protocol in §3 and an output format in §5.

### Q1: Entity-identifier derivation surface audit

**What exact code path derives `entity_id_field` for an entity-classified content unit at commit time?** Trace from the execute-bulk entry point through to the `commitContentUnit` call for entity-classified units.

Specifically:

- (a) What data structure does the commit path read to determine which column is the entity identifier?
- (b) Is that data structure populated by a single writer (canonical surface) or by multiple producers (LLM comprehension writes shape A, flywheel writes shape B)?
- (c) What discriminates the two warm-path entity successes (Empleados, Resumen_Producto) from the five failures? Inspect the actual runtime state (atoms, signals, content-unit metadata, whatever the code reads) for at least one success and one failure sheet, pasting the actual values.

### Q2: Resume invocation Ventas re-processing

On the cold run, the resume invocation correctly marked Ventas as `skip_in_flight` and continued from the interrupted pulse. On the warm run, the resume **restarted Ventas from pulse 1**, producing a complete second pass (321 pulses) concurrently with the ongoing first pass's tail.

- (a) What condition determines `skip_in_flight` vs. fresh processing in the Phase B resume logic?
- (b) What was Ventas' content-unit state at the moment the resume invocation checked it on the warm run? Paste the relevant state fields.
- (c) Is there a single-flight enforcement mechanism (claim/lock) that should prevent concurrent processing of the same content unit? If so, why didn't it fire?

### Q3: Mystery rule_set provenance

The warm run's completion screen shows "Plan de Incentivos 2025 – Coordinadores de Logística." The cold run's plan-skeleton refused to persist (zero components, HF-264 clean release). Yet the SCI Bulk log says "Cleared input_bindings on 1 rule_sets" and "All 356 entities already assigned to 1 rule sets."

- (a) Query the rule_set record for tenant `3d354bfa-b298-48dd-88a0-9f8c5a00be4e` — paste its `id`, `name`, `status`, `content_hash`, `created_at`, and component count.
- (b) Was this rule_set created by a prior session (cold run or earlier), or by this warm session? Trace its provenance.
- (c) Does the plan have a complete skeleton (components > 0) or is it a partial persist that the HF-264 guard should have prevented?

---

## §3 — Evidence Gathering Instructions

All evidence gathering is **read-only**. No code changes. No schema changes. No data mutations. CC reads code, reads DB via service-role tsx scripts, and reports.

### Phase 1: Code trace (Q1)

1. Starting from `web/src/app/api/import/sci/execute-bulk/route.ts` (or wherever the POST handler lives), trace the call to the SCI Bulk processor.
2. Find where entity-classified content units are processed. Locate the code that determines `entity_id_field`.
3. Paste the **verbatim function body** (or relevant excerpt, max 80 lines) that performs entity-id derivation.
4. Identify every data source that function reads from. Name each: is it `classification_signals.header_comprehension`? `classification_signals.vocabulary_bindings`? A runtime object built during LLM comprehension? An atom-injected binding? Something else?
5. For the warm path (Tier-1 match, `llmCalled=false`): trace what the flywheel injection (`HF-254 fieldBindings`) writes and where. Paste the write-site code (max 40 lines).
6. Compare the read surface (step 4) with the write surface (step 5). Are they the same object/table/column? If not, name both surfaces explicitly.

### Phase 2: Discriminator inspection (Q1c)

7. Write a tsx script (`scripts/diag-066-entity-binding-inspect.ts`) that, for tenant `3d354bfa-b298-48dd-88a0-9f8c5a00be4e`, session `505a6d2c-7b11-42a2-a11e-100c8a42afbd`:
   - Reads the content-unit records for Empleados (succeeded) and Sucursales (failed).
   - For each, prints: classification, entity_id_field (if stored), fieldBindings (if stored), header_comprehension (if stored), vocabulary_bindings (if stored), and any other fields the code trace (Phase 1) identified as relevant.
   - Diff the two outputs. The discriminating field(s) are the answer to Q1c.

### Phase 3: Resume logic trace (Q2)

8. Find the Phase B resume logic (the code that decides `skip_terminal` / `skip_in_flight` / fresh processing for each content unit).
9. Paste the **verbatim decision function** (max 40 lines).
10. Identify what `state` value triggers `skip_in_flight`. From the warm log, Ventas was NOT in the skip list — what state was it in? If determinable from the content-unit table, query it via the tsx script from Phase 2 (add Ventas to the inspection set).

### Phase 4: Rule_set provenance (Q3)

11. Add to the tsx script: query `rule_sets` for tenant `3d354bfa-b298-48dd-88a0-9f8c5a00be4e`. Print `id`, `name`, `status`, `content_hash`, `created_at`, `updated_at`, and a count of associated components (from whatever join table holds plan components — likely `rule_set_components` or similar).
12. If the rule_set's `created_at` predates this session (before `2026-06-13T01:06:00Z`), it was inherited. If after, it was created in this session.

### Phase 5: Output assembly

13. Assemble findings into `docs/diagnostics/DIAG-066_WARM_PATH_ENTITY_BINDING_GAP_OUTPUT.md` per the format in §5.
14. Commit directive + output pair to `docs/diagnostics/`.
15. Push.

---

## §4 — HALT Conditions

**HALT-1:** If the entity_id_field derivation code is not locatable within 15 minutes of searching, HALT and report the search paths tried. Do not guess.

**HALT-2:** If the tsx inspection script fails to connect or query, HALT and paste the error. Do not fabricate DB output.

**HALT-3:** If the discriminating field between success and failure sheets appears to involve a surface not covered by the code trace (e.g., a Vercel edge function, an external service), HALT and name the surface.

**HALT-4:** If any finding suggests the five failures cannot be fixed without re-engaging the LLM on the warm path (i.e., the stored learning is structurally incapable of carrying entity-id information), flag this explicitly — it would be a Progressive Performance constitutional question requiring architect disposition.

---

## §5 — Output Format

File: `docs/diagnostics/DIAG-066_WARM_PATH_ENTITY_BINDING_GAP_OUTPUT.md`

```markdown
# DIAG-066 Output: Warm-Path Entity Binding Gap

**Executed by:** CC
**Date:** [timestamp]
**Branch:** [branch name]
**SHA:** [commit SHA after output committed]

## Q1 Answer: Entity-Identifier Derivation Surface

### Read surface (what commitContentUnit reads)
[Paste code excerpt + analysis]

### Write surface — cold path (LLM comprehension)
[Paste code excerpt showing where LLM result writes entity_id_field or equivalent]

### Write surface — warm path (flywheel injection)
[Paste code excerpt showing what HF-254 injection writes]

### Surface comparison verdict
[ ] SINGLE SURFACE — both paths write to the same location, consumer reads it
[ ] DUAL SURFACE — cold writes to location A, warm writes to location B, consumer reads only A
[ ] PRODUCER-ENUMERATED — consumer checks provenance before reading

### Q1c Discriminator
[Pasted diff between Empleados (success) and Sucursales (failure) binding state]
[Name the discriminating field(s)]

## Q2 Answer: Resume Ventas Re-processing

### Resume decision logic
[Paste code excerpt]

### Ventas state at resume check
[Paste queried state]

### Single-flight assessment
[Is there a claim/lock? Did it fire? Why not?]

## Q3 Answer: Rule_set Provenance

### Rule_set record
[Paste query output]

### Provenance verdict
[Inherited from cold / Created in warm / Other]

### Component completeness
[Count + assessment: complete skeleton or partial persist?]
```

---

## §6 — Out of Scope

- No code fix. This DIAG determines the fix target; the HF that ships the fix is a separate work item sequenced after disposition.
- No performance optimization (double-parse, poll discipline, concurrent LLM). Those are named MC items with their own sequencing.
- No settle-audit divergence investigation. The divergence is expected given 5 uncommitted units + Ventas double-processing; it resolves when the structural defects are fixed.
- No Portada disposition. Portada committed correctly as reference@58% — the graph-prior self-correction is verified; no further investigation needed.

## §6A — Residuals

- **Warm-path roles fallback HF (pre-existing):** If Q1 confirms a dual-surface defect, this HF and the entity-binding HF may be the same structural fix (canonical-surface unification at the binding layer). The DIAG output should note whether they are the same or distinct.
- **Double-parse item:** This DIAG's Q2 investigation may reveal that the resume's re-download+re-parse is coupled to the Ventas re-processing. If so, note the coupling; the fix belongs to the double-parse MC item, not this DIAG's HF.
- **Generation accumulation at TMB scale:** HF-213 supersede gate held under concurrent abuse (both Ventas commits produced valid supersede chains). Retention/compaction policy is a separate MC item for TMB-scale operations.
- **`failed_interpretation` state semantics:** Five sheets reaching this state is correct platform behavior (refuse what you can't identify). But the state name may mislead — interpretation succeeded (classification, roles, bindings all present); entity-id *derivation* failed. If the DIAG reveals the state name is inaccurate, note it as a naming-clarity residual.

---

*DIAG-066, Warm-Path Entity Binding Gap Directive*
*2026-06-13 · vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafting discipline: INF_Structured_Compliant_Drafting_Reference_20260513.md*
*Standing rules: CC_STANDING_ARCHITECTURE_RULES.md*
*Diagnostic protocol: CC_DIAGNOSTIC_PROTOCOL.md*
