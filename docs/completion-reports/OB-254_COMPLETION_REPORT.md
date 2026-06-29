# OB-254 — Completion Report (in progress: Phase 1 + Phase 2)

**Work item:** OB-254 — Structural Construction Stage (banded-report comprehension). **Branch:** `ob-254-structural-construction` (off `main` @ `da73d10c`). **Date:** 2026-06-29.
**Session scope (architect dispatch):** §3.2 de-bander as a pure function + EPG-2 on the actual file. Commit EPG-2 and STOP — §3.3–§3.5 and the PR are a later session. SR-35: evidence is pasted executed output, not self-attestation.

---

## Phase 1 (§3.1) — Surface map + HALT-1 — COMPLETE
EPG-1 committed at `fcef5934` (`docs/diagnostics/OB-254_PHASE1_SURFACE_MAP.md`): consumer table + grep evidence + the live parse→fingerprint→Content-Profile ordering. **HALT-1 fired correctly** (the "inside Content Profile, before fingerprint" insertion point does not exist — fingerprint precedes Content Profile; parse collapses the grid). Architect **dispositioned D1/D2/D3** (parse→sheets boundary shared helper; data-locality scale split; carried transform map at commit) — recorded in the amended directive §2.

## Phase 2 (§3.2) — The de-bander (pure function) + EPG-2

**Module:** `web/src/lib/sci/structural-construction.ts` — `constructStructure(grid, opts)`. Deterministic, **zero LLM** (Decision 158), **zero language-literal gates** (AP-25): every classification is structural — populated-cell counts, per-column numeric/text type ratios, positional footprint, single-cell vs wide footprint, numeric presence. No header text / domain token decides any outcome. **Harness:** `web/scripts/ob254-epg2-deband.ts` (downloads the actual file from `ingestion-raw` at runtime — no customer data committed). Build green (tsc clean; `npm run build` ✓).

### EPG-2 — executed output on the actual file (all 8 sheets)
```
OB-254 EPG-2 — de-band on 8 sheets of …COMISIONES___AUTORIZADOS_-_copia.xlsx

LOCALES REFAC:   header (no __EMPTY): DEPARTAMENTO, col_2, SUCURSAL, % AUTORIZADO, POLITICA DE PAGO,
                 BASE COMISION, FORMULA BASE COMISION, PAGO MENSUAL, AUTORIZA, OBSERVACIONES
                 sidecar {SECTION_LABEL:1, BLANK:8, HEADER:1, REPEATED_HEADER:2}; carry-down 23; records 24
                 sample: {DEPARTAMENTO:"PULL DE VENTAS", SUCURSAL:"FSV", "% AUTORIZADO":"0.20%", …}
FORANEAS REFAC:  header (no __EMPTY): col_1,col_2,SUCURSAL,PUESTO,"% AUTORIZADO CONFECC", … (real names)
                 sections lifted: "SUCURSAL : MERIDA", "SUCURSAL : TIJUANA"
                 sidecar {SECTION_LABEL:4, REPEATED_HEADER:16, HEADER:1, BLANK:8, SUBTOTAL:2}; carry 67; records 79
MAQUINARIA (2):  header: OBSERVACIONES,PUESTO,DEPARTAMENTO,SUCURSAL,% AUTORIZADO,…,OBSERVACIONES__2
                 sidecar {BLANK:18, SECTION_LABEL:2, HEADER:1, REPEATED_HEADER:5}; carry 25; records 30
                 sample: {OBSERVACIONES:"GERENTE BORDADO", SUCURSAL:"FSV", "% AUTORIZADO":0.005, …}
MAQUINARIA:      header: OBSERVACIONES,DEPARTAMENTO,SUCURSAL,% AUTORIZADO,…,OBSERVACIONES__2
                 sidecar {BLANK:19, SECTION_LABEL:2, HEADER:1, REPEATED_HEADER:9}; carry 19; records 44
COMISIÓN GARANTIZADA: header: DEPARTAMENTO,SUCURSAL,% AUTORIZADO,POLITICA DE PAGO,…,OBSERVACIONES
                 sidecar {BLANK:2, SECTION_LABEL:1, HEADER:1}; records 2
DISTRIBUIDORES:  header (band r0): DEPARTAMENTO,SUCURSAL,% AUTORIZADO,…,OBSERVACIONES
                 sidecar {HEADER:1, BLANK:7, SECTION_LABEL:1, REPEATED_HEADER:1}; carry 3
                 records 4  +  DOCUMENTATION UNIT: 9 narrative rows (the internal-process block + email list)
DIST Y SUC:      header: OBSERVACIONES,DEPARTAMENTO,SUCURSAL,col_4,% AUTORIZADO,…,OBSERVACIONES__2
                 sidecar {BLANK:6, SECTION_LABEL:1, HEADER:1}; carry-down 7; records 8
                 sample: {OBSERVACIONES:"DANIEL DELGADO", … "% AUTORIZADO":0.0008}  ← carry-down filled the rep name
PULL (EXTERNOS): header: OBSERVACIONES,DEPARTAMENTO,SUCURSAL,% AUTORIZADO,…,OBSERVACIONES__2
                 sidecar {BLANK:3, SECTION_LABEL:1, HEADER:1}; records 5
```

