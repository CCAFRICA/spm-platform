# HF-332 Completion Report — AGENTS Navigation: Elevate the Agents, Relocate Plans & Canvas under Calculate

**Date:** 2026-06-22 · **Branch:** `hf-332-agents-nav` · **Mode:** ULTRACODE (single pass) · **Lineage:** OB-228 (merged `4cd3bfc5`)
**Touches (display layer only — no engine, no schema):** `web/src/lib/navigation/workspace-config.ts`, `web/src/components/navigation/mission-control/VialuceSidebar.tsx`, `web/src/components/navigation/ChromeSidebar.tsx`, `web/src/app/globals.css`.
**Directive:** `docs/vp-prompts/HF-332_DIRECTIVE_20260621.md`.

---

## Decisions Log (§3.1 discoveries → decisions)

1. **Live agents enumerated (verbatim from `WORKSPACES`):** `decide` (Performance), `calculate` (Calculation), `finance` (Finance — `featureFlag: 'financial'`, per-tenant), `platform-core` (Platform Core). **= 4 agents** — matches the architect's "four." The elevated treatment renders against whatever the *entitled* set yields (a non-Finance tenant sees 3 tiles; the layout adapts 1–N).
   ```
   $ npx tsx --tsconfig scripts/tsconfig.proof.json /tmp/hf332-enum.ts
   AGENTS (workspaces): decide, calculate, finance, platform-core
   ```
2. **Plans & Canvas placement:** was `platform-core` → `configure` section (OB-228 repointed the dead `/design` slot to `/configure/plans` there). The config already supports children via `sections[].routes[]` — **no new nesting structure needed.** Added a dedicated `plans` section under the `calculate` agent and removed the route from `configure`.
3. **Entitlement signal:** `icm.configure_plans` — the same capability the OB-228 `/configure/plans` route enforces (confirmed in `permissions.ts`: held by `platform` + `admin`; not `manager`/`sales_rep`). Reused via the live PDP `getWorkspaceRoutesForRole` (→ `hasCapability`). **No new entitlement concept invented.** ChromeSidebar already used this helper; **VialuceSidebar was reading raw sections + a roles-only `itemVisible` (the gap) and now uses `getWorkspaceRoutesForRole`** — so the Vialuce rail capability-gates Plans & Canvas too.
4. **Heading source:** VialuceSidebar `.sb-lbl` + ChromeSidebar workspace-switcher `<p>`. Renamed `'Workspaces'`/`'Espacios'` → **`'AGENTS'`/`'AGENTES'`** (the `.sb-lbl` / inline style already uppercase-transform).
5. **Descriptor wording — NOT flagged:** sourced directly from the config's existing `description`/`descriptionEs` (no invention): Performance = "Performance intelligence — see, benchmark, act"; Calculation = "Run the engine, reconcile, sign off, and export results"; Finance = "Financial intelligence — licensed module"; Platform Core = "Foundation — configure and maintain the system." Architect may refine post-merge (cheap; §6A).
6. **Scope decision (§4 autonomous):** the elevated **tile treatment** uses the Vialuce token system (Deep Indigo / Gold) and ships in **VialuceSidebar** (the live demo theme). **Dark/Bliss (ChromeSidebar)** receive the **AGENTS rename + the shared config relocation** but keep their existing workspace switcher — applying gold/indigo tiles to those palettes would clash and risk regressing the byte-preserved else-branch. Flagged for the architect; the Vialuce rail is the design surface.
7. **Single-route sections → direct child links (Vialuce):** matching ChromeSidebar's `isSingleChild`, a one-route section renders as a direct indented link (no redundant header) — so Plans & Canvas reads as a single clean link under Calculate. Improves several existing single-route sections (Reconcile, Statements, …) consistently; all routes remain reachable (DD-7).

---

## Before / After (the rail)

