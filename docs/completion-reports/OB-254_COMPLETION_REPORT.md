# OB-254 — Completion Report (in progress: Phase 1 + Phase 2)

**Work item:** OB-254 — Structural Construction Stage (banded-report comprehension). **Branch:** `ob-254-structural-construction` (off `main` @ `da73d10c`). **Date:** 2026-06-29.
**Session scope (architect dispatch):** §3.2 de-bander as a pure function + EPG-2 on the actual file. Commit EPG-2 and STOP — §3.3–§3.5 and the PR are a later session. SR-35: evidence is pasted executed output, not self-attestation.

---

## Phase 1 (§3.1) — Surface map + HALT-1 — COMPLETE
EPG-1 committed at `fcef5934` (`docs/diagnostics/OB-254_PHASE1_SURFACE_MAP.md`): consumer table + grep evidence + the live parse→fingerprint→Content-Profile ordering. **HALT-1 fired correctly** (the "inside Content Profile, before fingerprint" insertion point does not exist — fingerprint precedes Content Profile; parse collapses the grid). Architect **dispositioned D1/D2/D3** (parse→sheets boundary shared helper; data-locality scale split; carried transform map at commit) — recorded in the amended directive §2.

## Phase 2 (§3.2) — The de-bander (pure function) + EPG-2

**Module:** `web/src/lib/sci/structural-construction.ts` — `constructStructure(grid, opts)`. Deterministic, **zero LLM** (Decision 158), **zero language-literal gates** (AP-25): every classification is structural — populated-cell counts, per-column numeric/text type ratios, positional footprint, single-cell vs wide footprint, numeric presence. No header text / domain token decides any outcome. **Harness:** `web/scripts/ob254-epg2-deband.ts` (downloads the actual file from `ingestion-raw` at runtime — no customer data committed). Build green (tsc clean; `npm run build` ✓).

### EPG-2 — executed output on the actual file (all 8 sheets) — 8/8 PASS (re-run after the block-context pass)
```
OB-254 EPG-2 — de-band on 8 sheets of …COMISIONES___AUTORIZADOS_-_copia.xlsx

LOCALES REFAC:   header (no __EMPTY): DEPARTAMENTO, col_2, SUCURSAL, % AUTORIZADO, POLITICA DE PAGO,
                 BASE COMISION, FORMULA BASE COMISION, PAGO MENSUAL, AUTORIZA, OBSERVACIONES
                 header band [2]; sidecar {SECTION_LABEL:1, BLANK:8, HEADER:1, REPEATED_HEADER:2}; carry 23; records 24
                 sample: {DEPARTAMENTO:"PULL DE VENTAS", SUCURSAL:"FSV", "% AUTORIZADO":"0.20%", …}
FORANEAS REFAC:  header (no __EMPTY, 21 cols): "No. VEND","No. Nòmin","SUCURSAL NOMBRE VENDEDOR","PUESTO",
                 "% AUTORIZADO CONFECC % AUTORIZ CONFECC","% AUTORIZADO SERIG","PAGO MENSUAL 1a Catorcena",
                 "POLITICAS DE PAGO","BASE COMISION","FORMULA BASE DE COMISIÓN","AUTORIZA","OBSERVACIONES",…,__section
                 header band [1,3,4]  (top header r1 + per-branch mini-header r3,r4; section r2 NOT in band)
                 sections lifted (7): MERIDA, TIJUANA, LEON, SN. FCO. DEL RINCON, IRAPUATO, CELAYA, MONTERREY
                 sidecar {SECTION_LABEL:8 (7 branches+banner), HEADER:3, REPEATED_HEADER:15, SUBTOTAL:8, BLANK:8}; carry 56; records 67
                 sample: {"No. Nòmin":2170, "SUCURSAL NOMBRE VENDEDOR":"GARCIA TERRON  REYMUNDO",
                          "PUESTO":"GERENTE", "% AUTORIZADO CONFECC % AUTORIZ CONFECC":0.01, …}  ← clean, no "No." sub-row
MAQUINARIA (2):  header: OBSERVACIONES,PUESTO,DEPARTAMENTO,SUCURSAL,% AUTORIZADO,…,OBSERVACIONES__2
                 header band [3]; sidecar {BLANK:18, SECTION_LABEL:1, HEADER:1, REPEATED_HEADER:5}; carry 29; records 31
                 sample: {OBSERVACIONES:"GERENTE BORDADO", SUCURSAL:"FSV", "% AUTORIZADO":0.005, …}
MAQUINARIA:      header: OBSERVACIONES,DEPARTAMENTO,SUCURSAL,% AUTORIZADO,…,OBSERVACIONES__2
                 header band [3]; sidecar {BLANK:19, SECTION_LABEL:1, HEADER:1, REPEATED_HEADER:9}; carry 20; records 45
COMISIÓN GARANTIZADA: header: DEPARTAMENTO,SUCURSAL,% AUTORIZADO,POLITICA DE PAGO,…,OBSERVACIONES
                 header band [3]; sidecar {BLANK:2, SECTION_LABEL:1, HEADER:1}; records 2 (text-policy rows, no numeric measure)
DISTRIBUIDORES:  header: DEPARTAMENTO,SUCURSAL,% AUTORIZADO,…,OBSERVACIONES,__section
                 header band [0]; section lifted: "COMISIÓN"; sidecar {HEADER:1, BLANK:7, SECTION_LABEL:1, REPEATED_HEADER:1}; carry 3
                 records 4  +  DOCUMENTATION UNIT: 9 narrative rows (the internal-process block + email list)
DIST Y SUC:      header: OBSERVACIONES,DEPARTAMENTO,SUCURSAL,col_4,% AUTORIZADO,…,OBSERVACIONES__2
                 header band [3]; sidecar {BLANK:6, SECTION_LABEL:1, HEADER:1}; carry 7; records 8
                 sample: {OBSERVACIONES:"DANIEL DELGADO", … "% AUTORIZADO":0.0008}  ← carry-down filled the rep name
PULL (EXTERNOS): header: OBSERVACIONES,DEPARTAMENTO,SUCURSAL,% AUTORIZADO,…,OBSERVACIONES__2
                 header band [3]; sidecar {BLANK:3, SECTION_LABEL:1, HEADER:1}; records 5
```

