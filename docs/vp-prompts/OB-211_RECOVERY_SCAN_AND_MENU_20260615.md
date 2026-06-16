# OB-211 RECOVERY: SUBSTANCE SCAN + TEMPORARY WALKABLE MENU — turn the 81 orphans into a recoverable-value map the architect can walk

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-15 (architect channel)
**Type:** Recovery enablement. The deployed-state audit found ~81 orphaned pages — pages that render-by-URL but have no nav path. The audit classified them by REACHABILITY, not by SUBSTANCE or VALUE. This directive does both: (1) a read-only SUBSTANCE SCAN of every orphaned page (does it have real display/actions or is it an empty inferred link), cross-referenced to the MIR capability profile (which capabilities the demo needs) and lineage-clustered (which pages are variants/iterations of the same capability), and (2) a TEMPORARY walkable menu wiring every SUBSTANTIVE page in, tagged with its classification, so the architect can evaluate them IN the platform (URLs don't reveal page identity — names don't match paths — so the architect must SEE them). The output is the recoverable-value map + the means to walk it.
**Why:** the orphaned set is not 81 mistakes — it is prior vision/design work stranded because the platform beneath it wasn't wired (Disputes, Approvals, statements — the MIR profile confirms each as a real capability with a platform gap). A page being orphaned says nothing about whether the page was RIGHT. This separates recoverable design capital from genuinely-empty stubs.
**Gate:** main `1dae916e` + the audit (`docs/audits/OB-211_DEPLOYED_STATE_AUDIT_20260615.md`) as the route inventory. **Branch:** a recovery branch — the scan is read-only (a doc); the temp menu is a SMALL, CLEARLY-TEMPORARY nav addition (reversible). tsc 0 before push.

**THE PRINCIPLE (architect-set): substance over reachability; recover vision, discard only the empty.** The keep/absorb/discard decision is the ARCHITECT's, made by WALKING the pages — but the scan does the heavy pre-sort (auto-flags the empties so the architect never walks them) and the prioritization (MIR-needed first) and the lineage (which variant superseded which). The architect walks a CURATED, TAGGED set, not 81 raw links.

**CRITICAL — lineage cannot come from git:** every page shares one first-commit date (a repo migration/squash). Lineage MUST be derived from CONTENT (maturity, pattern-currency, which imports canonical vs orphaned components), NOT commit dates. Do not assert creation order from git history.

**Governing inputs:** the audit (the 81 routes), the MIR Capability Status Profile R1 (`MIR_CAPABILITY_STATUS_PROFILE_R1_20260612` — the demand side: which capabilities MIR needs + their state, e.g. Disputes 🔴, statements 🟠, Results dashboard 🟡, Company view 🟡 at /perform, Audit 🟠), the capability board R4 (status by agent), the agent-nav config (`workspace-config.ts` — where the temp menu wires).

---

