# HF-266 — Intent Constructor Branch Normalization

## §0 — Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Drafting per `INF_Structured_Compliant_Drafting_Reference_20260513.md`. Commit + push after each phase. Build gate before completion report.

---

## §1 — Problem Statement

Plan components with conditional shapes (`shape: "conditional"`) fail at the intent constructor when the LLM emits branch nodes (`then`/`else`) that lack both the `shape` discriminant (making them a nested structure) and the `kind` discriminant (making them a leaf operand). The constructor correctly rejects these, but offers no repair.

Reproducible witness: CRP Plan 3 `cross-sell-bonus` fails 100% at `$.structure.then: branch is neither a structure (shape field) nor an operand (kind field)`. Same plan succeeded 2026-05-18 (prior to clean-slate). Meridian `registro-seguridad` (`shape=conditional`) succeeds every time. CRP Plan 2 `consumables-commission-rep` fails at `$.structure.children[1]: unknown shape "undefined"` — same class.

HF-265 bumped retry to 3 attempts, but HALT-2 confirmed: temperature 0 reproduces the same output, so retry without structural repair is ineffective.

**Defect class:** The LLM emits structurally incomplete nodes — a branch node might have `{ value: 500 }` (missing `kind: "constant"`) or `{ inputs: [...], op: "add" }` (missing `shape: "arithmetic"`). The constructor's validation correctly identifies these but has no normalization pass to infer the missing discriminant from the node's other properties.

**Combined-treatment:** Two interventions on the same constructor file:
- A normalization pass that infers missing `shape`/`kind` discriminants from structural cues before validation
- Capture and log the raw LLM CompositionalIntent JSON on construction failure (currently lost — only the error string survives)

---

## §2 — Execution

**P1 — Read the intent constructor.**

```bash
find web/src -name '*intent*constructor*' -o -name '*prime*construct*' -o -name '*compositional*' 2>/dev/null | head -10
```

Then read the file(s) found. Paste the FULL validation/construction function — specifically:
- Where `shape` is checked as a structure discriminant
- Where `kind` is checked as an operand discriminant
- The error throw site that produces `branch is neither a structure (shape field) nor an operand (kind field)`
- The error throw site that produces `unknown shape "undefined"`
- The set of recognized `shape` values (`banded_lookup`, `arithmetic`, `conditional`, `composed`)
- The set of recognized `kind` values (`constant`, `input`, `measure`, etc.)

**P2 — Capture raw CompositionalIntent on failure.**

At the point where the constructor throws `cognition_violation`, add logging that captures the raw LLM-emitted JSON BEFORE validation:

```typescript
console.error(`[intent-constructor] Raw CompositionalIntent on failure:`, JSON.stringify(rawIntent, null, 2));
```

This surfaces the exact malformation for future diagnosis. Currently the raw intent is lost — only the error path string (`$.structure.then`) and the error description survive.

**P3 — Implement branch normalization.**

Add a normalization pass that runs BEFORE the constructor's validation. The normalizer walks every node in the CompositionalIntent tree. For each node that lacks both `shape` and `kind`:

Inference rules (structural, Korean Test compliant — no domain vocabulary):

1. **Has `value` field (number/string/boolean) and nothing else structural** → infer `kind: "constant"`. A bare `{ value: 500 }` is a constant operand missing its discriminant.

2. **Has `inputs` array or `children` array** → infer `shape: "arithmetic"` (if `op` is present: `add`/`multiply`/`subtract`/`divide`) or `shape: "composed"` (if no `op`). A node with children is a structure missing its shape.

3. **Has `condition` field** → infer `shape: "conditional"`. A node with a condition is a conditional structure missing its shape.

4. **Has `boundaries` or `lookup` field** → infer `shape: "banded_lookup"`.

5. **Has `field` or `source` or `metric` field** → infer `kind: "input"` (or `kind: "measure"` per the constructor's vocabulary — use whichever the existing operand kinds use for data references).

6. **Has `component` or `ref` field** → infer `kind: "reference"`.

7. **None of the above** → do NOT infer. Let the constructor throw as before. The normalization handles known structural patterns, not unknowns.

The normalizer applies recursively to every node: `then`, `else`, `children[*]`, `inputs[*]`, nested structures at any depth.

**HALT-1:** The intent constructor does not use `shape`/`kind` as discriminants — it uses a different structural convention (e.g., `type`, `nodeType`, or a union with different field names). If so, adapt the normalizer to the actual discriminant fields. Paste the actual convention.

**HALT-2:** The set of recognized `kind` values does not include a "data reference" operand (for nodes with `field`/`metric`). If the constructor uses a different name for input operands, use that name. Paste the recognized values.

**P4 — Build + test.**

```bash
rm -rf .next && npm run build
```

Build must succeed.

**P5 — Live verification.**

Re-import CRP Plan 3 (`CRP_Plan_3_CrossSell.pdf`) for tenant `e44bbcb1-2710-4880-8c7d-a1bd902720b7`. The import should now succeed — the normalizer should infer the missing discriminant on the `then` branch, and the constructor should accept it.

If the import still fails, paste:
- The raw CompositionalIntent JSON from the P2 logging
- The exact node that failed after normalization
- Which inference rule (1-7) should have fired but didn't

Do NOT fabricate success. If it fails, report the actual malformation.

Also re-import CRP Plan 2 (`CRP_Plan_2_Consumables.pdf`). The `consumables-commission-rep` component (`$.structure.children[1]: unknown shape "undefined"`) should also be repaired by the normalizer.

Commit: `HF-266: intent-constructor branch normalization — infer missing shape/kind discriminants from structural cues`

Push. `gh pr create --base main --head dev --title "HF-266: Intent constructor branch normalization" --body "Adds structural normalization pass before CompositionalIntent validation. Infers missing shape/kind discriminants from node properties (value→constant, inputs→arithmetic, condition→conditional). Logs raw intent JSON on construction failure. Fixes CRP Plan 3 cross-sell-bonus and Plan 2 consumables-commission-rep cognition_violation failures."`

---

## §3 — Reporting

Completion report: `docs/completion-reports/HF-266_INTENT_CONSTRUCTOR_NORMALIZATION_COMPLETION.md`

Include:
- Pasted intent-constructor validation code (P1)
- The normalization function as implemented
- Raw CompositionalIntent JSON for CRP Plan 3 (from P2 logging — the actual malformation)
- CRP Plan 3 import result (PASS/FAIL + component count)
- CRP Plan 2 import result (PASS/FAIL + component count)
- Build gate output
- HALT disposition log

---

## §4 — Out of Scope

- Prompt template modification for CompositionalIntent emission. The normalizer handles the class at the constructor level; prompt changes are a separate optimization.
- Retry hint threading (HF-265 §6A). The normalizer makes retry-with-hint less necessary.
- Progressive Performance cache for plan interpretation. Architecture item.
- Calculation verification. Architect reconciles CRP after this HF ships.

## §4A — Residuals

- If the normalizer handles CRP Plan 3 but a future plan produces a node pattern not covered by rules 1-7, the normalizer should be extended — rules are append-only.
- The raw-intent logging (P2) should be retained permanently — it's the diagnostic evidence for any future intent-construction failure.
