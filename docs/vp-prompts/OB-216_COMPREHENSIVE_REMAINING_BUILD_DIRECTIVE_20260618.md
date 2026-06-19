# OB-216 — Comprehensive Remaining-Build Directive (Phases 2–5): Generality-First, ULTRACODE

**Consolidates and supersedes** the piecemeal phase directives (Phase 2 Final / Direction A, the Aggregation-Reduction amendment, the SR-2 Generality Criteria). This is the single executable directive for the remainder of `ob-216-convergence-unified-path` (HEAD `ac25d827`, Phase 1 / EPG-1 released). CC executes Phases 2→3→3′→4→5→PR against this document.

**Effort directive — ULTRACODE / maximum rigor.** The standard here is **general-by-design, not MIR-fitted-then-checked.** For every phase, build the mechanism that serves the structural *class*; MIR's five plans must fall out as *one instance*, never as the target. ULTRACODE effort is spent reasoning exhaustively about each capability's class boundaries *before* implementation, so the general mechanism is cut first — not a MIR-specific version retrofitted toward generality. Do not abbreviate. Every phase gate requires pasted evidence (Rule 27); no self-attestation.

---

## §0 — Standing rules & disqualifications

- Load `CC_STANDING_ARCHITECTURE_RULES.md` in full. Architecture Decision Gate before implementation; Anti-Pattern Registry every build; SQL Verification Gate before any SQL.
- Commit + push after each phase. After all phases: `pkill -f "next dev"` → `rm -rf .next` → `npm run build` (exit-0) → `npm run dev` → confirm `localhost:3000`. Git from repo root.
- **Live code only** at the branch HEAD. DO NOT read/cite `AUD-001` or any extract. DIAG-073 line numbers are guidance — re-verify live before editing.
- **No merge (SR-44):** final step is `gh pr create`, architect merges + browser-verifies.
- **Reconciliation-channel separation:** CC reports computed values verbatim; NO ground-truth values in any output. Architect reconciles.

---

## §1 — THE GOVERNING MANDATE: Enduring Capability, Not Tenant-Specific (SR-2, deep)

Every phase builds **enduring platform capability for a structural class.** Code that fits only MIR — even with no literal lookup table — is a **disguised registry** and an SR-2 failure equal to a duplicate path. **Generality is proven, not asserted.**

**The trap:** MIR is the *only* tenant exercising the new capability AND the proof of it. Single-sheet tenants (BCL/Meridian/CRP) prove *no regression* but exercise *none* of the new behavior. So "works for MIR" and "serves the class" are indistinguishable unless the class is made explicit and a *second instance* exercises it.

**The discipline, applied to every phase below:**
- **(a) Capability class** stated explicitly.
- **(b) General structural property** the code keys on (never a MIR literal).
- **(c) Anti-patterns** confirmed absent.
- **(d) Constructed second-instance proof** for the two RISK phases (3′, 5) — a synthetic input exercising a *different* instance of the class, flowing through the *same* mechanism. Retained as a regression fixture.

**EECI of the generality work:** *Efficiency* — one general mechanism per class, not N tenant-fixes. *Efficacy* — serves the class, proven by the second instance (not coincidence). *Comprehensive* — covers the full structural space (structuralType set, reduction set, cross-period class), not MIR's subset. *Innovation* — the constructed second-instance fixtures become the platform's durable proof that these capabilities are general.

---

## §2 — PHASE 2: Clean Labeled Candidates + LLM Binding + Structural Validation (Direction A; self-gate to EPG-2)

The accepted implementation map (surgical against live `generateAllComponentBindings` / `resolveColumnMappingsViaAI` / adapter prompt), with the generality widening:

