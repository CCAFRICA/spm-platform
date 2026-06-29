# OB-254 — Completion Report (Phases 1–5 complete; PR open)

**Work item:** OB-254 — Structural Construction Stage (banded-report comprehension at Phase A). **Branch:** `ob-254-structural-construction` (off `main` @ `da73d10c`). **Date:** 2026-06-29.
**Outcome:** a deterministic, zero-LLM, Korean-clean de-band stage recovers real headers from banded reports BEFORE the fingerprint, lifts section context to `__section`, removes banner/repeated-header/subtotal to an auditable sidecar, captures narrative as a documentation unit, and is the byte-identical identity transform on a clean sheet. Wired at the parse→sheets boundary (process-job + execute-bulk); structural observations on the single signal surface; commit applies the carried companion. Proven on the actual Casa Diaz 8-sheet file: EPG-1..EPG-5 all green, DD-7 byte-identical, DS-017 fingerprint repaired. SR-35: all evidence below is pasted executed output. Merge + live browser verification are architect-only (SR-44).

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

## Phase 3 (§3.3) — Signal emission + fingerprint repair + Phase 4 (§3.4) — Wiring + Phase 5 (§3.5) — End-to-end

**Wiring (§3.4a, D1).** A single shared helper `web/src/lib/sci/deband-sheet.ts` `debandWorksheet(XLSX, ws, sheetName)` reads the raw `{header:1}` grid and runs `constructStructure`. It is called at the **parse→sheets boundary** by BOTH callers — the classify worker (`process-job/route.ts`, replacing the `sheet_to_json` keyed read) and the commit re-parse (`execute-bulk/route.ts`) — at the same point, BEFORE the fingerprint. So fingerprint → Content Profile → Header Comprehension all consume the recovered header. ONE helper, two callers, same point = singular path (HALT-4 clear). Grid-availability is an input property: an oversized sheet (> OB-251 cell ceiling / > 20 MB) keeps the OB-251 windowed/stream header-keying untouched (the OOM defense is not regressed) — D2 option (a); every human-authored banded report is small and takes the full-grid path.

**Lossless commit (§3.4c, D3).** For a non-oversized file the parse **companion** (`{columns, rows}`) is the carried artifact: `process-job` writes the **de-banded** rows into it and `execute-bulk` APPLIES them on a companion HIT (it never re-derives the de-band). On a companion MISS, `execute-bulk` re-reads the worksheet through the **same** helper → identical rows. `committed_data.row_data` carries the full tidy row including `__section`; the sidecar (banner/repeated-header/subtotal/blank) is the auditable removed-row set. **No canonical overwrites an original** — the de-bander only recovers headers, lifts `__section`, and (merged-range only) carries down; it never replaces a cell value (HALT-3 clear). The forward-fill carry-down heuristic was **removed** (it fabricated values on clean sheets) — carry-down is now authoritative merged-ranges only.

**Signal surface (§3.3a/§3.3c, G7).** `emitStructuralObservations` maps each `StructuralObservation` to a `classification_signals` row via the canonical `writeSignal` — open-vocabulary `signal_type` (`structural:header_recovered` / `:blocks` / `:multi_value_cell`), `decision_source='structural_construction'`, `scope='tenant'`, with `sheet_name`/`source_file_name`/`structural_fingerprint`. `structural-construction.ts` performs **zero** DB writes (pure function); `deband-sheet` writes only through `writeSignal`, whose sole insert surface is `.from('classification_signals').insert(...)`. **One signal surface, no second store** (HALT-3 clear). Best-effort: a signal-write failure never blocks the import.

