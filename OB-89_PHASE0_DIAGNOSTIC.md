# OB-89 Phase 0: Platform Diagnostic

## 0A: Demo Persona Switcher

**File exists:** `src/components/demo/DemoPersonaSwitcher.tsx`
**Mounted:** `src/components/layout/auth-shell.tsx` line 136

**FAILURE MODE: Case C — Auth round-trip.**
- Uses `supabase.auth.signOut()` + `supabase.auth.signInWithPassword()` (lines 102-108)
- Full page reload via `window.location.href = '/'` (line 117)
- Reset sends user to `/login` (line 133)
- `persona-context.tsx` already has `setPersonaOverride` but switcher ignores it
- No sessionStorage persistence — override lost on navigation

**Fix:** Replace auth round-trip with context-only `setPersonaOverride()` + sessionStorage.

## 0B: Stub / Duplicate Page Inventory

**Total route pages:** 134
**Pages with redirects:** 38

### Catch-all slug handlers (KEEP — they're 404 fallbacks):
- `configure/[...slug]`, `operate/[...slug]`, `investigate/[...slug]`, `govern/[...slug]`, `perform/[...slug]`, `design/[...slug]`

### Duplicate Reconciliation (5 pages → 1):
| Page | Status | Action |
|------|--------|--------|
| `/investigate/reconciliation` | LIVE — OB-87 rewrite | **KEEP** |
| `/admin/launch/reconciliation` | LIVE — older version | Redirect → `/investigate/reconciliation` |
| `/operate/reconcile` | Re-export of admin/launch | **DELETE** |
| `/govern/reconciliation` | Re-export of operate | **DELETE** |
| `/admin/reconciliation-test` | Debug/diagnostic | **KEEP** (admin tool) |

### Duplicate Calculations:
| Page | Status | Action |
|------|--------|--------|
| `/admin/launch/calculate` | LIVE — primary | **KEEP** |
| `/operate/calculate` | LIVE — secondary | Redirect → `/admin/launch/calculate` |
| `/investigate/calculations` | Re-export of operate | **DELETE** |
| `/govern/calculation-approvals` | LIVE — approvals | **KEEP** (different feature) |

### Sidebar links pointing to reconciliation:
- `/admin/launch/reconciliation` (vlAdminOnly) → update to `/investigate/reconciliation`

## 0C: Console Error Sources

### .trim() without null guard
- `auth-context.tsx:251` — cookie parsing: `.trim()` on split result (safe — always string after split)
- Most other .trim() calls are on form values, already guarded by conditional checks
- **Low risk** — most are structurally safe

### configuration.variants access
- `performance/plans/[id]/page.tsx:103` — `config.variants[0]` without null check
- `data/import/enhanced/page.tsx:634` — `plan.configuration.variants[0]` without null check
- `data/import/enhanced/page.tsx:1049,1638,3425` — multiple unguarded accesses
- **Medium risk** — these crash if configuration is not additive_lookup

### Supabase null tenant_id
- Persona context, demo persona switcher fetch with tenant_id that could be empty string
- **Fix**: early return on empty tenant_id

## 0D: N+1 Query Pattern

- Only 2 components create their own Supabase client (DemoPersonaSwitcher, LanguageSwitcher)
- 12 total direct `.from()` calls in components
- Main data fetching is through contexts (auth-context, tenant-context, persona-context)
- **Severity: LOW** — the 5,928 request claim appears overstated. Real fix is persona switcher removing auth round-trip.
