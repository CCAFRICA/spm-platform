# CLT-102: POST-SEQUENCE BROWSER VERIFICATION — FINDINGS
## Date: February 27, 2026
## Scope: HF-067/068/069/070 + OB-106 deliverables + Caribe Financial walkthrough

---

## EXECUTIVE SUMMARY

The HF-067 through OB-106 intervention sequence delivered what it promised: Observatory data truth, field mapper CSV path fix, currency formatting, auth fix, and Óptica component reconnection. These are real improvements.

However, the Caribe Financial walkthrough exposed **systemic architectural gaps in the import pipeline** that will prevent any new multi-plan, multi-file tenant from achieving accurate calculations. The import pipeline was built and validated for one pattern (Óptica: single Excel file, 7 sheets, one plan with certification variants). It does not generalize to the Caribe pattern (multiple independent files, 4 plans, different data schemas per plan, banking domain).

**The import pipeline is the critical path.** If data doesn't enter the system correctly, nothing downstream works — calculations will be wrong, reconciliation will fail, and the demo will not be credible.

---

## FINDINGS BY PRIORITY

### P0 — BLOCKING (Demo Cannot Proceed)

| # | Finding | Location | Detail |
|---|---------|----------|--------|
| F-3 | Plan import shows single Plan ID for 4 plans | /admin/launch/plan-import | One UUID for 4 independent rule sets. Plans may be aggregated or only last plan's ID shown. |
| F-7 | "View Plans" links to abandoned Customer Launch Dashboard | /admin/launch | Dead page with "0 launches." User cannot view their imported plans. |
| F-10 | Period detection creates 22 erroneous periods from roster HireDate | Roster import validation | HireDate is an entity attribute, not a performance boundary. Pollutes period selector. |
| F-12 | Validation requires plan metrics on roster file | Roster approval | "Required fields not mapped: Quarterly Mortgage Origination Volume" — plan metric confused with roster field. |
| F-16 | Roster import auto-selects single plan | Approval page | Roster is plan-agnostic. Should not be associated with any specific plan. |
| F-17 | No multi-plan selection for imports | Import pipeline | Blocks multi-plan demo. Each file locked to one plan even when data feeds a different plan. |
| F-18 | Validation errors reference plan metrics on roster | Approval page | Same as F-12 — validation doesn't understand file context. |
| F-21 | 22 erroneous periods created from HireDate | Import completion | Periods committed to database. Must be cleaned before real calculation. |
| F-22 | No suppression of period detection for roster files | Import pipeline | Classification as "Personnel Data" doesn't propagate to period detection logic. |
| F-23 | Erroneous periods pollute period selector | Downstream calculation | 22 meaningless periods (Feb 2015 – May 2023) will appear alongside real Q1 2024 periods. |
| F-26 | 7 files selected, only 1 sheet analyzed | Sheet Analysis | Multi-file upload collapses 7 CSVs into single "Sheet1" with 48 rows × 3 columns. Data loss. |
| F-27 | Transaction files misclassified as "Entity Roster Detected" | Sheet Analysis | 7 transaction data files classified as roster. Wrong file type flows to wrong validation. |
| F-28 | Single plan context locked across all files in batch | Import pipeline | Deposit data locked to Mortgage plan. Insurance referrals will also go to Mortgage. |
| F-32 | 48 rows × 3 columns doesn't match any file's actual dimensions | Sheet Analysis | Data corruption or partial read during multi-file processing. |
| F-33 | NewAccountsOpened and AccountsClosed both → Quantity | Field mapping | Semantic distinction lost. Opposite business concepts (growth vs attrition) mapped to same target. |
| F-38 | Deposit data locked to Mortgage plan | Field mapping | Should feed Deposit Growth Incentive. System has no way to route correctly. |
| F-40 | Data Preview truncates columns | Field mapping | Cannot see all fields to verify mappings. Currency column invisible. |
| F-47 | "% confidence" displays as literal text | Sheet Analysis | Confidence value broken — shows string not number. |
| F-48 | Insurance Referral data force-matched to Mortgage plan | Field mapping | Will always calculate $0 because wrong plan. |
| F-49 | 4 of 9 fields Unresolved on insurance referral data | Field mapping | ReferralID, ProductCode, ProductName, ProspectName effectively lost. |
| F-51 | **Target field taxonomy too narrow for multi-domain use** | Field mapping architecture | Only offers: Entity ID, Entity Name, Store ID, Date, Period, Amount, Quantity, Achievement %. No transaction IDs, product codes, qualification status, customer names. Designed for Óptica pattern only. |
| F-52 | **Field mapper acts as gate not enrichment layer** | Import pipeline architecture | Unmapped columns are effectively lost instead of carried through. Contradicts Carry Everything principle and TMR description of the architecture. |

### P1 — SIGNIFICANT (Demo Credibility)

