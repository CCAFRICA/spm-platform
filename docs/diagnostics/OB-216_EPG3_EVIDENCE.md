# OB-216 Phase 3 — EPG-3 Evidence (threshold elimination)

**Branch:** `ob-216-convergence-unified-path` · `npm run build` exit 0 · `npx tsc --noEmit` exit 0
**Gate (hard):** `no-developer-numbers-scan.sh` on `convergence-service.ts` → **GREEN**.

Phase 2 had already eliminated 2 of the original 6 (`2883` boundary floor via the loop rewrite; `2316` membership floor via deleting `isValidColumnMapping`). Phase 3 eliminates the remaining 5 flagged in `convergence-service.ts`:

| was | replacement | rationale |
|---|---|---|
| `347` `matchConfidence < 0.5` | **removed** | gated only observation-only per-match signal emission; the derivation path it guarded is dead. No cutoff. |
| `523` `score > 0.2 && argmax` | `score > 0 && argmax` | argmax over candidates + structural floor `0` (any token overlap), not a tuned cutoff. |
| `1279` `bestMatch.score > 0.3` | `if (bestMatch)` | accept the **argmax** structural winner (bestMatch set only when `score > 0`). Post-Phase-2 the matched data_type drives only entity_identifier/period cap + variant grouping; binding correctness is LLM recognition + validation. |
| `1310` `bestScore > 0.2` | `if (bestDt)` | accept any token-overlap winner (`bestDt` set only when `score > 0`). |
| `3064` `bestCatScore < 0.3` | **dead function removed** | `generateFilteredCountDerivations` (superseded, a Korean-Test E910 violation per DIAG-073 §5) deleted; its only caller (`generateDerivationsForMatch`) was already dead/commented. |

All replacements are **relative-separation/argmax + the bare structural floor 0** (Decision 110: 0 is the structural floor "is there any signal at all", never a tuned value) — no new bare-float, no column-name literal (Korean Test).

```
$ bash scripts/no-developer-numbers-scan.sh   # convergence-service.ts
CONVERGENCE-SERVICE GREEN
```
(Remaining global flags are in `run/route.ts`: `730` roster match-rate floor and `2734` the payout-equality float-precision **tolerance** — addressed when Phase 4 edits route.ts; `2734` will be `// RATIFIED:` as a numerical-precision epsilon, not an authority value.)

## No regression (live convergence, all bindings fresh)
The matcher change is a no-op for MIR/BCL (every component already scored above the old floor). Re-run confirms identical binding:
```
MIR Plan3 -> Monto_Cobrado[Cobranza] Saldo_Pendiente[Cobranza]   eid=DNI_Vendedor
MIR Plan4 -> Verificado[Clientes_Nuevos]                         eid=DNI_Vendedor
MIR Plan1 -> Monto_Total[Ventas] Categoria[Ventas] Monto_Total[Ventas]  eid=DNI_Vendedor
MIR Plan5 -> Monto_Total[Ventas_Marzo] + 2 abstentions (cross-period)   eid=DNI_Vendedor
MIR Plan2 -> Monto_Total[Ventas] (cuota field LLM-variance: bind/abstain)  eid=DNI_Vendedor
BCL       -> all 10 comps -> own sheets (Rendimiento/Flota_Hub)  eid=No_Empleado
```

## §GC-3 generality
- **(a) Class:** any data distribution / any plan. **(b) Keyed on:** argmax (distribution-relative) + the structural floor 0; no replacement is tuned to MIR's distributions. **(c) Anti-patterns absent:** no bare-float reintroduced; no MIR-distribution constant.

## Residual (not the EPG-3 gate)
The scale-inference bounds in `profileColumnDistribution`/`inferScale` (`max <= 1.5` ratio, `<= 150` percentage, …) are bare-float scale boundaries but are NOT scan-flagged (else-if chains the gate doesn't match) and are not on the active MIR binding path (scaleFactor ≈ 1 for MIR). They are a known residual for a distribution-derived rewrite; convergence-service is scan-GREEN without them.

*OB-216 Phase 3 / EPG-3 · 2026-06-18 · vialuce.ai*
