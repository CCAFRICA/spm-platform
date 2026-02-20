# OB-66 Phase 1: Navigation Audit

## Route Inventory

**Total page.tsx files:** 135
**Re-export stubs (route aliases):** 33
**Unique pages with real content:** 102
**Pages with data queries (from/select/fetch):** 9
**Pages with zero data queries:** 126

## Route Resolution

All 135 routes tested against localhost:3000:
- **HTTP 200:** 3 routes (`/landing`, `/login`, `/signup`) — public pages
- **HTTP 307:** ~125 routes — protected, redirect to login (expected)
- **HTTP 308:** 3 routes (`/data/reports`, `/data/transactions`, `/transactions/orders`) — Next.js normalization
- **No response:** ~7 routes with dynamic segments (`[...slug]`, `[id]`, `[entityId]`) — cannot test without params
- **HTTP 404:** 0
- **HTTP 500:** 0

## Sidebar Menu Tree (from Sidebar.tsx)

```
Home                → /
My Compensation     → /my-compensation

Insights
├── Overview        → /insights
├── Analytics       → /insights/analytics
├── My Performance  → /insights/performance
├── My Team         → /insights/my-team
├── Compensation    → /insights/compensation
├── Disputes        → /insights/disputes
├── Sales Finance   → /insights/sales-finance
└── Trends          → /insights/trends

Transactions
├── Overview        → /transactions
├── Orders          → /transactions/orders
├── Find            → /transactions/find
├── Disputes        → /transactions/disputes
└── Inquiries       → /transactions/inquiries

Performance
├── Overview        → /performance
├── Goals           → /performance/goals
├── Plans           → /performance/plans
├── Adjustments     → /performance/adjustments
├── Approvals       → /performance/approvals
└── Scenarios       → /performance/scenarios

Financial (feature-gated)
├── Network Pulse   → /financial
├── Benchmarks      → /financial/performance
├── Timeline        → /financial/timeline
├── Staff           → /financial/staff
└── Leakage         → /financial/leakage

Configuration
├── Overview        → /configuration
├── Personnel       → /configuration/personnel
├── Teams           → /configuration/teams
├── Locations       → /configuration/locations
└── Terminology     → /configuration/terminology

Data
├── Overview        → /data
├── Enhanced Import → /data/import/enhanced
├── Import History  → /data/imports
├── Operations      → /data/operations
├── Quality         → /data/quality
└── Reports         → /data/reports

Approvals           → /approvals

Operations
├── Audits          → /operations/audits
├── Data Readiness  → /operations/data-readiness
├── Messaging       → /operations/messaging
└── Rollback        → /operations/rollback

Admin
├── Launch          → /admin/launch
├── Access Control  → /admin/access-control
├── Audit           → /admin/audit
└── New Tenant      → /admin/tenants/new
```

## Workspace Navigation (workspace-config.ts)

Two workspace overlays exist:
1. **Operate** — `/operate/*` (calculate, import, approve, reconcile, results, pay, monitor)
2. **Perform** — `/perform/*` (dashboard, compensation, team, transactions, inquiries, trends)

These map to the same underlying pages via re-exports.

## Orphaned Pages (not linked from sidebar or workspaces)

| Route | Lines | Classification |
|-------|-------|---------------|
| `/acceleration` | 635 | ORPHAN — no sidebar link |
| `/admin/demo` | 269 | ORPHAN — test/demo page |
| `/admin/reconciliation-test` | 194 | ORPHAN — test page |
| `/admin/test/ob-15-proof-gate` | 335 | ORPHAN — test page |
| `/configure/*` (8 pages) | various | ORPHAN — duplicate of /configuration |
| `/design/*` (7 pages) | various | ORPHAN — not in sidebar |
| `/govern/*` (8 pages) | various | ORPHAN — not in sidebar |
| `/integrations/catalog` | 509 | ORPHAN — not in sidebar |
| `/investigate/*` (10 pages) | various | ORPHAN — not in sidebar |
| `/notifications` | 514 | ORPHAN — not in sidebar |
| `/spm/alerts` | 398 | ORPHAN — not in sidebar |
| `/test-ds` | 239 | ORPHAN — design system test |
| `/upgrade` | 393 | ORPHAN — not in sidebar |
| `/workforce/*` (4 pages) | various | ORPHAN — not in sidebar |

## Page Classification

### ACTIVE (real data queries, renders content): 9 pages
- `/data/import/enhanced` — 3,941 lines, 5 data queries
- `/admin/launch/reconciliation` — 1,587 lines, 3 queries
- `/admin/launch/calculate` — 708 lines, 2 queries
- `/admin/launch/plan-import` — 1,534 lines, 1 query
- `/signup` — 458 lines, 2 queries
- `/operate/import/history` — 301 lines, 1 query
- `/operate/import/quarantine` — 314 lines, 1 query
- `/admin/reconciliation-test` — 194 lines, 2 queries
- `/` (dashboard) — 140 lines, 1 query

### RE-EXPORT STUBS: 33 pages (2-8 lines, alias routes)
operate/*, perform/*, design/*, govern/*, configure/*, investigate/* catch-alls

### STATIC/SEED DATA: ~60 pages
Pages that render content from hardcoded seed data, localStorage, or context providers.
Examples: `/financial/*`, `/insights/*`, `/performance/*`, `/transactions/*`

### HUB/NAV PAGES: ~15 pages
Landing pages that link to sub-pages with no data of their own.
Examples: `/data`, `/admin/launch`, `/operate`, `/configuration`

### TEST/DEBUG: 4 pages
- `/admin/demo`
- `/admin/reconciliation-test`
- `/admin/test/ob-15-proof-gate`
- `/test-ds`

## Sprawl Score

- **Total pages:** 135
- **Pages with real DB queries:** 9 (6.7%)
- **Re-export stubs:** 33 (24.4%)
- **Orphaned (not in nav):** ~40+ (30%)
- **Sprawl ratio:** 93% of pages have zero direct data queries

## Recommendations

### CUT (remove entirely)
- `/admin/demo` — debug page
- `/admin/test/ob-15-proof-gate` — test artifact
- `/test-ds` — design system test
- `/admin/reconciliation-test` — test artifact

### MERGE (consolidate duplicates)
- `/configure/*` → already duplicated by `/configuration/*`
- `/govern/*` → largely re-exports, merge into sidebar nav
- `/investigate/*` → largely re-exports, merge into sidebar nav
- `/design/*` → largely re-exports, merge into sidebar nav

### PROMOTE (add to navigation)
- `/notifications` — useful but unreachable
- `/workforce/*` — personnel management not in sidebar

---
*OB-66 Phase 1 — February 19, 2026*
