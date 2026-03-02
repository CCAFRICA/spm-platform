# VIALUCE CLT FINDINGS REGISTRY
## Single Source of Truth — All Browser Findings Across All CLT Sessions
## Revision: R7 — February 28, 2026 (Consolidated)
## Replaces: R4 base + R5 patch + R6 patch + R7 patch + Feb 28 patch
## Total: 323 findings across 10 CLT sessions

---

## PURPOSE

**This registry exists so that CC never repeats a mistake it has already been shown.** Every CLT finding is a discovery made through browser verification — real behavior, not assumed behavior. When CC receives an OB or HF prompt, this registry must be included so CC knows:
- What has been tried and failed
- What has been fixed and verified
- What patterns keep recurring and why
- What gaps exist between "it builds clean" and "it works in the browser"

**Fragmented patches caused recurring failures.** Prior to R7, findings were spread across 6 files. CC saw at most 1-2 files per session. The same issues appeared in CLT after CLT because the institutional memory was never loaded as a single document.

---

## HOW TO USE THIS REGISTRY

**Globally unique IDs:** `CLT{session}-F{number}` (e.g., `CLT72-F38`). CLT-113 uses `CLT113-T{number}`.

**Status definitions:**
- ✅ **FIXED** — Verified resolved in browser
- 🔄 **PARTIALLY** — Root cause addressed but not fully verified
- ❌ **OPEN** — Not yet addressed
- 🔁 **REGRESSED** — Was fixed, broke again
- 📌 **PDR** — Persistent Defect Registry
- ⏭️ **DEFERRED** — Intentionally postponed
- 🗑️ **SUPERSEDED** — No longer relevant
- ℹ️ **NOT A BUG** — Confirmed correct behavior
- ✅ **POSITIVE** — Working as intended or better than expected

**After every CLT:** Add new findings, update statuses, note which intervention resolved each item.

**Before every OB/HF:** CC reads this entire document.

---

## STATISTICS

| Metric | Count |
|--------|-------|
| Total findings (all CLTs) | 323 |
| Currently OPEN | ~190 |
| FIXED | ~72 |
| PDR (persistent) | 10 (3 resolved, 1 acceptable, 6 open) |
| DEFERRED | ~20 |
| SUPERSEDED | ~8 |
| POSITIVE (working well) | ~23 |
| NOT A BUG / Informational | ~10 |

---

## CLT-51A — February 17, 2026
**Scope:** OB-51 dark theme, design system, admin dashboard
**Document:** CLT51A_FINDINGS_AND_MEASURE_INVENTORY.md

### Systemic Issues

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT51A-F2 | Font too small / low contrast throughout | P0 | 🔄 PARTIALLY | OB-97 improved readability. Some surfaces still affected. |
| CLT51A-F21 | Sidebar rail text too small and dull | P0 | 🔄 PARTIALLY | OB-97 improved. Still noted in CLT-100. |
| CLT51A-F22 | Language selector not enforced for Admin | P1 | ❌ OPEN | Standing Rule exists but not consistently enforced. |
| CLT51A-F28 | Dashboard mislabeled as "Operate" | P1 | ✅ FIXED | OB-97 workspace restructure. |
| CLT51A-F29 | Overview = Performance Dashboard (duplicate) | P1 | ✅ FIXED | OB-97 eliminated duplicate routes. |
| CLT51A-F42 | Cognitive fit violations — duplicate chart types | P2 | ❌ OPEN | Design debt. |
| CLT51A-F45 | Navigation overcomplicated — 12+ items for rep | P1 | ❌ OPEN | Requires Nav IA redesign (S1). |
| CLT51A-F46 | Single-child menu sections require expand click | P1 | ❌ OPEN | UX rule defined but not implemented. |
| CLT51A-F47 | Dead-end pages in navigation | P1 | ❌ OPEN | 36 stubs per CLT-72A inventory. |

### Data/Wiring Gaps

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT51A-F6 | AI metrics not expanded in Observatory | P1 | 🔄 PARTIALLY | OB-86 built signal capture. Display still incomplete. |
| CLT51A-F8 | Infrastructure tab static | P2 | ❌ OPEN | |
| CLT51A-F16 | Ingestion tab zeros despite active tenants | P1 | ✅ FIXED | HF-067 fixed Observatory data truth. |
| CLT51A-F30 | Rep shows "No Outcome" despite admin showing data | P1 | ❌ OPEN | Entity-to-user mapping gap. |
| CLT51A-F33 | 308 requests / 19.5 min finish time | P1 | 📌 PDR-04 | N+1 pattern. Reassessed CLT-113: acceptable in dev. |
| CLT51A-F38 | Statements page empty | P1 | ❌ OPEN | Value prop: "Every calculation is auditable." |
| CLT51A-F39 | Transactions page empty | P1 | ❌ OPEN | Value prop: "Full transparency into every transaction." |
| CLT51A-F40 | Team Performance empty | P1 | ❌ OPEN | Value prop: "Managers gain immediate visibility." |

---

## CLT-72 — February 21, 2026
**Scope:** OB-67 through OB-72 browser walkthrough (Óptica, RetailCDMX, VD)
**Document:** SESSION_HANDOFF_20260221.md (Section 5)

### Critical

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT72-F38 | RetailCDMX phantom AI data — $58K with 0 DB results | P0 | ✅ FIXED | OB-73 Mission 1: AI safety gate. |
| CLT72-F52 | Import committed 119K records with 5 unresolved mappings | P0 | ❌ OPEN | Relates to CLT102-F52 (field mapper as gate). Decision 51. |
| CLT72-F56 | All entities MX$0 but summary shows MX$157,139 | P0 | ✅ FIXED | OB-73 Mission 4. |
| CLT72-F63 | $0 batch advanced to Official without gate | P0 | ✅ FIXED | OB-73 Mission 4: lifecycle validation gate. |
| CLT72-F68 | Reconciliation crash — .trim() on undefined | P0 | ✅ FIXED | OB-73 Mission 5: null guards. |

