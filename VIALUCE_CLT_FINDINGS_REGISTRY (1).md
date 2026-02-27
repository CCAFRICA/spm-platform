# VIALUCE CLT FINDINGS REGISTRY
## Single Source of Truth — All Browser Findings Across All CLT Sessions
## Revision: R4 — February 27, 2026

### Revision History

| Rev | Date | Changes |
|-----|------|---------|
| R1 | 2026-02-27 | Initial creation. 170+ findings consolidated from CLT-51A, 72, 84, 85, 98/99/100, 102. |
| R2 | 2026-02-27 | OB-107 (PR #115) + HF-071 resolutions applied. 12 P0s fixed, 3 RETEST, 4 PARTIALLY. |
| R3 | 2026-02-27 | HF-072 (PR #116) resolution applied. CLT102-F7, F8 fixed (dead page removed). |
| R4 | 2026-02-27 | OB-108 (PR #117) resolution applied. CLT102-F2 fixed (Operate landing intelligence). |

---

## HOW TO USE THIS REGISTRY

**Globally unique IDs:** Each finding uses `CLT{session}-F{number}` format (e.g., `CLT72-F38`).

**Status definitions:**
- ✅ **FIXED** — Verified resolved in browser. Include which OB/HF fixed it.
- 🔄 **PARTIALLY** — Root cause addressed but not fully verified or has edge cases.
- ❌ **OPEN** — Not yet addressed.
- 🔁 **REGRESSED** — Was fixed, broke again. Candidate for PDR.
- 📌 **PDR** — Promoted to Persistent Defect Registry (tracked separately with screenshot requirements).
- ⏭️ **DEFERRED** — Intentionally postponed with rationale.
- 🗑️ **SUPERSEDED** — Replaced by a different finding or no longer relevant.

**After every CLT:** Add new findings, update statuses, note which intervention resolved each item.

---

## STATISTICS

| Metric | Count |
|--------|-------|
| Total findings (all CLTs) | 170+ |
| Currently OPEN | ~70 |
| FIXED (code, awaiting browser verify) | ~70 |
| PDR (persistent) | 7 |
| DEFERRED | ~20 |
| SUPERSEDED | ~10 |

**Last update:** OB-107 (PR #115) + HF-071 resolved. Pending browser verification in CLT-103.

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
| CLT51A-F45 | Navigation overcomplicated — 12+ items for rep | P1 | ❌ OPEN | Requires Nav IA redesign (S30). |
| CLT51A-F46 | Single-child menu sections require expand click | P1 | ❌ OPEN | UX rule defined but not implemented. |
| CLT51A-F47 | Dead-end pages in navigation | P1 | ❌ OPEN | 36 stubs per CLT-72A inventory. |

### Data/Wiring Gaps

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT51A-F6 | AI metrics not expanded in Observatory | P1 | 🔄 PARTIALLY | OB-86 built signal capture. Display still incomplete. |
| CLT51A-F8 | Infrastructure tab static | P2 | ❌ OPEN | |
| CLT51A-F16 | Ingestion tab zeros despite active tenants | P1 | ✅ FIXED | HF-067 fixed Observatory data truth. |
| CLT51A-F30 | Rep shows "No Outcome" despite admin showing data | P1 | ❌ OPEN | Entity-to-user mapping gap. |
| CLT51A-F33 | 308 requests / 19.5 min finish time | P1 | 📌 PDR-04 | N+1 pattern. Promoted to PDR. |
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
| CLT72-F38 | RetailCDMX phantom AI data — $58K with 0 DB results | P0 | ✅ FIXED | OB-73 Mission 1: AI safety gate. AP-18 prevented. |
| CLT72-F52 | Import committed 119K records with 5 unresolved mappings | P0 | ❌ OPEN | Relates to CLT102-F52 (field mapper as gate). |
| CLT72-F56 | All entities MX$0 but summary shows MX$157,139 | P0 | ✅ FIXED | OB-73 Mission 4: data source changed to calculation_results. |
| CLT72-F63 | $0 batch advanced to Official without gate | P0 | ✅ FIXED | OB-73 Mission 4: lifecycle validation gate. |
| CLT72-F68 | Reconciliation crash — .trim() on undefined | P0 | ✅ FIXED | OB-73 Mission 5: null guards. |

### High

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT72-F14 | Landing page is "Govern" not Operate | P1 | ✅ FIXED | OB-73 Mission 3 + OB-97 workspace restructure. |
| CLT72-F16 | Markdown not rendered in AI panels | P1 | ✅ FIXED | OB-73 Mission 5: react-markdown. |
| CLT72-F17 | Assessment title not contextual to persona | P1 | ✅ FIXED | OB-73 Mission 6. |
| CLT72-F18 | "Upgrade Required" trial modal for demo | P1 | ✅ FIXED | OB-73 Mission 3. |
| CLT72-F20 | "Post Results" purple gradient looks like marketing | P1 | ⏭️ DEFERRED | UI polish. |
| CLT72-F21 | Every entity shows identical -9.1% variance | P1 | ⏭️ DEFERRED | Data quality — flat budget multiplier in seed. |
| CLT72-F22 | Workspace labels in Spanish for admin | P1 | ✅ FIXED | OB-97 English enforcement. |
| CLT72-F25 | Console: variants undefined in rule set load | P1 | ❌ OPEN | |
| CLT72-F26 | Console: configuration.variants is undefined | P1 | ❌ OPEN | |
| CLT72-F27 | Duplicate import paths (3 paths → should be 1) | P1 | ❌ OPEN | Import UX consolidation needed (S16). |
| CLT72-F29 | Standard Import purpose unclear | P1 | ❌ OPEN | |
| CLT72-F30 | Data Templates → Configuration Center no context | P1 | ❌ OPEN | |
| CLT72-F31 | New Adjustment button doesn't fire | P1 | ✅ FIXED | OB-73 Mission 5. |
| CLT72-F32 | Approve/Reject buttons don't fire | P1 | ✅ FIXED | OB-73 Mission 5. |
| CLT72-F33 | .trim() on undefined throughout | P1 | ✅ FIXED | OB-73 Mission 5 null guards. |
| CLT72-F34 | Adjustment data authenticity unclear | P2 | ⏭️ DEFERRED | |
| CLT72-F35 | Two separate Reconciliation UIs | P1 | ❌ OPEN | Standing Rule 24: one canonical location. |
| CLT72-F36 | Plan Validation under Forensics — belongs in import | P2 | ❌ OPEN | |
| CLT72-F37 | Disputes > Resolution History loops | P2 | ❌ OPEN | |
| CLT72-F39 | RetailCDMX Operate stuck on "Loading periods..." | P1 | 🗑️ SUPERSEDED | RetailCDMX hidden from demos. |
| CLT72-F40 | Toggle pills on import cards — no values | P1 | ❌ OPEN | Same issue as CLT102-F30 (fluorescent pill). |
| CLT72-F41 | 50% confidence hardcoded | P1 | ❌ OPEN | Confirmed again in CLT-102 (CLT102-F29). |
| CLT72-F44 | Import page shows classification view for committed data | P1 | ❌ OPEN | |
| CLT72-F46 | Console: "using inline base fields fallback" | P2 | ❌ OPEN | |
| CLT72-F48 | Period detector year misinterpretation | P1 | ❌ OPEN | Month values as years. Relates to CLT102-F10. |
| CLT72-F50 | Console: targetFields empty, using base fields | P2 | ❌ OPEN | |
| CLT72-F54 | 88% Data Quality — no drill-down | P1 | ❌ OPEN | Quality score issues confirmed CLT-102. |
| CLT72-F60 | Entity IDs show UUIDs not names | P1 | ✅ FIXED | OB-85 R3. |
| CLT72-F67 | Batch selector shows raw UUID | P1 | ❌ OPEN | Human-readable batch IDs needed (S19). |
| CLT72-F70 | Reconciliation batch selector raw UUID | P1 | ❌ OPEN | Same as F-67. |
| CLT72-F71 | Persona switcher doesn't persist on navigation | P0 | ✅ FIXED | OB-73 Mission 2: signInWithPassword on switch. |

---

## CLT-84/85 — February 23, 2026
**Scope:** Post OB-85 R3 pipeline proof, calculation accuracy, import UX
**Document:** SESSION_HANDOFF_20260223.md (Section 8), VIALUCE_COMPLETE_BACKLOG.md

### CLT-84 Systemic (49 findings — key items below)

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT84-F10 | N+1 query pattern (5,928 requests) | P1 | 📌 PDR-04 | Promoted to PDR. Partially addressed OB-99/100. |
| CLT84-F20 | Navigation IA mixes metaphors | P1 | ❌ OPEN | Needs design session (S30). |
| CLT84-F25 | Demo persona switcher missing | P1 | ✅ FIXED | Restored in OB-84 or subsequent. |
| CLT84-F40 | Sheet analysis pills unclear | P1 | ❌ OPEN | Same as CLT72-F40, CLT102-F30. |
| CLT84-F41 | Unmapped fields appear as "won't be imported" | P1 | ❌ OPEN | Now CLT102-F52 (field mapper as gate). |
| CLT84-F46 | Plan × Data × Period not user-controllable | P0 | 🔄 PARTIALLY | Period selector built (OB-85). Data batch + plan still missing. |
| CLT84-F48 | No way to distinguish calculation runs | P1 | ❌ OPEN | Relates to CLT72-F67 (batch IDs). |
| CLT84-F57 | Components column empty | P1 | ❌ OPEN | |
| CLT84-F58 | Zero-payout calculation advances without warning | P2 | ✅ FIXED | OB-73 Mission 4. |
| CLT84-F59 | Period ribbon nearly unreadable | P1 | ❌ OPEN | |
| CLT84-F62 | Three components produce $0 | P0 | ✅ FIXED | OB-106: Insurance + Warranty reconnected. |

### CLT-85 (10 findings)

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT85-F50 | Import confirmation missing period info | P1 | ❌ OPEN | |
| CLT85-F51 | No period handling options at import | P2 | ❌ OPEN | |
| CLT85-F52 | Calculate shows old seed batch alongside import | P2 | ❌ OPEN | |
| CLT85-F53 | "Batch" terminology is internal jargon | P2 | ❌ OPEN | |
| CLT85-F54 | All payouts MX$0 | P0 | ✅ FIXED | OB-85 R3 — entity UUID + Supabase batch. |
| CLT85-F55 | UUIDs in Employee ID column | P1 | ✅ FIXED | OB-85 R3. |
| CLT85-F56 | Name column shows UUID | P1 | ✅ FIXED | OB-85 R3. |
| CLT85-F57 | Components column empty | P1 | ❌ OPEN | Same as CLT84-F57. |
| CLT85-F58 | Zero-payout calc advances lifecycle | P2 | ✅ FIXED | OB-73 Mission 4. |
| CLT85-F59 | Period ribbon nearly unreadable | P1 | ❌ OPEN | Same as CLT84-F59. |

---

## CLT-98/99/100 — February 25-26, 2026
**Scope:** Financial module (Sabor Grupo), OB-97/98/99/100 deliverables
**Document:** OB-99_FINANCIAL_PERFORMANCE_AND_DEMO_READINESS.md, PERSISTENT_DEFECT_REGISTRY.md

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT98-F1 | Network Pulse: 431 requests, 3.9 min load | P0 | ✅ FIXED | OB-99 API route fix. Promoted to PDR-04 for residual. |
| CLT98-F2 | Brand cards disconnected from location grid | P1 | ✅ FIXED | OB-100 Phase 3. PDR-06 for ongoing verification. |
| CLT98-F3 | Cents on million-peso amounts | P1 | 📌 PDR-01 | HF-069 sweep. Still promoted to PDR for ongoing. |
| CLT98-F4 | Blue border rendered, legend says amber | P1 | ✅ FIXED | OB-100 Phase 0 threshold fix. PDR-07. |
| CLT98-F5 | Legend text too small | P2 | ❌ OPEN | |
| CLT98-F6 | Location/brand tiles not clickable | P1 | ❌ OPEN | Thermostat principle violation. |
| CLT98-F7 | Operate workspace ICM-flavored for Financial tenant | P1 | 📌 PDR-02 | Promoted to PDR. Still failing CLT-100. |
| CLT98-F8 | Persona switcher doesn't filter Financial pages | P1 | 📌 PDR-05 | Promoted to PDR. |
| CLT98-F9 | Rep persona not applicable to Financial context | P1 | ❌ OPEN | Server needs own view. |
| CLT98-F10 | Product Mix: 1,409 requests, 19 min, 202 MB | P0 | ✅ FIXED | OB-99 API route. |

---

## CLT-102 — February 27, 2026
**Scope:** HF-067/068/069/070 + OB-106 + Caribe Financial walkthrough
**Document:** CLT-102_FINDINGS.md

### P0 — Import Pipeline Architecture

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT102-F3 | Single Plan ID for 4 imported plans | P0 | ❌ OPEN | Plan import page not in OB-107 scope. |
| CLT102-F7 | "View Plans" → dead Customer Launch Dashboard | P0 | ✅ FIXED | HF-072 (PR #116): redirects to /performance/plans. 811-line dead page removed. |
| CLT102-F10 | Period detection on roster HireDate (22 periods) | P0 | ✅ FIXED | OB-107 Phase 2: period-detector.ts skips roster/unrelated. Phase 5: cleanup. |
| CLT102-F12 | Validation requires plan metrics on roster | P0 | 🔄 PARTIALLY | OB-107: validateCriticalFields() already skipped roster. Browser verify needed. |
| CLT102-F16 | Roster auto-selects single plan | P0 | ✅ FIXED | OB-107 Phase 4: per-file plan selector. |
| CLT102-F17 | No multi-plan selection | P0 | ✅ FIXED | OB-107 Phase 4: plan dropdown loads ALL active plans. |
| CLT102-F18 | Validation errors reference wrong plan on roster | P0 | 🔄 PARTIALLY | Same as F-12. Browser verify needed. |
| CLT102-F21 | 22 erroneous periods committed | P0 | ✅ FIXED | OB-107 Phase 5: pre-2024 period deleted. 3 remain (Jan-Mar 2024). |
| CLT102-F22 | No period suppression for roster files | P0 | ✅ FIXED | OB-107 Phase 2: client + server skip roster sheets. |
| CLT102-F23 | Erroneous periods pollute period selector | P0 | ✅ FIXED | OB-107 Phase 5: cleanup + Phase 2 prevents recurrence. |
| CLT102-F26 | 7 files → 1 sheet in Sheet Analysis | P0 | ❓ RETEST | Multi-CSV concatenation — not directly addressed. CLT-103. |
| CLT102-F27 | Transaction files misclassified as roster | P0 | ❓ RETEST | Signal loop closure may improve. CLT-103. |
| CLT102-F28 | Single plan locked across all files | P0 | ✅ FIXED | OB-107 Phase 4: per-file plan selector. |
| CLT102-F32 | 48 rows × 3 cols doesn't match any file | P0 | ❓ RETEST | Related to F-26 multi-file. CLT-103. |
| CLT102-F33 | NewAccountsOpened + AccountsClosed both → Quantity | P0 | ❌ OPEN | Taxonomy limitation. Data preserved but semantic distinction lost. |
| CLT102-F38 | Deposit data locked to Mortgage plan | P0 | ✅ FIXED | OB-107 Phase 4: user can select Deposit Growth plan. |
| CLT102-F40 | Data Preview truncates columns | P0 | ❌ OPEN | Not in OB-107 scope. |
| CLT102-F47 | "% confidence" literal text | P0 | ✅ FIXED | OB-107 Phase 2: null guard on matchedComponentConfidence. |
| CLT102-F48 | Insurance data force-matched to Mortgage | P0 | ✅ FIXED | OB-107 Phase 4: user can select Insurance Referral plan. |
| CLT102-F49 | 4/9 fields Unresolved on insurance referral | P0 | 🔄 PARTIALLY | "Unresolved" → "Will be preserved". Data not lost. Taxonomy still narrow. |
| CLT102-F51 | Target field taxonomy too narrow | P0 | 🔄 PARTIALLY | Phase 0: 25+ base fields + dynamic. Data preserved. UI was the issue. |
| CLT102-F52 | Field mapper as gate not enrichment | P0 | ✅ FIXED | Phase 0 discovery: data layer ALREADY preserves all columns. UI now says "Will be preserved". |

### P1 — Demo Credibility

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT102-F2 | Operate landing underwhelming | P1 | ✅ FIXED | OB-108 (PR #117): Pipeline readiness cockpit. 4 sections, data-driven. |
| CLT102-F4 | Plan import — triplicate information | P1 | ❌ OPEN | |
| CLT102-F5 | "Next Step" doesn't mention roster | P1 | ❌ OPEN | |
| CLT102-F6 | Periods shown as manual step | P1 | ❌ OPEN | |
| CLT102-F8 | Customer Launch Dashboard dead | P1 | ✅ FIXED | HF-072 (PR #116): 811-line dead page → 13-line redirect. Sidebar entry removed. |
| CLT102-F11 | Quality score doesn't reflect manual corrections | P1 | ❓ RETEST | OB-107 Phase 0: scores computed dynamically, not hardcoded. May work now. |
| CLT102-F13 | Progress bars lack explanation | P1 | ❌ OPEN | |
| CLT102-F14 | No roster-specific intelligence | P1 | ❌ OPEN | |
| CLT102-F19 | Classification doesn't flow to validation | P1 | ✅ FIXED | OB-107 Phase 2: classification propagation to period detection + validation. |
| CLT102-F24 | "What's Next" wrong for roster context | P1 | ❌ OPEN | |
| CLT102-F29 | 50% confidence hardcoded | P1 | ❓ RETEST | OB-107 Phase 0: confidence IS computed by AI. Display issue may be fixed. |
| CLT102-F30 | Fluorescent green pill unreadable | P1 | ❌ OPEN | HF-073 scope. |
| CLT102-F31 | 0 relationships detected across related files | P1 | ❌ OPEN | |
| CLT102-F34 | Taxonomy too coarse for directional metrics | P1 | ❌ OPEN | Data preserved; semantic distinction limited. |
| CLT102-F35 | SnapshotDate as Excel serial number | P1 | ❌ OPEN | HF-073 scope. |
| CLT102-F36 | SnapshotPeriod as Excel serial number | P1 | ❌ OPEN | HF-073 scope. |
| CLT102-F37 | Validation references Óptica-specific logic | P1 | ❓ RETEST | Signal loop + classification propagation may fix. CLT-103. |
| CLT102-F41 | Currency column → Amount (wrong) | P1 | ❓ RETEST | Signal loop may improve mapping. CLT-103. |
| CLT102-F42 | Data Preview 1 row at a time | P1 | ❌ OPEN | |
| CLT102-F43 | 74% Quality identical across all files | P1 | ❓ RETEST | Phase 0: quality IS computed dynamically. Verify in CLT-103. |
| CLT102-F44 | Multi-file queue locked to wrong plan | P1 | ✅ FIXED | OB-107 Phase 4: per-file plan selector. |
| CLT102-F50 | Boolean fields → numeric types | P1 | ❌ OPEN | |

### P2 — Performance

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT102-F9 | 248 requests, 11.4 min | P2 | ❌ OPEN | PDR-04. |
| CLT102-F15 | 346 requests, 18.7 min | P2 | ❌ OPEN | PDR-04. |
| CLT102-F20 | 358 requests, 25.6 min | P2 | ❌ OPEN | PDR-04. |
| CLT102-F25 | 373 requests, 29.3 min | P2 | ❌ OPEN | PDR-04. |
| CLT102-F39 | 396 requests, 38.7 min | P2 | ❌ OPEN | PDR-04. |
| CLT102-F45 | 12/25 entities matched — no explanation | P2 | ❌ OPEN | |
| CLT102-F46 | 411 requests, 45.8 min cumulative | P2 | ❌ OPEN | PDR-04. |

---

## PERSISTENT DEFECT REGISTRY (Cross-Reference)

Items promoted from CLT findings to PDR due to repeated fix failures:

| PDR # | Source Finding | Description | Status |
|-------|---------------|-------------|--------|
| PDR-01 | CLT98-F3 | Currency no cents on large amounts | Recurring — 3 cycles |
| PDR-02 | CLT98-F7 | Financial-only tenant redirect | Recurring — 2 cycles |
| PDR-03 | Design spec | Bloodwork Financial landing page | Never built — 4 sessions |
| PDR-04 | CLT51A-F33, CLT84-F10 | N+1 platform overhead | Partially addressed — 3 cycles |
| PDR-05 | CLT98-F8 | Persona filtering effectivePersona | Recurring — 2 cycles |
| PDR-06 | CLT98-F2 | Brand cards as section headers | Fixed OB-100, verify holds |
| PDR-07 | CLT98-F4 | Amber threshold ±5% | Fixed OB-100, verify holds |

---

## CROSS-CLT PATTERNS (Same issue, different sessions)

These findings keep appearing across sessions under different F-numbers:

| Pattern | Appearances | Root Cause | Intervention |
|---------|-------------|------------|-------------|
| Hardcoded confidence (50%, 74%) | CLT72-F41, CLT84-F40, CLT102-F29, CLT102-F43 | OB-107 Phase 0: confirmed NOT hardcoded — computed by AI. Display issues fixed. | ❓ RETEST CLT-103 |
| Fluorescent green pill unreadable | CLT72-F40, CLT84-F40, CLT102-F30 | CSS color value on dark background | HF-073 scope |
| N+1 request explosion | CLT51A-F33, CLT84-F10, CLT98-F1/F10, CLT102-F9/F15/F20/F25/F39/F46 | Context providers re-fetch | PDR-04, OB-99/100 partial |
| Field mapper as gate not enrichment | CLT72-F52, CLT84-F41, CLT102-F49/F51/F52 | OB-107 Phase 0: data layer ALREADY preserves all columns. UI said "Unresolved" implying loss. | ✅ FIXED — UI now says "Will be preserved" |
| Period detection on wrong dates | CLT72-F48, CLT102-F10/F21/F22/F23 | Classification didn't propagate to period detection | ✅ FIXED — OB-107 Phase 2 |
| UUID display instead of human names | CLT72-F60/F67/F70, CLT85-F55/F56 | Missing display_name joins | OB-85 R3 fixed entities, batches still UUID |
| Single plan context | CLT84-F46, CLT102-F16/F17/F28/F38/F44/F48 | Import locked to one plan | ✅ FIXED — OB-107 Phase 4 |
| Navigation dead ends / stubs | CLT51A-F47, CLT72-F29/F30/F37 | 36 stub pages, 15+ orphans | HF-072 (running) |
| Statements/Transactions empty | CLT51A-F38/F39/F40 | Pages built but not wired to data | Future OB |

---

## PRIORITY SUMMARY — WHAT TO FIX NEXT

### Tier 1: ~~Import Pipeline (OB-107)~~ ✅ COMPLETE (PR #115)
Three root causes fixed. 12 of 22 P0s resolved. 3 need browser retest. 4 partially addressed. 3 still open.

### Tier 1B: Browser Verification (CLT-103) — Verify OB-107 + HF-072
Full Caribe Financial walkthrough to confirm fixes in browser. 7 findings marked ❓ RETEST.

### Tier 2: Persistent Defects (PDR items) — Demo credibility
7 items that keep failing across CLT cycles.

### Tier 3: Recurring UI (HF-073) — Visual credibility
Fluorescent pill, Excel serial dates. Raised 3+ times, never fixed.

### Tier 4: UX/Navigation (Future OB) — Polish
~15 open P1 findings across CLT-51A, 72, 84 related to navigation, dead pages, empty states.

### Tier 5: Performance (PDR-04) — Scale
N+1 pattern affecting every page. Needs architectural fix (SWR/React Query).

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*"170+ findings across 6 CLT sessions. One registry. One truth."*
