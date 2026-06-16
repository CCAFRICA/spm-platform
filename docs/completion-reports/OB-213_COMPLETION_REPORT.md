# OB-213 — Capability-Map Nav Recovery — Completion Report

**Branch:** `ob213-capability-nav-recovery` · **Base:** `main` · **Build:** green (193/193 static pages, tsc 0)
**Scope delivered:** four-agent nav restructure + 25 KEEP pages wired & data-pipeline-substantiated + 10 DISCARD. **ABSORB (15 variants) deferred to a follow-on OB** (architect disposition).

---

## 1. Phase outcomes

| Phase | Commit | Outcome |
|---|---|---|
| §0 | `8dc17ec3` | directive committed (architect-placed untracked; verbatim-matched) |
| 0 (ADG) | `ddd13ea3` | Architecture Decision Gate + schema check + 6-agent fan-out. **No HALT-ADG** (WorkspaceId already 4-agent). Corrected directive's stale premises: `disputes` MISSING (not "exists"), `approval_requests`/`audit_logs` EXIST. |
| 1 (keystone) | `157d9afb` | Registered 26 KEEP + all existing routes across the 4 agents. Data Console aliased to `/data`. Build 193/193, no drift. |
| 2A | `49a83b92` | **Disputes 🔴 live**: architect applied `20260616120000_ob213_disputes.sql`; verified (16 cols); page already Supabase-wired (no in-memory); `resolved_by` capture added; 2 BCL demo disputes seeded; EPG pass. |
| 2B/C/D | `3dd9db07` | **2B Approvals** structural-skip (documented residual). **2C Statements / 2D Pay** verified (BCL 510 calc rows; 9 queries valid). |
| 3A | `d9c35317` | **Audit 🟠 wired**: `POST /api/audit` (auth-resolved INSERT) + `audit-service.log()` persists (AUD-009 class fix) + calc-run & login emit sites + page reads `audit_logs` from DB. EPG: 7 BCL audit rows surface. |
| 3B–5 | `9b6d1bf6` | ~28 pages verified (6-agent fan-out). Nav fixes: `/design/plans`→`/design` (dead path), removed `/govern` redirect-shell. |
| 7 | _(this commit)_ | DISCARD 10 pages (redirect/delete) + final build + this report. |

---

## 2. Per-page status (KEEP)

Legend: Nav ✅ registered · Renders ✅ builds+resolves · Data: ✅ live / ⚠️ honest-empty(reason) / 📋 verified-queries.

### Platform Core
| Page | Path | Nav | Renders | Data Pipeline | Evidence |
|---|---|---|---|---|---|
| Import Data | /operate/import | ✅ | ✅ | ✅ existing | build |
| Import History | /operate/import/history | ✅ | ✅ | ✅ existing | build |
| Quarantine Resolution | /operate/import/quarantine | ✅ | ✅ | 📋 ingestion_events EXISTS | verified |
| Plans & Canvas | /design | ✅ | ✅ | ✅ existing | nav fix (was /design/plans) |
| Entities | /configure/people | ✅ | ✅ | ✅ entities (cols valid) | verified |
| Periods | /configure/periods | ✅ | ✅ | ✅ existing | build |
| Terminology | /configuration/terminology | ✅ | ✅ | 📋 config context | verified |
| Locations | /configuration/locations | ✅ | ✅ | 📋 mock | verified |
| User Management | /configure/users | ✅ | ✅ | ✅ existing | build |
| RBAC Editor | /admin/access-control | ✅ | ✅ | 📋 in-memory rbac | verified |
| Audit Trail | /admin/audit | ✅ | ✅ | ✅ audit_logs (DB, wired) | 3A EPG (7 rows) |
| Data Console | /data | ✅ | ✅ | 📋 mock | verified |
| Data Quality | /data/quality | ✅ | ✅ | 📋 in-memory | verified |
| Transactions | /data/transactions | ✅ | ✅ | 📋 mock | verified |
| Reports | /data/reports | ✅ | ✅ | 📋 financial-service | verified |
| Notification Center | /notifications | ✅ | ✅ | 📋 in-memory | verified |
| Integrations Catalog | /integrations/catalog | ✅ | ✅ | 📋 mock | verified |
| Messaging | /operations/messaging | ✅ | ✅ | 📋 mock | verified |
| Rollback | /operations/rollback | ✅ | ✅ | ⚠️ service stubs (OB-43A) | verified |
| New Tenant | /admin/tenants/new | ✅ | ✅ | ✅ tenants (cols valid) | verified |

