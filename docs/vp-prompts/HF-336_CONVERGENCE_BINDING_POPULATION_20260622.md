# HF-336: Convergence Binding Population — Korean Test Critical Fix

**Mode:** ULTRACODE
**Priority:** ZERO — inject immediately, ahead of OB-232 Objective 3 (Insight Engine)
**Date:** 2026-06-22
**Classification:** Korean Test violation remediation. Structural, not cosmetic.

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Binding: Principle 1 (Korean Test), Principle 8 (Domain-Agnostic Always), AP-5 (no hardcoded field dictionaries), AP-6 (no language-specific pattern matching), SR-34 (No Bypass).

---

## §1 — The Violation

Sabor Grupo Gastronomico's `rule_sets.input_bindings` is empty (`{}`). The Financial Agent imported and comprehended 263,250 POS cheque rows but never persisted field-to-semantic-role mappings into convergence bindings.

This forces every downstream consumer to hardcode Spanish POS field names:

- `summary_artifacts.metrics` stores raw keys: `{"total": ..., "propina": ..., "cancelado": ...}`
- Financial page components read `metrics.total` and label it "Revenue" — hardcoded Spanish-to-English mapping
- The Insight Engine (OB-232 Objective 3) would need hardcoded instructions that `total` means revenue to generate meaningful insights
- A Korean tenant's `metrics.매출` would render as nothing — silently discarded by every component that checks for `total`

BCL does NOT have this problem. BCL has rich convergence bindings with `field_identity.contextualIdentity` values (`loan_placement_amount`, `net_new_deposits_amount`, etc.) populated by the convergence/SCI pipeline. The mechanism exists. It was never run for Sabor.

**This is not a missing feature. It is a violation of the platform's most fundamental principle.**

---

## §2 — Objective

Sabor must have convergence bindings in `rule_sets.input_bindings` that map every POS cheque `row_data` field to its semantic role, using the same structure and process that produced BCL's bindings. Then `summary_artifacts` must be re-backfilled so metrics carry semantic labels instead of raw field names.

### 2.1 — Populate convergence bindings for Sabor

The convergence/SCI pipeline that generated BCL's bindings must be invoked for Sabor's POS cheque data. The output is persisted to `rule_sets.input_bindings` on Sabor's active rule set(s).

Find the convergence binding generation mechanism in the codebase — the same code path that produced BCL's bindings (which carry `learning_provenance` with `batch_id`, `learned_at`, `confidence`, `match_pass`, `field_identity.structuralType`, `field_identity.contextualIdentity`). Invoke it for Sabor.

If the convergence pipeline cannot be invoked directly (it may be tightly coupled to the ICM plan comprehension flow), then build a standalone convergence binding generator that:

1. Reads a sample of Sabor's `committed_data.row_data` (POS cheque rows)
2. Classifies each field structurally: numeric fields → `structuralType: "measure"`, identifier fields (mesero_id, folio) → `structuralType: "identifier"`, temporal fields (fecha, cierre) → `structuralType: "temporal"`, categorical fields (turno, forma_pago) → `structuralType: "category"`
3. Assigns `contextualIdentity` — the semantic label. This is where the Financial Agent's comprehension is persisted. The LLM reads the field names + sample values + data_type context and emits semantic labels: `total` → `revenue`, `propina` → `tips`, `descuento` → `discount`, `cancelado` → `cancellation`, `total_alimentos` → `food_revenue`, `total_bebidas` → `beverage_revenue`, `numero_de_personas` → `guest_count`, `total_articulos` → `item_count`, `mesero_id` → `server_identifier`, etc.
4. Persists to `rule_sets.input_bindings` in the same JSONB structure as BCL's bindings

**The LLM assigns semantic labels (recognition — Decision 158 permitted). Deterministic code persists and enforces them (construction). This is the correct boundary.**

**HALT-1:** If no code path exists that generated BCL's convergence bindings and no standalone generator can be built within this HF's scope, halt. Report what the convergence pipeline looks like and where it's coupled. Architect will disposition.

### 2.2 — Re-backfill summary artifacts with semantic labels

After bindings are populated, the OB-229 Summary Engine's convergence enrichment path activates for Sabor. The engine reads `input_bindings.convergence_bindings`, builds the semantic label map (`raw_column → contextualIdentity`), and uses semantic labels as metric keys.

Re-run the Summary Engine backfill for Sabor:
```
POST /api/admin/summary/backfill { tenantId: <sabor_tenant_id> }
```

After re-backfill, `summary_artifacts.metrics` for Sabor should contain semantic keys: `{"revenue": {"sum": 45200}, "tips": {"sum": 3150}}` instead of `{"total": {"sum": 45200}, "propina": {"sum": 3150}}`.