### High

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT72-F14 | Landing page is "Govern" not Operate | P1 | ✅ FIXED | OB-73 + OB-97. |
| CLT72-F16 | Markdown not rendered in AI panels | P1 | ✅ FIXED | OB-73 Mission 5. |
| CLT72-F17 | Assessment title not contextual to persona | P1 | ✅ FIXED | OB-73 Mission 6. |
| CLT72-F18 | "Upgrade Required" trial modal for demo | P1 | ✅ FIXED | OB-73 Mission 3. |
| CLT72-F20 | "Post Results" purple gradient looks like marketing | P1 | ⏭️ DEFERRED | UI polish. |
| CLT72-F21 | Every entity shows identical -9.1% variance | P1 | ⏭️ DEFERRED | Data quality — flat budget multiplier. |
| CLT72-F22 | Workspace labels in Spanish for admin | P1 | ✅ FIXED | OB-97. |
| CLT72-F25 | Console: variants undefined in rule set load | P1 | ❌ OPEN | |
| CLT72-F26 | Console: configuration.variants is undefined | P1 | ❌ OPEN | |
| CLT72-F27 | Duplicate import paths (3 → 1) | P1 | ❌ OPEN | Import UX consolidation (S3/S16). |
| CLT72-F29 | Standard Import purpose unclear | P1 | ❌ OPEN | |
| CLT72-F30 | Data Templates → Config Center no context | P1 | ❌ OPEN | |
| CLT72-F31 | New Adjustment button doesn't fire | P1 | ✅ FIXED | OB-73 Mission 5. |
| CLT72-F32 | Approve/Reject buttons don't fire | P1 | ✅ FIXED | OB-73 Mission 5. |
| CLT72-F33 | .trim() on undefined throughout | P1 | ✅ FIXED | OB-73 Mission 5. |
| CLT72-F34 | Adjustment data authenticity unclear | P2 | ⏭️ DEFERRED | |
| CLT72-F35 | Two separate Reconciliation UIs | P1 | ❌ OPEN | Standing Rule 24. |
| CLT72-F36 | Plan Validation under Forensics | P2 | ❌ OPEN | |
| CLT72-F37 | Disputes > Resolution History loops | P2 | ❌ OPEN | |
| CLT72-F39 | RetailCDMX Operate stuck on loading | P1 | 🗑️ SUPERSEDED | RetailCDMX hidden. |
| CLT72-F40 | Toggle pills on import cards — no values | P1 | ❌ OPEN | Same as CLT102-F30. |
| CLT72-F41 | 50% confidence hardcoded | P1 | ✅ FIXED | **OB-114 Phase 1. PDR-08 RESOLVED.** |
| CLT72-F44 | Import shows classification for committed data | P1 | ❌ OPEN | |
| CLT72-F46 | Console: "inline base fields fallback" | P2 | ❌ OPEN | |
| CLT72-F48 | Period detector year misinterpretation | P1 | ❌ OPEN | Relates to CLT102-F10. |
| CLT72-F50 | Console: targetFields empty | P2 | ❌ OPEN | |
| CLT72-F54 | 88% Data Quality — no drill-down | P1 | ❌ OPEN | |
| CLT72-F60 | Entity IDs show UUIDs not names | P1 | ✅ FIXED | OB-85 R3. |
| CLT72-F67 | Batch selector shows raw UUID | P1 | ❌ OPEN | S19. |
| CLT72-F70 | Reconciliation batch selector raw UUID | P1 | ❌ OPEN | Same as F-67. |
| CLT72-F71 | Persona switcher doesn't persist | P0 | ✅ FIXED | OB-73 Mission 2. |

---

## CLT-84/85 — February 23, 2026
**Scope:** Post OB-85 R3 pipeline proof, calculation accuracy, import UX
**Document:** SESSION_HANDOFF_20260223.md

### CLT-84 (49 findings — key items)

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT84-F10 | N+1 query pattern (5,928 requests) | P1 | 📌 PDR-04 | Reassessed CLT-113: dev-mode doubling. |
| CLT84-F20 | Navigation IA mixes metaphors | P1 | ❌ OPEN | Design session (S1). |
| CLT84-F25 | Demo persona switcher missing | P1 | ✅ FIXED | Restored. |
| CLT84-F40 | Import UX confidence unclear | P1 | ✅ FIXED | OB-114 — adapter root cause. |
| CLT84-F41 | Unmapped fields appear lost | P1 | ❌ OPEN | Carry Everything principle. Decision 51. |
| CLT84-F46 | Plan × Data × Period not user-controllable | P0 | 🔄 PARTIALLY | OB-85 added period selector. Batch + plan selection still missing. |

### CLT-85 (10 findings)

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT85-F50 | Import missing period info | P1 | ❌ OPEN | |
| CLT85-F51 | No period handling options | P2 | ❌ OPEN | |
| CLT85-F52 | Old seed batch alongside fresh import | P2 | ❌ OPEN | |
| CLT85-F53 | "Batch" terminology is jargon | P2 | ❌ OPEN | |
| CLT85-F54 | 719 entities all MX$0 | P0 | ✅ FIXED | OB-85 R3. |
| CLT85-F55 | UUIDs in Employee ID | P1 | ✅ FIXED | OB-85 R3. |
| CLT85-F56 | Name column shows UUID | P1 | ✅ FIXED | OB-85 R3. |
| CLT85-F57 | Components column empty | P1 | ❌ OPEN | |
| CLT85-F58 | Zero-payout advances lifecycle | P2 | ❌ OPEN | |
| CLT85-F59 | Period ribbon nearly unreadable | P1 | ❌ OPEN | |

---

## CLT-98/99/100 — February 25-26, 2026
**Scope:** Financial module walkthrough (Sabor Grupo)

### Financial Module

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT98-F1 | 860 requests on Network Pulse | P0 | ✅ FIXED | OB-99 API route. |
| CLT98-F2 | Brand cards not as section headers | P1 | 📌 PDR-06 | Fixed OB-100. Needs CLT verification. |
| CLT98-F3 | Currency shows cents on large amounts | P1 | 📌 PDR-01 | Recurring — 3+ cycles. |
| CLT98-F4 | Amber threshold too wide (±10%) | P1 | 📌 PDR-07 | Changed to ±5% OB-100. Needs CLT verification. |
| CLT98-F5 | Revenue Timeline doesn't load | P0 | ✅ FIXED | OB-99. |
| CLT98-F6 | Staff Leaderboard empty | P0 | ✅ FIXED | OB-99. |
| CLT98-F7 | Operate ICM-flavored for Financial | P1 | ✅ FIXED | **OB-115 Phase 3. PDR-02 RESOLVED.** |
| CLT98-F8 | Persona doesn't filter Financial | P1 | 📌 PDR-05 | Open. |
| CLT98-F9 | Rep persona N/A for Financial | P1 | ❌ OPEN | Server needs own view. |
| CLT98-F10 | Product Mix: 1,409 requests | P0 | ✅ FIXED | OB-99. |

---

## CLT-102 — February 27, 2026
**Scope:** HF-067/068/069/070 + OB-106 + Caribe Financial walkthrough
**Document:** CLT-102_FINDINGS.md
**Key stat:** 52 findings, 22 P0. "The engine works. The import pipeline is the critical path."

