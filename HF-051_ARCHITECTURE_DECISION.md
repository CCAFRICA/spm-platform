# HF-051 Architecture Decision Record

## Problem
Multiple production pages fail to resolve. GPV exposed publicly. Sidebar fonts too small.

## MISSION A: Page Resolution

Option A1: Fix each page individually
  REJECTED — fragile, misses pages, doesn't prevent recurrence

Option A2: Fix Operate page loading pattern directly
  CHOSEN — The Operate page is the ONLY page with this bug (configure/govern/investigate
  are static nav hubs, insights already handles empty state, perform redirects to /).
  Fix: change `if (isLoading && periods.length === 0)` to proper isLoading/empty/content
  three-state pattern. No new component needed — the fix is 10 lines.
  Scale: only 1 page needs fixing. AI-first: no hardcoding. Atomic: pure UI.

Option A3: Create DataGuard wrapper component
  REJECTED — over-engineering for a single page fix. Only Operate has this bug.

## MISSION B: GPV Feature Flag

Option B1: Gate GPV behind hasCalculationData check (already exists) + default skip
  CHOSEN — The existing condition on page.tsx line 65 already checks hasCalculationData.
  The simplest fix: default gpvComplete to true when the GPV API returns no state.
  This means GPV only shows for tenants that have EXPLICITLY started the wizard.
  No database table needed. No API route needed. One line change.

Option B2: Platform-wide feature flag in platform_settings table
  DEFERRED — correct long-term architecture, but overkill for this immediate fix.
  When we need multiple feature flags, create the table then.

## MISSION C: Sidebar Fonts

Option C1: Increase inline fontSize values in ChromeSidebar.tsx
  CHOSEN — direct, verifiable, 7 targeted changes. No new classes or config.
  Minimum: 12px for labels/headers, 14px for interactive menu items.

REJECTED: A1 (fragile), A3 (over-engineering), B2 (premature)