| # | Finding | Location | Detail |
|---|---------|----------|--------|
| F-2 | Operate landing underwhelming | /operate | No guidance, no intelligence, no proximity to next action. Static summary card with text links. |
| F-4 | Plan import completion — triplicate information | /admin/launch/plan-import | Same 4 file→plan mappings shown 3 times (imported, queue, complete). |
| F-5 | "Next Step" doesn't mention roster | Plan import completion | Critical next action missing. Shows generic "Import Data Package" instead of roster guidance. |
| F-6 | Periods shown as manual step on plan import | Plan import completion | Should auto-detect from transaction data. Roster doesn't need periods. |
| F-8 | Customer Launch Dashboard is dead | /admin/launch | 7-step pipeline with "0 launches." Abandoned feature, still navigable. |
| F-11 | Quality score doesn't reflect manual mapping corrections | Validation | Still 74% after full manual field mapping. Should update post-correction. |
| F-13 | Progress bars lack explanation | Validation | Completeness 50%, Validity 100%, Consistency 95% — no drill-down, no detail on what failed. |
| F-14 | No roster-specific intelligence | Validation | Should show hierarchy, roles, plan assignment preview from ProductLicenses. Shows generic metrics instead. |
| F-19 | File classification doesn't flow to validation logic | Pipeline | "Personnel Data" classification at top doesn't influence downstream validation, period detection, or plan association. |
| F-24 | "What's Next" options wrong for roster context | Import completion | Suggests "Run Calculations" when no transaction data exists. |
| F-29 | 50% confidence hardcoded | Sheet Analysis | Flagged in multiple CLTs. Still present. Not computed from actual analysis. |
| F-30 | Fluorescent green pill unreadable | UI throughout | Flagged in multiple CLTs. Still present. Low contrast on dark background. |
| F-31 | "0 relationships detected" across 7 related files | Sheet Analysis | Files share OfficerID but system finds no relationships. |
| F-34 | Target field taxonomy too coarse for directional metrics | Field mapping | No way to express growth vs reduction (NewAccountsOpened vs AccountsClosed). |
| F-35 | SnapshotDate displays as Excel serial number | Data Preview | 45350.666 instead of parsed date. SheetJS date conversion not applied to preview. |
| F-36 | SnapshotPeriod displays as Excel serial number | Data Preview | 45323 instead of parsed date/period. |
| F-37 | Validation warning references Óptica-specific logic | Validation | "Certified vs Non-Certified routing" warning on banking data. Domain-specific when should be agnostic. |
| F-41 | Currency column mapped to Amount (60%) | Field mapping | Likely contains currency code string ("MXN"), not a monetary value. |
| F-42 | Data Preview shows 1 row at a time with pagination | Data Preview | Insufficient for pattern recognition. Need 5-10 rows visible simultaneously. |
| F-43 | 74% Quality identical on roster and transaction data | Import completion | Confirms F-29 — quality score is not computed from actual data quality. |
| F-44 | Multi-file queue works but all locked to wrong plan | Import completion | Sequential file processing exists but plan context doesn't reset per file. |
| F-50 | Qualified (boolean) → Quantity, PolicyIssued → Achievement % | Field mapping | Semantic mismatch — boolean/status fields mapped to numeric types. |

### P2 — TRACKED (Performance / Polish)

| # | Finding | Location | Detail |
|---|---------|----------|--------|
| F-9 | 248 requests, 11.4 min finish | Customer Launch Dashboard | PDR-04 |
| F-15 | 346 requests, 18.7 min finish | Validation page | PDR-04 |
| F-20 | 358 requests, 25.6 min finish | Approval page | PDR-04 |
| F-25 | 373 requests, 29.3 min finish | Import completion | PDR-04 |
| F-39 | 396 requests, 38.7 min finish | Field mapping | PDR-04 |
| F-45 | 12/25 entities matched with no explanation | Import completion | Correct but not communicated. |
| F-46 | 411 requests, 45.8 min finish | Cumulative session | PDR-04 |

---

## WHAT WORKS (Confirmed Deliverables)

| Intervention | Status | Evidence |
|-------------|--------|----------|
| Auth (HF-070) | ✅ PASS | Login → tenant selector → tenant landing works. Incognito cleared on second attempt. |
| Observatory (HF-067) | ✅ NOT RETESTED | Scope of this CLT focused on import pipeline. Retest recommended. |
| Field mapper CSV path (HF-068) | ✅ PARTIAL | CSV files are accepted and processed. But multi-file processing collapses files (F-26). |
| Currency formatting (HF-069) | ✅ NOT RETESTED | Scope focused on import. Retest on results pages recommended. |
| Óptica 6/6 components (OB-106) | ✅ CONFIRMED | Completion report shows Insurance $42.54, Warranty $66,872. Not browser-retested in this CLT. |
| Pipeline Proof Co (regression) | ✅ CONFIRMED | MX$1,253,832 unchanged per OB-106 completion report. |

---

## ROOT CAUSE ANALYSIS

### The Three Systemic Failures

**1. Classification doesn't propagate.** The AI correctly identifies files ("Personnel Data," "Component Data") but this classification doesn't influence downstream behavior. Period detection runs the same logic on rosters as on transaction data. Validation checks the same requirements regardless of file type. Plan association is fixed regardless of what the data contains.

