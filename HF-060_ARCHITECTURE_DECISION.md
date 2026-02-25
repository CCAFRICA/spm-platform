# HF-060 Architecture Decision Record

## Problem

Persona filtering on Financial pages doesn't work. When VL Admin uses DemoPersonaSwitcher to impersonate Rep/Manager, the scope in persona-context.tsx always returns `canSeeAll: true` because it checks `user!.role === 'vl_admin'` (the real auth role) instead of the effective persona. Financial pages see `canSeeAll=true` → pass no filter → full admin view.

## Root Cause

`persona-context.tsx` line 140: scope derivation uses `user!.role` (real Supabase auth role) instead of the active `persona` value (which includes demo override). The `useEffect` that fetches scope depends on `[user, currentTenant]` but NOT on `override`/`persona`, so it never re-fetches when the persona switches.

## Option A: Fix persona-context scope derivation to respect override

- In persona-context.tsx, make scope depend on effective `persona` (includes override)
- When persona='admin' → canSeeAll: true
- When persona='manager' and real user is admin → fetch all location entities → entityIds
- When persona='rep' and real user is admin → fetch one individual entity → entityIds
- Scale test: Yes — queries are bounded (entity count per tenant)
- AI-first: No hardcoding — entity types queried dynamically
- Transport: No data through HTTP bodies
- Atomicity: N/A (read-only)

## Option B: Fix only in financial pages (check persona, not just scope)

- Keep persona-context unchanged
- In each financial page, check `persona` in addition to `scope.canSeeAll`
- If persona='rep', fetch entity list from Supabase to build scopeEntityIds
- Scale test: Yes
- AI-first: No hardcoding
- Transport: Additional per-page Supabase calls (Standing Rule 26 violation)
- Atomicity: N/A

## Option C: Fix in financial-data-service (thin client layer)

- Add persona parameter to all service functions
- Service queries entities and builds scope before API call
- Scale test: Yes
- AI-first: No hardcoding
- Transport: Additional client-side queries per service call
- Atomicity: N/A

## CHOSEN: Option A

Fix at the source (persona-context). All pages using `usePersona()` benefit — not just financial pages. No Standing Rule 26 violation. The persona context is the correct place to derive scope from the effective persona.

## REJECTED: Option B — violates Standing Rule 26 (zero component-level Supabase calls) and requires changes in every financial page
## REJECTED: Option C — adds client-side queries, wrong layer for scope logic

## Additional: Rep → Server Detail redirect

In financial/page.tsx, when persona='rep', redirect to /financial/server/[entityId] instead of showing Network Pulse. This matches the HF-060 spec. The entityId comes from persona-context (already provided).