**HALT-2:** If the OB-229 Summary Engine does not have a working convergence enrichment path (the code that reads `contextualIdentity` and uses it as the metric key), build it. This is not optional — it was specified in OB-229 §4.2 Step A but may not have been implemented since Sabor had empty bindings at build time and BCL had no summaries (HALT-2). Verify the enrichment path works before re-backfilling.

### 2.3 — Verify the rendering chain

After re-backfill, verify that the financial page components can read semantic keys from `summary_artifacts.metrics`. If the page components are hardcoded to read raw field names (`metrics.total`, `metrics.propina`), they must be updated to read semantic keys (`metrics.revenue`, `metrics.tips`).

The correct pattern: page components read metrics by semantic role. If a component needs revenue, it reads `metrics.revenue` — a domain-agnostic semantic key that works for any tenant in any language whose convergence bindings map their revenue field to `contextualIdentity: "revenue"`.

If the page components have a fixed set of expected semantic keys, that set must be structural (revenue, tips, discount, cancellation, guest_count, item_count) — not Spanish POS vocabulary. These are platform-level semantic roles, analogous to the convergence `contextualIdentity` vocabulary. A Korean restaurant's convergence would map `매출` → `revenue`. The page component reads `revenue`. Korean Test passes.

Report: which page components were updated, what hardcoded field names were removed, what semantic keys they now read.

### 2.4 — Verify OB-232 Insight Engine readiness

After re-backfill, the summary artifacts OB-232's Insight Engine will read contain semantic keys. The Insight Engine prompt receives `{"revenue": {"sum": 45200}, "tips": {"sum": 3150}}` — semantically self-describing data. The LLM generates insights without needing hardcoded instructions about what `total` means.

No code change needed in OB-232 if HF-336 lands first — the data it reads is already semantically labeled.

---

## §3 — Constraints

1. **Korean Test.** The convergence binding generator must not hardcode semantic labels in source code. The LLM assigns them (recognition). If using the existing convergence pipeline, it already does this. If building standalone, the semantic label assignment is an LLM call, not a dictionary lookup.

2. **Decision 158.** LLM recognizes field semantics (assigns contextualIdentity). Deterministic code persists, stores, aggregates, and validates. The LLM never computes summary values.

3. **BCL's bindings are untouched.** BCL already has correct bindings. This HF only adds bindings for Sabor. No modification to BCL's rule_sets.

4. **Idempotent.** Re-running the binding generation for Sabor replaces existing bindings. Re-running the Summary Engine backfill replaces existing artifacts. Safe to re-trigger.

5. **OB-232 compatibility.** If OB-232 is already running, HF-336's changes must not conflict. The convergence bindings are a data write to `rule_sets.input_bindings`. The summary re-backfill is a data write to `summary_artifacts`. Neither touches code files OB-232 is likely editing. If a merge conflict arises, HF-336 takes priority (it fixes a violation; OB-232 builds on corrected data).

---

## §4 — Proof Gates

### PG-1: Sabor convergence bindings exist
Query `rule_sets.input_bindings` for Sabor's active rule set(s). The result must be non-empty, containing `convergence_bindings` with field mappings that include `field_identity.contextualIdentity` for every numeric POS cheque field. Paste the bindings.

### PG-2: Summary artifacts use semantic keys
Query `summary_artifacts.metrics` for Sabor. The metric keys must be semantic labels (revenue, tips, discount, etc.), not raw POS field names (total, propina, descuento). Paste a sample row's metrics.

### PG-3: Financial pages render with semantic keys
At least one financial page renders correctly for Sabor using semantic metric keys from summary artifacts. Paste the route handler response showing semantic keys.

### PG-4: Korean Test
Grep the convergence binding generator, the Summary Engine enrichment path, and any updated page components. Zero hardcoded POS field names. Paste grep results.

---

## §5A — Reporting

Completion report at `docs/completion-reports/HF-336_COMPLETION_REPORT.md`.

Structure: proof gates PG-1 through PG-4 with pasted evidence, HALT outcomes, binding generator approach (reused pipeline vs standalone), subtraction log (hardcoded field names removed from page components), PR number.

Final step: `gh pr create --base main --head hf-336-convergence-bindings` with descriptive title.

---

## §6 — Out of Scope

- OB-232 Insight Engine — this HF ensures the data is correctly labeled; OB-232 builds on it
- OB-231 full route handler convergence refactor — this HF populates bindings; the full route handler refactor may follow
- BCL binding changes — BCL already has correct bindings
- MIR/CRP convergence bindings — same mechanism applies but those tenants have other open items; follow-on
- Curation Engine, adaptive surfaces, morphological inversion — all downstream; this HF fixes the foundation

---

*HF-336: Korean Test critical fix. Convergence binding population for Sabor.*
*Priority ZERO. Inject before OB-232 Insight Engine fires.*
*vialuce.ai — Intelligence. Acceleration. Performance.*
