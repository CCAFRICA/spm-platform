# OB-216 — Phase 2 Directive (REVISED): Unified Agentic Binding — One LLM Recognition Path

**Supersedes:** the prior Phase 2 directive's literal/abstract bifurcation (§M/§N). That design split field resolution into deterministic superset matching (literal) + AI mapping (abstract). **That split is withdrawn** — it misapplied Decision 158 (which governs the *calculation* boundary, not recognition) and reintroduced rigidity the partition already eliminates. This revision is one unified, LLM-maximizing, agentic binding path.
**Applies to:** `ob-216-convergence-unified-path` (HEAD `ac25d827`, EPG-1 released). Self-gate to EPG-2; next mandated pause EPG-3′.

---

## §R — Principle (the hard lessons, applied)

Binding a plan requirement to a column is **recognition** — the LLM's job, maximized — NOT deterministic matching. DIAG-073 proved the LLM binds correctly once candidates are clean ("with a correctly scoped pool the same prompt yields the right answer"); the root was contaminated, unlabeled candidates, which Phase 1's partition fixes. Therefore:

- **One unified LLM binding path** for all field kinds (literal, abstract, cross-sheet) — no second deterministic matcher, no per-field-kind branch, no registry.
- **Maximize LLM expression:** the model recognizes every binding over clean, sheet-labeled, role-aware, field-identity-annotated candidates, and **may abstain / express confidence** (remove the forced-no-abstention defect).
- **Deterministic code does ONLY:** structural validation of the proposed binding (existence + role-consistency, no tuned threshold), fingerprint-cached reuse, and the calculation guarantee. This is Decision 158 correctly placed: LLM recognizes; deterministic code guarantees structural soundness + the math.
- **Agentic self-correction:** structural-validation failure is fed back to the LLM as context for re-reasoning (the OB-214 / IGF pattern).
- **No hardcoded thresholds** anywhere in binding or reduction (Decision 110).

---

## §S — The unified agentic binding mechanism

Replace the candidate-construction + AI-mapping + boundary-fallback chain (`generateAllComponentBindings`, `resolveColumnMappingsViaAI`, the boundary scorers) with a single binding pass:

### §S.1 Candidate assembly (deterministic, structural)
From the Phase-1 sheet capabilities, assemble for the LLM a candidate descriptor set: **every sheet capability's columns, each labeled with its sheet identity (`partitionKey`), structuralType, contextualIdentity, and value stats.** All sheets' candidates are presented *with their sheet labels* — the partition does not hide cross-sheet candidates (Plan 2 needs Ventas + Cuotas); it *labels* them so the LLM can discriminate. (The original defect was unlabeled candidates, not their presence.) No measure-only filter — all role-bearing columns are candidates, tagged by role.