### EPG-3 — signals + fingerprint repair (executed)
```
EPG-3 §3.3a — structural observations → classification_signals:
  signal_type=structural:header_recovered  decision_source=structural_construction  detail={headerRows:[1,3,4], columns:20, autoGenerated:true}
  signal_type=structural:multi_value_cell  decision_source=structural_construction  detail={row:83, column:"PUESTO", value:"GERENTE 27-Abr-16"}
  signal_type=structural:blocks            decision_source=structural_construction  detail={headerBands:10, sectionsLifted:7, sidecarByReason:{SECTION_LABEL:8,HEADER:3,BLANK:8,SUBTOTAL:8,REPEATED_HEADER:15}}
  LIVE WRITE: 3 structural signals persisted to classification_signals (then cleaned up)

EPG-3 §3.3b — fingerprint repair (FORANEAS):
  OLD keyed columns (legacy): __EMPTY present = TRUE   fingerprint=7b7a3fda115c4ee7  (poisoned — keyed on the banner/blank row)
  NEW de-banded columns:      __EMPTY present = FALSE  fingerprint=5bdcd62e58032364  (real recovered header)
  DETERMINISM (pass1==pass2): MATCH  → pass-2 lookupFingerprint hits Tier 1 and SKIPS Header Comprehension (LLM)
  REPAIR: old != new = true  (the poisoned fingerprint is replaced by a stable, real-header one — DS-017 flywheel un-poisoned)

EPG-3 §3.3c — single signal surface:
  deband-sheet.ts writes only via writeSignal → sole insert surface .from('classification_signals').insert(...)
  structural-construction.ts DB writes: NONE (pure function)
```

### EPG-4 — routing + DD-7 behavior preservation (executed)
```
EPG-4 §3.4a — routing dry-run (the {columns,rows} the companion carries to commit), FORANEAS:
  columns[0..6]: ["No. VEND","No. Nòmin","SUCURSAL NOMBRE VENDEDOR","PUESTO","% AUTORIZADO CONFECC % AUTORIZ CONFECC","% AUTORIZADO SERIG","PAGO MENSUAL 1a Catorcena"]
  __section in columns: true   record (with __section): {"No. Nòmin":2170,"SUCURSAL NOMBRE VENDEDOR":"GARCIA TERRON  REYMUNDO","PUESTO":"GERENTE", … ,"__section":"SUCURSAL : MERIDA"}
  sidecar → commit metadata: {SECTION_LABEL:8,HEADER:3,BLANK:8,SUBTOTAL:8,REPEATED_HEADER:15}   records → committed_data.row_data: 67

EPG-4 §3.4d — DD-7 behavior preservation (a real CLEAN sheet: the 87-col JDE export "Exportar Hoja de Trabajo", first 200 rows):
  columns byte-identical: TRUE    rows byte-identical: TRUE    (record-count old=199 new=199)
  DD-7 VERDICT: PASS — the de-bander is the IDENTITY transform on a clean sheet (HALT-5 clear).
  (Two fixes made this hold: defvalEmpty preserves a present space-padded cell raw / '' only for an absent cell; forward-fill carry-down removed.)
```

### EPG-5 — end-to-end acceptance G-A..G-G on the actual file (executed, all 8 sheets)
```
  LOCALES REFAC          no __EMPTY  cols=10  __section=0   sidecar={SECTION_LABEL:1,BLANK:8,HEADER:1,REPEATED_HEADER:2}   records=24
  FORANEAS REFAC         no __EMPTY  cols=21  __section=7   sidecar={SECTION_LABEL:8,HEADER:3,BLANK:8,SUBTOTAL:8,REPEATED_HEADER:15}   records=67
  MAQUINARIA (2)         no __EMPTY  cols=20  __section=0   sidecar={BLANK:18,SECTION_LABEL:1,HEADER:1,REPEATED_HEADER:5}   records=31
  MAQUINARIA             no __EMPTY  cols=15  __section=0   sidecar={BLANK:19,SECTION_LABEL:1,HEADER:1,REPEATED_HEADER:9}   records=45
  COMISIÓN GARANTIZADA   no __EMPTY  cols=9   __section=0   sidecar={BLANK:2,SECTION_LABEL:1,HEADER:1}   records=2
  DISTRIBUIDORES         no __EMPTY  cols=10  __section=1   sidecar={HEADER:1,BLANK:7,SECTION_LABEL:1,REPEATED_HEADER:1}   records=4   doc-unit=9 narrative rows
  DIST Y SUC             no __EMPTY  cols=11  __section=0   sidecar={BLANK:6,SECTION_LABEL:1,HEADER:1}   records=8   (merged-cell carry-down=4)
  PULL (EXTERNOS)        no __EMPTY  cols=10  __section=0   sidecar={BLANK:3,SECTION_LABEL:1,HEADER:1}   records=5

  G-A real header recovered, zero __EMPTY (all 8 sheets) ........ PASS
  G-B real column roles available to HC (recovered names) ....... PASS
  G-C section context preserved as __section .................... PASS (FORANEAS 7 branches + DISTRIBUIDORES)
  G-D banner/repeated-header/subtotal NOT in records (sidecar) .. PASS
  G-E every record commits with full row_data (+__section) ...... PASS
  G-F DISTRIBUIDORES narrative captured as documentation unit ... PASS
  G-G re-import recognizes structure (deterministic fingerprint, pass-2 match) ... PASS
```

