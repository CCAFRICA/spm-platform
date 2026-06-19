# VIALUCE — Layout redesign · Component spec & dev handoff

**Version:** v1 · June 2026
**Scope:** layout/UI redesign of the tenant app (`/stream` and related screens). Does not change logic, data, or flows.
**Package files:**

| File | What it is | Use |
|---|---|---|
| `vialuce-ui.css` | Tokens + base + components (production-ready CSS) | Drop-in, or translate to your stack |
| `vialuce-design-spec.md` | This document — anatomy, states, rules | Implementation reference |
| `vialuce-layout-redesign.html` | Navigable prototype (7 screens) | Visual source of truth / markup reference |

> Core rule of the system: **the system is the brand** — always use tokens, never loose hex values. Numbers, labels, and data are **always in DM Mono**. Headlines in DM Sans Bold, body in DM Sans Light.

---

## 1. Redesign principles

1. **One page template** for every screen (header + actions + content). Eliminates the 4+ different headers in the current app.
2. **One KPI card** (with relief) replaces the 4 variants that coexist today.
3. **Consistent iconography** on every navigation item — either all have an icon, or none. Never mix.
4. **Main options as the protagonists:** sidebar groups (Dashboards, Insights, Configure…) are prominent, expandable rows; sub-items are subordinate.
5. **Persona switcher docked** at the sidebar footer — never floating over content (current bug).
6. **Color discipline in charts:** indigo ramp + gold accent. No rainbow.
7. **Ordered density:** 8px grid, consistent padding and content width.

---

## 2. Design tokens

### Color
| Token | Hex | Use |
|---|---|---|
| `--vialuce-indigo-deep` | `#2D2F8F` | Primary brand, dark rail, highlighted data |
| `--vialuce-indigo` | `#4446B8` | Primary buttons, links, data bars |
| `--vialuce-indigo-light` | `#6668D8` | Hover, secondary elements |
| `--vialuce-gold` | `#E8A838` | Primary CTA (Calculate), accents, signal/insight |
| `--vialuce-gold-light` | `#F5C060` | Gold hover, active accent in nav |
| `--vialuce-slate` | `#606880` | Body text / neutrals |
| `--vialuce-near-black` | `#1A1A2E` | Headlines, high-contrast text |
| `--vl-success` / `-50` | `#15936A` / `#E6F5EE` | Up deltas, Completed status |
| `--vl-danger` / `-50` | `#DC5454` / `#FCECEC` | Down deltas, Failed status, Unread |
| `--vl-bg` / `--vl-surface` | `#F4F5FB` / `#FFFFFF` | Page background / surfaces |
| `--vl-line` / `--vl-line-soft` | `#E8EAF3` / `#F0F1F8` | Borders / inner dividers |
| `--vl-nav` | `#1F2154` | Navigation rail (deep indigo) |

### Typography
| Role | Font | Weight | Token |
|---|---|---|---|
| Headlines / wordmark | DM Sans | 700 | `--vl-fw-bold` |
| Body / default | DM Sans | 300 | `--vl-fw-body` |
| Emphasis, numbers, labels | DM Mono | 400–500 | `--vl-font-mono` / `--vl-fw-med` |

Type scale: H1 23px · H3/card title 15px · body 13px · meta/label 11–12px · never below 11px.

### Spacing (8px base)
`--space-xs 4` · `--space-sm 8` · `--space-md 16` · `--space-lg 24` · `--space-xl 32` · `--space-2xl 48` · `--space-3xl 64`

### Radius · Elevation · Motion
Radius: `--vl-r-sm 7` · `--vl-r-md 10` · `--vl-r-lg 14` · `--vl-r-pill 999`.
Shadow: `--vl-sh-1` (cards at rest) · `--vl-sh-2` (hover/elevated).
Motion: `--vl-dur .18s` · `--vl-ease cubic-bezier(.2,.8,.2,1)`.

---

## 3. Layout / grid