### P0 — Import Pipeline Architecture

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT102-F3 | Single Plan ID for 4 imported plans | P0 | ❌ OPEN | |
| CLT102-F7 | "View Plans" → dead dashboard | P0 | ❌ OPEN | |
| CLT102-F10 | Period detection on HireDate (22 periods) | P0 | ❌ OPEN | Decision 52: suppress for roster. |
| CLT102-F12 | Validation requires plan metrics on roster | P0 | ❌ OPEN | |
| CLT102-F16 | Roster auto-selects single plan | P0 | ❌ OPEN | |
| CLT102-F17 | No multi-plan selection | P0 | ❌ OPEN | |
| CLT102-F18 | Validation errors ref wrong plan | P0 | ❌ OPEN | |
| CLT102-F21 | 22 erroneous periods committed | P0 | ❌ OPEN | Decision 52. |
| CLT102-F22 | No period suppression for roster | P0 | ❌ OPEN | Decision 52. |
| CLT102-F23 | Erroneous periods pollute selector | P0 | ❌ OPEN | |
| CLT102-F26 | 7 files → 1 sheet in Analysis | P0 | 🔄 PARTIALLY | OB-111 fixed parsing. Display still Frankenstein. |
| CLT102-F27 | Transaction misclassified as roster | P0 | ❌ OPEN | |
| CLT102-F28 | Single plan locked across all files | P0 | ❌ OPEN | Decision 53: per-file plan routing. |
| CLT102-F32 | 48×3 doesn't match any file | P0 | ❌ OPEN | |
| CLT102-F33 | Both metrics → Quantity | P0 | ✅ FIXED | **OB-110 — taxonomy: count_growth + count_reduction.** |
| CLT102-F38 | Deposit locked to Mortgage plan | P0 | ❌ OPEN | Per-file plan assignment. |
| CLT102-F40 | Data Preview truncates columns | P0 | ❌ OPEN | |
| CLT102-F47 | "% confidence" literal text | P0 | ✅ FIXED | **OB-114 Phase 1 — adapter root cause.** |
| CLT102-F48 | Insurance force-matched to Mortgage | P0 | ❌ OPEN | Per-file plan assignment. |
| CLT102-F49 | 4/9 fields Unresolved | P0 | 🔄 PARTIALLY | OB-110 taxonomy helped. Semantic binding still needed. |
| CLT102-F51 | Target taxonomy too narrow | P0 | ✅ FIXED | **OB-110 — 7 types → 22 types.** |
| CLT102-F52 | Field mapper as gate not enrichment | P0 | ❌ OPEN | Decision 51. |

### P1 — Demo Credibility

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT102-F2 | Operate landing underwhelming | P1 | ❌ OPEN | |
| CLT102-F4 | Plan import triplicate info | P1 | ❌ OPEN | |
| CLT102-F5 | "Next Step" doesn't mention roster | P1 | ❌ OPEN | |
| CLT102-F6 | Periods shown as manual step | P1 | ❌ OPEN | |
| CLT102-F8 | Customer Launch Dashboard dead | P1 | ❌ OPEN | |
| CLT102-F11 | Quality score ignores corrections | P1 | ❌ OPEN | |
| CLT102-F13 | Progress bars lack explanation | P1 | ❌ OPEN | |
| CLT102-F14 | No roster-specific intelligence | P1 | ❌ OPEN | |
| CLT102-F19 | Classification → validation gap | P1 | ❌ OPEN | |
| CLT102-F24 | "What's Next" wrong for roster | P1 | ❌ OPEN | |
| CLT102-F29 | 50% confidence hardcoded | P1 | ✅ FIXED | **OB-114 Phase 1.** |
| CLT102-F30 | Fluorescent green pill | P1 | ❌ OPEN | |
| CLT102-F31 | 0 relationships across files | P1 | ❌ OPEN | |
| CLT102-F34 | Taxonomy too coarse for direction | P1 | ✅ FIXED | **OB-110 — count_growth vs count_reduction.** |
| CLT102-F35 | SnapshotDate as serial number | P1 | ❌ OPEN | |
| CLT102-F36 | SnapshotPeriod as serial number | P1 | ❌ OPEN | |
| CLT102-F37 | Validation refs Óptica logic | P1 | ❌ OPEN | |
| CLT102-F41 | Currency column → Amount | P1 | ✅ FIXED | **OB-110 — currency_code type.** |
| CLT102-F42 | Data Preview 1 row at a time | P1 | ❌ OPEN | |
| CLT102-F43 | 74% Quality identical all files | P1 | ✅ FIXED | **OB-114 — adapter root cause.** |
| CLT102-F44 | Multi-file queue wrong plan | P1 | ❌ OPEN | Per-file plan assignment. |
| CLT102-F50 | Boolean fields → numeric types | P1 | ✅ FIXED | **OB-110 — boolean_flag type.** |

### P2 — Performance

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT102-F9 | 248 requests, 11.4 min | P2 | 🔄 REASSESSED | PDR-04 — dev-mode doubling. |
| CLT102-F15 | 346 requests, 18.7 min | P2 | 🔄 REASSESSED | Same. |
| CLT102-F20 | 358 requests, 25.6 min | P2 | 🔄 REASSESSED | Same. |
| CLT102-F25 | 373 requests, 29.3 min | P2 | 🔄 REASSESSED | Same. |
| CLT102-F39 | 396 requests, 38.7 min | P2 | 🔄 REASSESSED | Same. |
| CLT102-F45 | 12/25 entities matched — no info | P2 | ❌ OPEN | |
| CLT102-F46 | 411 requests cumulative | P2 | 🔄 REASSESSED | Same. |

---

## CLT-109 — February 27, 2026
**Scope:** alpha.1.0 verification across 4 tenants post OB-107/108/109
**Document:** CLT-109_FINDINGS_R1.md
**Findings:** 25 (10 P0, 10 P1, 5 P2)

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT109-F1 | Sabor landing shows ICM content for Financial tenant | P0 | ✅ FIXED | **OB-115 Phase 3. PDR-02 RESOLVED.** |
| CLT109-F7 | Caribe shows wrong plan count (5 not 4) | P1 | ✅ FIXED | **OB-114 Phase 5.** |
| CLT109-F8 | Every tenant shows misleading landing | P0 | ✅ FIXED | **OB-115 Phase 3.** |
| CLT109-F10 | CFG Insurance Referral pre-selected on unrelated data | P1 | ✅ FIXED | **OB-114 Phase 2.** |
| CLT109-F11 | Period in header irrelevant during import | P1 | ❌ OPEN | |
| CLT109-F14 | Import treats user as operator not customer | P1 | ❌ OPEN | |
| CLT109-F15 | 7 CSVs → 1 "Sheet1" with wrong dimensions | P0 | 🔄 PARTIALLY | OB-111 fixed parsing. Display still duplicated. |
| CLT109-F17 | Transaction files misclassified as roster | P0 | ❌ OPEN | |
| CLT109-F20 | Hardcoded 50% confidence on all sheets | P0 | ✅ FIXED | **OB-114 Phase 1. PDR-08 RESOLVED.** |
| CLT109-F21 | OfficerName → Role/Position at 85% | P0 | ✅ FIXED | **OB-110 → Entity Name 100%.** |
| CLT109-F22 | Currency ("MXN") → Amount at 100% | P0 | ✅ FIXED | **OB-110 → Currency Code 80% with calibration warning.** |
| CLT109-F23 | NewAccountsOpened → Quantity (same as AccountsClosed) | P0 | ✅ FIXED | **OB-110 → Growth Count 95%.** |

---

## CLT-111 — February 27, 2026
**Scope:** alpha.2.0 verification (OB-110, OB-111, HF-076)
**Document:** CLT-111_FINDINGS_R1.md
**Findings:** 51 (16 P0, 22 P1, 5 P2, 5 PASS, 3 SYSTEMIC)

### Landing & Routing

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT111-F1 | Sabor lands on import, not /financial | P0 | ✅ FIXED | **OB-115 Phase 3. PDR-02 RESOLVED.** |
| CLT111-F2 | MBC lands on import — wrong first experience | P0 | ℹ️ NOT A BUG | CLT-113 T-03: routing correct for new tenant. |