| | Before | After |
|---|---|---|
| Section heading | "Workspaces" / "Espacios" | **"AGENTS" / "AGENTES"** |
| Agents (Vialuce) | 2×2 `.ws` grid of small icon+label tiles (same weight as nav) | **Elevated bordered container of tiles** — icon + name (heavier) + one-line descriptor; **active agent = gold accent**; children (sections) revealed subordinate below the active tile; **divider** then the restrained Search utility |
| Plans & Canvas | top-level under **Platform Core → Configure** (any platform/admin) | **child of the Calculate agent** (`calculate/plans`), **capability-gated on `icm.configure_plans`** (menu matches the route gate) |
| Vialuce route gating | roles-only (`itemVisible`) — capability NOT enforced in menu | **`getWorkspaceRoutesForRole`** (the live PDP) — capability + role |
| Route paths | — | **unchanged** (`/configure/plans` etc.) — DD-7, no dead links |

---

## Proof

**Entitlement + placement (config enumeration, live):**
```
--- role=admin ---
  calculate: Plans & Canvas PRESENT in section "plans"
  platform-core/configure has Plans & Canvas: false
--- role=manager ---            (manager lacks icm.configure_plans AND Calculate access)
  platform-core/configure has Plans & Canvas: false
  (Plans & Canvas present nowhere)
```
→ admin (entitled) sees Plans & Canvas under Calculate; manager (unentitled) sees it nowhere; removed from Platform Core for all.

**Build (kill dev → `rm -rf .next` → `npm run build`):**
```
✓ Compiled successfully
ƒ /configure/plans                          284 B   179 kB
ƒ /configure/plans/[ruleSetId]              348 B   179 kB
ƒ Middleware                                76.9 kB
build exit: 0
```
(The "Dynamic server usage" lines are the standard expected cookie notices — not failures.) `npx tsc --noEmit` → 0 errors. Korean-test prebuild gate → PASS.

**Dev (`npm run dev` → `localhost:3000`):**
```
✓ Ready
/configure/plans → HTTP 307 → /login?redirect=%2Fconfigure%2Fplans   (Plans & Canvas reachable — DD-7)
/operate        → HTTP 307 → /login?redirect=%2Foperate              (Calculate agent home reachable)
/               → HTTP 307 → /login                                  (middleware)
```
No compile errors. The **rendered** Vialuce rail (AGENTS heading, elevated tiles, gold-accented active agent, Plans & Canvas under Calculate) is architect-verified visually in an authenticated Vialuce session (split-proof model, OB-221) — headless curl cannot drive the authed themed rail; the config enumeration + build + route reachability are the code-side evidence.

---

## ARTIFACT SYNC
```
MC: S1 (Navigation IA) — AGENTS-section slice advanced (agents elevated; Plans & Canvas placed under
    Calculate, entitlement-aligned). Full IA hierarchy remains architect-led (§6).
REGISTRY: Navigation/Wayfinding row → evidence: AGENTS rename + elevated tiles (VialuceSidebar) +
    capability-gated relocation; menu visibility now == route capability gate (icm.configure_plans).
R1: "menu visibility aligns to route entitlement" → status: TRUE for Plans & Canvas (getWorkspaceRoutesForRole
    in both rails; enumeration proof). Route-level enforcement unchanged (SR-39 — security boundary intact).
BOARD: Nav/Wayfinding CAPS — gap "agents indistinct + Plans mis-placed/over-exposed" closed (Vialuce);
    ev=enumeration + build + routes; ef=elevated tiles + entitlement-aligned visibility; lane=Navigation IA.
SUBSTRATE: Wayfinder Layer 1 exercised (elevated agent tiles = primary-destination ambient cue);
    entitlement-aligned nav (reuse live PDP, not a new concept); Korean Test (labels/descriptors/icons from
    config data, treatment adapts to the entitled agent set); DD-7 (all destinations reachable, paths unchanged).
```

## Residuals (§6A)
- **Descriptor wording** — sourced from config; architect may refine (not flagged as blocking).
- **Full Navigation IA (S1)** — architect-led; this HF advanced one slice.
- **Dark/Bliss elevated treatment** — rename + relocation applied; the elevated tiles are Vialuce-only by design (token-system scope). If the architect wants the elevation in Dark/Bliss, a follow-on with those palettes' tokens.
- **Nesting generality** — the `plans` section nests under Calculate via the existing `sections[].routes[]`; future agents nest the same way.

---

## PR
**https://github.com/CCAFRICA/spm-platform/pull/582** (`hf-332-agents-nav` → `main`). **CC does not merge (SR-44).**