- **App shell:** `grid-template-columns: 252px 1fr` (fixed rail + fluid content). Class `.vl-app`.
- **Content:** `max-width: 1340px`, padding `26px 28px`, centered.
- **KPI grid:** 4 columns (`.kpis`), collapses to 2 < 1120px.
- **2-up content:** `.grid2` (1fr 1fr) · **content + aside:** `.split` (1fr 300px). Both collapse to 1 column < 1120px.
- **Breakpoints:** Desktop > 1120px · Tablet 860–1120px · Mobile < 860px (rail → drawer).

---

## 4. Components

### 4.1 Sidebar / navigation rail
**Anatomy:** brand + tenant switcher → "← Observatory" → workspace switcher (2×2) → expandable main groups → footer (persona + user).

| Part | Class | Notes |
|---|---|---|
| Rail | `.sb` | Background `--vl-nav`, sticky, full-height |
| Workspace switcher | `.ws` / `.ws a` / `.ws a.on` | 2×2; active one has translucent indigo fill |
| **Main option** | `.sb-sec` | Prominent row: icon + label + count + chevron |
| Active group | `.sb-sec.active` | Fill + **gold** left bar + gold icon |
| Open group | `.sb-sec.open` | Chevron rotated 180° |
| Sub-items | `.nav` / `.nav a` | Indented with vertical guide; subordinate to the group |
| Active sub-item | `.nav a.on` | White text + thin gold bar |
| Persona switcher | `.persona` | **Docked in the footer** (not floating) |

**Behavior:**
- Selecting a **workspace** (`data-ws`) switches rail context, navigates to its primary screen (`first`), and leaves its first group **active and expanded**.
- The group containing the active screen is always highlighted and open.
- Clicking `.sb-sec` collapses/expands that group.
- **Every** item has an icon (including ones the current app left without icons: Reports, Notifications).

**States:** default · hover (`rgba(255,255,255,.06)`) · active (group with gold) · open/collapsed.

### 4.2 Topbar
| Part | Class | Notes |
|---|---|---|
| Bar | `.top` | 60px, background blur on scroll, sticky |
| Breadcrumb | `.crumb` (`b` = active leaf) | Tenant ⟩ Section ⟩ Page |
| Primary CTA | `.btn-gold` | **Calculate** in gold (frequent action = signal) |
| Search | `.top-search` | Own width, `⌘K` |
| Utilities | `.top-icon` / `.top-pill` | Help, alerts (with `.ping`), language, tenant |

### 4.3 Page template
```
.page > .phead ( h1 + .sub + .phead-meta | .pactions )
       > [.tabs]
       > [.insight]
       > .kpis (×N)
       > .grid2 | .split | .card
```
- **`.phead`**: title (DM Sans Bold) + subtitle (slate) + meta (DM Mono) on the left; actions on the right (`.ctl` date/refresh + `.btn-pri` Export). **Same pattern on every screen.**
- **`.tabs`**: segmented control for sub-views (Overview/Detail/Reports).

### 4.4 KPI card (unified, with relief)
**Anatomy:** `.kpi` → `.kpi-top` (`.kpi-ic` chip + `.kpi-delta` chip) → `.kpi-label` → `.kpi-val` (DM Mono) → `.kpi-foot` + optional `.bar`.

| Property | Token |
|---|---|
| Top accent (3px) | `--accent` (category: indigo / gold / deep / semantic) |
| Number | DM Mono 500, 27px |
| Delta | chip `.up`/`.down`/`.flat`/`.ok` (green/red/neutral) |
| Relief | `--vl-sh-1` at rest → `--vl-sh-2` + `translateY(-3px)` on hover |

**Variants:** with "vs target" bar (`.bar` + `barPct`) · with "previous: X" footer · with status badge (`.ok` → "Healthy"). **One card covers all 8 cases** in the current app.
**Do:** number always in DM Mono. **Don't:** mix the with/without-bar style in the same row without reason (the bar is only for metrics that have a target).