### Multi-File Import

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT111-F3 | 7 cards duplicated + phantom 8th "Sheet1" | P0 | 🔄 PARTIALLY | OB-112 fixed completion. Sheet Analysis still Frankenstein. |
| CLT111-F4 | 50% confidence identical all 7 | P0 | ✅ FIXED | **OB-114 Phase 1. PDR-08 RESOLVED.** |
| CLT111-F5 | Transaction files misclassified as roster | P0 | ❌ OPEN | Sheet classification prompt unchanged. |
| CLT111-F6 | Phantom "Sheet1" — system invented a file | P0 | 🔄 PARTIALLY | Legacy path + OB-111 path coexist. |
| CLT111-F7 | Two representations with different confidence | P1 | ✅ FIXED | OB-114 fixed confidence source. |
| CLT111-F8 | Global plan selector, not per-file | P1 | ❌ OPEN | Per-file plan assignment needed. |
| CLT111-F9 | 5 plans instead of 4 | P1 | ✅ FIXED | **OB-114 Phase 5.** |
| CLT111-F10 | Period prominent in header during import | P1 | ❌ OPEN | |

### Field Mapping

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT111-F12 | 4 of 5 CLT-109 mapping failures fixed | ✅ | ✅ FIXED | OB-110 taxonomy + sample values. |
| CLT111-F13 | Currency calibration warning working | ✅ | ✅ FIXED | OB-110. |
| CLT111-F14 | Data Preview shows 5 rows all columns | ✅ | ✅ FIXED | Pre-existing. |
| CLT111-F15 | "Sheet1" label instead of filename | P1 | ✅ FIXED | **OB-115 Phase 1 — resolveDataType().** |
| CLT111-F16 | Locked to wrong plan — Insurance on deposit data | P1 | ✅ FIXED | **OB-114 Phase 2 — active filter + order.** |
| CLT111-F17 | Validation refs Óptica logic on banking data | P1 | ❌ OPEN | Domain-agnostic validation needed. |
| CLT111-F18 | 743 requests on Field Mapping | P2 | 🔄 REASSESSED | PDR-04 — dev-mode doubling. |
| **CLT111-F19** | **SYSTEMIC: Platform vocabulary replaces customer vocabulary** | **P0** | ❌ OPEN | Decision 64 scope. Every column name erased. |
| **CLT111-F20** | **SYSTEMIC: Type classification without semantic context** | **P0** | ❌ OPEN | Decision 64. 5 "Date" columns, 5 purposes. |
| **CLT111-F21** | **SYSTEMIC: Type ≠ Comprehension** | **P0** | ❌ OPEN | Decision 64. WHAT vs WHY vs HOW gap. |

### Validate & Preview

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT111-F22 | Validate page useless and incorrect | P0 | ❌ OPEN | Bloodwork Principle violation. PDR-09. |
| CLT111-F23 | Detected Periods correct (4 monthly) | ✅ | ✅ FIXED | Working. |
| CLT111-F24 | 0% entity match — no roster context | P1 | ❌ OPEN | |
| CLT111-F25 | Calc Preview premature, wrong plan | P1 | ✅ FIXED | **OB-114 Phase 6 — fake preview removed.** |
| CLT111-F26 | "Create Periods" for auto-detected data | P1 | ❌ OPEN | Should auto-create at 100%. |
| CLT111-F27 | Period detection may create duplicates | P1 | ❌ OPEN | |

### Approve & Commit

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT111-F28 | Approve page — noise not decision support | P0 | 🔄 PARTIALLY | OB-114 fixed plan count. Still noisy. |
| CLT111-F29 | Three representations of 7 files | P1 | ❌ OPEN | |
| CLT111-F30 | "1/6 required fields" — wrong plan | P1 | 🔄 PARTIALLY | OB-114 better default. Still single-plan evaluation. |
| CLT111-F31 | No commit button in viewport | P1 | ❌ OPEN | |
| CLT111-F32 | Single import ID for 7 files | P0 | ❌ OPEN | Per-file audit trail. |
| CLT111-F33 | 107 entities instead of 25 | P0 | ❌ OPEN | Cross-file dedup gap. |
| CLT111-F34 | 28 periods instead of 4 | P0 | ❌ OPEN | Existing period check. |
| CLT111-F35 | 43% Data Quality carries to completion | P1 | ❌ OPEN | |
| CLT111-F36 | "What's Next" not contextual | P1 | ❌ OPEN | |
| CLT111-F37 | 833 requests cumulative | P2 | 🔄 REASSESSED | PDR-04. |

### Calculation

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT111-F38 | Conflicting period contexts | P1 | ❌ OPEN | |
| CLT111-F39 | Calculate All — no individual selection | P1 | ❌ OPEN | |
| CLT111-F40 | 5 plans listed instead of 4 | P1 | ✅ FIXED | **OB-114 Phase 5.** |
| CLT111-F41 | Empty state suggests upload, not calc | P0 | ❌ OPEN | |
| CLT111-F42 | 954 requests on Calculate page | P2 | 🔄 REASSESSED | PDR-04. |
| CLT111-F43 | Calc fails — no entity rule set assignments | P0 | ❌ OPEN | **OB-123 scope.** |
| CLT111-F44 | Error as browser alert() | P1 | ❌ OPEN | |
| CLT111-F45 | $0.00 all entities | P0 | 🔄 PARTIALLY | **OB-116/117/118: 3 of 4 plans now non-zero for MBC.** |
| CLT111-F46 | Only Mortgage visible, 4 others missing | P1 | ❌ OPEN | |
| CLT111-F47 | No diagnostic info for $0 result | P0 | ❌ OPEN | |
| CLT111-F48 | Mark Official enabled on $0 results | P1 | ❌ OPEN | |
| CLT111-F49 | Two "Preview" indicators | P1 | ❌ OPEN | |
| CLT111-F50 | 1,026 requests on results | P2 | 🔄 REASSESSED | PDR-04. |
| CLT111-F51 | "Review Field Mappings" → dead end | P0 | ❌ OPEN | Terminal dead end. |

---

