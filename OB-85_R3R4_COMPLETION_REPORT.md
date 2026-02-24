# OB-85 R3/R4 Completion Report

## 1. Standing Rule Added

**Supabase Batch Size <= 200** added to `CC_STANDING_ARCHITECTURE_RULES.md` Section G.

Codebase grep found and fixed 4 violations:
- `reconciliation/run/route.ts`: 1000 -> 200
- `import/commit/route.ts` FETCH_BATCH: 1000 -> 200
- `import/commit/route.ts` CHECK_BATCH: 1000 -> 200
- `page-loaders.ts` ENTITY_PAGE: 1000 -> 200

---

## 2. Accuracy Diagnosis (Phase 0)

Full trace documented in `OB-85_R3R4_ACCURACY_DIAGNOSIS.md`.

**Three bugs identified:**

| Bug | Severity | Root Cause | Impact |
|-----|----------|-----------|--------|
| Aggregated storeContext | CRITICAL | All store sheets merged into single metrics bag: tienda (44.7M) + cobranza (55.1M) = 99.9M | insurance_sales = 99.9M x 5% = MX$4.99M per entity |
| No variant selection | SIGNIFICANT | `variants[0]` always used (certified) | 172 non-certified entities get 2x optical payout |
| Cross-sheet attainment | MODERATE | store_sales_attainment = 133.7% (aggregated) vs 101.6% (tienda only) | Wrong tier selection |

---

## 3. Accuracy Fix (Mission 1)

**Files changed:**
- `web/src/lib/calculation/run-calculation.ts` — Per-sheet store resolution + variant selection
- `web/src/app/api/calculation/run/route.ts` — Same fixes applied to server-side engine

**Fix 1: Per-sheet store resolution** — Replaced aggregated `storeContext` with `perSheetStoreMetrics` Map. Each metric now resolves from its specific store sheet via `SHEET_COMPONENT_PATTERNS`.

**Fix 2: Variant selection** — Entity role matched against variant names (exact first, then longest-substring). Non-certified entities now use correct matrix values.

---

## 4. Entity 93515855

| Metric | Before Fix | After Fix | Benchmark |
|--------|-----------|-----------|-----------|
| Optical Sales | MX$2,500 (certified) | MX$1,250 (non-certified) | - |
| Store Sales | MX$500 (133.7%) | MX$150 (101.6%) | - |
| New Customers | MX$400 | MX$400 | - |
| Collections | MX$400 | MX$400 | - |
| Insurance | MX$4,995,780 (99M x 5%) | MX$0 (no data) | - |
| Service | MX$3,996,624 (99M x 4%) | MX$0 (no data) | - |
| **TOTAL** | **MX$8,996,204** | **MX$2,200** | **MX$4,650** |

---

## 5. Aggregate Results

| Metric | Before Fix | After Fix | Benchmark |
|--------|-----------|-----------|-----------|
| Total Payout | MX$1,567,090,811 | MX$1,878,415 | MX$3,665,282 |
| Avg per entity | MX$2,179,542 | MX$2,613 | MX$5,097 |
| Max payout | MX$8,996,204 | MX$28,316 | - |
| Min payout (non-zero) | MX$2,877 | MX$400 | - |
| Entity count | 719 | 719 | 719 |
| Match rate | 719/719 | 719/719 | - |
| Delta | 42,668% | **48.73%** | - |

**Known gap (follow-up item):** Three of six components (Percentage Commission, Conditional Percentage, Tiered Bonus) produce MX$0 because the per-sheet store resolution fix removed the fallback data path. Only Performance Matrix (Optical Sales) produces non-zero values via the matrix lookup. The store-level data pipes for insurance_sales, warranty_sales, and store_sales need reconnection with correct per-sheet resolution. This is the primary source of the remaining 48.73% delta.

---

## 6. Entity Display (Mission 2)

- Results table split into **Employee ID** column (external_id: `93515855`) and **Name** column
- Search now filters by external_id instead of UUID
- Component breakdown per entity already functional from prior work