### 4.5 Data table + status pills
- **`.card.flush`** wraps the table (padded header, edge-to-edge table).
- **`.tbl`**: header in DM Mono uppercase (`th`), rows with hover, numbers in `.num` (DM Mono, right-aligned).
- **Status as a pill, not a button:** `.pill.success` (Completed), `.pill.danger` (Failed), `.pill.open` (Open), `.pill.neutral` (Monthly). *Fixes the blue "Open" in the current app that looked like an action.*
- **Row actions:** `.gbtn` (ghost) + `.iact.del` (trash, red on hover). Right-aligned (`.row-act`).
- **Semantic numbers:** Success in `.num.up` (green), Failed in `.num.down` (red).

### 4.6 Charts
- Horizontal bars `.hbars/.hbar`; donut and line as inline SVG.
- **Mandatory palette:** `--vialuce-indigo-deep → indigo → indigo-light → #9A9CE0`, with `--vialuce-gold` as accent. For performance tiers, semantic: Exceeding=success, Meeting=indigo, Approaching=gold, Missing=danger.
- Line chart: Actual = solid indigo; Budget = dashed gold.

### 4.7 Insight banner / Empty state / Summary aside
- `.insight`: AI signal in gold (`ti-sparkles` icon + mono label + claim).
- `.empty`: icon in an indigo chip + title + **path to the next action** (never a dead end). Applies to the login too: replace *"profile is missing. Contact your administrator"* with a message that has context + an action.
- `.split` + `.summary`: content + side panel layout (Notifications).

---

## 5. Accessibility (WCAG 2.1 AA)

| Combination | Ratio | Verdict |
|---|---|---|
| Deep Indigo `#2D2F8F` on white | ~9:1 | ✅ |
| Indigo `#4446B8` on white | ~6.8:1 | ✅ text/links |
| Slate `#606880` on white | ~5.0:1 | ✅ body |
| Dark text `#3a2606` on Gold | high | ✅ (gold button) |
| **Gold `#E8A838` as text on white** | ~2.0:1 | ⚠️ **decorative/accent only, never text** |
| Nav text `rgba(255,255,255,.72)` on `#1F2154` | ~7:1 | ✅ |

- **Focus ring:** `2px solid --vialuce-gold` (on `:focus-visible`).
- **Touch targets:** ≥ 44×44px on interactive controls.
- **Don't signal state by color alone:** status pills include an icon in addition to color.

---

## 6. Implementation guide for the agent

**Goal:** apply this system across the platform without touching logic or data.

1. **Load tokens first.** Paste the `:root` block from `vialuce-ui.css` into the global CSS (or map it to your theme/config). Everything else depends on it.
2. **Import the fonts** DM Sans + DM Mono (link in the head, already documented in the CSS).
3. **Migrate in layers, in this order** (each is independently verifiable):
   1. App shell (rail + topbar) — classes `.sb*`, `.top*`.
   2. Page template — `.page`, `.phead`, `.tabs`.
   3. KPI cards — replace the 4 variants with `.kpi`.
   4. Tables + pills — `.tbl`, `.pill.*`.
   5. Charts — recolor to the brand ramp.
4. **Non-negotiable rules when porting:**
   - Numbers/labels → DM Mono. Hex → tokens. Nothing hardcoded.
   - Persona switcher in the sidebar footer (take it off the content area).
   - Every nav item has an icon.
   - Status = pill, not button.

**If the stack is React + Tailwind:** map tokens in `tailwind.config` (`theme.extend.colors.vialuce.*`, `fontFamily.sans/mono`, `boxShadow.vl1/vl2`, `borderRadius`). Each class in this CSS = one component (`<KpiCard>`, `<DataTable>`, `<StatusPill>`, `<Sidebar>`). The `vialuce-ui.css` classes serve as a 1:1 spec for which utilities to apply.

**Verification at close:** run an AA contrast check, confirm no hex values remain outside tokens, and that all 7 screens share a single header and a single KPI card.