# OB-93 Architecture Decision Record

```
ARCHITECTURE DECISION RECORD
============================
Problem: Multiple contexts independently query Supabase on mount,
21 pages make direct Supabase calls (bypassing service layer),
and 49 scattered service files duplicate query patterns.
Combined: hundreds of redundant round trips per page load.

Option A: SessionContext (global) + PageLoaders (per-route)
  - SessionContext fetches: tenant, profile, counts ONCE at auth
  - Existing page-loaders.ts enhanced with loaders for all workspace landing pages
  - Pages consume loader data — no direct Supabase calls
  - Scale test: Works at 10x? YES — adding a component never adds a query
  - AI-first: Any hardcoding? NO
  - Transport: Data through HTTP bodies? NO
  - Atomicity: YES — loader succeeds with all data or shows error

Option B: React Query / SWR with deduplication
  - Add query library that auto-deduplicates identical requests
  - Components still fetch independently but library merges identical calls
  - Scale test: PARTIAL — reduces duplicates but doesn't prevent proliferation
  - AI-first: YES
  - Transport: N/A
  - Atomicity: PARTIAL — each query resolves independently

Option C: Server Components (Next.js RSC)
  - Move data fetching to server components
  - Scale test: YES
  - Risk: Requires massive component refactoring, conflicts with client contexts
  - Transport: N/A
  - Atomicity: YES

CHOSEN: Option A — SessionContext + PageLoaders
REASON: Simplest conceptual model. OB-92 already created OperateContext as proof.
Extends the same pattern platform-wide. No new dependencies. Each page has
exactly ONE data loading function. Components become pure renders.
Diagnostic confirms 0 component-level clients — fix is at context + page level.

REJECTED: Option B — deduplication hides the problem rather than solving it.
REJECTED: Option C — too much refactoring risk for a performance OB.
```
