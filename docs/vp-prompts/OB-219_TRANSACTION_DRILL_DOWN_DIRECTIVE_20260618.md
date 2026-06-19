# OB-219: Per-Transaction Audit Drill-Down + Commission Statement

**Sequence:** OB-219 — architect-assigned 2026-06-18. Collision check mandatory.
**Repo:** `CCAFRICA/spm-platform` · **Branch:** `ob-219-transaction-drill-down` from `main`
**Type:** BUILD (experience layer — vertical slice completing the per-transaction substrate)
**Effort:** ULTRATHINK / ULTRACODE
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

**Prerequisites (merged to `main`):**
- **OB-217 merged:** `calculation_traces` populated with per-row traces (`committed_data_id`, `transaction_ref`, `output` JSONB with `contribution`, `rate`, `pattern`).
- **OB-218 merged (or in parallel if clawback traces are not needed for Phase 1):** clawback traces with negative contributions and `pattern: 'clawback'`.

**CC instance:** FRESH.

---

## §0 — CC STANDING RULES HEADER

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Commit + push after every phase. Kill dev → `rm -rf .next` → `npm run build` (exit-0) → `npm run dev` → confirm `localhost:3000`. Git from repo root. Final: `gh pr create`. **DO NOT merge** (SR-44).

**First action:** write this directive to `docs/vp-prompts/OB-219_TRANSACTION_DRILL_DOWN_DIRECTIVE_20260618.md` and commit.

### §0.1 Context

The platform can compute per-transaction traces (OB-217) and clawback reversals (OB-218). These traces exist in `calculation_traces` but have NO user-facing surface. The gap analysis rates this P0: *"Individual statements and transaction detail are in the VALUE PROPOSITION. They're what we're selling. Empty pages here are a credibility risk."*

This OB builds the experience layer that makes the substrate visible. It is the completion of the vertical slice.

### §0.2 What exists today (read, don't rebuild)

| Surface | Status | Location |
|---|---|---|
| Calculate page (admin triggers calculation) | BUILT | Discover route via sidebar/nav |
| Results/entity list (shows entity-level payouts) | BUILT (partially) | Discover via Calculate flow |
| "My Statements" sidebar item (individual persona) | EXISTS in nav, page EMPTY | CLT51A-F38 |
| Reconciliation Studio | BUILT | /operate/reconciliation |
| Dispute submission form | BASIC CRUD exists | OB-73 |
| Entity-to-user linking (rep sees own data) | NOT BUILT | Rep self-service requires this; admin can view any entity |
| Bliss dual-theme | BUILT (OB-201) | Cookie-backed, per-user preference |

### §0.3 IAP Gate

| Measure | I (Intelligence) | A (Acceleration) | P (Performance) |
|---|---|---|---|
| Commission statement | ✓ understand why each component paid what it did | ✓ immediate visibility vs waiting for Excel from finance | ✓ transparency drives rep engagement and retention |
| Transaction drill-down | ✓ see exact rate, tier, inputs for each transaction | ✓ self-service vs emailing comp admin | ✓ reduces dispute volume by answering questions proactively |
| Clawback trace | ✓ see original transaction, reversal formula, negative | ✓ rep understands deduction without calling finance | ✓ trust in the system |

All three measures pass. None are cut.

---

## §1 — PROBLEM STATEMENT

### §1.1 The gap

`calculation_traces` has 510+ rows for BCL (Pattern A + C) and will have thousands for MIR. No UI page reads this table. A user cannot see which transactions contributed to a payout, what rate was applied, or why a clawback deducted a specific amount. The audit drill-down, the commission statement, and the transaction detail — the bottom three layers of the 5-layer audit promise — have no rendering surface.

### §1.2 Definition of done

1. **Commission statement page:** given an entity + period, display total payout, component breakdown, and per-transaction table (from `calculation_traces`). Accessible by URL with entity and period parameters.
2. **Transaction detail:** click a transaction row → see full trace (formula, inputs, rate, contribution, steps). For clawback traces: show original transaction link, reversal computation.
3. **Admin drill-down entry point:** from the existing Calculate/Results page, an admin can navigate to any entity's commission statement.
4. **Bliss theme:** both light and dark themes. Responsive.
5. **i18n-aware:** currency formatting respects tenant locale (PEN for MIR, USD for BCL). Number formatting follows locale.
6. **MIR demo verification:** navigate to a MIR entity, see per-transaction traces with rates and contributions.
7. `npm run build` exit-0; PR opened (not merged).