## CLT-112 — February 28, 2026
**Scope:** alpha.3.0 verification (OB-110 through OB-113), Sabor + MBC tenants
**Findings:** 40

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT112-F1 | Sabor lands on /data/import/enhanced | P0 | ✅ FIXED | **OB-115 Phase 3. PDR-02 RESOLVED.** |
| CLT112-F2 | "Enero 2024" period in header during import | P1 | ❌ OPEN | |
| CLT112-F3 | ICM plan name for Financial tenant | P1 | ✅ FIXED | OB-115 + OB-114 active filter. |
| CLT112-F4 | 174 requests, 39.63s blank import | P2 | 🔄 REASSESSED | PDR-04. Dev-mode doubling. |
| CLT112-F5 | "AI-Powered" badge unexplained | P2 | ❌ OPEN | |
| CLT112-F6 | MBC lands on /admin/launch/calculate | P1 | ℹ️ NOT A BUG | CLT-113 T-03. |
| CLT112-F7 | "March 2024" period pre-selected | P1 | ❌ OPEN | |
| CLT112-F8 | 5 plans instead of 4 | P0 | ✅ FIXED | **OB-114 Phase 5.** |
| CLT112-F9 | "Calculate All 5 Plans" wrong count | P0 | ✅ FIXED | Resolved by F-8. |
| CLT112-F10 | "No batch" contradicts "Recent: 1" | P1 | ❌ OPEN | |
| CLT112-F11 | 389 requests | P2 | 🔄 REASSESSED | PDR-04. |
| CLT112-F12 | "Period Close: March 2024" on first login | P1 | ❌ OPEN | |
| CLT112-F13 | 50% confidence all 7 cards | P0 | ✅ FIXED | **OB-114 Phase 1. PDR-08 RESOLVED.** |
| CLT112-F14 | "CFG Insurance Referral" for deposit data | P0 | ✅ FIXED | **OB-114 Phase 2.** |
| CLT112-F15 | "5 active plans" in selector | P0 | ✅ FIXED | **OB-114 Phase 5.** |
| CLT112-F16 | Global plan selector for 7 files | P0 | ❌ OPEN | Per-file plan assignment. |
| CLT112-F17 | "0 relationships detected" | P1 | ❌ OPEN | |
| CLT112-F18 | All files "Component Data" only | P1 | ❌ OPEN | |
| CLT112-F19 | 447 requests | P2 | 🔄 REASSESSED | PDR-04. |
| CLT112-F20 | "March 2024" in header during import | P1 | ❌ OPEN | |
| CLT112-F21 | "Sheet1" label instead of filename | P1 | ✅ FIXED | **OB-115 Phase 1.** |
| CLT112-F22 | TotalDepositBalance → "Amount" lossy | P1 | ❌ OPEN | Decision 64. |
| CLT112-F23 | SnapshotDate → "Date" generic | P1 | ❌ OPEN | Decision 64. |
| CLT112-F24 | Branch → "Store ID" wrong domain | P1 | ❌ OPEN | Decision 64. |
| CLT112-F25 | Validation warns "$0 for components" | P1 | 🔄 PARTIALLY | OB-114 fixed plan context. |
| CLT112-F26 | Warnings ref wrong plan components | P1 | ✅ FIXED | OB-114 active filter. |
| CLT112-F27 | 448 requests | P2 | 🔄 REASSESSED | PDR-04. |
| CLT112-F28 | Calc Preview $0.00 all entities | P0 | ✅ FIXED | **OB-114 Phase 6 — fake removed.** |
| CLT112-F29 | Calc Preview against wrong plan | P0 | ✅ FIXED | Resolved by F-28. |
| CLT112-F30 | "Required fields" against wrong plan | P1 | 🔄 PARTIALLY | Better default, still single-plan. |
| CLT112-F31 | "1/6 required" on 6 of 7 files | P1 | 🔄 PARTIALLY | Same. |
| CLT112-F32 | "[filename] Sheet1" labeling | P1 | ✅ FIXED | **OB-115 Phase 1.** |
| CLT112-F33 | "fields" and warning badges unclear | P1 | ❌ OPEN | |
| CLT112-F34 | "Create Periods" for auto-detected | P1 | ❌ OPEN | |
| CLT112-F35 | Cross-Sheet "0% match, 0 in roster" | P1 | ❌ OPEN | |
| CLT112-F36 | Store validation placeholder | P2 | ❌ OPEN | |
| CLT112-F37 | "Not in roster" for valid IDs | P1 | ❌ OPEN | |
| CLT112-F38 | December only 23 records | P2 | ❌ OPEN | |
| CLT112-F39 | 458 requests | P2 | 🔄 REASSESSED | PDR-04. |
| CLT112-F40 | Approve page unchanged | P0 | 🔄 PARTIALLY | OB-114 fixed plan count. |

---

## CLT-113 — February 28, 2026
**Scope:** System-Verified Acceptance Test — pure diagnostic, zero code changes
**Methodology:** Traced every problem from UI to exact source file:line. This is the breakthrough methodology (Decision 65).
**Findings:** 21 (Truth Report format)

| ID | Finding | Root Cause | Status | Resolution |
|----|---------|-----------|--------|------------|
| CLT113-T01 | Sabor routes to import | session-context counts archived | ✅ FIXED | OB-115 Phase 3 |
| CLT113-T02 | ruleSetCount includes archived | session-context.tsx:84 | ✅ FIXED | OB-114 Phase 3 |
| CLT113-T03 | MBC routing correct | Not a bug | ℹ️ N/A | |
| CLT113-T04 | 50% confidence everywhere | anthropic-adapter.ts:630 | ✅ FIXED | OB-114 Phase 1 |
| CLT113-T05 | Per-sheet "AI" confidence text | page.tsx:2556 fallback | ❌ OPEN | |
| CLT113-T06 | OB-113 fixed labels not source | Documented gap | ℹ️ N/A | Informational |
| CLT113-T07 | Wrong plan selected by default | activePlans[0] unordered | ✅ FIXED | OB-114 Phase 2 |
| CLT113-T08 | 5 active plans instead of 4 | Duplicate insurance referral | ✅ FIXED | OB-114 Phase 5 |
| CLT113-T09 | getRuleSets no filter, no ORDER | rule-set-service.ts:106 | ✅ FIXED | OB-114 Phase 2 |
| CLT113-T10 | Calc Preview Math.random | page.tsx:1986 | ✅ FIXED | OB-114 Phase 6 |
| CLT113-T11 | "Data Quality" label | page.tsx:4381 | ✅ FIXED | OB-114 Phase 4 |
| CLT113-T12 | 12/15 validate metrics real | Post-OB-113 | ℹ️ N/A | Informational |
| CLT113-T13 | MBC calculation $0.00 | run-calculation.ts:63 | 🔄 PARTIALLY | **OB-116/117/118: 3 of 4 plans non-zero ($7.4M). Deposit Growth $0 — F-65 root cause.** |
| CLT113-T14 | input_bindings NULL all rule sets | Plan import sets {} | 🔄 PARTIALLY | OB-115: 2 of 4 populated. OB-123 convergence addresses rest. |
| CLT113-T15 | CSV data_type "Sheet1" | import/commit XLSX.js name | ✅ FIXED | OB-115 Phase 1 |
| CLT113-T16 | findMatchingSheet can't match | Depends on T-15 | ✅ FIXED | Resolved by T-15 |
| CLT113-T17 | Óptica works via domain patterns | metric-resolver.ts regex | 🗑️ SUPERSEDED | OB-122 removed SHEET_COMPONENT_PATTERNS. |
| CLT113-T18 | Component 0.002 but total 0.0 | Rounding/write issue | ✅ FIXED | **OB-117 — rate detection heuristic. $0.18 → $985,410.** |
| CLT113-T19 | ~20-25 requests fresh load | Context providers | ℹ️ N/A | Acceptable |
| CLT113-T20 | React Strict Mode doubles | Standard React 18 dev | ℹ️ N/A | Not a bug |
| CLT113-T21 | getRuleSets fetches all, client filters | rule-set-service.ts:106 | ✅ FIXED | OB-114 Phase 2 |

---