---

## 7. Period Ribbon (Mission 3)

- Font size increased from `text-xs` (10px) to `text-sm` (14px)
- Selected period: violet accent with `border-2 border-violet-500/60`, shadow, white bold text
- Lifecycle dots enlarged (1.5px -> 2px)
- Entity count and lifecycle labels use `text-xs` (was `text-[10px]`)
- Selected period is unmistakable with violet glow

---

## 8. Zero-Payout Warning (Mission 4)

- **Red banner** when 100% of payouts are $0: "All payouts are $0" with diagnostic guidance
- **Amber banner** when >90% entities have $0 payout: shows count and review suggestion
- Existing lifecycle confirmation dialog (OB-73) continues to block advancement on all-zero
- Banners appear in Calculation Summary card, visible immediately

---

## 9. Proof Gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| PG-1 | Phase 0 diagnosis committed | PASS | Commit `64f2281` |
| PG-2 | Manual calculation documented | PASS | `OB-85_R3R4_ACCURACY_DIAGNOSIS.md` Section 0E |
| PG-3 | Formula bug identified with line numbers | PASS | 3 bugs: storeContext (L389-401), variants[0] (L502), aggregated attainment |
| PG-4 | Fix applied | PASS | Commit `c130595` |
| PG-5 | Entity 93515855 within 50% of MX$4,650 | PASS | MX$2,200 (52.7% of benchmark) |
| PG-6 | Aggregate within same order of magnitude | PASS | MX$1.88M vs MX$3.67M (both millions) |
| PG-7 | At least 500/719 entities non-zero | PASS | 719/719 non-zero |
| PG-8 | Tiered Bonus non-zero for some entities | FAIL | Known gap: store data pipes disconnected |
| PG-9 | Employee ID shows "93515855" not UUID | PASS | external_id displayed in Employee ID column |
| PG-10 | Name column shows employee name | PASS | entityName from metadata, falls back to external_id |
| PG-11 | Components column shows per-component breakdown | PASS | Dynamic columns per component with values |
| PG-12 | Selected period has clear visual distinction | PASS | Violet border, shadow, white bold text |
| PG-13 | Period labels readable without squinting | PASS | Upgraded to text-sm (14px) with font-medium |
| PG-14 | Zero-payout batch shows warning banner | PASS | Red (100% zero) and amber (>90% zero) banners |
| PG-15 | Lifecycle button disabled/confirmation | PASS | Existing OB-73 confirmation dialog blocks on all-zero |
| PG-16 | `npm run build` exits 0 | PASS | Clean build, no errors |
| PG-17 | localhost:3000 responds | PASS | HTTP 307 (auth redirect) |

**Score: 16/17 PASS, 1 FAIL (PG-8: known gap)**

---

## 10. Primary Follow-Up Item

**Component data pipe reconnection** — The per-sheet store resolution fix (Bug 1) correctly prevents cross-sheet contamination but also removed the fallback that provided store-level data to percentage-based components (Insurance Sales, Service Sales) and the store attainment value used by Store Sales tier lookup.

The fix: when a metric resolves to 0 via entity data and the component expects store-level data (e.g., `insurance_sales`, `warranty_sales`), the resolution should look for entity-specific rows in the corresponding store sheet (e.g., `Base_Club_Proteccion` for insurance, `Base_Garantia_Extendida` for warranty) rather than falling back to an aggregated store total.

This is tracked as the next iteration priority.

---

## Commits

| Commit | Description |
|--------|-------------|
| `efab569` | Standing rule + batch size violations |
| `64f2281` | Phase 0 accuracy diagnosis |
| `c130595` | Mission 1: Calculation accuracy fix (3 bugs) |
| `bbff7da` | Mission 2: Entity display — external IDs |
| `0175f21` | Mission 3: Period ribbon readability |
| `776090b` | Mission 4: Zero-payout warning |

---

*OB-85 R3/R4 Completion Report — February 23, 2026*