---

## §2 — SUBSTRATE DISCIPLINES

**Vertical Slice Rule:** this OB completes the experience half of the per-transaction slice. OB-217 (engine) + OB-218 (clawback) + OB-219 (experience) = one vertical capability.

**Korean Test:** no hardcoded component names, column names, or plan names in UI code. Component names render from `calculation_traces.component_name`. Column labels render from `calculation_traces.inputs` keys. The UI is domain-agnostic — works for BCL, MIR, CRP, any future tenant.

**Thermostat Principle:** act on data, don't just display it. The commission statement surfaces actionable detail (which transactions earned what, which were clawed back) — not just a number.

**Decision 158:** the UI reads stored traces. Zero LLM calls in the rendering path.

---

## §3 — PHASE 1: Data Layer + Commission Statement Page

### §3.1 Read the existing patterns

Before writing any code, read:

```bash
# Discover the existing page structure and patterns
find web/src/app -name 'page.tsx' -o -name 'layout.tsx' | head -30
# Read the Calculate page for layout/data-fetching patterns
grep -rn 'calculation_results\|entity_period_outcomes' web/src/app/ | head -20
# Read the Bliss theme components
ls web/src/components/ui/
# Read the existing data-fetching pattern (server component? API route? client query?)
grep -rn 'createClient\|supabase\|useQuery' web/src/app/**/page.tsx | head -20
```

Record: (a) how pages are structured (App Router conventions, server vs client components); (b) how data is fetched (direct Supabase in server component, or API route, or client-side); (c) what UI components exist (Card, Table, Badge, etc.); (d) how the sidebar/navigation adds new routes.

### §3.2 Commission statement API route (or server query)

Create a data-fetching layer that returns the commission statement for an entity + period. Follow the existing pattern (API route or server component query). The query:

```sql
-- Commission statement: entity's traces grouped by component
SELECT
  ct.component_name,
  ct.committed_data_id,
  ct.transaction_ref,
  ct.formula,
  ct.inputs,
  ct.output,
  ct.steps,
  cd.row_data AS source_row,
  cd.source_date
FROM calculation_traces ct
LEFT JOIN committed_data cd ON cd.id = ct.committed_data_id
WHERE ct.tenant_id = $tenantId
  AND ct.result_id IN (
    SELECT id FROM calculation_results
    WHERE tenant_id = $tenantId AND entity_id = $entityId AND period_id = $periodId
  )
  AND ct.committed_data_id IS NOT NULL
ORDER BY ct.component_name, cd.source_date;
```

Also fetch the entity-level summary:
```sql
SELECT cr.entity_id, cr.period_id, cr.total_payout, cr.components, cr.metrics,
       e.external_id, e.display_name,
       p.label AS period_label
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
JOIN periods p ON p.id = cr.period_id
WHERE cr.tenant_id = $tenantId AND cr.entity_id = $entityId AND cr.period_id = $periodId;
```

### §3.3 Commission statement page

Create the page at a route consistent with the existing app structure (e.g., `/statements/[entityId]/[periodId]` or `/compensation/[entityId]/[periodId]` — follow whatever naming convention the app uses).

**Layout structure:**