**2. Single-plan context model.** The import pipeline assumes one-file-one-plan. The plan is set once at the beginning and persists across all files in a batch. For Óptica (one Excel file, one plan), this works. For Caribe (7 files, 4 plans), it means every file is associated with the wrong plan except possibly the first one.

**3. Field mapper as gate, not enrichment.** The TMR describes an enrichment layer where all columns are preserved and the AI adds semantic classifications. The implementation is a gate where columns must map to a fixed taxonomy or become "Unresolved" and are effectively lost. The taxonomy is too narrow (designed for Óptica's attainment-based compensation) and doesn't cover banking, insurance, or other domains.

### Why This Matters

These three failures compound. A file enters the system → gets classified correctly → classification is ignored → forced into wrong plan context → fields don't match narrow taxonomy → unresolved fields lost → wrong periods created from wrong date columns → data committed with wrong associations → calculation produces $0 or garbage → reconciliation fails.

The calculation engine works (Pipeline Proof Co proves it at 100%). The import pipeline is where data integrity breaks down.

---

## INTELLIGENCE CREDIBILITY GAP

### What We Claim
- "The system gets smarter each time" (classification signals / closed-loop intelligence)
- "AI interprets plan documents in 30 seconds" (plan import)
- "No column mapping wizard" (field mapping)

### What's Actually Happening
- Classification signals are WRITTEN but NOT READ on subsequent imports (F-29 feedback loop not closed)
- FirstName → Store ID at 95% confidence on the 4th+ import of the same roster
- Field mapping IS a column mapping wizard — and one with a narrow fixed taxonomy
- 50% and 74% confidence scores appear hardcoded, not computed
- "% confidence" displays as literal text, not a value

### What Needs to Be True for Demo
- Prior mapping corrections inform subsequent imports for the same tenant
- AI field suggestions are reasonable on first attempt (no FirstName → Store ID)
- Confidence scores are real and computed from the analysis
- The taxonomy is rich enough to handle banking data, not just optical retail

---

## SIGNAL LOOP STATUS

| Signal | Written? | Read? | Impact? |
|--------|----------|-------|---------|
| Classification signals (field mapping decisions) | ✅ HF-068 | ❌ Not queried on next import | Zero — same mistakes repeat |
| File type classification | ✅ AI identifies correctly | ❌ Ignored by validation, periods, plan association | Zero — downstream behavior unchanged |
| Plan interpretation confidence | ✅ AI produces scores | ⚠️ Display broken (literal "% confidence") | Cannot verify |
| Field mapping confidence | ✅ AI produces scores | ⚠️ Some appear hardcoded (50%, 74%) | Misleading |

---

## RECOMMENDED INTERVENTION SEQUENCE

### Phase 1: Data Integrity (Before any new demo attempt)

**OB-107: Import Pipeline Architecture Fix** — the big one.

Scope:
1. Classification propagation — file type influences validation, period detection, plan association
2. Multi-plan routing — AI determines which plan each file feeds, or allows user selection per file
3. Field mapper as enrichment layer — ALL columns preserved, AI adds semantic tags, no "Unresolved = lost"
4. Roster vs transaction distinction — rosters don't create periods, don't require plan metrics
5. Signal loop closure — read prior classification signals into AI prompt for the same tenant
6. Period detection context — only run on transaction/performance data files, not attribute dates

**HF-071: Erroneous Period Cleanup** — delete the 22 hire-date periods from Caribe's periods table.

**HF-072: Confidence Score Fix** — replace hardcoded 50%/74% with actual computed values. Fix "% confidence" literal text display.

### Phase 2: Demo Experience

**OB-108: Operate Overview Redesign** — Bloodwork-style operations cockpit replacing the static summary card.

**HF-073: Dead Page Cleanup** — remove or redirect Customer Launch Dashboard, fix "View Plans" link.

### Phase 3: Verification

**CLT-103: Caribe Full Pipeline Retest** — after OB-107 merges, re-run the complete Caribe walkthrough with all 13 files.

---

## LOCKED DECISIONS FROM THIS CLT

| # | Decision |
|---|----------|
| 51 | Field mapper must act as enrichment layer, not gate. ALL columns preserved in committed_data. AI adds semantic tags. Unmapped columns are carried, not lost. |
| 52 | Period auto-detection suppressed for files classified as roster/personnel. Only transaction/performance data triggers period creation. |
| 53 | Import pipeline must support multi-plan routing. No single-plan lock across file batches. AI determines plan association per file, or user selects. |
| 54 | Classification signals must be READ during subsequent imports for the same tenant. Prior corrections inform AI suggestions. |
| 55 | Confidence scores must be computed from actual analysis, not hardcoded. Display must show actual numeric values. |
| 56 | Validation logic must respect file classification. Roster files don't require plan-specific metrics. Transaction files validate against their associated plan. |

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*CLT-102: "52 findings. 22 P0. The engine works. The import pipeline is the critical path."*
