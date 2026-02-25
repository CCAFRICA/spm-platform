# Architecture Decision Record: Navigation IA — 4 Workspace Model

## Problem

Navigation IA is incoherent. 7 workspaces with unclear boundaries, too many nav items per persona, 36 dead-end stub pages, and duplicate routes for the same functionality. The workspace names mix metaphors (Perform vs Operate vs Investigate vs Govern), the organizing principle is unclear, and single-child sections require unnecessary expand clicks.

## Options Considered

### Option A: Keep 7 workspaces, clean up dead ends only
- Lowest risk
- Doesn't fix the fundamental IA confusion
- REJECTED: Fixing dead ends without fixing the mental model leaves the problem

### Option B: Consolidate to 4 workspaces with clear purpose
- **Perform**: See data (dashboards, results, reports) — READ
- **Operate**: Do things (import, calculate, reconcile, approve) — ACT
- **Configure**: Set up (plans, periods, entities, settings) — SETUP
- **Financial**: Module-specific workspace (when enabled) — MODULE
- Remove: Investigate (fold into Operate), Govern (fold into Configure), Design (fold into Configure)
- Scale test: YES — fewer workspaces means clearer navigation
- AI-first: YES — no hardcoded workspace labels
- Domain-agnostic: YES — Korean Test passes

### Option C: Single sidebar with role-filtered flat list
- Admin: 8-10 items, no workspace grouping
- Manager: 4-5 items
- Rep: 3 items
- Scale test: YES
- Risk: Flat list doesn't scale as modules grow

## Decision

**CHOSEN: Option B — 4 workspace model**

### Reasoning
Workspaces provide the mental model customers need. The READ/ACT/SETUP framework is universally understandable. Module workspaces (Financial, future domains) extend cleanly. Persona filtering still applies — Rep sees 3 items in Perform + their Financial views.

### Navigation Structure

**Admin (≤15 items):**
```
PERFORM (see data)
  ├── Dashboard (landing)
  ├── Results (calculation results)
  └── Trends

OPERATE (do things)
  ├── Operations Center (lifecycle subway)
  ├── Import Data
  ├── Calculate
  ├── Reconciliation
  └── Approvals

CONFIGURE (set up)
  ├── Plans (rule sets)
  ├── Periods
  ├── Entities (personnel)
  └── Settings (tenant config)

FINANCIAL (module, when enabled)
  ├── Network Pulse
  ├── Timeline
  ├── Performance
  ├── Staff
  ├── Patterns
  ├── Summary
  ├── Products
  └── Leakage
```

**Manager (≤6 items):**
```
PERFORM
  ├── Dashboard
  └── Results

FINANCIAL (if enabled)
  ├── Network Pulse
  └── [filtered views]
```

**Rep (≤4 items):**
```
PERFORM
  ├── My Dashboard
  └── My Compensation

FINANCIAL (if enabled)
  └── My Performance
```

### Workspace Mapping

| Old Workspace | Destination | Rationale |
|---------------|-------------|-----------|
| Investigate | Operate | Investigation is an operational activity |
| Govern | Configure | Governance is system configuration |
| Design | Configure | Plan design is setup work |

### Single-Child Rule
If a workspace has only 1 child for a persona, clicking the workspace navigates directly (no expand click needed).

## REJECTED
- Option A — doesn't fix the root cause
- Option C — doesn't scale for multi-module