```
┌────────────────────────────────────────────────────────┐
│ ← Back to Results                                      │
│                                                        │
│ Entity: [display_name] ([external_id])                 │
│ Period: [period_label]                                 │
│ Total Payout: [total_payout, formatted with currency]  │
├────────────────────────────────────────────────────────┤
│                                                        │
│ ▼ Component 1: [name]              Subtotal: [amount]  │
│ ┌──────────────────────────────────────────────────┐   │
│ │ Ref       │ Date     │ Inputs  │ Rate  │ Amount  │   │
│ ├───────────┼──────────┼─────────┼───────┼─────────┤   │
│ │ TXN-001   │ 2026-01  │ 5,000   │ 4.0%  │ 200.00  │   │
│ │ TXN-002   │ 2026-01  │ 3,200   │ 3.5%  │ 112.00  │   │
│ │ ...       │          │         │       │         │   │
│ └──────────────────────────────────────────────────┘   │
│ ► Component 2: [name]              Subtotal: [amount]  │
│ ► Component 3: [name] (clawback)   Subtotal: −[amt]   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Component rendering rules:**
- Each component is an expandable card showing the component name and subtotal (sum of per-row contributions).
- Expanded: a table of per-transaction rows. Each row shows: `transaction_ref` (or committed_data_id if ref is null), `source_date`, key input values (from `inputs` JSONB), `rate` (from `output.rate`), `contribution` (from `output.contribution`).
- Clawback components (`output.pattern === 'clawback'`): render with a distinct visual indicator (e.g., red text, negative sign, "Reversal" badge). Show `output.originalContribution` and the reversal formula.
- Non-attributable components (Pattern C — no per-row traces): render the component card with the entity-level subtotal and a note like "Entity-level calculation (no per-transaction breakdown)." These components have no rows in `calculation_traces` with `committed_data_id`.
- Currency formatting: use the tenant's locale. PEN for MIR, USD for BCL. Read from tenant config or use `Intl.NumberFormat`.

**Clicking a transaction row** → expand inline or navigate to transaction detail (Phase 2).

### §3.4 Admin entry point

Add a link/button on the existing entity results view (wherever entity payouts are displayed) that navigates to the commission statement page for that entity + period. This is the admin drill-down: Calculate → see results → click entity → commission statement.

Discover the existing results rendering (grep for `calculation_results` or `entity_period_outcomes` in page components) and add the link there.

Commit: `"OB-219 Phase 1: commission statement page + admin entry point"`

### §3.5 EPG-1

Paste: (a) existing page pattern findings. (b) data query/route diff. (c) commission statement page diff. (d) admin entry point diff. (e) screenshot-equivalent: navigate to a BCL entity's commission statement, paste the rendered data (entity name, total, component names, trace count per component). (f) `npm run build` exit-0.

**HALT-DATA:** if `calculation_traces` has 0 rows for the target tenant → the OB-217 migration hasn't been applied or BCL hasn't been recalculated. Do not proceed. Report.

---

## §4 — PHASE 2: Transaction Detail + Clawback Rendering

### §4.1 Transaction detail panel

When a user clicks a transaction row in the commission statement, show the full trace detail. This can be an expandable inline panel or a separate route — follow the existing app's pattern for detail views.

**Detail content:**
- **Header:** Transaction ref (or ID), source date, component name
- **Formula:** `output.formula` (e.g., "18 × Cantidad_Productos_Cruzados")
- **Inputs:** render each key-value pair from `inputs` JSONB as a labeled row
- **Rate:** `output.rate`, formatted as percentage or multiplier as appropriate
- **Contribution:** `output.contribution`, formatted with currency
- **Pattern:** `output.pattern` — display as badge ("Additive", "Qualified", "Clawback")
- **Steps:** if `steps` array has entries, render as a timeline or ordered list

**For clawback traces (`pattern === 'clawback'`):**
- Show "Original Transaction" section: `output.originalCommittedDataId`, `output.originalContribution`, `output.originalRate`
- Show reversal computation: "−[recoveryRate] × [originalContribution] = [contribution]"
- If the original transaction's commission statement is accessible, link to it

### §4.2 Source data panel

Below the trace detail, show the raw source row from `committed_data.row_data`:
- Render all key-value pairs from `row_data` JSONB as a definition list or table
- This is the "see exactly what data drove this calculation" layer — the bottom of the 5-layer drill-down
- Label: "Source Transaction Data" or equivalent

### §4.3 Locale-aware formatting

Read the tenant's locale (from tenant config or session). Apply:
- Currency: `Intl.NumberFormat(locale, { style: 'currency', currency: tenantCurrency })`
- Dates: `Intl.DateTimeFormat(locale)`
- Numbers: `Intl.NumberFormat(locale)`

If the locale system is not wired yet (i18n is an open item), use a reasonable default and note in the completion report.

Commit: `"OB-219 Phase 2: transaction detail + clawback rendering + locale formatting"`

### §4.4 EPG-2

Paste: (a) transaction detail component diff. (b) source data panel diff. (c) navigate to a BCL entity → expand a transaction → paste the rendered trace detail (formula, inputs, rate, contribution). (d) if clawback traces exist (OB-218): navigate to a clawback transaction → paste the rendered reversal detail. (e) `npm run build` exit-0.

---

## §5 — PHASE 3: Verification + PR

### §5.1 BCL walkthrough

Navigate to a BCL entity's commission statement. Verify:
- Total payout displayed matches `calculation_results.total_payout`.
- "Productos Cruzados" component expanded → per-transaction rows visible with rate and contribution.
- Other components (Pattern C) show entity-level total with no per-row breakdown.
- Click a transaction → trace detail renders (formula, inputs, rate, contribution, source data).

### §5.2 MIR walkthrough (if OB-218 merged)

Navigate to a MIR entity. Verify:
- Multiple components visible with per-transaction traces.
- Plan 1: traces show category-specific rates (not uniform fallback).
- Clawback component: negative contributions with reversal detail.
- Click a clawback transaction → original contribution and reversal formula visible.

If OB-218 is not yet merged, verify MIR non-clawback plans only (per-transaction traces from OB-217).

### §5.3 Regression

No calculation changes in this OB — pure UI. Verify `npm run build` exit-0 and no console errors at runtime.

### §5.4 PR

```bash
gh pr create --base main --head ob-219-transaction-drill-down \
  --title "OB-219: Per-transaction drill-down + commission statement" \
  --body "Commission statement page: entity + period → component breakdown → per-transaction table.
