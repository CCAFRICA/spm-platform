# HF-324 COMPLETION REPORT

Financial Agent Hardening + Reconciliation Theme

## Date / Branch
2026-06-21 · `hf-324-financial-hardening` · base main (post HF-321 `1701911e`)

## Commits (one per logical unit, Rule 28)
| SHA | Unit |
|---|---|
| `0f06a3e6` | directive committed |
| `b982c61d` | Phase 1 — crash fixes (D1/D2) |
| `9143b36a` | Phase 2 — entity corrections (O4 brand + O5 staff location) |
| `7facca4b` | Phase 3 — 6 months of data (O2) |
| `1d0df599` | Phase 4 — reconciliation Vialuce theme (O6) |
| `8330f8da` | Phase 5 — Leakage drill-through (O3) |
| `8b1a640f` | Phase 5b — Operating Summary month selector (O2/PG-5/PG-9) |

## Files changed (code)
`web/src/app/api/financial/data/route.ts` (additive: `cheques` mode, leakage category `key`, summary `monthFilter`+`availableMonths`, staff/perf brand resolution untouched — see note), `web/src/app/financial/{performance,staff,leakage,summary}/page.tsx`, `web/src/app/operate/reconciliation/page.tsx`, `web/src/components/financial/ChequeList.tsx` (new), `web/src/lib/financial/financial-data-service.ts`, plus scripts `web/scripts/frmx-entity-corrections.ts` + `web/scripts/frmx-multimonth-datagen.ts`. **No auth, engine, or calculation files.**

## EVIDENCE METHODOLOGY (C1 honesty)
The two crashes (D1/D2) were render-time **Radix `<SelectItem value="">` invariant throws**, not data/null bugs — I eliminated the exact throwing condition structurally and verified, via the real route handler, that the data feeds now contain **zero** empty option values. Browser login is the architect channel (SR-44); the route-handler output below is the data each component renders, and the crash conditions are provably gone. Browser-visual confirmation remains the architect's pass (the same channel that found these via CLT-226).

## PROOF GATES
| PG | Criterion | Result | Evidence |
|---|---|---|---|
| **PG-1** | `/financial/performance` no crash, 20-location table | **PASS** | Crash was `brands` useMemo → `<SelectItem value="">`; guarded (skip empty brandId). After O4, route `performance` returns 20 rows, **distinct brands = [Mar y Brasa, Cocina Dorada, Taco Veloz], 0 empty brandId** → no empty option emitted. |
| **PG-2** | `/financial/staff` no crash, server names + revenue + location | **PASS** | Crash was `locations` useMemo → empty `<SelectItem>`; guarded (`filter(Boolean)`). After O5, route `staff` returns 40 servers, **0 empty locationName**; e.g. `Raúl García Hernández @ Cocina Dorada Querétaro`, `Silvia Domínguez García @ Mar y Brasa Guadalajara`. |
| **PG-3** | `/financial/pulse` grouped by brand, not "Other (20)" | **PASS** | Network Pulse brands = **Cocina Dorada (8 locs, $7,308,466)**, **Taco Veloz (7, $4,032,478)**, **Mar y Brasa (5, $4,809,388)**; locations map to brand names. |
| **PG-4** | `/financial/timeline` 6 periods, revenue varies | **PASS** | 263,250 cheques across Jan–Jun 2024; 24 periods (4 Jan + 20 Feb–Jun). Timeline aggregates by `fecha` → 6 months. |
| **PG-5** | Period selector on Operating Summary changes data | **PASS** | `availableMonths = [2024-01…2024-06]`; selecting changes gross: Jan **$16,150,334**, Mar **$15,681,196**, Jun **$18,811,848**. |
| **PG-6** | Leakage category → drill-through cheques | **PASS** | New `cheques` mode + `ChequeList`; Descuentos→**104,662** cheques, Cortesías→**79,335**, Cancelaciones→**1,345**, each with date/location/amount (capped display 200). |
| **PG-7** | Staff server → drill-through | **PASS (pre-existing)** | `staff/page.tsx` already `router.push('/financial/server/[id]')` (full-page server detail). Premise corrected — drill exists. |
| **PG-8** | Location Benchmarks location → drill-through | **PASS (pre-existing)** | `performance/page.tsx` already `router.push('/financial/location/[id]')`. The additive `cheques` mode also serves per-location cheques (Cocina Dorada Roma → 12,873). |
| **PG-9** | Summary non-January data non-zero | **PASS** | 2024-03: gross **$15,681,196**, food **$10,460,575**, tax **$2,162,925**, guests **114,660** — all non-zero. |
| **PG-10** | 6-month gross ≈ MX$97M ±10%, checks ≈ 262K ±10% | **PASS** | gross **MX$102,557,014.55** (within 87.3–106.7M), checks **263,250** (within 235.8K–288.2K). |
| **PG-11** | `npm run build` exit 0 | **PASS** | `BUILD EXIT: 0`. (tsc --noEmit also exit 0.) |
| **PG-12** | Zero auth-scope files modified | **PASS** | `git diff --name-only` → only financial/reconciliation + scripts; auth/middleware grep = 0 matches. |
| **PG-13** | `/operate/reconciliation` Vialuce theme, no grey | **PASS** | Root cause: inline `CARD_STYLE` const (`rgba(24,24,27,0.8)`) on 17 cards bypassed the HF-316 CSS net. Made it `useIsVialuce`-aware → `var(--vl-surface)`/`var(--vl-line)` under Vialuce; all 17 `...CARD_STYLE` → `...cardStyle`. |
| **PG-14** | Reconciliation results view Vialuce theme | **PASS** | The results-view cards (period matching, mapping, results table at lines 1491–1627) use the same `cardStyle` → themed. Only grey residual was the inline const; no other reconciliation file carries the dark-rgba pattern. |

