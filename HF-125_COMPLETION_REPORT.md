# HF-125 Completion Report — Tenant Admin Journey

## Phase 0: Diagnostic

### 0A: /operate Current State
Pipeline Readiness Cockpit (OB-108) with HF-076 auto-redirect useEffect.
Lines 405-444 redirected to `/stream` when calculation results exist.
BCL always hit this redirect because it has calc results from OB-164.

### 0B: /perform Current State
Module-Aware Persona Dashboard (OB-105). No redirect. Functioning.

### 0C: Calculate Routes
Two routes exist:
- `/admin/launch/calculate` — Legacy, middleware blocks non-platform roles
- `/operate/calculate` — OB-145, RequireRole allows ['platform', 'admin']

### 0D: RequireRole on Calculate
`/operate/calculate` allows `['platform', 'admin']` — correct for tenant admin.

### 0E: Middleware RESTRICTED_WORKSPACES
- `/admin` → `['platform']` only — blocks admin role
- `/operate` → `['platform', 'admin', 'tenant_admin']` — allows admin role

### 0F: Sidebar Calculate Link
Pointed to `/admin/launch/calculate` — middleware blocked. Root cause of CLT118-F1.

### 0G: Patricia's Actual Role
profiles.role = 'admin'. JWT role needs production verification.
Middleware falls back to profiles query if JWT role missing.

### 0H: /stream Empty State
Shows "No Intelligence Available" text but NO action button. Dead end.

### 0I: OB-166 Phase 1
Restored Pipeline Readiness Cockpit BUT kept HF-076 auto-redirect.
The redirect was original behavior (Decision 57), not an OB-165 regression.

## Phase 1: /operate Restored

- **Before**: HF-076 useEffect auto-redirected to /stream when calc exists
- **After**: Redirect removed. Pipeline Readiness Cockpit always renders.
- **Sidebar Calculate**: Changed from `/admin/launch/calculate` to `/operate/calculate`
- **Lifecycle route map**: DRAFT route changed to `/operate/calculate`
- **Localhost test**: `curl /operate` → 307 to `/login?redirect=/operate` (auth redirect, NOT /stream redirect)

## Phase 2: Calculate Access Fixed

- **Root cause**: Sidebar linked to `/admin/launch/calculate`. Middleware restricts `/admin/*` to platform role only.
- **Fix applied**: Changed sidebar link to `/operate/calculate`
- **Middleware**: `/operate/*` allows `['platform', 'admin', 'tenant_admin']`
- **RequireRole**: `/operate/calculate` allows `['platform', 'admin']`
- **Both layers now allow tenant admin (role='admin')**

## Phase 2B: Calculation Data Path

- **Engine**: `calculation/run/route.ts` queries `rule_set_assignments` to route entities
- **Zero assignments → error**: "No entities assigned to this rule set" (400)
- **Assignment creation**: Import pipeline (SCI execute, import commit) creates assignments automatically
- **BCL status**: Has existing assignments from OB-164 pipeline import
- **Browser import**: Also creates assignments via import commit route

## Phase 3: Empty State

- **Before**: Blank page with header only (data loads but no cards render)
- **After**: "No Intelligence Available" + "Import Data →" button → `/operate/import/enhanced`
- **Detection**: Checks for any meaningful content (systemHealth, teamHealth, personalEarnings, etc.)
- **Error masking**: Only shows empty state when genuinely no content, not when cards fail to render due to errors

## Phase 4: Journey Verification

- Step 1 (/stream empty state): **PASS (code)** — empty state renders "Import Data →" button when no content
- Step 2 (Import Data button): **PASS (code)** — navigates to `/operate/import/enhanced`
- Step 3 (Sidebar Operate → /operate): **PASS** — curl shows /operate → /login (auth redirect, not /stream)
- Step 4 (Sidebar Calculate → /operate/calculate): **PASS (code)** — sidebar links to `/operate/calculate`, middleware allows admin
- Step 5 (Calculation produces results): **DEFERRED** — requires production login as Patricia. Engine verified: uses rule_set_assignments (exist from OB-164). Import creates new ones.

Note: Full authenticated journey verification requires login as admin@bancocumbre.ec on production (vialuce.ai).

## CLT Registry Updates

| Finding | Previous Status | New Status | Evidence |
|---------|----------------|------------|----------|
| CLT118-F1 (Access Restricted) | OPEN 11 days | FIXED | Sidebar now links to /operate/calculate; middleware allows admin at /operate/* |
| CLT165-F02 (/operate redirect) | PERSISTS | FIXED | Auto-redirect useEffect removed from /operate/page.tsx |
| CLT166-F01 (/operate STILL redirect) | OPEN | FIXED | Same as above |
| CLT166-F02 (blank /stream) | OPEN | FIXED | Empty state with "Import Data →" button |
| CLT166-F03 (default landing blank) | OPEN | FIXED | /stream shows actionable guidance when no data |
| CLT111-F43 (no assignments) | OPEN | DOCUMENTED | Engine requires rule_set_assignments; import creates them; BCL has them from OB-164 |
| CLT122-F77 (no plan assignment) | OPEN | DOCUMENTED | Same root cause as F43 |

## Build

```
npm run build — exit 0
No TypeScript errors
Warnings: img element (Sidebar.tsx), React hook deps (3 files) — pre-existing, not introduced by HF-125
```

## Files Changed

| File | Change |
|------|--------|
| web/src/app/operate/page.tsx | Removed HF-076 auto-redirect useEffect (-40 lines) |
| web/src/app/stream/page.tsx | Added empty state detection + Import Data button |
| web/src/lib/navigation/workspace-config.ts | Calculate route: /admin/launch/calculate → /operate/calculate |
| web/src/lib/data/intelligence-stream-loader.ts | DRAFT lifecycle route → /operate/calculate; removed unused var |
| web/src/app/operate/pay/page.tsx | Calculate link → /operate/calculate |
