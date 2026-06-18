# OB-216 — Amendment: Track-C′ Aggregation-Reduction Sub-Scope + Phase 4 Reframe + Updated Cadence

**Applies to:** `ob-216-convergence-unified-path` (HEAD `cb8062f7`, Phase 0 + §B probe complete).
**Disposition (architect):** option **(A)** — fold the §B aggregation-reduction defect INTO OB-216 as a gated sub-scope. The solution stays unified (no separate OB, no fragmentation). DoD #3 ("the 4 non-clawback plans compute non-zero") is retained as a real gate, now achievable.
**Type:** scope addition + reframe + cadence. **No merge (SR-44).**

The §B probe correctly triggered the STOP branch and characterized a 5th defect (aggregation semantics). This amendment incorporates it rather than deferring it, because deferral would ship OB-216 green while plans still return 0 — the favorable-framing pattern. The aggregation-reduction defect is a structural class on the same convergence→resolution path and belongs in the unified OB.

---

## §F — The 5th defect, ratified (from §B probe)

`resolveColumnFromBatch` (`run/route.ts:1648-1677`) **unconditionally SUMs** every bound column. Correct for a flow column (a per-transaction measure like `Monto_Cobrado`); **wrong for a stock column** (a balance snapshot like `Saldo_Pendiente`, the identical value repeated on every one of an entity's rows). Live evidence (Plan 3, entity 10300021): `Saldo_Pendiente` snapshot `6026.29` summed across 147 rows → `885,864.63` (147× inflated) → ratio `295288.17 / 885864.63 = 0.33` fails the plan's `> 0.7` gate → `else = 0`. The metrics resolve correctly; the **reduction** is wrong. This is strictly downstream of binding (Track A) and keying (Track C) — a distinct structural class: **reduction policy must depend on the column's nature, not be unconditional SUM.**

**Scope-creep guard (why it must be in OB-216):** after Phases 1–2 bind Plans 1/2/4 to their own sheets, any plan reading a stock column in a ratio/threshold can still compute 0 via this same defect. DoD #3 is unachievable without it.

---

## §G — Phase 3′: Aggregation-Reduction (new sub-scope, on the same path)

Insert **Phase 3′** after Phase 3 (selection), before Phase 4. It is the reduction layer of the same resolution path.

### §G.0 Probe (read-only, settles the reduction-detection mechanism BEFORE implementing)
The detection of flow-vs-stock must be **structural** (Korean-Test-clean, threshold-free) — never a column-name list. Two candidate structural signals; the probe determines which the live system already supports and which is robust:

1. **Field-identity signal:** read what `fieldIdentity`/`contextualIdentity` the live classifier assigns to `Monto_Cobrado` vs `Saldo_Pendiente` (and the other measure columns across sheets). Does the classification already distinguish a flow/amount from a stock/balance (e.g. `contextualIdentity`)? Paste per-column.
2. **Data-shape invariance signal:** for each measure column, per entity within the period, is the value **invariant across the entity's rows** (stock) or **varying** (flow)? Compute over multiple entities (not one) so single-row entities don't create false invariance. Paste the invariance profile for `Monto_Cobrado` (expect: varies) and `Saldo_Pendiente` (expect: invariant per entity).

```sql
-- Data-shape invariance, per measure column, across the real Cobranza vendors (multi-entity)
SELECT col,
       count(*) FILTER (WHERE distinct_vals = 1) AS entities_invariant,
       count(*) FILTER (WHERE distinct_vals > 1) AS entities_varying
FROM (
  SELECT row_data->>'DNI_Vendedor' AS dni, 'Monto_Cobrado' AS col,
         count(DISTINCT row_data->>'Monto_Cobrado') AS distinct_vals
  FROM committed_data
  WHERE tenant_id='972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
    AND row_data->>'_sheetName' LIKE 'Cobranza_%'
    AND row_data->>'DNI_Vendedor' LIKE '10300%'
  GROUP BY 1,2
  UNION ALL
  SELECT row_data->>'DNI_Vendedor', 'Saldo_Pendiente',
         count(DISTINCT row_data->>'Saldo_Pendiente')
  FROM committed_data
  WHERE tenant_id='972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
    AND row_data->>'_sheetName' LIKE 'Cobranza_%'
    AND row_data->>'DNI_Vendedor' LIKE '10300%'
  GROUP BY 1,2
) t GROUP BY col;
```

**Decision rule (record it):**
- If the field-identity signal already cleanly separates flow from stock → reduction policy keys on `fieldIdentity`/`contextualIdentity` (cleanest; the classifier is authority — Decision 110).
- Else, use the data-shape invariance signal: a column invariant-per-entity across a meaningful fraction of multi-row entities is a **stock** → reduce by its single (distinct) value; a varying column is a **flow** → SUM. This is structural and threshold-free (invariance is a property, not a tuned cutoff).
- Record which mechanism Phase 3′ implements and why. **HALT-G:** if neither signal cleanly separates `Monto_Cobrado` (flow) from `Saldo_Pendiente` (stock), STOP and report — the reduction policy needs architect design before implementation.

### §G.1 Implementation
In `resolveColumnFromBatch` (`run/route.ts:1648-1677`), replace the unconditional SUM with a **reduction selected by the column's structural nature** (per §G.0):
- **flow / measure-amount →** `SUM` (unchanged behavior).
- **stock / balance-snapshot →** reduce to the single per-entity value (the invariant value; if a `reference` prime consumes it, it receives the snapshot, not the sum).
- The reduction is chosen structurally per `fieldIdentity`/`structuralType` (Decision 158: code constructs the reduction deterministically from the column's structural identity; no LLM, no column-name literal, no developer threshold).

**Korean-Test:** the reduction selector branches on structural identity / data-shape, never on a column-name string. **Decision 110:** if any relative cutoff is needed (e.g. "invariant across ≥X% of entities"), it must be relative/data-derived, not a bare float — prefer a structural all-or-nothing rule (invariant vs not) that needs no cutoff.

### §G.2 EPG-3′ (gate)
Paste the diff. Paste a MIR Plan 3 calc trace showing: `Saldo_Pendiente` now reduces to its snapshot value (not the 147× sum), the ratio passes the `>0.7` gate for qualifying vendors, and Plan 3 computes a **non-zero** per-entity result and grand total. Paste a single-file regression check (BCL): its flow columns still SUM unchanged — no behavior change for a tenant with only flow measures. **Architect reconciles the Plan 3 value against ground truth (SR-44, architect channel).**

**SR-38 math gate (Plan 3):** hand-compute one qualifying vendor — `(Monto_Cobrado_sum / Saldo_Pendiente_snapshot) > 0.7` → `Monto_Cobrado_sum × 0.015` — and show the engine reproduces it. Paste both.

---

## §H — Phase 4 reframe (scope unchanged; framing corrected)

The §B runtime proved `entityCol = knownEntityCols[0] = DNI_Vendedor` for all MIR plans — so **Phase 4 was never the MIR unblock.** Phase 4 (per-sheet entity key) **remains in OB-216 as the SR-2 / scale-by-design structural fix** (a tenant whose sheets use different identifiers would break on the global `[0]`), but:
- Its EPG-4 success criterion is **"per-sheet keying preserves the currently-correct `DNI_Vendedor` resolution for all MIR sheets (no regression)"** — NOT "unblocks Plan 3" (Plan 3 is unblocked by Phase 3′).
- Do not present Phase 4 as the Plan-3 fix in the completion report. Its justification is structural scale-safety only.
- No re-derivation needed — the per-sheet-key change is the same; only the claim about what it fixes is retired.

---

## §I — Updated cadence (supersedes §C)

| Phase | Run mode | Gate |
|---|---|---|
| §B probe | ✅ complete | UNKNOWN #1 resolved; 5th defect characterized. |
| **Phase 1** (sheet-aware partition) | **PAUSE at EPG-1** | Foundational; partition key revised. Architect review before 2→. |
| Phase 2 (sheet-scoped matching + role-aware candidates) | Run through to EPG-2 | Self-gate, pasted evidence. |
| Phase 3 (relative/CRL selection — threshold elimination) | Run through to EPG-3 | `no-developer-numbers-scan.sh` GREEN hard gate. |
| **Phase 3′** (aggregation-reduction — NEW) | **PAUSE at EPG-3′** | The phase that actually unblocks Plan 3. Probe (§G.0) first, then implement; EPG-3′ must show Plan 3 non-zero + SR-38 hand-comp. Architect reconciles value vs GT. |
| Phase 4 (per-sheet entity key — SR-2 only) | Run through to EPG-4 | Success = no regression to `DNI_Vendedor` keying (not "unblocks Plan 3"). |
| Phase 5 (cross-period clawback) | Run through to EPG-5 | SR-38 hand-comp required. |
| PR | Open, do NOT merge | Completion report = PR body + all EPG evidence. |

Two mandated pauses: **EPG-1** (foundational partition) and **EPG-3′** (the actual MIR-value unblock). Phases 2, 3, 4, 5 self-gate to their EPGs; architect reviews them in the completion report.

---

## §J — Updated Definition of Done (supersedes OB-216 §1 DoD)

1. All 5 MIR plans bind each metric to a column from that plan's **own sheet** (structural, CC-checkable).
2. `no-developer-numbers-scan.sh` on `convergence-service.ts` GREEN (and Phase 3′ introduces no new bare-float).
3. **The 4 non-clawback plans compute non-zero, correctly-reduced, correctly-keyed per-entity results** — RETAINED as a real gate (Phase 3′ makes it achievable). Architect reconciles all values vs ground truth.
4. Clawback computes its negative in the return period (Phase 5).
5. No single-file regression: BCL/Meridian/CRP recalc unchanged (architect, SR-44).
6. `npm run build` exit-0; `localhost:3000`; PR opened (not merged).

---

## §K — Disposition notes
- Phase 3′ is on the same resolution path as the rest — this is one unified vertical slice (partition → match → candidates → select → **reduce** → key → clawback), not a separate fix. SR-34: the reduction defect is fixed at its structural-class layer (reduction-by-identity), not per-column.
- The §B finding and Phase 3′ resolution are recorded in the completion report as the *correct* resolution of UNKNOWN #1 (superseding the Phase 0 static read) plus the 5th defect.
- If §G.0's HALT-G triggers (no clean structural flow/stock signal), that is a blocking design question for the architect before Phase 3′ — do not invent a reduction policy.
- All other OB-216 disciplines stand (Korean Test, Decision 110, SR-2, SR-38, SR-44, reconciliation-channel separation — no ground-truth values in CC outputs).
- Scope note: OB-216 now spans seven structural sub-scopes + clawback on one path. If at any EPG pause the artifact proves too large to land safely, raise it at that pause for an architect split decision — but the default is unified.

---

*OB-216 amendment · Track-C′ aggregation-reduction + Phase 4 reframe + cadence · 2026-06-18 · vialuce.ai*