- **§2.1 Candidate assembly (§B):** replace the measure-only `measureColumns` build (~2700-2751) with a **labeled set from ALL capabilities** — `{column, partitionKey (sheet), structuralType, contextualIdentity, stats}` — admitting attributes (`Verificado`). Drop the null-rate scoring block.
- **§2.2 Recognition (§C):** `resolveColumnMappingsViaAI` (~2355) new signature taking `labeledCandidates`; user prompt lists requirements (field + role + plan intent) and candidates grouped by **opaque** sheet label (Korean-Test: LLM discriminates by columns/types, not sheet-name meaning); parse `{field:{column,sheet,confidence}} | {field:{abstain,reason}}`. Adapter prompt (`anthropic-adapter.ts:940`) **permits abstention**. Remove the `match_pass:2` "bind anyway" path; abstain/invalid → **convergence gap**.
- **§2.3 Validation (§D) — WIDENED for generality (§GC-2):** `deriveNeededType(field, calculationIntent)` AST-walker mapping intent usage to the **full structuralType space**, NOT a numeric/attribute binary:
  - arithmetic/aggregate ref → **numeric** (measure/count)
  - compare/conditional/filter ref → **attribute-OK** (numeric also acceptable)
  - temporal/date context → **temporal**
  - join/grouping-key context → **identifier**
  Validation = existence + role-consistency to the derived structuralType; numeric-needed binding an attribute → fail → gap. No bare-float.
- **§2.4 batchIds (§E):** bound column's sheet drives provenance; multi-sheet union implicit (`resolveColumnFromBatch` column-scan). Preserve `entity_identifier` self-verification (~3030) and period binding.

**Generality posture (state in EPG-2):** **(a)** class = any plan whose fields are literal/abstract/cross-sheet, any language; **(b)** keyed on labeled-all-caps candidates + LLM semantic recognition + intent-usage structural validation, no field-name list; **(c)** anti-patterns absent — no MIR field name in prompt/validator, no sheet/plan assumption, **no numeric/attribute binary** (must be full structuralType map), one identical path for literal/abstract/cross-sheet.

**EPG-2 (self-gate):** per-plan binding table (Plan1→{Ventas,Ventas_Marzo} `Monto_Total`+`Categoria`(attribute); Plan3→{Cobranza}; Plan4→{Clientes_Nuevos} `Verificado` **via the attribute branch specifically**; Plan2→{Ventas,Cuotas} abstract `Monto_Total`+`Enero_2025`; Plan5→deferred Phase 5). Plus: updated prompt pasted (abstention, no literal, no threshold); `deriveNeededType` pasted **covering the full structuralType space**; evidence no plan binds another sheet's columns; **abstention path stated reachable-or-not** (if no MIR field abstained, note path exists but unexercised — honestly); **BCL before/after binding comparison** (single-cap tenant unchanged — the SR-2 regression proof). Architect reconciles values (SR-44).

---

## §3 — PHASE 3: Threshold Elimination (self-gate to EPG-3)

Eliminate the 6 scan-flagged thresholds (`338,514,1261,1292,2883,3202`) + the scale-inference bounds (`2014-2044`) + the membership-validity floor (`2316-2325`), replacing each with relative-separation (argmax, importing `web/src/lib/sci/resolver.ts`) or CRL-`reliability` authority. Remove the dead/superseded functions carrying `338`/`3202`.

**Generality posture (§GC-3):** **(a)** class = any data distribution; **(b)** relative/CRL authority (distribution-relative, inherently tenant-agnostic); **(c)** no replacement reintroduces a bare-float or tunes a relative parameter to MIR's distributions.

**EPG-3:** `bash scripts/no-developer-numbers-scan.sh` on `convergence-service.ts` → **GREEN** (paste). Each replacement diff pasted. Confirm no MIR-distribution tuning.

---

## §4 — PHASE 3′: Aggregation-Reduction — GENERAL Reduction Capability (RISK · PAUSE at EPG-3′)

**Defect (§F):** `resolveColumnFromBatch` (~1648-1677) unconditionally SUMs. Wrong for stock/snapshot columns (`Saldo_Pendiente` snapshot summed 147× → ratio collapses → Plan 3 = 0).

**§4.0 Probe (read-only):** confirm the structural signals the reduction recognizer reasons over — field-identity/contextualIdentity per column, and data-shape (invariance-per-entity across multiple entities). Paste for `Monto_Cobrado` (flow) and `Saldo_Pendiente` (stock). **HALT-G** if no clean signal separates them.

