# HF-321 Phase 0 — Field Delta Investigation

**Date:** 2026-06-20 · **Branch:** `hf-321-frmx-seed-correction` · **Tenant:** Sabor Grupo Gastronomico `f7093bcc-e90b-4918-9680-69da7952dd65`
**Method:** read the authoritative field schema (`ChequeRowData` in `web/src/app/api/financial/data/route.ts:20-44` — the financial pages' thin client `financial-data-service.ts` delegates all `row_data` extraction to this server route, OB-99) + queried live Sabor `committed_data`.

> **HALT-1:** NOT triggered. `financial-data-service.ts` exists; OB-99 moved field extraction server-side to `/api/financial/data/route.ts` (the `ChequeRowData` interface is the contract). Seed correction (not code-fix) remains the right approach.
> **HALT-2:** NOT triggered. 43,875 `pos_cheque` rows exist for Sabor, all with `entity_id` populated.

## Substrate state (live)

- `committed_data`: **43,875** rows, all `data_type='pos_cheque'`, all `entity_id` populated (→ location UUID; 1000/1000 sampled map to a `location` entity). Location grouping (route groups by `entity_id`) therefore works.
- Entities: organization×1, **team×7** (3 brands `entity_role='brand'`: Cocina Dorada/Taco Veloz/Mar y Brasa + 4 regions), location×20, individual×40 (servers, `external_id` MES-001…MES-040, `metadata.mesero_id="MES-0XX"`, `metadata.location_id=<location external_id>`).
- entity_relationships: 83. Current aggregates: **gross(total)=MX$16,150,334.28**, **tips(propina)=MX$2,060,226.87**, **count=43,875**.

## The defect is a FIELD-NAME MISMATCH (the data exists under different names), not missing data

`ChequeRowData` (route, EXPECTED) vs the live seed `row_data` keys:

| EXPECTED (route reads) | Live seed has | Disposition |
|---|---|---|
| `numero_franquicia` (string) | `sucursal_id` ("FRMX-CD-QRO-001") | rename |
| `total_alimentos` (food) | `subtotal_alimentos` (202.54) | rename |
| `total_bebidas` (bev) | `subtotal_bebidas` (66.85) | rename |
| `total_impuesto` (tax/IVA) | `iva` (42.44) | rename |
| `total_descuentos` (discounts) | `descuento` (0) | rename/derive |
| `total_cortesias` (comps) | `cortesia` (0) | rename |
| `numero_de_personas` (guests) | `num_comensales` (2) | rename |
| `mesero_id` (**number**) | `mesero_id` ("MES-018", **string**) | **numeric coerce** — route does `n("MES-018")→NaN→skip` → "No Staff Data" |
| `fecha` (used for `new Date(fecha).getHours()` heatmap) | `fecha` date-only ("2024-01-04") | **add time** — `getHours()→0`, heatmap empty |
| `cierre` (close datetime, service-minutes) | `hora_cierre` ("01:11") | derive datetime |
| `turno_id` (number) | `turno` ("night", string) | map →number |
| `pagado`, `total_articulos`, `numero_cheque`, `subtotal_con_descuento` | absent | derive |
| `total`, `propina`, `efectivo`, `tarjeta`, `descuento`, `subtotal`, `fecha`, `folio`, `cancelado` | present (match) | preserve |

```
EXPECTED BUT MISSING (route name absent in seed): numero_franquicia, turno_id, numero_cheque, cierre,
  numero_de_personas, pagado, total_articulos, subtotal_con_descuento, total_impuesto,
  total_descuentos, total_cortesias, total_alimentos, total_bebidas
PRESENT AND USED (match): folio, fecha, mesero_id*, cancelado, total, efectivo, tarjeta, propina, descuento, subtotal
  (* mesero_id present but wrong TYPE — string vs number)
PRESENT BUT UNUSED (seed name route ignores): iva, mesa, turno, cortesia, forma_pago, hora_cierre,
  sucursal_id, hora_apertura, tipo_servicio, num_comensales, subtotal_bebidas, subtotal_alimentos
```

## Per-page root cause (maps to CLT-226)

- **Product Mix / Summary food-bev / Location food-bev:** route reads `total_alimentos`/`total_bebidas`; seed has `subtotal_alimentos`/`subtotal_bebidas` → MX$0.
- **Summary tax/discounts/comps/guests:** route reads `total_impuesto`/`total_descuentos`/`total_cortesias`/`numero_de_personas`; seed has `iva`/`descuento`/`cortesia`/`num_comensales` → MX$0.
- **Leakage Descuentos/Cortesías:** same rename gap → MX$0.
- **Patterns heatmap:** route derives hour via `new Date(fecha).getHours()`; `fecha` is date-only → hour 0 → empty.
- **Staff Performance:** route does `n(mesero_id)` → NaN on "MES-018"; AND server `metadata.mesero_id` is "MES-0XX" (the map key), so even a numeric cheque mesero_id wouldn't match. → "No Staff Data". Fix requires cheque `mesero_id` numeric AND server `metadata.mesero_id` numeric (both seed data).
- **Location Benchmarks crash:** `foodBevRatio`/null derived metric on missing food/bev → likely resolved once food/bev populate (verify; HALT-4 if persists).

## Correction strategy (Phase 1)

**Transform-and-reinsert** (preserves exact aggregates + internal consistency — the values exist, only mis-named): read each of the 43,875 rows, emit `row_data` in the `ChequeRowData` schema (rename food/bev/tax/comps/guests/franchise; `mesero_id`→integer from "MES-0XX"; `fecha`→`YYYY-MM-DDThora_apertura:00` datetime; `cierre`→datetime; `turno_id` map; derive `pagado`/`total_articulos`/`numero_cheque`/`subtotal_con_descuento`; `cancelado`→proper 0/1 flag preserving ~3 cancellations). Then normalize the 40 server entities' `metadata.mesero_id` "MES-0XX"→integer so the staff join resolves. `total`/`propina`/`efectivo`/`tarjeta`/`subtotal` preserved verbatim → aggregates exact.

## Residual (R-1, out of committed_data scope)

Network Pulse **brand grouping** ("Other (20 locations)"): the route resolves brands via `entity_type='organization'` + `metadata.role='brand'` + location `metadata.brand_id`. Sabor's brands are `team` entities (`entity_role='brand'`) and locations carry `metadata.brand`/`brand_code` but **no `brand_id`** → no match → "Other". This is an entity-structure / brand-resolution gap (route vs entity shape), **not** a `committed_data` issue → documented residual for a follow-on HF (§6 / R-1). Location-level grid still renders (grouping by `entity_id`).