## CLT-118 — March 1, 2026
**Scope:** Post OB-114→118 browser verification + clean pipeline test
**Findings:** 9

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT118-F1 | Tenant admin gets "Access Restricted" | P0 | ❌ OPEN | Profile/role/tenant assignment issue. |
| CLT118-F2 | VL Admin lands on Calculate, not dashboard | P1 | ❌ OPEN | |
| CLT118-F3 | Plan pills not interactive | P1 | ❌ OPEN | |
| CLT118-F4 | MX$38,550 total — appears single plan/period | P1 | ❌ OPEN | Grand total should be ~$7.4M. |
| CLT118-F5 | 225 requests on tenant admin login | P2 | 🔄 REASSESSED | PDR-04. |
| CLT118-F6 | 396 requests on VL Admin Calculate | P2 | 🔄 REASSESSED | PDR-04. |
| CLT118-F7 | Deposit Growth $0 — platform failure not data gap | P0 | ❌ OPEN | **Root cause: CLT122-F65 (multi-tab XLSX Tab 1 only).** |
| CLT118-F8 | Insurance Referral payouts correct in browser | ✅ | ✅ VERIFIED | OB-118 metric derivation confirmed. |
| CLT118-F9 | 4 active plans displayed (not 5) | ✅ | ✅ VERIFIED | OB-114 Phase 5. |

---

## CLT-122 — February 28, 2026
**Scope:** Fresh tenant walkthrough — Latin American Bank (newly provisioned via HF-080)
**Test:** tenant creation → roster import → 7 CSV imports → 4 plan imports → calculate
**Result:** BLOCKED. 1 of 4 plans visible, 0 entities assigned, 0 calculation results.
**Key insight:** Plan intelligence works (92-100%). Engine proven ($1,253,832). Nothing connects them.
**Findings:** 82 (10 P0, 32 P1, 22 P2, 18 POSITIVE)

### Tenant Provisioning

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F1 | Caribe admin access restricted | P1 | ❌ OPEN | Auth workstream. |
| CLT122-F2 | Auth login bypassed in incognito | P1 | ❌ OPEN | HF-059/061 territory. |
| CLT122-F3 | Calculate page shows single plan not aggregate | P2 | ❌ OPEN | |
| CLT122-F4 | Create New Tenant button non-responsive | P1 | ✅ FIXED | **HF-080 PR#138.** |
| CLT122-F5 | Profile creation: scope_level column missing | P1 | ❌ OPEN | Auth workstream. |
| CLT122-F6 | Deposit Growth $0 — Tab 2 never imported | P0 | ❌ OPEN | Root cause: F-65. |
| CLT122-F7 | Agent module selections name-only | P2 | ❌ OPEN | S42. |

### New Tenant Landing

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F8 | Lands on Data Import, no onboarding | P1 | ❌ OPEN | |
| CLT122-F9 | No contextual guidance for new users | P1 | ❌ OPEN | |
| CLT122-F10 | Header says "Excel workbooks" but supports csv/txt | P2 | ❌ OPEN | |

### Data Import — Sheet Analysis

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F11 | AI confidence 0% across all 7 files | P1 | ❌ OPEN | **PDR-10.** Systemic — actual 0% from AI (not hardcoded). |
| CLT122-F12 | All files "Component Data" — no differentiation | P1 | ❌ OPEN | Repeat CLT112-F18. |
| CLT122-F13 | 0 relationships detected across 7 files | P1 | ❌ OPEN | |
| CLT122-F14 | Deposit/Defaults misclassified | P1 | ❌ OPEN | |
| CLT122-F15 | No guidance: import plans before data | P1 | ❌ OPEN | |

### Data Import — Field Mapping

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F16 | "Sheet1" label for CSVs | P2 | ❌ OPEN | Repeat CLT112-F21. |
| CLT122-F17 | Branch → "Store ID" — wrong domain | P1 | ❌ OPEN | Repeat CLT112-F24. |
| CLT122-F18 | TotalDepositBalance → "Amount" — lossy | P1 | ❌ OPEN | Repeat CLT112-F22. |
| CLT122-F19 | SnapshotDate → generic "Date" | P1 | ❌ OPEN | Repeat CLT112-F23. |
| CLT122-F20 | AccountsClosed → "Reduction Count" | P3 | ✅ POSITIVE | OB-110 taxonomy. |
| CLT122-F21 | NewAccountsOpened → "Growth Count" | P3 | ✅ POSITIVE | OB-110 taxonomy. |
| CLT122-F22 | Currency "Review 80%" uniform detection | P3 | ✅ POSITIVE | OB-110 calibration. |
| CLT122-F23 | Roster warning on non-roster sheet | P1 | ❌ OPEN | |
| CLT122-F24 | Data imported before plans — no plan context | P1 | ❌ OPEN | |
| CLT122-F25 | OfficerID "Review 75%" — 5-row sample bias | P2 | ❌ OPEN | |
| CLT122-F26 | ProspectName → "Reference ID" — wrong | P1 | ❌ OPEN | |
| CLT122-F27 | **Qualified + PolicyIssued unmapped** | **P0** | ❌ OPEN | Boolean fields not in taxonomy. |
| CLT122-F28 | Branch → "Store ID" (repeat F-17) | P1 | ❌ OPEN | |
| CLT122-F29 | ReferralID → "Transaction ID" | P3 | ✅ POSITIVE | |
| CLT122-F30 | ProductCode/ProductName correct | P3 | ✅ POSITIVE | |
| CLT122-F31 | Roster warning repeat (F-23) | P1 | ❌ OPEN | |
| CLT122-F32 | "Entity ID" overloaded | P1 | ❌ OPEN | |
| CLT122-F33 | ProductType → "Product Name" | P2 | ❌ OPEN | |
| CLT122-F34 | Term_Months → "Quantity" | P2 | ❌ OPEN | |
| CLT122-F35 | InterestRate → "Rate/Percentage" | P3 | ✅ POSITIVE | |
| CLT122-F36 | LoanAmount → "Amount" — correct but generic | P2 | ❌ OPEN | |
| CLT122-F37 | 5-row sample single officer, false warnings | P2 | ❌ OPEN | |

### Data Import — Validate & Preview

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F38 | 0% aggregate contradicts 85-95% field-level | P1 | ❌ OPEN | |
| CLT122-F39 | Critical fields unmapped: Qualified, PolicyIssued, ProductType, DefaultReason | P0 | ❌ OPEN | |
| CLT122-F40 | Cross-Sheet Validation fails — no roster | P1 | ❌ OPEN | Repeat CLT112-F35. |
| CLT122-F41 | Valid IDs "not in roster" | P1 | ❌ OPEN | Repeat CLT112-F37. |
| CLT122-F42 | Create Periods manual click at 100% | P2 | ❌ OPEN | Repeat CLT112-F34. |
| CLT122-F43 | December 2023 detected — noise? | P2 | ❌ OPEN | |
| CLT122-F44 | No calculation preview before commit | P2 | ❌ OPEN | |
| CLT122-F45 | Validation sections hardcoded, not intelligent | P1 | ❌ OPEN | Lacks IAP. PDR-09. |
| CLT122-F46 | "Store validation" placeholder | P2 | ❌ OPEN | Repeat CLT112-F36. |