### EPG-2 verdict — honest, per SR-35 (no faked pass)

**PASS:**
- **Header recovery on ALL 8 sheets — zero `__EMPTY`.** This closes the root defect (the `__EMPTY` headers that poisoned the DS-017 fingerprint and produced the 0/0/all-roster outcome). Real column names recovered everywhere; data-bearing columns with no header cell get a structural positional name (`col_N`), never `__EMPTY`.
- **Carry Everything (T1-E902).** Every removed row is retained in the sidecar by reason (BANNER/SECTION_LABEL, REPEATED_HEADER, SUBTOTAL, BLANK). Nothing deleted (HALT-6 clear).
- **Carry-down fill** works (DIST Y SUC: the rep name "DANIEL DELGADO" forward-filled onto the second rate line; merged-range-aware).
- **Narrative capture** works (DISTRIBUIDORES: the 9-row internal-process block + email list emitted as a `documentation` unit, not mixed into the 4 rule records).
- **Duplicate-header disambiguation** works (`OBSERVACIONES` → `OBSERVACIONES__2`).
- **Subtotal / repeated-header / blank removal** works (FORANEAS: 16 repeated sub-headers + 2 subtotals to sidecar, out of the record set — vs the pre-OB outcome where ~2 dozen non-records committed as vendor rows).
- **Korean Test (HALT-2 clear):** classification is purely structural; the only token use anywhere is none load-bearing. **Singular path (HALT-4 clear):** one `constructStructure`; a clean sheet is the degenerate output (one band, no sections, no sidecar) of the same code — no banded/clean branch.

**PARTIAL — honest failure (FORANEAS REFAC):** FORANEAS's deeply-interleaved structure (title banner → a top header row → a branch section label → a multi-row header band → data, *repeated per branch*) does not cleanly separate with per-row structural rules alone. Two of six branch sections lift correctly ("SUCURSAL : MERIDA", "SUCURSAL : TIJUANA"); the remaining branch labels and the header sub-rows ("No./No./% AUTORIZ") are not cleanly disambiguated — a header sub-row sandwiched *inside* the header region, a section label, and a text-only data row are positionally—not content—distinct, so a few sub-rows leak into the FORANEAS record set. The 7 other sheets are clean. **This is reported, not faked** (per the dispatch: "honest failure is information; fabricated success is a HALT").

**Root of the FORANEAS partial + the fix path:** the per-row classifier lacks *block context*. The clean separation needs a second pass that recognizes a contiguous header BAND (section-label sandwiched between header rows is part of the band, not a data section) — i.e. classify by position within the detected block, not row-in-isolation. This is a bounded refinement to `constructStructure` (the band-context pass) and is the first task when this OB resumes; it does not change the module's interface, its insertion point (D1), or the transform-map contract (D3). The root defect (header recovery → fingerprint repair) is already universal across all 8 sheets.

## HALT log
- HALT-1 — fired in Phase 1, dispositioned (D1/D2/D3). HALT-2/HALT-4/HALT-6 — clear (structural classification, single path, lossless sidecar). HALT-3/HALT-5 apply to §3.3–§3.5 wiring (not this session).

## Status / next session
- **Done:** Phase 1 (EPG-1) + HALT-1 disposition; Phase 2 de-bander + EPG-2 (header recovery universal; 7/8 sheets clean; FORANEAS partial, honestly reported).
- **Next (resume):** the FORANEAS band-context disambiguation pass; then §3.3 (signals + fingerprint repair), §3.4 (wire at parse→sheets boundary + carried transform map at commit + DD-7), §3.5 (end-to-end G-A..G-G), completion, PR. No PR this session (architect dispatch).

ARTIFACT SYNC (deltas; architect applies):
```
MC: OB-254 → Phase 1 + Phase 2 (de-bander + EPG-2) committed; FORANEAS section disambiguation is the resume task.
REGISTRY: row "banded-report structural construction" → ev: EPG-2 (header recovery universal on the live Casa Diaz file).
R1: header-recovery-closes-fingerprint-poisoning → PASS (8/8 no __EMPTY); FORANEAS full de-band → PARTIAL.
BOARD: now = deterministic de-bander recovers real headers on all 8 banded sheets; gap = FORANEAS block-context section separation; ev = EPG-2; fl = build green; lane = build (Phase 2 of 5).
SUBSTRATE: candidate ICA capture — "banded-report structural construction" as a Progressive-Immunity extension (header recovery makes the DS-017 fingerprint stable for the banded class).
```