Unit tests: `src/lib/sci/__tests__/structural-construction.test.ts` (5/5 — identity-on-clean, defval parity, no-__EMPTY, banner sidecar, banded section lift + Carry-Everything). Full SCI suite: **186/186 pass**. `tsc` clean; `npm run build` green; dev server confirmed on localhost:3000.

## HALT log
- **HALT-1** — fired in Phase 1, dispositioned (D1/D2/D3).
- **HALT-2** (Korean Test) — clear: every classification is structural (populated counts, per-column numeric/text type, footprint, numeric-presence, positional block context). No language token decides any outcome.
- **HALT-3** (second surface / canonical overwrite / commit re-derivation) — clear: one signal surface (`classification_signals`); no canonical reaches `row_data`; commit APPLIES the companion (never re-derives).
- **HALT-4** (parallel path) — clear: one `constructStructure`, one `debandWorksheet`, two callers at the same point; clean sheet = degenerate output; grid-availability is an input property (D2), not a structure-class branch.
- **HALT-5** (behavior regression) — clear: DD-7 byte-identical on a real clean sheet; 186/186 SCI tests pass.
- **HALT-6** (lossy removal) — clear: Carry Everything — every removed row is in the sidecar; narrative → documentation unit.

## Scope notes for architect verification (SR-44)
- The EPG proofs run the de-bander + signal + fingerprint functions on the ACTUAL files at the function level (the signal write was exercised live then cleaned up). **Live browser verification** of an end-to-end re-import of the Casa Diaz file (and the broad-tenant DD-7 across sealed anchors) is the architect's, per SR-44 — the de-bander now runs on every non-oversized sheet for every tenant; DD-7 is byte-identical *by construction* on a header-at-row-1, all-columns-present sheet, and is proven on the 87-col JDE export.
- **Oversized sheets** (> OB-251 cell ceiling / > 20 MB) retain the existing windowed/stream header-keying (OOM defense untouched). Extending header-recovery into those streaming readers (D2's universal-sample header recovery) is a bounded follow-up that must not regress OB-251's peak-heap bound; it is flagged, not silently skipped.

## Status
Phases 1–5 complete; EPG-1..EPG-5 all green; PR opened against `main`. Merge + migration (none required — no new table; `classification_signals` columns are existing) + live browser verification are architect-only (SR-44).

ARTIFACT SYNC (deltas; architect applies):
```
MC: OB-254 → Phases 1–5 complete; de-bander wired at parse→sheets boundary (process-job + execute-bulk); PR open.
REGISTRY: row "banded-report structural construction" → ev: EPG-2..EPG-5 (header recovery universal; 8/8; DD-7 byte-identical; fingerprint repaired).
R1: header-recovery-closes-fingerprint-poisoning → PASS (8/8 no __EMPTY, two-pass fingerprint match); FORANEAS full de-band → PASS (7/7 branches).
BOARD: now = deterministic de-band wired before the fingerprint, signals on the single surface, commit applies the carried companion; gap = oversized-sheet sample header-recovery (D2 follow-up) + architect live re-import; ev = EPG-1..EPG-5 + 186/186 + DD-7; lane = review (PR open).
SUBSTRATE: ICA capture — "banded-report structural construction" as a Progressive-Immunity extension: header recovery makes the DS-017 fingerprint stable for the banded class (poisoned→real, pass-2 Tier-1 skip-LLM).
```
