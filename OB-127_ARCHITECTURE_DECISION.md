```
ARCHITECTURE DECISION RECORD — OB-127
=====================================

Problem: Replace two-path import with unified agent-based content ingestion.

Option A: New standalone SCI service with separate API routes
  - Scale test: Works at 10x? YES — stateless API, Content Profile is lightweight
  - AI-first: Any hardcoding? NO — agent weights are configurable, not hardcoded patterns
  - Transport: Data through HTTP bodies? YES for analysis (Content Profile only, not raw data)
  - Atomicity: Clean state on failure? YES — analyze returns proposal, execute is idempotent

Option B: Modify existing DPI routes to add agent layer
  - Scale test: Inherits DPI limitations
  - AI-first: Risk of entangling with existing hardcoded patterns
  - Transport: Already has file handling
  - Atomicity: Existing DPI is not atomic

Option C: Add agent middleware that intercepts before existing routes
  - Scale test: YES
  - AI-first: YES
  - Transport: Adds complexity to middleware chain
  - Atomicity: Depends on downstream routes

CHOSEN: Option A — clean separation. SCI is new infrastructure in /api/import/sci/.
  Existing DPI routes remain operational (not deleted) but are deprecated.
  SCI routes call into existing pipelines (plan interpretation, committed_data insert)
  as downstream processors.

REJECTED: Option B — entanglement risk with legacy patterns. Pattern 21 (dual code path)
  risk if we modify in place.

REJECTED: Option C — middleware approach creates hidden dependencies.
```
