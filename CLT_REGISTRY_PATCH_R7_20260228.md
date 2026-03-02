# VIALUCE CLT FINDINGS REGISTRY — R7 UPDATE PATCH
## February 28, 2026
## Adds: CLT-122 (82 findings), HF-078/079/080 resolutions, OB-121/122 status updates, CC Failure Patterns 21-22
## Apply to: VIALUCE_CLT_FINDINGS_REGISTRY_R4.md (after R5 + R6 patches)

---

## STATISTICS UPDATE

| Metric | R6 (Previous) | R7 (Current) |
|--------|---------------|--------------|
| Total findings (all CLTs) | 241 | 323 |
| Currently OPEN | ~130 | ~190 |
| FIXED | ~60 | ~67 |
| PDR (persistent) | 9 | 10 |
| DEFERRED | ~20 | ~20 |
| SUPERSEDED | ~15 | ~15 |
| POSITIVE (working well) | ~5 | ~23 |

**Key movement this session:**
- +82 new findings from CLT-122 (fresh tenant walkthrough)
- HF-078/079: MBC 409 calculation errors → FIXED (PR#135, #136)
- HF-080: Create New Tenant button regression → FIXED (PR#138)
- OB-122: SHEET_COMPONENT_PATTERNS removal → MERGED (PR#137)
- CC Failure Patterns 21 (dual code path) and 22 (RLS silent swallow) documented
- MBC clean baseline established: $3,256,677.72 / 320 rows / idempotent

---

## STATUS UPDATES FROM THIS SESSION

### OB-121 / HF-078 / HF-079 Resolutions

| ID | Finding | Previous Status | New Status | Resolution |
|----|---------|----------------|------------|------------|
| CLT113-T13 | MBC calculation $0.00 | ❌ OPEN | 🔄 PARTIALLY | OB-117→121 fixed Consumer Lending, Mortgage, Insurance Referral. Deposit Growth still $0 (F-65 root cause). Grand total: $3,256,677.72. |
| CLT113-T14 | input_bindings NULL all rule sets | 🔄 PARTIALLY | 🔄 PARTIALLY | OB-115+121: Consumer Lending and Mortgage populated. Insurance Referral and Deposit Growth still need convergence. |
| CLT112-F13 | 50% confidence on all 7 file cards | ✅ FIXED | ✅ FIXED | Confirmed: OB-114 resolved. But CLT-122 shows 0% confidence now (different issue — AI returning 0, not hardcoded 50%). |

### OB-122 Resolutions

| ID | Finding | Previous Status | New Status | Resolution |
|----|---------|----------------|------------|------------|
| CLT113-T17 | Óptica works via domain patterns | ℹ️ N/A | 🗑️ SUPERSEDED | OB-122 removed all SHEET_COMPONENT_PATTERNS. Resolution now via input_bindings + semantic type inference only. |

---

## NEW SECTION: CLT-122 — February 28, 2026
**Scope:** Fresh tenant walkthrough (Latin American Bank) — tenant creation → roster/data import → plan import → calculate
**Methodology:** Created new tenant via HF-080 fix. Imported all Caribe Financial demo files as a new customer would. Tested full pipeline from zero.
**Result:** BLOCKED at calculation. 1 of 4 plans visible, 0 entities assigned, 0 calculation results.
**Findings:** 82 (10 P0, 32 P1, 22 P2, 18 POSITIVE)

### Tenant Provisioning

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F1 | Caribe admin (Roberto Vega) access restricted | P1 | ❌ OPEN | Auth workstream. Profile/role/tenant issue. |
| CLT122-F2 | Auth login bypassed in incognito | P1 | ❌ OPEN | Known — HF-059/061 territory. |
| CLT122-F3 | Calculate page shows single plan, not aggregate | P2 | ❌ OPEN | |
| CLT122-F4 | Create New Tenant button non-responsive | P1 | ✅ FIXED | **HF-080 PR#138.** Root cause: auth-shell.tsx:17 TENANT_EXEMPT_ROUTES missing /admin/tenants/new. |
| CLT122-F5 | Profile creation failed: scope_level column missing | P1 | ❌ OPEN | Auth workstream — full user creation effort. |
| CLT122-F6 | Deposit Growth $0 — Tab 2 target data never imported | P0 | ❌ OPEN | Root cause: F-65 (multi-tab XLSX reads Tab 1 only). |
| CLT122-F7 | Agent module selections name-only, no downstream wiring | P2 | ❌ OPEN | S42 — focused development effort. |

### New Tenant Landing & UX

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F8 | New tenant lands on Data Import, no onboarding | P1 | ❌ OPEN | UX redesign needed. |
| CLT122-F9 | Import page has no contextual guidance | P1 | ❌ OPEN | |
| CLT122-F10 | Header says "Import Excel workbooks" but supports csv/txt/tsv | P2 | ❌ OPEN | |

### Data Import — Sheet Analysis

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F11 | AI confidence 0% across all 7 files | P1 | ❌ OPEN | Systemic. Different from PDR-08 (50% hardcoded was fixed; now shows actual 0% from AI). |
| CLT122-F12 | All files classified as "Component Data" — no differentiation | P1 | ❌ OPEN | Repeat CLT112-F18. |
| CLT122-F13 | 0 relationships detected across 7 files sharing OfficerID | P1 | ❌ OPEN | |
| CLT122-F14 | Deposit Balances and Loan Defaults misclassified | P1 | ❌ OPEN | |
| CLT122-F15 | No guidance that plans should be imported before data | P1 | ❌ OPEN | |

### Data Import — Field Mapping

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F16 | "Sheet1" label instead of filename for CSVs | P2 | ❌ OPEN | Repeat CLT112-F21. |
| CLT122-F17 | Branch → "Store ID" — wrong domain vocabulary | P1 | ❌ OPEN | Repeat CLT112-F24. Banking customer, not retail. |
| CLT122-F18 | TotalDepositBalance → "Amount" — semantically lossy | P1 | ❌ OPEN | Repeat CLT112-F22. |
| CLT122-F19 | SnapshotDate/Period → generic Date/Period | P1 | ❌ OPEN | Repeat CLT112-F23. |
| CLT122-F20 | AccountsClosed → "Reduction Count" — good | P3 | ✅ POSITIVE | OB-110 taxonomy working. |
| CLT122-F21 | NewAccountsOpened → "Growth Count" — good | P3 | ✅ POSITIVE | OB-110 taxonomy working. |
| CLT122-F22 | Currency "Review 80%" uniform value detection — good | P3 | ✅ POSITIVE | OB-110 calibration working. |
| CLT122-F23 | Roster validation warning on non-roster sheet | P1 | ❌ OPEN | |
| CLT122-F24 | Data imported before plans — no plan context | P1 | ❌ OPEN | |
| CLT122-F25 | OfficerID "Review 75%" due to 5-row sample bias | P2 | ❌ OPEN | |
| CLT122-F26 | ProspectName → "Reference ID" — wrong mapping | P1 | ❌ OPEN | |
| CLT122-F27 | Qualified + PolicyIssued unmapped — critical for calc | P0 | ❌ OPEN | Boolean fields not mapped to any target type. |
| CLT122-F28 | Branch → "Store ID" (repeat F-17) | P1 | ❌ OPEN | |
| CLT122-F29 | ReferralID → "Transaction ID" — correct | P3 | ✅ POSITIVE | |
| CLT122-F30 | ProductCode/ProductName mapped correctly | P3 | ✅ POSITIVE | |
| CLT122-F31 | Roster warning on non-roster sheet (repeat F-23) | P1 | ❌ OPEN | |
| CLT122-F32 | "Entity ID" overloaded — person vs transaction | P1 | ❌ OPEN | Architectural terminology gap. |
| CLT122-F33 | ProductType → "Product Name" — should be Type/Code | P2 | ❌ OPEN | |
| CLT122-F34 | Term_Months → "Quantity" — semantically wrong | P2 | ❌ OPEN | |
| CLT122-F35 | InterestRate → "Rate/Percentage" — correct | P3 | ✅ POSITIVE | |
| CLT122-F36 | LoanAmount → "Amount" — correct but generic | P2 | ❌ OPEN | |
| CLT122-F37 | 5-row sample shows single officer, false warnings | P2 | ❌ OPEN | Repeat F-25. |

### Data Import — Validate & Preview

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F38 | AI Confidence 0% aggregate contradicts 85-95% field-level | P1 | ❌ OPEN | |
| CLT122-F39 | Critical fields unmapped: Qualified, PolicyIssued, ProductType, DefaultReason | P0 | ❌ OPEN | |
| CLT122-F40 | Cross-Sheet Validation fails against non-existent roster | P1 | ❌ OPEN | Repeat CLT112-F35. |
| CLT122-F41 | Valid IDs listed as "not in roster" errors | P1 | ❌ OPEN | Repeat CLT112-F37. |
| CLT122-F42 | Create Periods requires manual click at 100% confidence | P2 | ❌ OPEN | Repeat CLT112-F34. |
| CLT122-F43 | December 2023 detected — may be noise | P2 | ❌ OPEN | |
| CLT122-F44 | No calculation preview before commit | P2 | ❌ OPEN | |
| CLT122-F45 | Validation sections hardcoded, not intelligence-driven | P1 | ❌ OPEN | Lacks IAP. |
| CLT122-F46 | "Store validation" empty placeholder | P2 | ❌ OPEN | Repeat CLT112-F36. |

### Data Import — Approval

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F47 | "No Active Plan" warning correct but buried at bottom | P1 | ❌ OPEN | Should be prominent at start of import. |
| CLT122-F48 | Batch Summary duplicates Sheet Breakdown | P2 | ❌ OPEN | Repeat CLT112-F4. |
| CLT122-F49 | 0% confidence shown 9 times on one page | P1 | ❌ OPEN | |
| CLT122-F50 | "Preserved" label masks critical unmapped fields | P1 | ❌ OPEN | |
| CLT122-F51 | Approval routing message when no approvers configured | P2 | ❌ OPEN | |
| CLT122-F52 | Review Validation/Analysis buttons redundant | P3 | ❌ OPEN | |

### Roster Import

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F53 | Roster 0% confidence — systemic across all file types | P0 | ❌ OPEN | Confirms AI confidence issue is universal. **PDR-10 candidate.** |

### Plan Import

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F54 | Consumer Lending 100% confidence, 3 components, 34/34 | P3 | ✅ POSITIVE | Plan Intelligence working. |
| CLT122-F55 | Worked example MX$5,975 calculated | P3 | ✅ POSITIVE | |
| CLT122-F56 | Plan description accurate | P3 | ✅ POSITIVE | |
| CLT122-F57 | Metric sources correctly identified | P3 | ✅ POSITIVE | |
| CLT122-F58 | Multi-tab XLSX in queue — Tab 2 handling unknown | P0 | ⚠️ WATCH | See F-65. |
| CLT122-F59 | "0 Values Parsed" contradicts worked example | P2 | ❌ OPEN | |
| CLT122-F60 | Effective date defaults to today, not plan's date | P1 | ❌ OPEN | |
| CLT122-F61 | Deposit Growth 95% confidence, tier_lookup correct | P3 | ✅ POSITIVE | |
| CLT122-F62 | Three worked examples spanning tier range | P3 | ✅ POSITIVE | |
| CLT122-F63 | Tier gap anomalies detected — genuine intelligence | P3 | ✅ POSITIVE | Real plan anomaly detection working. |
| CLT122-F64 | Description captures cadence, tiers, AND coordination gate | P3 | ✅ POSITIVE | |
| CLT122-F65 | **Multi-tab XLSX reads only Tab 1 — targets silently lost** | **P0** | ❌ **OPEN — ROOT CAUSE** | 17 rows = Tab 1 only. Tab 2 (25 officer targets) not processed. Root cause of Deposit Growth $0 across OB-117→122. **Decision 72.** |
| CLT122-F66 | Effective date defaults to today (repeat F-60) | P1 | ❌ OPEN | |
| CLT122-F67 | Mortgage 92% confidence, marginal tiers correct | P3 | ✅ POSITIVE | |
| CLT122-F68 | Period badge in header during plan import | P2 | ❌ OPEN | |
| CLT122-F69 | "1 Component" insufficient — needs plain-language summary | P1 | ❌ OPEN | |
| CLT122-F70 | Plan queue shows all 4 confidence scores — good | P3 | ✅ POSITIVE | |
| CLT122-F71 | Description captures marginal tier methodology | P3 | ✅ POSITIVE | |

### Post-Plan Import

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F72 | After last plan, dropped to blank upload page | P1 | ❌ OPEN | No summary, no next steps. |
| CLT122-F73 | Stale plan context in AI-Powered badge | P2 | ❌ OPEN | |
| CLT122-F74 | No way to review imported plans from import flow | P1 | ❌ OPEN | |
| CLT122-F75 | Period badge with error indicator persists | P2 | ❌ OPEN | |

### Calculation

| ID | Finding | Priority | Status | Resolution |
|----|---------|----------|--------|------------|
| CLT122-F76 | Only 1 of 4 plans visible on Calculate page | P0 | ❌ OPEN | Repeat CLT111-F46. |
| CLT122-F77 | No entities assigned to plans | P0 | ❌ OPEN | Repeat CLT111-F43. Root cause: no entity creation from roster, no assignment mechanism. |
| CLT122-F78 | Calculate button stuck in "Calculating" after error | P2 | ❌ OPEN | |
| CLT122-F79 | No guidance on entity-to-plan assignment | P1 | ❌ OPEN | |
| CLT122-F80 | **Platform does not wire imports into calculable state** | **P0** | ❌ **OPEN — CORE GAP** | Three independent import pipelines produce artifacts with no connecting layer. **OB-123 addresses. Decisions 71-74.** |
| CLT122-F81 | No plan selection/management on Calculate page | P0 | ❌ OPEN | |
| CLT122-F82 | No entity-to-plan assignment UI exists | P0 | ❌ OPEN | |

---

## UPDATED CROSS-CLT PATTERNS

| Pattern | Appearances | Status |
|---------|-------------|--------|
| Hardcoded confidence (50%) | CLT72→CLT112 | ✅ **RESOLVED** OB-114 (PDR-08). Now shows actual AI result (0%). |
| AI confidence = 0% (actual) | **CLT-122** (all files, all types, new tenant) | ❌ **NEW PATTERN — PDR-10 candidate** |
| Landing page wrong | CLT92→CLT111 | ✅ **RESOLVED** OB-115 Phase 3 (PDR-02). HF-080 fixed tenant creation route. |
| No entity assignment mechanism | CLT111-F43, **CLT122-F77/F80/F82** | ❌ **3rd consecutive CLT.** OB-123 Phase 3 addresses. |
| Only 1 plan visible on Calculate | CLT111-F46, **CLT122-F76** | ❌ OB-123 Phase 2 addresses. |
| Multi-tab XLSX reads Tab 1 only | **CLT122-F65** | ❌ **NEW — root cause of Deposit Growth $0.** OB-123 Phase 4. Decision 72. |
| Classification ≠ comprehension | CLT111-F20/F21, CLT113-T13/T14, **CLT122-F12/F27/F39** | ❌ Decision 64 territory. |
| Branch → "Store ID" vocabulary | CLT112-F24, **CLT122-F17/F28** | ❌ Domain vocabulary in taxonomy. |
| Validation on missing context | CLT112-F35/F37, **CLT122-F40/F41** | ❌ Validation runs regardless of what's imported. |
| Period badge during wrong workflow | CLT109-F11, CLT111-F10, **CLT122-F68/F75** | ❌ 4th CLT. |
| Import completes to blank page | **CLT122-F72** | ❌ **NEW.** No summary or next steps after plan import. |
| Plan interpretation strong (92-100%) | **CLT122-F54/F61/F67** + CLT118-F8 | ✅ **POSITIVE PATTERN.** Plan Intelligence consistently performs well. |
| Platform replaces customer vocabulary | CLT111-F19, CLT112-F22/F23/F24, **CLT122-F17/F18/F19** | ❌ Field mapper erases original terms. |

---

## UPDATED PDR

| PDR # | Source | Description | Status |
|-------|--------|-------------|--------|
| PDR-01 | CLT98-F3 | Currency no cents on large amounts | ❌ OPEN |
| PDR-02 | CLT98+ | Landing page wrong | ✅ **RESOLVED** — OB-115 Phase 3 |
| PDR-03 | Design spec | Bloodwork Financial landing | ❌ OPEN — never built |
| PDR-04 | CLT51A+ | N+1 platform overhead | 🔄 ACCEPTABLE (dev) |
| PDR-05 | CLT98-F8 | Persona filtering effectivePersona | ❌ OPEN |
| PDR-06 | CLT98-F2 | Brand cards as section headers | ❌ UNVERIFIED |
| PDR-07 | CLT98-F4 | Amber threshold ±5% | ❌ UNVERIFIED |
| PDR-08 | CLT72+ | Hardcoded 50% confidence | ✅ **RESOLVED** — OB-114 |
| PDR-09 | CLT72+ | Validate/Preview page useless | ❌ OPEN — 5th CLT (CLT-122 F-45) |
| **PDR-10** | **CLT122-F11/F53** | **AI field mapping confidence = 0% (actual, not hardcoded)** | ❌ **NEW — systemic across all file types and tenants** |

---

## CC FAILURE PATTERNS ADDED THIS SESSION

| Pattern | ID | Description | Discovery |
|---------|----|-------------|-----------|
| 21 | Dual code path | Fix applied to route.ts but not runCalculation() — two entry points for same operation | HF-078/079 |
| 22 | RLS silent swallow | Supabase RLS doesn't error on unauthorized DELETE — returns success with 0 rows affected | HF-079 |

---

## PRIORITY TIERS (Updated)

### Tier 0: Wiring Layer — Import to Calculable State (NEW)
**OB-123.** No new tenant can calculate. 82 findings in CLT-122 all trace to one root cause: nothing connects plan import + data import + roster import. Decisions 71-74 locked. 6 phases: entity creation, all plans visible, assignments, multi-tab XLSX, convergence, end-to-end proof.

### Tier 1: Deposit Growth Root Cause
CLT122-F65: multi-tab XLSX reads only Tab 1. Target data silently lost. Decision 72 (independent tab classification). Addressed by OB-123 Phase 4.

### Tier 2: AI Confidence Investigation (PDR-10)
PDR-08 (hardcoded 50%) was RESOLVED by OB-114. Now showing actual 0% from AI (CLT122-F11/F53). Separate diagnostic OB needed to investigate why Anthropic API returns zero confidence.

### Tier 3: Import Pipeline UX
~30 open P1 findings about guidance, vocabulary, classification display, validation theater. Requires design-level rework, not individual HFs.

### Tier 4: Persistent Defects (PDR)
PDR-03 (Bloodwork), PDR-05 (persona filtering), PDR-09 (Validate page useless) — highest impact.

### Tier 5: Auth / User Management
CLT122-F1/F2/F5: scope_level column, access restricted, auth bypass. Full workstream (user creation, permissions, MFA, reset password).

---

*Registry R7 — 323 findings across 10 CLT sessions.*
*"Plan intelligence works (92-100%). The engine is proven ($1,253,832). The chain between them doesn't exist."*
*Revision R7 — February 28, 2026*