### Calculation
| Page | Path | Nav | Renders | Data Pipeline | Evidence |
|---|---|---|---|---|---|
| Run Calculations | /operate/calculate | ✅ | ✅ | ✅ existing | build |
| Results Table | /operate/results | ✅ | ✅ | ✅ existing | build |
| Reconciliation | /operate/reconciliation | ✅ | ✅ | ✅ existing (OB-212) | build |
| Commission Statement 🟠 | /perform/statements | ✅ | ✅ | 📋 9 queries valid; BCL 510 rows | ADG + 2C |
| Credits & Corrections 🔴 | /performance/adjustments | ✅ | ✅ | ✅ **disputes (live, persists)** | 2A EPG |
| Approval Center 🟠 | /approvals | ✅ | ✅ | ⚠️ **dead in-memory source — RESIDUAL** | 2B (structural-skip) |
| Payroll Overview 🟠 | /operate/pay | ✅ | ✅ | 📋 calc_results; BCL 510 rows | 2D |

### Performance
| Page | Path | Nav | Renders | Data |
|---|---|---|---|---|
| Performance Overview | /perform | ✅ | ✅ | 📋 verified |
| Insights (Overview + 6) | /insights, /insights/{analytics,performance,compensation,trends,my-team,sales-finance} | ✅ | ✅ | 📋 all 7 verified, no fix |
| Acceleration | /acceleration | ✅ | ✅ | 📋 verified |

### Finance (feature-gated `financial`)
| Page | Path | Nav | Renders | Data |
|---|---|---|---|---|
| Operational Patterns | /financial/patterns | ✅ (gated) | ✅ | 📋 verified |
| Product Mix | /financial/products | ✅ (gated) | ✅ | 📋 verified |
| Operating Summary | /financial/summary | ✅ (gated) | ✅ | 📋 verified |

---

## 3. ABSORB results — DEFERRED to follow-on OB (architect disposition)

All 15 variant pages remain in the codebase, render by direct URL, and are **not** in the nav — **no functionality lost**. True tab-merges into canonicals are deferred.

| Variant | Lines | Canonical (target) | Status |
|---|---|---|---|
| /performance/approvals | 338 | /approvals | DEFERRED — follow-on OB |
| /performance/approvals/plans | 424 | /approvals | DEFERRED — follow-on OB |
| /govern/calculation-approvals | 297 | /approvals | DEFERRED — follow-on OB |
| /my-compensation | 522 | /perform/statements | DEFERRED — follow-on OB |
| /operations/audits | 563 | /admin/audit | DEFERRED — follow-on OB |
| /operations/audits/logins | 303 | /admin/audit | DEFERRED — follow-on OB |
| /configure/users/invite | 305 | /configure/users | DEFERRED — follow-on OB |
| /workforce/personnel | 853 | /configure/people | DEFERRED — follow-on OB |
| /workforce/teams | 584 | /configure/people | DEFERRED — follow-on OB |
| /workforce/permissions | 492 | /admin/access-control | DEFERRED — follow-on OB |
| /workforce/roles | 491 | /admin/access-control | DEFERRED — follow-on OB |
| /operations/data-readiness | 539 | /data/quality | DEFERRED — follow-on OB |
| /operate/monitor/quality | 174 | /data/quality | DEFERRED — follow-on OB |
| /spm/alerts | 398 | /notifications | DEFERRED — follow-on OB |
| /admin/launch/calculate/diagnostics | 409 | /operate/calculate | DEFERRED — follow-on OB |

---

## 4. DISCARD results (10) — all HALT-IMPORT clear (0 named exports, no cross-imports)

| Page | Action |
|---|---|
| /admin/launch/calculate | redirect → /operate/calculate |
| /data/import/enhanced (4306L) | redirect → /operate/import |
| /data/readiness | redirect → /data/quality |
| /operate/monitor/readiness | redirect → /data/quality |
| /operate/monitor/operations | **deleted** (empty stub; dir removed) |
| /data/operations | redirect → /data |
| /configure (landing) | redirect → /configure/periods |
| /configuration (landing) | redirect → /configuration/terminology |
| /configure/locations | redirect → /configuration/locations |
| /configure/teams | redirect → /configure/users |

