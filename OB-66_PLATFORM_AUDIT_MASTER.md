# OB-66: Comprehensive Platform Audit — Master Report

## Executive Summary

Full audit of the SPM Platform across 7 dimensions. **Zero code changes** — reports only.

### Platform Baseline
| Metric | Count |
|--------|-------|
| TypeScript files | ~605 |
| Page routes (page.tsx) | 135 |
| Unique pages with content | 102 |
| Re-export stubs | 33 |
| Components | ~205 |
| Library modules | ~168 |
| Pages with real DB queries | 9 (6.7%) |

---

## Dimension Scores

| # | Dimension | Score | Status | Report |
|---|-----------|-------|--------|--------|
| 1 | Navigation | 6.7% active | SPRAWL | `OB-66_01_NAVIGATION_AUDIT.md` |
| 2 | Page Quality (IAP) | 9/9 top, 40% empty states | PARTIAL | `OB-66_02_PAGE_QUALITY_AUDIT.md` |
| 3 | Hardcoding | 23 violations (4 CRITICAL) | NEEDS WORK | `OB-66_03_HARDCODING_AUDIT.md` |
| 4 | Schema Alignment | 1 remaining issue | GOOD | `OB-66_04_SCHEMA_AUDIT.md` |
| 5 | AI/ML Signal Mesh | 1/6 closed loop | PARTIAL | `OB-66_05_AI_ML_AUDIT.md` |
| 6 | Functionality Gaps | 86% avg workflow completion | GOOD | `OB-66_06_FUNCTIONALITY_GAPS.md` |
| 7 | Design Compliance | 50% avg across 5 dims | MIXED | `OB-66_07_DESIGN_COMPLIANCE.md` |

---

## Key Findings

### 1. Navigation (Phase 1)
- **135 total routes**, only **9 have real DB queries** (6.7%)
- **33 re-export stubs** (workspace aliases)
- **40+ orphaned pages** not linked from sidebar or workspaces
- **4 test/debug pages** should be removed (`/admin/demo`, `/test-ds`, etc.)
- Sidebar menu tree covers 60+ routes across 10 sections

### 2. Page Quality — IAP Gate (Phase 2)
- **Top scorer:** `/data/import/enhanced` at 9/9 (I:3, A:3, P:3)
- **12 pages fail IAP** completely (catch-all stubs, hub redirects)
- **~40% of active pages** handle empty states
- **0 pages** have timeout handling
- Most pages use seed data pattern (No Empty Shells principle)

### 3. Hardcoding (Phase 3)
- **23 total violations** across 4 severity levels
- **CRITICAL (4):** Spanish field names in `data-service.ts`, hardcoded business logic in `results-formatter.ts`, `employee-reconciliation-trace.ts`
- **HIGH (10):** Spanish field names in parsers, ICM-specific language in 10 components
- **AP-5/AP-6 violations:** 12 files with ~30+ hardcoded field names (`fecha`, `empleado`, `mes`, `año`)
- **AP-7 violations:** 2 files with hardcoded confidence scores

### 4. Schema Alignment (Phase 4)
- **P0 fixed (HF-054):** `profiles.entity_id` SELECT — was causing 13 error requests per page load
- **Remaining:** `scope_level` written during profile creation in 3 INSERT paths (medium risk — silently ignored if column absent)
- **lifecycle_state:** 70+ references, confirmed real column, 406 likely RLS-related
- **Query inventory:** ~100 SELECTs, ~48 INSERTs, ~27 UPDATEs across codebase

### 5. AI/ML Signal Mesh (Phase 5)
- **6 AI service files**, provider-agnostic through `AIService` singleton
- **5 API routes**, 1 bypasses AIService (direct Anthropic fetch in `/api/ai/assessment`)
- **Closed-loop score: 1/6** — Only field mapping has full capture → persist → consume → correction loop
- **3/6 partially closed** (capture + persist, no correction feedback)
- **2/6 open** (period detection: client-side only; assessment: bypasses AIService)

