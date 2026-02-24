# HF-058 Architecture Decision Record

```
ARCHITECTURE DECISION RECORD
============================
Problem: Sidebar contains links to (a) duplicate pages for the same feature
across multiple workspaces and (b) unbuilt features that fall back to
parent workspace landing pages. Both erode demo trust.

Option A: Remove dead links, consolidate reconciliation to /operate/reconciliation
  - Scale test: Works at 10x? YES — fewer routes = simpler
  - AI-first: Any hardcoding? NO
  - Transport: N/A
  - Atomicity: Clean — removing links, not adding complexity

Option B: Build stub pages with "Coming Soon" placeholders
  - Scale test: Works at 10x? YES but adds maintenance burden
  - AI-first: N/A
  - Transport: N/A
  - Atomicity: Adds pages that need future cleanup

CHOSEN: Option A — remove what isn't built, consolidate what is.
REJECTED: Option B — padding nav with stubs is worse than a lean, honest menu.
```
