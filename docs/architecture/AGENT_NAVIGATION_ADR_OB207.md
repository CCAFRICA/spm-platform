# Agent-Navigation ADR — OB-207

**Date:** 2026-06-14 · **Governing:** Capability Status Board R4, DS-013, Decision 128, CLT-84-F20
**Supersedes:** the 4-workspace model (OB-97: Perform/Operate/Configure/Financial)

---

## DECISION

Navigation reorganizes around the four Capability-Board agents. The primary axis is the **three ACTS**
the user performs through; **Platform Core** is the always-on foundation, not a peer tab.

```
/stream (Intelligence) — HOME for every persona (Decision 128). Above the three workspaces.

CALCULATE (run the engine)          DECIDE (performance intelligence)     CONSOLIDATE (reconcile + financial)
  /operate        → lifecycle cockpit  /stream     → intelligence (HOME)     /operate/reconciliation
  /operate/import                      /operate/results → persona results    /financial/*  (FM 5-level views,
  /operate/import/history                                                       reads committed_data via DS-029)
  /operate/calculate

PLATFORM CORE — always on (foundation; "Configure" lives here)
  /configure/periods · /configure/people · /configure/users
  (substrate: ingestion · identity · the carrier · classification · adaptive signal layer)
```

### Route → agent mapping (grouping only — every box is an EXISTING route; no URL changes)

| Agent (WorkspaceId) | Routes (paths unchanged) |
|---|---|
| `decide` | `/stream` (Intelligence, default), `/operate/results` |
| `calculate` | `/operate` (cockpit), `/operate/import`, `/operate/import/history`, `/operate/calculate` |
| `consolidate` | `/operate/reconciliation`, `/financial` + all `/financial/*` views |
| `platform-core` | `/configure/periods`, `/configure/people`, `/configure/users` |

### Persona emphasis (same spine, different default — DS-013 §5)

Admin → Calculate (governs the cycle) · Manager → Decide (coaches) · Rep → Decide-self (grows).
The **active default route is `/stream` for every persona** (Decision 128); the *workspace* highlighted
when on `/stream` is `decide`.

---

## RATIONALE

- **Hick's Law:** three primary acts, not four mixed-metaphor workspaces.
- **CLT-84-F20:** Operate (verb) / Perform (domain) / Configure (function) / Financial (module) mix three
  metaphors. The agent-verbs are one principle — *acts the system performs*.
- **Platform Core "Always on"** (the board's verb) = substrate, not a destination → foundation section, not a tab.
- **A.24 (plan-data independence):** Consolidate owns Financial because the same `committed_data`
  transaction expresses as revenue (Consolidate) OR commission (Calculate) — no duplicate import.
- **Grouping only:** route paths are unchanged; only their nav grouping changes (SR-34; no URL moves → no
  deep-link / redirect risk; HALT-2 not triggered).

## REJECTED

- **Four equal agent tabs** — category error: Platform Core is not a place you navigate to.
- **Keep the current workspaces** — perpetuates the metaphor-mix defect (CLT-84-F20).

---

*OB-207 Phase 1 ADR · 2026-06-14 · vialuce.ai*
