# HF-021: localStorage Data Wipe on App Restart
## Hotfix — Interactive Mode (Stop and Validate)
## Date: February 13, 2026
## SEVERITY: CRITICAL — All tenant data lost on dev server restart + hard refresh

---

## THE PROBLEM

After OB-38 completion (13 phases, all PASS, clean build), restarting the dev server and doing CMD+SHIFT+R (hard refresh) causes ALL tenant data to disappear. RetailCGMX — which had an imported plan, 2157 committed data rows, calculation results for 719 employees totaling MX$1.2M+ — is completely gone.

`Object.keys(localStorage)` returns only 8 keys:
```
vialuce_recent_pages, foundation_approval_requests, entityb_current_user,
foundation_import_batches, entityb_user_role, audit_log,
foundation_checkpoints, vialuce_nav_signals
```

Zero tenant data. Zero plans. Zero calculations. Zero committed data.

This did NOT happen before OB-38. The standard post-commit procedure (kill dev server, rm -rf .next, npm run build, npm run dev, CMD+SHIFT+R) has been done after every OB batch and tenant data always persisted.

## ROOT CAUSE HYPOTHESIS

OB-38 Phase 9 modified `storage-migration.ts` comments and `auth-context.tsx`. The auth context calls `migrateStorageKeys()` at line 430 during initialization. Something in the auth initialization flow — possibly a demo reset, demo data reload, or tenant provisioning re-initialization — is wiping tenant-created data (RetailCGMX) while preserving hardcoded demo scaffolding (TechCorp, RestaurantMX, RetailCo, FRMX Demo).

The migration script itself (`src/lib/storage/storage-migration.ts`) only migrates `clearcomp_` → `vialuce_` prefix keys, which is not destructive. But the auth context initialization chain may trigger other services that ARE destructive.

## SUSPECTS (from grep analysis)

1. **`src/contexts/auth-context.tsx:430`** — calls `migrateStorageKeys()`. What else runs in this initialization block?
2. **`src/lib/demo/demo-reset.ts:56,174,187`** — broad key deletion
3. **`src/lib/demo/demo-service.ts:84,187`** — broad key deletion
4. **`src/lib/tenant/provisioning-engine.ts:633`** — deletes keys during provisioning
5. **`src/lib/demo/foundation-demo-data.ts:592`** — deletes keys during demo data setup
6. **`src/lib/data-architecture/data-layer-service.ts:1670,2388-2421`** — clears raw/transformed/checkpoint data

## PHASE 1: TRACE THE INITIALIZATION CHAIN

Read the auth context initialization flow. Do NOT write any code yet.

```bash
echo "=== AUTH CONTEXT INITIALIZATION ==="
sed -n '420,450p' src/contexts/auth-context.tsx

echo ""
echo "=== WHAT CALLS DEMO RESET? ==="
grep -n "demoReset\|resetDemo\|initializeDemo\|loadDemoData\|setupDemo\|provisionDemo" src/contexts/auth-context.tsx

echo ""
echo "=== WHAT DOES DEMO RESET DO? ==="
cat src/lib/demo/demo-reset.ts

echo ""
echo "=== WHAT DOES DEMO SERVICE DELETE? ==="
sed -n '70,100p' src/lib/demo/demo-service.ts
sed -n '175,200p' src/lib/demo/demo-service.ts

echo ""
echo "=== WHAT DOES PROVISIONING ENGINE DELETE? ==="
sed -n '620,650p' src/lib/tenant/provisioning-engine.ts

echo ""
echo "=== WHAT DOES FOUNDATION DEMO DATA DELETE? ==="
sed -n '580,600p' src/lib/demo/foundation-demo-data.ts

echo ""
echo "=== AUTH CONTEXT FULL useEffect BLOCKS ==="
grep -n "useEffect" src/contexts/auth-context.tsx
```

### PHASE 1 REQUIRED OUTPUT

Document the complete initialization chain:
```
APP LOADS
  → AuthProvider mounts
    → useEffect at line [X] fires
      → calls [function A]
        → calls [function B]
          → localStorage.removeItem([keys])

DESTRUCTIVE CHAIN IDENTIFIED:
  Function: [name]
  File: [path:line]
  What it deletes: [pattern — all keys matching X, or specific keys]
  Why it fires: [triggered by auth init, demo setup, or provisioning]
  WHY THIS IS NEW: [what OB-38 changed that caused this to start happening]
```

**Commit:** `HF-021-1: Root cause diagnostic trace`

---

## PHASE 2: APPLY THE FIX

Based on Phase 1 findings, apply the minimum fix:

**IF the destructive chain is demo reset/reload:**
- Guard the demo reset so it ONLY runs when explicitly triggered by a user action (button click), NOT on app initialization
- Demo data initialization should CHECK if data exists before overwriting
- Pattern: `if (!localStorage.getItem(key)) { initializeDemoData(); }`

**IF the destructive chain is provisioning engine cleanup:**
- Guard the cleanup so it ONLY removes data for tenants being de-provisioned, NOT all tenant data
- Customer-created tenants (like RetailCGMX) must be preserved

**IF the destructive chain is the storage migration itself:**
- The migration should COPY then DELETE, never DELETE without confirming the copy succeeded
- Add a migration marker: `localStorage.setItem('vialuce_migration_v1_complete', Date.now())`
- Skip migration if marker exists

**CRITICAL CONSTRAINT:** The fix must NOT break the demo tenant system. TechCorp, RestaurantMX, RetailCo, and FRMX Demo must still initialize correctly for new visitors.

**PROOF GATE 2:** After the fix:
1. Kill dev server, rm -rf .next, npm run build, npm run dev
2. Create a test key: `localStorage.setItem('test_tenant_data', 'should_survive')`
3. Kill dev server, rm -rf .next, npm run build, npm run dev, CMD+SHIFT+R
4. `localStorage.getItem('test_tenant_data')` returns `'should_survive'`

**Commit:** `HF-021-2: Fix destructive initialization chain`

---

## PHASE 3: VERIFY DEMO SYSTEM STILL WORKS

1. Clear ALL localStorage: `localStorage.clear()` in console
2. Refresh the page
3. Verify: TechCorp, RestaurantMX, RetailCo, FRMX Demo tenants appear
4. Verify: Demo data initializes correctly for at least one tenant
5. Verify: No console errors related to missing data

**PROOF GATE 3:** Demo tenants provision correctly from clean state. Customer-created data persists across restarts.

**Commit:** `HF-021-3: Verify demo provisioning still works`

---

## HARD GATES

| # | Gate | Criterion |
|---|------|-----------|
| HG-1 | Root cause documented | Initialization chain traced with exact file:line of destructive call and explanation of what OB-38 changed |
| HG-2 | Test key survives restart | `localStorage.setItem('test_key', 'persist')` → restart → `localStorage.getItem('test_key')` returns `'persist'` |
| HG-3 | Demo tenants still provision | From `localStorage.clear()` state, demo tenants appear correctly |
| HG-4 | Build passes | `npm run build` exits 0 |
| HG-5 | Completion report | `HF-021_COMPLETION_REPORT.md` at project root |

---

## CC RULES

- Commit after each phase
- After every commit: kill dev server, rm -rf .next, npm run build, npm run dev
- Completion report at PROJECT ROOT
- ASCII-only commit messages
- This is interactive mode — STOP after Phase 1 and show findings before proceeding