Transaction detail: click-through to full trace (formula, inputs, rate, contribution, source data).
Clawback rendering: negative contributions with original link and reversal formula.
Admin entry point: Calculate results → entity → commission statement.
Domain-agnostic: renders any tenant's traces (BCL, MIR, future).
Bliss theme: light + dark. Locale-aware currency/date formatting."
```

**DO NOT MERGE** (SR-44).

---

## §5A — REPORTING DISCIPLINE

Completion report at `docs/completion-reports/OB-219_COMPLETION_REPORT.md`.

1. **Pasted evidence:** page screenshots or rendered-data paste for BCL + MIR, component expansion, transaction detail, clawback rendering (if available).
2. **SHA:** merge-ready commit.
3. **ARTIFACT SYNC:**
   ```
   ARTIFACT SYNC
   MC: [Commission Statement: NOT BUILT → BUILT; Transaction Detail: NOT BUILT → BUILT]
   REGISTRY: [Audit Trail row → drill-down UI evidence; Rep Transparency row → commission statement]
   BOARD: [5-layer drill-down: bottom 3 layers now have UI]
   SUBSTRATE: [Korean Test (domain-agnostic rendering), Thermostat (act on data)]
   ```

---

## §6 — OUT OF SCOPE

- **Rep self-service login** (entity-to-user linking — prerequisite for "My Statements" persona view). For MIR demo, admin navigates to the entity. Separate capability (DS-014 Phase 3).
- **Dispute submission from trace** (click trace → submit dispute with data reference). The basic CRUD exists (OB-73). Structured dispute workflow is a separate OB.
- **CSV/PDF export** from commission statement. Follow-on.
- **Manager team view** (manager sees team payouts with drill-down). Requires entity-relationship scoping. Separate OB.
- **Period-over-period comparison** within commission statement. Follow-on.
- **Reconciliation Studio integration** (the forensics environment from ViaLuce_Calculation_Forensics_Design). Separate, higher-complexity surface.

---

## §6A — RESIDUALS

1. The commission statement page becomes the data source for the dispute flow: "click transaction → see trace → dispute this calculation." OB-219 builds the "see" step. A follow-on OB wires the "dispute" step.

2. Entity-to-user linking (DS-014 Phase 3) enables the rep persona: login → see MY commission statement (scoped by entity-to-user mapping). Until then, admin-accessed statements serve the MIR demo.

3. The commission statement renders `inputs` JSONB keys as column headers. For MIR, these are raw Spanish headers (`Monto_Cobrado`, `Cantidad_Productos_Cruzados`). Display-name mapping (raw header → human-readable label) is a follow-on enrichment, possibly via convergence binding metadata.

---

*OB-219 · Per-Transaction Audit Drill-Down + Commission Statement · 2026-06-18*
*Architect gates: ZERO. Fully autonomous CC execution.*
