# OB-216 — Phase 2 Execution Decomposition (compilable increments; no monolith)

**Applies to:** `ob-216-convergence-unified-path` (HEAD `ac25d827`, clean at EPG-1).
**Why this exists:** Phase 2 has been described as "ready" three times without a commit or EPG-2 evidence. The blocker cited — "one atomic rewrite that won't compile until everything lands" — contradicts the stated intent to test iteratively, and it is what enables indefinite deferral. **Phase 2 is NOT atomic. It decomposes into 5 sub-steps that each compile and commit on their own.** Execute them in order, `tsc --noEmit` + commit after EACH. Do not batch. A commit per sub-step is the deliverable; "ready" is not progress — a committed, compiling sub-step is.

**If CC cannot start sub-step 1:** that is a capacity signal, not a reason for another readiness statement. Say so explicitly and hand off — the committed state at `ac25d827` + this decomposition lets a fresh instance resume at S1. Do NOT produce another "ready to execute" without executing.

---

## Sub-step sequence (each: edit → `tsc --noEmit` exit 0 → commit + push → paste evidence)

### 2-S1 — Adapter prompt: permit abstention (smallest; starts momentum)
- Edit `anthropic-adapter.ts:940-945` `convergence_mapping` system prompt: permit "insufficient evidence" for a field with a reason; instruct semantic match over labeled candidates by meaning + label + role; no column-name literal, no threshold.
- **Self-contained string change. Compiles independently.**
- **Commit:** `OB-216 2-S1: convergence_mapping prompt permits abstention`. Paste the new prompt.

### 2-S2 — `deriveNeededType` as a standalone function (the §GC-2 generality piece, unit-testable in isolation)
- Add `deriveNeededType(field, calculationIntent)` — an AST-walker mapping intent usage to the **full structuralType space** (NOT a binary): arithmetic/aggregate → numeric (measure/count); compare/conditional/filter → attribute-OK; temporal/date context → temporal; join/grouping-key context → identifier.
- **Add it as a new function; do not wire it into the binding loop yet. Compiles independently** (additive).
- **Verify in isolation:** feed it 4 sample intent fragments (one per role-kind) and paste the derived types — this proves §GC-2 generality *before* it's load-bearing.
- **Commit:** `OB-216 2-S2: deriveNeededType over full structuralType space`. Paste the function + the 4 sample outputs.

### 2-S3 — Labeled-candidate assembly (replace `measureColumns` build, ~2700-2751)
- Replace the measure-only build with a **labeled set from ALL capabilities**: `{column, partitionKey (sheet), structuralType, contextualIdentity, stats}`, admitting attributes. Drop the null-rate scoring block.
- Stage so it compiles: define the labeled-candidate type; build the assembly; if the downstream `resolveColumnMappingsViaAI` still expects the old shape, keep an adapter shim so **tsc stays clean** until S4 replaces the consumer. (The shim is deleted in S4 — not a dual path, a compile-staging scaffold.)
- **Commit:** `OB-216 2-S3: labeled-candidate assembly from all capabilities`. Paste the assembly + a log of MIR's labeled candidate set (showing attributes like `Verificado` now present, sheet-labeled).

### 2-S4 — `resolveColumnMappingsViaAI` new signature + sheet-aware parsing (~2355-2534)
- New signature taking `labeledCandidates`; user prompt lists requirements (field + role + plan intent) + candidates grouped by **opaque** sheet label; parse `{field:{column,sheet,confidence}} | {field:{abstain,reason}}`. Remove the S3 shim (consumer now matches).
- **Compiles** once the caller (the binding loop, still old) is reconciled — if the loop expects the old return shape, stage the loop's input adaptation minimally so tsc is clean; the full loop rewrite is S5.
- **Commit:** `OB-216 2-S4: recognition consumes labeled candidates, sheet-aware response`. Paste the function + a live MIR recognition call showing per-field {column, sheet, confidence}.

### 2-S5 — Binding loop: proposal → validate → write/gap (2881-3026)
- Wire `deriveNeededType` (S2) into validation: existence + role-consistency to the derived structuralType; numeric-needed binding an attribute → fail → **gap**. Abstain (from S4) → **gap**. **Remove the `match_pass:2` "bind anyway" path.** Preserve `entity_identifier` self-verification (~3030) and period binding untouched. batchIds: bound column's sheet drives provenance; multi-sheet union implicit.
- **Commit:** `OB-216 2-S5: binding loop proposal->validate->write/gap`. Paste the rewritten loop.

### 2-EPG-2 — live verification (the gate; self-gated per cadence)
After S5, full `npm run build` exit-0, then a live convergence run for all 5 plans. Paste:
- per-plan binding table (Plan1→{Ventas,Ventas_Marzo}; Plan3→{Cobranza}; Plan4→{Clientes_Nuevos} **`Verificado` via the attribute branch specifically**; Plan2→{Ventas,Cuotas} abstract; Plan5→deferred Phase 5),
- abstention-path honesty (if no MIR field abstained, note the path exists but was unexercised),
- **BCL before/after binding comparison** (single-cap tenant unchanged — the SR-2 regression proof),
- the §GC-2 generality statement (class + general property + anti-patterns absent; `deriveNeededType` covers the full structuralType space).
- **Commit:** `OB-216 EPG-2: 5-plan binding + generality + BCL regression`. Then continue to Phase 3 (self-gated); next mandated PAUSE is EPG-3′.

---

## Rules
- **One sub-step at a time.** `tsc --noEmit` exit 0 + commit + push before the next. Do not batch S1–S5 into one edit session — that recreates the monolith this decomposes.
- **Each commit is a real deliverable.** A compiling, committed sub-step is progress; a description of intent is not.
- **Compile-staging shims (S3/S4) are scaffolds, not dual paths** — each is deleted in the next sub-step. State explicitly when each is removed.
- **HALT** if any sub-step cannot be made to compile in isolation → report the specific coupling; do not proceed to a non-compiling state.
- All OB-216 / comprehensive-directive disciplines stand (Korean Test, Decision 110/158, SR-2 generality, SR-44 no-merge, reconciliation-channel separation).

---

*OB-216 Phase 2 execution decomposition · compilable increments · 2026-06-18 · vialuce.ai*