### §S.2 LLM binding recognition (maximized, agentic)
One LLM pass receives the plan's component requirements (declared field names + roles + the component's calculation intent) and the §S.1 labeled candidate set, and recognizes, per field: the target column, its sheet, and a confidence. The model:
- maps literal fields trivially (name↔name, high confidence) and abstract fields semantically (`ventas_brutas_mensuales`→`Monto_Total` (Ventas); `cuota_mensual_asignada`→`Enero_2025` (Cuotas)),
- spans sheets for one component where the requirement demands it (batchIds union follows from the resolved columns' sheets),
- **may flag a field as ambiguous / abstain** rather than force a pick (replaces the `anthropic-adapter.ts:940` no-abstention instruction — update that system prompt to permit "insufficient evidence" with a reason).
The prompt instructs semantic matching over the labeled candidates; it carries NO column-name literals and NO threshold.

### §S.3 Deterministic structural validation (the guarantee, no threshold)
Each proposed binding is validated structurally — **not** re-scored against a cutoff:
- the proposed column exists in the proposed sheet capability,
- its structuralType is consistent with the requirement's role (a numeric measure requirement does not bind to an attribute; an attribute/filter requirement may bind an attribute),
- batchIds resolve (the sheet's batches carry the column).
Validation is existence + role-consistency (structural, Korean-Test-clean), never a bare-float score. A binding that fails validation is NOT silently accepted (the old `match_pass:2` "AI-only, bind anyway" path is removed).

### §S.4 Agentic self-correction
If §S.3 rejects a binding, or §S.2 abstained, re-invoke the LLM with the specific failure as context ("column X is an attribute but the requirement needs a measure; reconsider") and the same labeled candidates, to converge on a structurally-valid binding. Bounded retries; if it cannot converge, surface a structured convergence gap (not a forced wrong binding). Whether MIR's 5 plans need any retry is empirical (likely a single pass suffices with clean labeled candidates) — but the loop is the SR-2/general mechanism and the abstention+validation are built regardless.

### §S.5 Progressive Performance (fingerprint-cached reuse)
A validated binding is cached by its structural fingerprint via the live CRR substrate, so an identical re-encounter reuses it deterministically at ~$0 (Tier-1, non-amnesiac). LLM recognition runs once per fingerprint; deterministic reuse + deterministic math run always. Verify the second identical convergence is cache-served (empirical non-amnesiac check).

---

## §T — Phase 3′ reduction, corrected to the same principle

Withdraw the data-shape-invariance *threshold* approach (it risked a hardcoded "invariant across ≥X%" cutoff). Instead: the **LLM recognizes** a bound column's nature — flow (a per-transaction amount → SUM) vs stock (a balance/snapshot → reduce to the single value) — from its field identity, contextualIdentity, and value shape; **deterministic code applies** the recognized reduction in `resolveColumnFromBatch`. Recognition by LLM, guarantee by deterministic code, no invariance threshold. (Probe §G.0 still confirms the field-identity signals the LLM reasons over; HALT-G if the signals are absent.)

---

## §U — EPG-2 (self-gate; reviewed in completion report)

Paste, per plan, the LLM-recognized bindings + structural-validation result:

| Plan | Field → column (sheet) | batchIds | Validation |
|---|---|---|---|
| 1 | `Monto_Total→Monto_Total (Ventas)`; `Categoria→Categoria (Ventas)` attribute/filter | {Ventas, Ventas_Marzo} | role-consistent ✓ |
| 3 | `Monto_Cobrado→Monto_Cobrado (Cobranza)`; `Saldo_Pendiente→Saldo_Pendiente (Cobranza)` | {Cobranza} | ✓ |
| 4 | `Verificado→Verificado (Clientes_Nuevos)` | {Clientes_Nuevos} | attribute role ✓ |
| 2 | `ventas_brutas_mensuales→Monto_Total (Ventas)`; `cuota_mensual_asignada→Enero_2025 (Cuotas)` | {Ventas, Cuotas} | ✓ |
| 5 | cross-period → Phase 5 (current-period `Folio_Original`→Ventas_Marzo materializes there) | — | — |

Plus:
- The updated `convergence_mapping` system prompt (abstention permitted) — paste it; confirm no column-name literal, no threshold.
- Evidence that NO plan binds to another sheet's columns (the original defect gone): paste each binding line showing same-sheet (or correct cross-sheet for Plan 2) resolution.
- Structural-validation code (§S.3) — paste; confirm existence + role-consistency, no bare-float.
- Whether any plan triggered §S.4 self-correction (and the outcome).
- §S.5: paste the second-identical-convergence trace showing cache-served (~$0) reuse.
- BCL single-file regression: one cap per data_type → bindings unchanged.

**Architect reconciles values vs ground truth (SR-44).** EPG-2 proves *binding* correctness (right sheet, right column, structurally valid); *compute-non-zero* is EPG-3′ (after reduction).

---

## §V — Notes
- This is one mechanism for all plans — SR-34 (structural-class), no per-plan branch, no registry. The LLM generality replaces the bifurcation.
- Decision 158 correctly placed: recognition (binding, reduction-nature) is LLM; guarantee (structural validation, fingerprint reuse, calculation) is deterministic.
- Removing the forced-no-abstention is itself a defect fix (it caused the original garbage picks).
- If the §S.4 loop cannot converge for a plan even with clean labeled candidates + feedback, that is a structured gap for architect review — not a forced binding.
- All other OB-216 / amendment disciplines stand (Korean Test, Decision 110, SR-2, SR-38, SR-44, reconciliation-channel separation — no ground-truth values in CC outputs).

---

*OB-216 Phase 2 directive (revised) · unified agentic binding · 2026-06-18 · vialuce.ai*