**§4.1 Implementation — ULTRACODE general-by-design (§GC-3′):** build **reduction-by-recognized-nature over a GENERAL reduction set**, NOT a `{sum, snapshot}` binary. The LLM **recognizes** a bound column's needed reduction from its identity/shape (Decision 158: recognize); deterministic code **applies** the recognized reduction from a meaningful set — **sum, snapshot/last/first, max, min, average, distinct-count.** No `Saldo_Pendiente`→snapshot literal; no two-value flow/stock switch; no column-name literal in the selector.

**Generality posture:** **(a)** class = any column whose correct reduction differs from sum (snapshot, max, min, average, last, first, distinct-count); **(b)** LLM-recognized reduction + deterministic application over a general set; **(c)** anti-patterns absent (no hardcoded column→reduction, no binary switch).

**§4.2 CONSTRUCTED SECOND-INSTANCE PROOF (mandatory):** add a synthetic input where a column needs a **non-sum, non-snapshot** reduction (e.g., a plan using the **maximum** balance over the period, or an **average** rate). Show the *same* recognizer selects the correct reduction. **HALT-GC3′:** if a third reduction type needs a new branch, the mechanism is a disguised binary — stop and generalize. Retain the fixture.

**EPG-3′ (PAUSE):** MIR Plan 3 trace — `Saldo_Pendiente` reduces to snapshot (not 147× sum), ratio passes the plan gate, Plan 3 computes **non-zero** per-entity + grand total. The §4.2 second-instance proof. **SR-38 hand-comp** of one qualifying Plan-3 vendor. BCL regression (flow columns still SUM). Architect reconciles Plan 3 vs ground truth.

---

## §5 — PHASE 4: Per-Sheet Entity Key — General-by-Construction (self-gate to EPG-4)

**Reframe (§H):** `entityCol = knownEntityCols[0]` (~813-820) is one global key for all sheets. **MIR does not need this** (`entityCol` uniformly `DNI_Vendedor`) — Phase 4 exists *entirely* for tenants with heterogeneous sheet identifiers (SR-2). Required: derive the entity key **per sheet/component** from its `entity_identifier` binding. **Success = preserves MIR's correct `DNI_Vendedor` keying (no regression)**, NOT "unblocks Plan 3" (Plan 3 is unblocked by Phase 3′).

**Generality posture (§GC-4):** **(a)** class = any tenant with heterogeneous sheet identifiers; **(b)** per-component `entity_identifier`, no global `[0]`; **(c)** no fallback reintroducing the single-global-key assumption.

**EPG-4:** confirm the per-sheet key is derived from each component's binding (so a heterogeneous tenant is served **by construction** — MIR can't prove it, so show the code *would* serve such a tenant) AND MIR's uniform keying preserved. BCL trace unchanged.

---

## §6 — PHASE 5: Cross-Period Reference Resolution Capability (RISK · PAUSE at EPG-5)

**Class, not instance (§GC-5):** build **cross-period reference resolution** as a capability — the class is *any retroactive adjustment referencing a prior period via a link key* (clawbacks, retroactive bonuses, corrections, reversals). MIR's clawback is **one instance** riding it.

**§6.0 Source (settled, §3.3):** source = (A) recompute-from-original-sale via the link-key→prior-period-row join, with the original plan's rate dependency. (Negative passthrough + conditional firing already supported, §5.3 — verify, don't rebuild.)

**§6.1 Implementation — ULTRACODE general-by-design:** recognize a **reference-key field structurally** (not `Folio_Original` literal), resolve it to the prior-period row (wire the dead `priorDataByEntity`/`priorPeriodRows` substrate, `run/route.ts:959-1034` + `intent-executor.ts:240-353`), and let the **plan's declared formula** (whatever it is) compute from the recovered inputs. The window/return-period is **read from the plan**, not a literal.