## ARTIFACT SYNC (INF-004)
- **R-1 (brand grouping): CLOSED.** Brand entities flipped to `organization`+`role='brand'`; 20/20 locations given `metadata.brand_id` from `entity_relationships`. Network Pulse groups by brand.
- **R-4 (staff location label): CLOSED.** 40/40 server `metadata.location_id` rewritten external_id→UUID; staff location names resolve.
- **Financial Agent capability status:** all 9 pages render (crashes eliminated); brand grouping live; 6 months of data; Leakage drill-through + Summary month selector added; performance/staff full-page drill pre-existing.
- **Reconciliation theme status:** Vialuce-applied (inline `CARD_STYLE` was the sole residual dark surface); no remaining grey reconciliation surfaces found.
- **New CLT findings:** (a) any data-derived `<SelectItem value={x}>` where `x` can be `''` is a latent crash — the same guard pattern should be applied wherever financial Selects derive options from data; (b) the financial route does **not** filter aggregation by period (every page shows all cheques) — the Summary now filters by month additively; other modes (network_pulse, leakage, products) remain whole-tenant.

## PREMISE CORRECTIONS (reported faithfully)
- D1/D2 are Radix Select empty-value throws — **not** industry-branch mismatch, null-reference, or `breakdownToRecord` (that normalizer is confined to `lib/drill-through`, not used by the financial route).
- O3: `/financial/performance` and `/financial/staff` **already** drill (full-page nav); only Leakage lacked a click handler. OB-224 `DrillThroughPanel` is ICM-coupled (entity_id+period_id, reads calculation_results, no row_data filter) and cannot express per-server / per-leakage-category scoping — so a small purpose-fit `cheques` mode + `ChequeList` was built instead of forcing reuse (avoids HALT-2).
- O2: **0** non-January rows existed (delete-non-Jan was a no-op safety); Jan gross = $16,150,334.28.
- O5: the staff-location data fix does **not** by itself fix the D2 crash (empty `locationName` renders harmlessly in a Badge); the crash is the separate Radix Select throw — both were fixed.
- O6: the reconciliation page was already Vialuce-adopted for frame/header/utility classes; the **only** residual dark surface was the inline `CARD_STYLE` const — a single-file fix, no new global CSS remap pass (HALT-1 clear).

## HALT activations
None. HALT-1 (no breaking route-contract change — all additive), HALT-2 (drill-through built additively, not forced onto OB-224), HALT-3 (no residual crash), HALT-4 (0 insert failures).

## Residuals
R-6 closed (summary period selector built). R-7 (cheque→receipt depth), R-8 (Product Mix / Network Pulse drill), R-9 (Patterns heatmap-cell drill) — additive future scope. R-10 — no other grey reconciliation surfaces found.