### Data Import — Approval

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F47 | "No Active Plan" warning buried at bottom | P1 | ❌ OPEN | |
| CLT122-F48 | Batch Summary duplicates Sheet Breakdown | P2 | ❌ OPEN | |
| CLT122-F49 | 0% confidence shown 9 times | P1 | ❌ OPEN | |
| CLT122-F50 | "Preserved" masks critical unmapped fields | P1 | ❌ OPEN | |
| CLT122-F51 | Approval routing, no approvers configured | P2 | ❌ OPEN | |
| CLT122-F52 | Review buttons redundant | P3 | ❌ OPEN | |

### Roster Import

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F53 | Roster 0% confidence — systemic | P0 | ❌ OPEN | **PDR-10.** |

### Plan Import — POSITIVE FINDINGS

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F54 | Consumer Lending 100%, 3 components, 34/34 | P3 | ✅ POSITIVE | Plan Intelligence working. |
| CLT122-F55 | Worked example MX$5,975 | P3 | ✅ POSITIVE | |
| CLT122-F56 | Plan description accurate | P3 | ✅ POSITIVE | |
| CLT122-F57 | Metric sources correctly identified | P3 | ✅ POSITIVE | |
| CLT122-F58 | Multi-tab XLSX in queue | P0 | ⚠️ WATCH | See F-65. |
| CLT122-F59 | "0 Values Parsed" contradicts worked example | P2 | ❌ OPEN | |
| CLT122-F60 | Effective date defaults to today | P1 | ❌ OPEN | |
| CLT122-F61 | Deposit Growth 95%, tier_lookup correct | P3 | ✅ POSITIVE | |
| CLT122-F62 | Three worked examples spanning tier range | P3 | ✅ POSITIVE | |
| CLT122-F63 | Tier gap anomalies detected — genuine intelligence | P3 | ✅ POSITIVE | |
| CLT122-F64 | Description captures cadence + coordination gate | P3 | ✅ POSITIVE | |
| CLT122-F65 | **Multi-tab XLSX reads only Tab 1** | **P0** | ❌ **OPEN — ROOT CAUSE** | **Tab 2 (25 officer targets) silently lost. Root cause of Deposit Growth $0 across OB-117→122. Decision 72.** |
| CLT122-F66 | Effective date defaults (repeat F-60) | P1 | ❌ OPEN | |
| CLT122-F67 | Mortgage 92%, marginal tiers correct | P3 | ✅ POSITIVE | |
| CLT122-F68 | Period badge during plan import | P2 | ❌ OPEN | |
| CLT122-F69 | "1 Component" insufficient summary | P1 | ❌ OPEN | |
| CLT122-F70 | Plan queue confidence scores | P3 | ✅ POSITIVE | |
| CLT122-F71 | Marginal tier methodology captured | P3 | ✅ POSITIVE | |

### Post-Plan Import

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F72 | After last plan, dropped to blank page | P1 | ❌ OPEN | No summary or next steps. |
| CLT122-F73 | Stale plan context in badge | P2 | ❌ OPEN | |
| CLT122-F74 | No way to review imported plans | P1 | ❌ OPEN | |
| CLT122-F75 | Period badge error persists | P2 | ❌ OPEN | |

### Calculation — THE CORE GAP

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F76 | Only 1 of 4 plans visible | P0 | ❌ OPEN | **OB-123 Phase 2.** |
| CLT122-F77 | No entities assigned to plans | P0 | ❌ OPEN | **OB-123 Phase 3.** |
| CLT122-F78 | Calculate stuck in "Calculating" | P2 | ❌ OPEN | |
| CLT122-F79 | No guidance on assignment | P1 | ❌ OPEN | |
| CLT122-F80 | **Platform does not wire imports → calculable** | **P0** | ❌ **OPEN — CORE GAP** | **OB-123. Decisions 71-74.** |
| CLT122-F81 | No plan management on Calculate page | P0 | ❌ OPEN | **OB-123 Phase 2.** |
| CLT122-F82 | No entity-to-plan assignment UI | P0 | ❌ OPEN | **OB-123 Phase 3.** |

---

## PERSISTENT DEFECT REGISTRY

| PDR # | Source | Description | Status |
|-------|--------|-------------|--------|
| PDR-01 | CLT98-F3 | Currency no cents on large amounts | ❌ OPEN — 3+ cycles |
| PDR-02 | CLT98-F7+ | Financial-only tenant redirect | ✅ **RESOLVED** — OB-115 Phase 3 |
| PDR-03 | Design spec | Bloodwork Financial landing page | ❌ OPEN — never built, 8+ attempts |
| PDR-04 | CLT51A-F33+ | N+1 platform overhead | 🔄 ACCEPTABLE (dev) — CLT-113 reassessed |
| PDR-05 | CLT98-F8 | Persona filtering effectivePersona | ❌ OPEN |
| PDR-06 | CLT98-F2 | Brand cards as section headers | ❌ UNVERIFIED — OB-100 fix needs CLT |
| PDR-07 | CLT98-F4 | Amber threshold ±5% | ❌ UNVERIFIED — OB-100 fix needs CLT |
| PDR-08 | CLT72-F41+ | Hardcoded 50% confidence | ✅ **RESOLVED** — OB-114 Phase 1 |
| PDR-09 | CLT72+ | Validate/Preview page useless | ❌ OPEN — 5 consecutive CLTs |
| **PDR-10** | **CLT122-F11/F53** | **AI field mapping confidence = 0% (actual)** | ❌ **OPEN — systemic across all file types and tenants** |

---

## CROSS-CLT PATTERNS — RECURRING ISSUES