**Generality posture:** **(a)** class = any prior-period-referencing retroactive adjustment; **(b)** structurally-recognized reference-key + prior-period resolution + plan-declared formula; **(c)** anti-patterns absent — no `Folio_Original`/`Ventas_Enero`/Plan-1-rate-table hardcoded as THE key/source/formula; no window literal.

**§6.2 CONSTRUCTED SECOND-INSTANCE PROOF (mandatory):** add a synthetic retroactive adjustment with a **different link key and a different source/formula** (e.g., a retroactive bonus keyed on a different reference field, recovering a different prior-period input). Show it resolves through the *same* cross-period substrate. **HALT-GC5:** if it needs a new hardcoded key/source/formula, the mechanism is MIR's clawback in disguise — stop and generalize. Retain the fixture.

**EPG-5 (PAUSE):** MIR clawback trace (return period) — the references resolve via the cross-period join, the prime produces a **negative** for the return entities and 0 otherwise, negative carries to `total_payout`. The §6.2 second-instance proof. **SR-38 hand-comp** of one return-row entity. Architect reconciles vs ground truth.

---

## §7 — PR (no merge)

`npm run build` exit-0 (paste); `localhost:3000` (paste 200); then:
```bash
git add -A && git commit -m "OB-216: convergence unified path — generality-first (partition + labeled-candidate binding + general reduction + per-sheet key + cross-period capability)"
git push origin ob-216-convergence-unified-path
gh pr create --base main --head ob-216-convergence-unified-path --title "OB-216: Convergence unified path (generality-first)" --body "<phase-by-phase + generality evidence + 2 constructed-instance fixtures>"
```
**DO NOT MERGE.** Completion report = PR body + all EPG + generality evidence.

---

## §8 — Generality Verification Posture (the SR-2 gate, first-class)

- Each phase's completion-report section carries its generality statement (class + general property + anti-patterns-absent). An EPG proving "MIR works" but unable to articulate the class is **incomplete**, regardless of MIR passing.
- Phases 3′ and 5 do NOT pass without the constructed second-instance proof. "MIR computes" is necessary, not sufficient — the second instance distinguishes capability from coincidence.
- The two constructed instances are retained as **regression fixtures** — the durable proof the reduction set and cross-period substrate are general.

---

## §9 — HALT conditions
- **HALT-G / HALT-GC3′ / HALT-GC5** (§4, §6): no clean reduction signal; reduction needs a 3rd-type branch; cross-period needs a new hardcoded key/source/formula → stop, the mechanism is not general.
- **HALT-3 (Locked-Rule, SR-42):** any phase requiring a column-name literal, a developer threshold, or a MIR special-case to pass → surface the rule verbatim + dictated action, halt for architect disposition. **Never** add a MIR special-case to force a pass.
- **HALT-2:** a single-file tenant (BCL) regresses (≠ its expected caps/bindings/keying) → stop.
- **General:** any claim not groundable in freshly-read live code → UNKNOWN; never substitute an extract.

---

## §10 — Cadence
| Phase | Mode | Gate |
|---|---|---|
| 2 (labeled candidates + binding + widened validation) | self-gate | EPG-2 + §GC-2 generality + BCL before/after |
| 3 (threshold elimination) | self-gate | EPG-3 scan GREEN |
| **3′ (general reduction)** | **PAUSE** | EPG-3′: Plan 3 non-zero + 2nd-instance + SR-38 |
| 4 (per-sheet key, SR-2 only) | self-gate | EPG-4: general-by-construction + no regression |
| **5 (cross-period capability)** | **PAUSE** | EPG-5: clawback negative + 2nd-instance + SR-38 |
| PR | open, no merge | report = all EPG + generality + 2 fixtures |

Two mandated pauses: **EPG-3′** (the MIR-value unblock + reduction generality) and **EPG-5** (clawback + cross-period generality). Phases 2, 3, 4 self-gate; architect reviews in the completion report.

---

*OB-216 comprehensive remaining-build directive · generality-first, ULTRACODE · 2026-06-18 · vialuce.ai*