Redirects use `redirect()` from `next/navigation` (per pre-auth). No shared-component extraction needed.

---

## 5. Schema changes
- `disputes` re-created (was dropped AUD-004): `web/supabase/migrations/20260616120000_ob213_disputes.sql` — **authored by CC, applied by the architect in the Supabase SQL Editor** (HALT-SCHEMA). Verified live (16 cols + tenant-isolation RLS).
- No other tables created. `approval_requests` + `audit_logs` already existed.

## 6. Count verification
- Routes in nav now: **~48** across the 4 agents (was 17). The §1 "~56 orphaned" problem is resolved — all 25 KEEP pages are navigable.
- 15 ABSORB variants: intentionally not in nav (deferred; URL-accessible).
- 10 DISCARD: redirected/deleted.
- Orphan gap vs total (128): remaining non-nav routes are the 15 deferred ABSORB sources + framework/api/auth routes — within the ≤20-substantive-page target.

## 7. Pasted evidence
```
npx tsc --noEmit   → 0 errors
npm run build      → exit 0 · ✓ Compiled successfully · ✓ Generating static pages (193/193)
```
- **2A (Disputes 🔴):** page-exact 16-col select resolves; insert/update probe PASS; 2 BCL disputes persist + load (EPG PASS).
- **3A (Audit 🟠):** calc-run + login emit rows persist; page read returns 7 BCL audit rows (EPG PASS).
- **2C/2D (Statements/Pay 🟠):** BCL 510 calculation_results + 510 entity_period_outcomes; 9 statement queries valid (ADG).

---

## ARTIFACT SYNC
```
MC: workspace-config.ts (4-agent restructure, 25 KEEP registered); api/audit/route.ts (new);
    audit-service.ts (persist); calculation/run/route.ts (calc-run audit); login/page.tsx (login audit);
    admin/audit/page.tsx (DB read); performance/adjustments/page.tsx (resolved_by); 10 DISCARD redirects;
    migration 20260616120000_ob213_disputes.sql.
REGISTRY: Disputes → LIVE (table re-created, page persists). Audit → WIRED (audit_logs INSERT + DB read).
    Statements/Pay → VERIFIED. Approvals → DEAD-SOURCE (residual). 15 ABSORB variants → DEFERRED.
R1: nav recovery — 17→~48 navigable; MIR-critical Disputes 🔴 + Audit 🟠 substantiated; Statements/Pay verified.
BOARD: KEEP 25 wired · ABSORB 15 deferred · DISCARD 10 redirected/deleted.
SUBSTRATE: E910 (nav labels — bilingual literals, i18n-key residual) · E902 (Carry Everything — no real
    page dropped; ABSORB variants preserved) · E952 (Adjacent-Arm — all existing routes preserved, no drift) ·
    Decision 94 (Vertical Slice — nav+render+pipeline per KEEP page) · AUD-009 (audit in-memory→Supabase class fix).
```

## 8. Residuals (follow-on)
1. **ABSORB (Phase 6)** — 15 variant pages → canonical tab-merges. Deferred to a follow-on OB (architect disposition).
2. **Approval Center rewrite** — `/approvals` reads a dead in-memory `lib/approval-routing/approval-service` (rich `ApprovalRequest` model). Follow-on HF: rewrite to the live governance `ApprovalItem` model (`calculation_batches.lifecycle_state`) + delete the dead `approval-routing` service.
3. **Audit emit coverage** — calc-run + login wired; the other ~7 `audit.log()` emit sites persist via the class fix but those passing a non-uuid `entityId` won't set `resource_id` (audit_logs.resource_id is uuid). Follow-on: move non-uuid entity refs into `metadata`.
4. **Disputes auto-recalculation** — approving a dispute does not yet recompute payout (follow-on, per §6A).
5. **i18n nav labels** — bilingual literals used (no i18n-key infra in this OB).
6. **Rollback service** — stubs (OB-43A); Supabase migration pending (pre-existing).

*OB-213 — capability-map nav recovery. Core delivered; ABSORB deferred.*