| Pattern | Appearances | Root Cause | Status |
|---------|-------------|------------|--------|
| **No entity assignment mechanism** | CLT111-F43, CLT122-F77/F80/F82 | Import creates entities but never rule_set_assignments. No UI. No auto-assignment. | ❌ OPEN — OB-123 |
| **Multi-tab XLSX Tab 1 only** | CLT122-F65 | Plan import reads first tab, ignores rest. Root cause of Deposit Growth $0. | ❌ OPEN — Decision 72 |
| **Classification ≠ comprehension** | CLT111-F19/F20/F21, CLT112-F22/F23/F24, CLT113-T13/T14, CLT122-F12/F27/F39 | Platform classifies WHAT but not WHY or HOW. 5 "Date" columns, 5 purposes. | ❌ OPEN — Decision 64 |
| **Platform replaces customer vocabulary** | CLT111-F19, CLT112-F22/F23/F24, CLT122-F17/F18/F19 | Field mapper erases original column names. | ❌ OPEN — Decision 64 |
| **Branch → "Store ID" wrong domain** | CLT112-F24, CLT122-F17/F28 | Taxonomy uses retail vocabulary for banking customer. | ❌ OPEN |
| **Validation on missing context** | CLT112-F35/F37, CLT122-F40/F41 | Cross-sheet validation runs against non-existent roster. | ❌ OPEN |
| **Period badge during wrong workflow** | CLT109-F11, CLT111-F10, CLT122-F68/F75 | 4 CLTs. Period selector irrelevant during import. | ❌ OPEN |
| **Import drops to blank page** | CLT122-F72 | After plan import, no summary, no next steps. | ❌ OPEN |
| **Only 1 plan visible on Calculate** | CLT111-F46, CLT122-F76 | Query or display filters out all but one plan. | ❌ OPEN — OB-123 |
| **Hardcoded 50% confidence** | CLT72→CLT112 (5 CLTs) | anthropic-adapter.ts:630 `\|\| 0.5` | ✅ **RESOLVED** — OB-114 |
| **AI confidence = 0% (actual)** | CLT122 (all files, all types) | AI call returns 0 confidence, not hardcoded. | ❌ OPEN — PDR-10 |
| **Fluorescent green pill** | CLT72-F40, CLT84-F40, CLT102-F30 | CSS color value. | ❌ OPEN |
| **N+1 request explosion** | CLT51A→CLT122 (6+ CLTs) | Context providers re-fetch. | 🔄 ACCEPTABLE (dev) — PDR-04 |
| **Field mapper as gate** | CLT72-F52, CLT84-F41, CLT102-F49/F51/F52 | Unmapped columns lost. | ❌ OPEN — Decision 51 |
| **Period detection on wrong dates** | CLT72-F48, CLT102-F10/F21/F22/F23 | Classification doesn't propagate. | ❌ OPEN — Decision 52 |
| **UUID display** | CLT72-F60/F67/F70, CLT85-F55/F56 | Missing display_name joins. | 🔄 PARTIALLY |
| **Single plan context** | CLT84→CLT122 (4+ CLTs) | Import locks to one plan. | 🔄 PARTIALLY — OB-114 fixed order |
| **Navigation dead ends** | CLT51A-F47, CLT72-F29/F30/F37 | 36 stubs. | ❌ OPEN |
| **Statements/Transactions empty** | CLT51A-F38/F39/F40 | Not wired to data. | ❌ OPEN |
| **Entity dedup failure (107 not 25)** | CLT111-F33 | No cross-file dedup. | ❌ OPEN — OB-123 |
| **Period pollution (28 not 4)** | CLT111-F34 | No existing period check. | ❌ OPEN |
| **Plan interpretation strong** | CLT122-F54/F61/F67, CLT118-F8 | 92-100% confidence consistently. | ✅ **POSITIVE PATTERN** |

---

## CC FAILURE PATTERNS (Cross-Reference)

| # | Pattern | Discovery | Mitigation |
|---|---------|-----------|------------|
| 18 | Stale result accumulation | OB-120 | UNIQUE constraint + DELETE before INSERT |
| 19 | Domain vocabulary leak | CC-UAT Architecture Trace | Korean Test enforcement (Decision 66) |
| 20 | SHEET_COMPONENT_PATTERNS dependency | OB-122 | Removed. 15→0 references. |
| 21 | Dual code path | HF-078/079 | Single API route for operations |
| 22 | RLS silent swallow | HF-079 | Service role for writes. Check row count. |

---

## DECISION LOG (Referenced by Findings)

| # | Decision | Key Findings Addressed |
|---|----------|----------------------|
| 51 | Field mapper as enrichment, not gate | CLT72-F52, CLT102-F52 |
| 52 | Period suppression for roster files | CLT102-F10/F21/F22/F23 |
| 53 | Multi-plan routing per file | CLT102-F28/F38/F48, CLT112-F16 |
| 54 | Classification signals read during imports | CLT102 |
| 55 | Confidence computed, not hardcoded | CLT72-F41→CLT112-F13 |
| 64 | Dual Intelligence (convergence layer) | CLT111-F19/F20/F21, CLT113-T13/T14 |
| 65 | CLT diagnostic methodology | CLT-113 breakthrough |
| 66 | Korean Test enforcement | CC-UAT Architecture Trace |
| 70 | AI field mapping confidence = 0 | CLT122-F11/F53 |
| 71 | Wiring Layer architecture | CLT122-F80 |
| 72 | Independent tab classification | CLT122-F65 |
| 73 | Proposal + Confirmation pattern | CLT122-F82 |
| 74 | Unified staging experience | CLT122-F8/F9 |

---

## OB-TO-FINDING RESOLUTION MAP

| OB/HF | PR | Findings Resolved | Key Achievement |
|-------|----|-------------------|-----------------|
| OB-73 | — | CLT72-F38/F56/F63/F68/F71, CLT72-F14/F16/F17/F18/F31/F32/F33 | Safety gates, lifecycle validation |
| OB-85 R3 | — | CLT85-F54/F55/F56, CLT72-F60 | Pipeline proof, UUID→names |
| OB-97 | — | CLT51A-F28/F29, CLT72-F22 | Workspace restructure |
| OB-99 | — | CLT98-F1/F5/F6/F10 | Financial API routes |
| OB-110 | #119 | CLT102-F33/F51, CLT109-F21/F22/F23, CLT102-F34/F41/F50 | Taxonomy 7→22, sample values |
| OB-114 | #125 | CLT72-F41, CLT102-F29/F43/F47, CLT111-F4/F9/F16/F25/F40, CLT112-F8/F9/F13/F14/F15/F28, CLT113-T04/T07/T08/T09/T10/T11 | PDR-08 resolved. Duplicates. |
| OB-115 | #126 | CLT111-F1/F15, CLT112-F1/F21/F32, CLT113-T01/T15/T16 | PDR-02 resolved. data_type. |
| OB-116 | #127 | CLT113-T13 (partial) | Consumer Lending $6.3M |
| OB-117 | #128 | CLT113-T18 | Mortgage $985,410 |
| OB-118 | #129 | CLT113-T13 (further) | Insurance Referral $124,550 |
| OB-122 | #137 | CLT113-T17 | SHEET_COMPONENT_PATTERNS eliminated |
| HF-078 | #135 | — | UNIQUE constraint 409 fix |
| HF-079 | #136 | — | RLS silent DELETE fix |
| HF-080 | #138 | CLT122-F4 | Create New Tenant route fix |
| OB-123 | #139 | CLT122-F76/F77/F80 (targeting) | Wiring API. PG-02→09 unverified. |

---

## PRIORITY TIERS

### Tier 0: Wiring Layer — Import to Calculable State
**OB-123.** Fresh tenant cannot calculate. 82 CLT-122 findings. Decisions 71-74. Wiring API built (PR#139), proof gates unverified.

### Tier 1: Deposit Growth Root Cause
CLT122-F65. Multi-tab XLSX Tab 1 only. Decision 72. Not addressed by OB-123 wiring API.

### Tier 2: AI Confidence Investigation (PDR-10)
AI returns actual 0% confidence on all data imports. Separate from PDR-08 (hardcoded 50%, resolved). Diagnostic OB needed.

### Tier 3: Decision 64 — Classification ≠ Comprehension
11 open findings. Type known, semantic binding missing. Convergence layer needed.

### Tier 4: Import Pipeline UX
~30 open P1 findings. Guidance, vocabulary, validation theater. Needs design rework.

### Tier 5: Persistent Defects (PDR)
PDR-03 (Bloodwork, never built), PDR-05 (persona), PDR-09 (Validate page, 5 CLTs).

### Tier 6: Auth / User Management
CLT122-F1/F2/F5, CLT118-F1. Full workstream.

### Tier 7: UX / Navigation / Polish
~40 open P1 findings. Nav IA redesign (S1) would address many.

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*"323 findings across 10 CLT sessions. One registry. One truth."*
*"Every OB prompt must include this document. The patterns that repeat are the patterns we didn't load."*
*Revision R7 (Consolidated) — February 28, 2026*
