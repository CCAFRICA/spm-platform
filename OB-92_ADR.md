# OB-92 Architecture Decision Record

```
ARCHITECTURE DECISION RECORD
============================
Problem: The Operate workspace needs a unified lifecycle surface that
connects Plan x Period x Data selection -> Calculation -> Results -> Reconciliation.
Currently these are scattered across unconnected pages with no batch navigation.

Option A: Unified single-page Operate surface with tabbed sections
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? NO
  - Transport: N/A
  - Atomicity: YES -- one page, one state

Option B: Multi-page with shared OperateContext provider
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? NO
  - Transport: N/A
  - Atomicity: YES -- context persists across pages

Option C: Wizard-style linear flow
  - Scale test: NO -- doesn't support jumping to reconciliation for existing batch
  - Rejected immediately

CHOSEN: Option B -- Multi-page with shared OperateContext
REASON: Matches existing Next.js routing. Sidebar navigation is familiar.
Shared context ensures plan/period/batch selection persists across pages.
Each page can be deep-linked. Reconciliation gets its canonical /operate/reconciliation route.

REJECTED: Option A -- tabbed single-page would work but fights Next.js conventions.
REJECTED: Option C -- too rigid for operational workflows.
```
