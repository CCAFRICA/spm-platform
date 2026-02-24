# OB-87 Phase 0: Reconciliation Infrastructure Reconnaissance

## Existing Files (18 total)

### Pages
- `web/src/app/investigate/reconciliation/page.tsx` — MAIN (940 lines, OB-85 compliant)
- `web/src/app/admin/launch/reconciliation/page.tsx` — Admin entry
- `web/src/app/operate/reconcile/page.tsx` — Redirect
- `web/src/app/govern/reconciliation/page.tsx` — Redirect
- `web/src/app/admin/reconciliation-test/page.tsx` — Diagnostic

### Services
- `web/src/lib/reconciliation/comparison-engine.ts` — Total + component comparison
- `web/src/lib/reconciliation/ai-column-mapper.ts` — AI-powered column classification
- `web/src/lib/reconciliation/smart-file-parser.ts` — CSV/XLSX/JSON parsing
- `web/src/lib/reconciliation/reconciliation-bridge.ts` — Session/dispute mgmt
- `web/src/lib/reconciliation/employee-reconciliation-trace.ts` — Calc trace debugging
- `web/src/lib/reconciliation/engine.ts`, `adaptive-comparison-engine.ts`, `comparison-depth-engine.ts`
- `web/src/lib/agents/reconciliation-agent.ts` — Server-side deterministic agent

### API
- `web/src/app/api/reconciliation/run/route.ts` — POST endpoint (agent-based)

## What Works
- File upload + parsing (CSV, XLSX, JSON)
- AI column mapping with classification signals
- Total-level comparison with delta classification
- Per-component comparison infrastructure (in comparison-engine.ts)
- Entity matching with normalized IDs
- Three populations: matched / VL-only / file-only

## Critical Gaps (OB-87 targets)
1. **NO period awareness** — zero period detection, no period filter, no period matching
2. **NO false green detection** — placeholder exists but not wired to UI
3. **Two-field only** — Entity ID + Total, no mandatory period column
4. **Client-side auto-map uses regex** — not AI-first (pattern matching + overlap)
5. **No benchmark analysis** — no depth assessment before comparison runs
6. **No reconciliation_sessions table** — results not persisted to Supabase
7. **No bilingual labels** — English only in investigate/reconciliation page

## Files to Create
- `web/src/lib/reconciliation/benchmark-intelligence.ts` — NEW
- `web/src/app/api/reconciliation/analyze/route.ts` — NEW
- `web/src/app/api/reconciliation/compare/route.ts` — NEW

## Files to Modify
- `web/src/lib/reconciliation/comparison-engine.ts` — Add period filter + false green
- `web/src/app/investigate/reconciliation/page.tsx` — Depth assessment + enhanced results
- `web/src/lib/reconciliation/ai-column-mapper.ts` — Add period target