### 6. Functionality Gaps (Phase 6)
- **Import: 95%** — All core steps implemented, minor gaps in quality scoring
- **Calculation: 90%** — Engine complete, results persistence path needs verification
- **Reconciliation: 85%** — Strong comparison engines, dispute persistence missing (in-memory only)
- **Plan Management: 85%** — AI interpretation + storage complete, no versioning
- **Approval/Pay: 75%** — Lifecycle + export complete, approval routing uses demo data
- **3 critical dead ends:** Dispute storage, approval DB backend, trace data loading stubs

### 7. Design Compliance (Phase 7)
- **TMR Gating: 9%** — Only 9 of ~100+ pages have explicit role guards
- **VVSPv3: 75%** — 28 design-system + 33 UI components, but 44 raw HTML instances in app pages
- **Brand: 80%** — Consistent Vialuce branding, zero ClearComp references, persona token system
- **Accessibility: 15%** — Only 9 ARIA attributes across 356 TSX components
- **Responsive: 70%** — Sidebar collapses, grids adapt, but data tables may overflow

---

## Priority Matrix

### P0 — Critical (fix before production)
| Issue | Dimension | Impact |
|-------|-----------|--------|
| Approval routing has no DB persistence | Functionality | Requests lost on reload |
| Dispute creation has no DB persistence | Functionality | Disputes lost on reload |
| TMR gating on 91% of pages | Design | Unauthorized page access |
| Accessibility (9 ARIA attrs total) | Design | WCAG non-compliance |

### P1 — High (fix in next sprint)
| Issue | Dimension | Impact |
|-------|-----------|--------|
| 4 CRITICAL hardcoding violations | Hardcoding | Multi-tenant breakage |
| Assessment route bypasses AIService | AI/ML | No signal capture |
| 40+ orphaned pages | Navigation | Maintenance burden |
| Trace data loading stubs | Functionality | Reconciliation incomplete |

### P2 — Medium (fix in next quarter)
| Issue | Dimension | Impact |
|-------|-----------|--------|
| 10 HIGH hardcoding violations | Hardcoding | Language assumptions |
| 5/6 AI loops not fully closed | AI/ML | No learning improvement |
| Empty state coverage at 40% | Page Quality | Poor UX on empty data |
| Raw HTML in public pages | Design | Inconsistent UX |

### P3 — Low (backlog)
| Issue | Dimension | Impact |
|-------|-----------|--------|
| 33 re-export stubs | Navigation | Code maintenance |
| Plan versioning missing | Functionality | No rollback |
| `scope_level` INSERT writes | Schema | Silent fail (non-blocking) |

---

## Audit Reports Index

| File | Phase | Lines | Content |
|------|-------|-------|---------|
| `OB-66_01_NAVIGATION_AUDIT.md` | 1 | 174 | Route inventory, sidebar tree, orphans, sprawl |
| `OB-66_02_PAGE_QUALITY_AUDIT.md` | 2 | 88 | IAP scorecards, empty states, placeholders |
| `OB-66_03_HARDCODING_AUDIT.md` | 3 | 93 | AP violations, ICM language, domain logic |
| `OB-66_04_SCHEMA_AUDIT.md` | 4 | 73 | Query inventory, mismatches, verification SQL |
| `OB-66_05_AI_ML_AUDIT.md` | 5 | 115 | Touchpoints, signals, closed-loop status |
| `OB-66_06_FUNCTIONALITY_GAPS.md` | 6 | ~120 | 5 workflow assessments, dead ends |
| `OB-66_07_DESIGN_COMPLIANCE.md` | 7 | ~160 | TMR, VVSPv3, brand, a11y, responsive |
| `OB-66_PLATFORM_AUDIT_MASTER.md` | 8 | this file | Consolidated findings + priority matrix |

---
*OB-66 Comprehensive Platform Audit — February 19, 2026*
*Zero code changes. Reports only.*