## §0 — CC Standing Rules
Read `CC_STANDING_ARCHITECTURE_RULES.md`. Binding: SR-42 (do NOT assert lineage from git dates — they're a migration artifact; derive from content), SR-34 (the temp menu is an ADDITIVE, reversible nav section — not a rewrite of the agent nav), SR-43, SR-44 (the architect walks + decides). **No fabrication:** substance is MEASURED from the page file (components, handlers, data hooks, stub-markers); MIR-mapping is cross-referenced to the profile; lineage is content-derived. If a page's purpose can't be determined from its content, say "unclear — architect must view," don't guess.

**Read-before-assert:** the substance signal is concrete (proven on samples): `/insights/analytics` = 526 lines/61 components/20 handlers/3 data hooks → SUBSTANTIVE; `/data/imports` = 11 lines/0/0/0 → EMPTY STUB; `/investigate/entities` = 2 lines → EMPTY. CC reads every orphaned page file.

AUTONOMY: produce the scan + wire the temp menu. No yes/no questions.

---

## §1 — THE SUBSTANCE SCAN (read-only, every orphaned page)
CC produces `docs/audits/OB-211_RECOVERY_VALUE_MAP_20260615.md` — a table of every orphaned page (the ~81 from the audit). For each:

1. **Path + inferred page name** — the route, AND what the page calls ITSELF (the H1/title/header in the file — because URLs don't match names). This is what the architect needs to recognize it.
2. **Substance class** (measured):
   - **SUBSTANTIVE** — real components + (data hooks OR wired handlers), low/no stub-markers (e.g. /insights/analytics, /approvals, /acceleration). Real design work.
   - **PARTIAL** — some real UI but heavy stub/mock/placeholder markers, or components with dead handlers (renders but doesn't act).
   - **EMPTY** — trivial line count, ~0 components, no actions (e.g. /data/imports, /investigate/entities). **Auto-flagged for discard.**
   The numbers pasted as evidence (lines / components / handlers / data-hooks / stub-markers).
3. **What it appears to DO** — from the content: what capability/function does it represent (a sentence). If unclear, "unclear — architect must view."
4. **MIR mapping** — does it serve a capability in the MIR profile? Name the capability + its MIR state (🟢/🟡/🟠/🔴). (e.g. an approvals/disputes page → Disputes 🔴; a statement page → Individual statements 🟠; an imports-history page → the import surface.) If no MIR mapping → "no MIR map (recoverable vision, not demo-critical)."
5. **Lineage cluster** — is this a VARIANT/iteration of another page serving the same capability? Group the clusters (e.g. /insights/* vs /perform vs /stream vs the "synthetic lookalike" dashboards the MIR profile flags at F-80/81; approvals ×5; audit ×3; data-readiness ×3; /configuration vs /configure; /data vs /operate/import). For each cluster: LIST ALL variants + indicate, from CONTENT (maturity, canonical-vs-orphaned imports, pattern-currency — NOT git), which appears to be the latest/most-developed expression and which appear to be earlier/stranded iterations. **Indicate lineage; do not delete — the architect confirms.**
6. **Priority lane** — MIR-CRITICAL (serves a 🟠/🔴 MIR capability on the demo path) / MIR-SUPPORTING (serves a 🟡/🟢 MIR capability) / VISION (substantive, no MIR map — the recoverable-value tail, e.g. the Insights visualization work) / DISCARD (empty).

**The scan's pre-sort = what the architect walks:** MIR-CRITICAL + MIR-SUPPORTING + VISION (substantive) → walk these. DISCARD (empty) → the architect confirms the list, then they're removed. The architect never walks an empty page.

---

## §2 — THE TEMPORARY WALKABLE MENU (additive, reversible)
Wire every SUBSTANTIVE + PARTIAL page (NOT the empties) into a TEMPORARY nav section so the architect can open each in the platform.
- A new clearly-temporary workspace/section — e.g. a "Recovery / All Pages" workspace (platform-admin only), visible only to platform admin, NOT part of the agent-governed nav the customer sees. **SR-34: additive — does NOT modify the four agents' nav; a separate section that can be removed wholesale.**
- Each entry TAGGED with its scan classification: the inferred page name (not the URL), the substance class, the MIR mapping + state, the priority lane, and the lineage-cluster label (e.g. "Insights — variant 2 of 3"). So when the architect opens it, they see WHAT it is and WHY it's flagged.
- Group the temp menu by PRIORITY LANE (MIR-CRITICAL first, then SUPPORTING, then VISION) so the architect walks the demo-critical pages first.
- The empties are NOT wired (they're the discard list in the scan doc, for confirmation).

**This is temporary scaffolding for evaluation — it is explicitly NOT the production nav.** A comment/flag marks it for removal once the architect's walk-through produces the keep/absorb/discard decisions. Reversible in one delete.

---

## §3 — THE DELIVERABLE + WHAT THE ARCHITECT DOES NEXT
- §1 the recovery value map (every orphan: substance, what-it-does, MIR-map, lineage, priority).
- §2 the temp menu live (the architect walks the substantive set, tagged, prioritized).
- The architect walks → decides per page/cluster: KEEP (recover + wire — the platform work to make it real beneath the design), ABSORB (merge its inferred functionality into the canonical sibling — e.g. Users), DISCARD (confirmed empty or superseded variant). For KEEP pages, the MIR profile ALREADY specifies much of the underlying work (Disputes E4, statements E2/E3, audit E3 sink-integrity, pagination E3) — so the recovery backlog connects directly to the MIR development schedule.
- That decision set → the next directive (the recovery BUILD: per kept page, wire the platform beneath it; per absorb, the merge; per cluster, retire the stranded variants). NOT in this directive — this ENABLES the walk; the build is scoped FROM the walk.

```
ARTIFACT SYNC (recovery scan + temp menu)
MC: the 81 orphaned pages turned into a RECOVERABLE-VALUE MAP — each scanned for substance (SUBSTANTIVE/PARTIAL/EMPTY, measured), mapped to the MIR capability profile (which serve demo-critical 🔴/🟠 capabilities — Disputes, statements, audit, pagination), lineage-clustered (variants/iterations indicated from content, NOT git — git dates are a migration artifact), and priority-laned (MIR-CRITICAL/SUPPORTING/VISION/DISCARD). A TEMPORARY walkable menu (platform-admin-only, additive, reversible — NOT the customer nav) wires the substantive pages in, tagged, so the architect evaluates them IN the platform (URLs don't reveal page identity). The empties are auto-flagged for discard (the architect never walks them). Pending the architect's walk-through → the keep/absorb/discard decisions → the recovery build.
REGISTRY: "Recoverable Value Map" → 81 orphans scanned, substance-classed, MIR-mapped, lineage-clustered; the temp menu enables the architect walk. "Orphaned Vision (Insights/visualization)" → catalogued as VISION lane (substantive, recoverable). "MIR-critical stranded surfaces" → Disputes/statements/audit pages mapped to their MIR build items.
R1: the recovery decision is now executable (walk a curated tagged set, not 81 raw links) → pending the architect's walk + the recovery-build directive it scopes.
SUBSTANCE: orphaned ≠ wrong — the pages are stranded design capital; substance (measured) separates recoverable vision from empty stubs; MIR sets priority; lineage from content not git (the dates are fake); the temp menu is reversible evaluation scaffolding, not production nav; the build is scoped FROM the architect's walk, not guessed.
```

---

## §4 — HALT / NOTES
- **HALT-LINEAGE:** do NOT assert which variant is older/newer from git (all share a migration commit date). Derive from content maturity + pattern-currency; where genuinely ambiguous, list variants and say "architect determines canonical by viewing."
- The temp menu is ADDITIVE and REVERSIBLE — it does NOT touch the four-agent customer nav. If wiring it requires changing the agent nav, HALT and report (it should be a separate platform-admin-only section).
- The scan is READ-ONLY (a doc). The temp menu is the only code change, and it's clearly-temporary scaffolding.
- Do NOT build the recovery (wiring platforms beneath pages, merging duplicates, retiring variants) here — this ENABLES the architect's walk; the build is the NEXT directive, scoped from the walk's decisions.
- The empties auto-flagged DISCARD are a LIST for architect confirmation, not auto-deleted.
- Pages whose purpose is unclear from content → "architect must view" (the temp menu is exactly how they view it) — never guess a purpose.