### EPG-2 verdict — 8/8 PASS (honest, per SR-35)

- **Header recovery on ALL 8 sheets — zero `__EMPTY`.** Closes the root defect (the `__EMPTY` headers that poisoned the DS-017 fingerprint → 0/0/all-roster). A data-bearing column with no header cell gets a structural positional name (`col_N`), never `__EMPTY`.
- **FORANEAS fully de-banded (the hard case):** real composite headers recovered (top header r1 merged with the per-branch mini-header r3/r4 — band `[1,3,4]`, section r2 excluded); **all 7 branch sections lifted** to `__section`; the per-branch repeated mini-headers (15) and the per-branch `TOTALES` subtotals (8) go to the sidecar; **the record set is clean — no header sub-row ("No./VEND") leaks in.**
- **Carry Everything (T1-E902, HALT-6 clear):** every removed row retained in the sidecar by reason (SECTION_LABEL incl. banner, REPEATED_HEADER, SUBTOTAL, BLANK). Nothing deleted.
- **Carry-down** (DIST Y SUC: "DANIEL DELGADO" forward-filled, merged-range-aware), **narrative capture** (DISTRIBUIDORES: 9-row block → documentation unit), **duplicate-header disambiguation** (`OBSERVACIONES__2`) all work.
- **No regression on the 7 non-FORANEAS sheets:** 5 are byte-identical to the prior (bdfd0359) baseline; the 2 MAQUINARIA sheets *improved* — a previously bogus "." section is gone and that row is now a real record (+1 each). HALT-5 logic clear.
- **The block-context pass that closed FORANEAS** is positional/structural, **Korean Test clear (HALT-2):** a text-only row that sits ABOVE numeric data is a header sub-row (no language token); a measure column counts toward `measPop` only when its cell is actually numeric (a text label in a measure column does not). **Singular path (HALT-4 clear):** one `constructStructure`; a clean sheet is the degenerate (single-band, no-section) output of the same code.

## HALT log
- HALT-1 — fired in Phase 1, dispositioned (D1/D2/D3). HALT-2/HALT-4/HALT-6 — clear. HALT-3/HALT-5 — addressed in §3.3–§3.4 (below).
