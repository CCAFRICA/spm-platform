# OB-163: BCL PROOF TENANT + BRIEFING EXPERIENCE — VERTICAL SLICE
## Pipeline Proof Tenant #2 + DS-011 Briefing-First Implementation

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — all rules, anti-patterns, Governing Principles (Decisions 123-124), G1-G6 evaluation framework
2. `SCHEMA_REFERENCE_LIVE.md` — live database schema (34 tables, March 7, 2026)
3. `DS-012_BCL_Proof_Tenant_Design_20260310.docx` — the proof tenant specification (Decision 125)
4. `DS-011_Briefing_Experience_Prototype_20260310.jsx` — the visual specification for the Briefing
5. `SH_UI_TO_BUILD_20260310.md` — UI conversation handoff with DS-011 proof gates and data dependencies
6. `DS-010_Calculation_Precision_Architecture_20260310.docx` — Decision 122: Banker's Rounding, decimal.js, rounding trace
7. This prompt in its entirety before writing a single line of code

---

## CONTEXT — WHY THIS EXISTS

### The Milestone

MX$185,063. Exact. Production. The Meridian pipeline proof (Decision 95) is complete. All five components zero delta. Three bugs found and fixed structurally: operator mismatch (HF-121), floating-point imprecision (HF-122), tier boundary inclusivity (HF-123).

### The Mode Shift

HF-mode is over. OB-mode: vertical slices with engine + experience together.

### What This OB Delivers

A **second proof tenant** (Banco Cumbre del Litoral — Ecuador, USD, 85 entities, 6 months, 4 components, team hierarchy) with the **Briefing Experience** (DS-011) rendering real calculation results for all three personas (Admin, Manager, Individual).

This is the single most important OB since the pipeline proof. It proves:
1. The pipeline works for a SECOND tenant (not Meridian-specific)
2. The Briefing-first model replaces dashboard-first
3. Multi-period calculation works
4. Team hierarchy enables manager coaching intelligence
5. The platform delivers value to every persona

### The Vertical Slice Rule (FOUNDATIONAL — NON-NEGOTIABLE)

Engine and experience evolve together. NEVER separate engine work from UI work. Every phase in this OB that touches the pipeline must result in BOTH correct data AND visible rendered result. One PR when complete.

---

## FIRST PRINCIPLES

1. **VERTICAL SLICE** — Engine + experience together. Every phase.
2. **GT-FIRST** — After every calculation run, compare against BCL ground truth file component-by-component. BCL total or it's wrong.
3. **BRIEFING IS THE PRODUCT** — The Briefing is what users see. Sidebar is support. Dashboard pages are dead.
4. **KOREAN TEST** — Zero hardcoded field names, entity names, component names, branch names, or language strings.
5. **DECISION 122** — All calculations use decimal.js with Banker's Rounding. Rounding trace in metadata.
6. **DECISION 123** — Compliance emerges from architecture. The Deterministic Calculation Boundary IS the audit control.
7. **DECISION 124** — Every visualization choice justified by research. Font → Tinker. Color → opponent-process theory. Navigation → Hick's Law.
8. **DECISION 125** — BCL specification is the law. Entity model, plan structure, components, narrative arcs — all locked.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. Architecture Decision Gate before implementation
5. Anti-Pattern Registry check (AP-1 through AP-25) — v3.0
6. Supabase batch ≤200 for all `.in()` calls
7. Build EXACTLY what this prompt specifies
8. ALL git commands from repository root (spm-platform)
9. SQL Verification Gate (FP-49): query live schema before writing any SQL
10. PRODUCTION VERIFICATION MANDATORY: every completion report includes post-merge production verification steps

---

## PHASE 0: DIAGNOSTIC — DISCOVER WHAT EXISTS

**MANDATORY. DO NOT SKIP. DO NOT ASSUME.**

After 227+ PRs, features may be broken. This phase discovers the actual state of the codebase before writing any new code.

### 0A: Platform Infrastructure State

```bash
echo "=== CURRENT ROUTES ==="
find src/app -name "page.tsx" | sort

echo "=== SIDEBAR/NAV CONFIG ==="
find src -name "*sidebar*" -o -name "*nav*" -o -name "*layout*" | grep -v node_modules | grep -v .next | sort

echo "=== PERSONA CONTEXT ==="
grep -r "usePersona\|effectivePersona\|PersonaContext\|persona" src/contexts/ src/providers/ --include="*.tsx" --include="*.ts" -l 2>/dev/null

echo "=== ASSESSMENT API ==="
find src/app/api -name "route.ts" -path "*assess*" | sort

echo "=== BRIEFING/DASHBOARD ROUTES ==="
find src/app -name "page.tsx" -path "*perform*" -o -name "page.tsx" -path "*dashboard*" -o -name "page.tsx" -path "*brief*" | sort

echo "=== CALCULATION ENGINE ==="
find src -name "*engine*" -o -name "*calculate*" -o -name "*evaluator*" | grep -v node_modules | grep -v .next | sort

echo "=== ENTITY RELATIONSHIPS TABLE ==="
grep -r "entity_relationships" src/ --include="*.ts" --include="*.tsx" -l 2>/dev/null

echo "=== IMPORT PIPELINE ==="
find src/app/api -name "route.ts" -path "*import*" -o -name "route.ts" -path "*upload*" -o -name "route.ts" -path "*ingest*" | sort

echo "=== DECIMAL.JS USAGE ==="
grep -r "decimal\.js\|Decimal\|ROUND_HALF_EVEN" src/ --include="*.ts" --include="*.tsx" -l 2>/dev/null
```

Paste ALL output. DO NOT summarize.

### 0B: Known Issues Verification

Test these specific items on localhost:3000:

1. `/api/platform/tenant-config` — does it return 403? What's the RLS policy?
2. File upload — does storage RLS error occur?
3. Calculate page — how many calculate pages exist? Which one works?
4. Persona switching — does `usePersona()` work? What mechanism exists?
5. Period creation — is there a UI? Or only SQL?

For each, report: WORKING / BROKEN / NOT FOUND, with evidence (error message, route response, or code reference).

### 0C: Meridian Verification

Before building BCL, confirm Meridian still works:

```bash
echo "=== MERIDIAN TENANT ==="
# Query Meridian's latest calculation results
# Verify MX$185,063 is still the production total
```

If Meridian has regressed, STOP. File HF-124 to fix before proceeding.

**Commit:** `OB-163 Phase 0: Diagnostic — platform state inventory`

---

## PHASE 1: STABILIZE — FIX PREREQUISITES

**Only fix what blocks BCL. Do not fix cosmetic issues. Do not refactor.**

### 1A: tenant-config 403

Root cause the `/api/platform/tenant-config` 403 error. This blocks multiple pages.

Likely cause: RLS policy requires `auth.uid()` to match a profile with the correct role. VL Admin (platform@vialuce.com, UUID 9c179b53-c5ee-4af7-a36b-09f5db3e35f2) may not satisfy the policy.

Fix: Ensure the API route uses service role client for platform-level configuration reads, OR fix the RLS policy to allow platform-role users.

### 1B: Storage RLS

Root cause the storage RLS error on file upload. BCL requires uploading 9 files.

Check: `supabase.storage.from('ingestion-raw')` policies. VL Admin must be able to upload to any tenant's storage path.

### 1C: Single Calculate Page

If two calculate pages exist (`/operate/calculate` and `/admin/launch/calculate`), consolidate to one. The Briefing will eventually replace both, but for Phase 2 we need a working calculate surface.

### 1D: Plan Status Lifecycle

The calculate page blocks on `plan.status = 'draft'`. BCL's plan must be 'active' to calculate. Options:
- A: Add a "Set Active" button on the plan detail page
- B: Auto-set status to 'active' when plan import completes successfully
- C: SQL workaround (acceptable for now but mark as tech debt)

**Choose the option that ships fastest without architectural debt.**

**Commit:** `OB-163 Phase 1: Stabilize — prerequisites for BCL`

---

## PHASE 2: BCL DATA GENERATION

**Generate all BCL data files programmatically. Fixed seed. Reproducible.**

### 2A: Data Generation Script

Create `scripts/generate-bcl-data.ts` (or `.js`) that produces:

1. **BCL_Plantilla_Personal.xlsx** — Roster: 85 rows with ID_Empleado, Nombre_Completo, Sucursal_ID, Cargo, Nivel_Cargo, Fecha_Ingreso, ID_Gerente, Region
2. **BCL_Datos_Oct2025.xlsx through BCL_Datos_Mar2026.xlsx** — 6 monthly files, each 85 rows, all metric columns per DS-012 Section 5.2
3. **BCL_Plan_Comisiones_2025.xlsx** — Plan document with 3 tabs: Plan General, Tablas de Tasas, Metas Mensuales
4. **BCL_Resultados_Esperados.xlsx** — Ground truth with 2 tabs: Per-Entity Detail, Summary

Requirements from DS-012 Section 12:
- Fixed random seed (seed=42)
- 5 narrative entity arcs hardcoded per DS-012 Section 6 (Valentina=accelerator, Roberto=decliner, Ana Lucía=recoverer, Diego=gate-blocked, Gabriela=top-performer)
- Background entities: normally distributed ~85-95% attainment, σ=15%
- ~12-15% of entity-months have 1+ regulatory infractions
- Seasonal pattern: Oct-Nov lower, Dec peak, Jan dip, Feb-Mar recovery
- Cross-product counts: Poisson(λ=6) for Ejecutivo, Poisson(λ=9) for Senior
- GT calculated using exact plan rules with Banker's Rounding (ROUND_HALF_EVEN)

### 2B: GT Verification

After generating, verify GT internally:
- Sum of all entity totals for all 6 months = BCL Grand Total
- Each narrative entity's arc matches DS-012 description
- C4 gate: Diego has infractions every month (C4=$0 every month). Gabriela has zero infractions every month (C4=$150 every month).
- Variant rates: Senior rates applied to 28 entities, Standard rates to 57

Record the **exact BCL Grand Total** — this becomes the BCL ground truth number (analogous to MX$185,063).

### 2C: Verification Anchors

Extract and record verification anchors for three entities (per DS-012 Section 7.3):
- Valentina Salazar (BCL-5012): all 6 months, all 4 components
- Diego Mora (BCL-5063): all 6 months, all 4 components (C4 should be $0 every month)
- Gabriela Vascones (BCL-5003): all 6 months, all 4 components (maximum payout path)

**Commit:** `OB-163 Phase 2: BCL data generation — [N] files, GT total: $[EXACT]`

---

## PHASE 3: BCL TENANT PROVISIONING + IMPORT

### 3A: Create BCL Tenant

Create the Banco Cumbre del Litoral tenant via the platform UI or API:
- Name: Banco Cumbre del Litoral
- Slug: banco-cumbre-litoral
- Industry: Banking
- Locale: es-EC
- Currency: USD

Create admin profile:
- Email: admin@bancocumbre.ec
- Display name: Patricia Zambrano
- Role: admin

### 3B: Import Plan Document

Upload BCL_Plan_Comisiones_2025.xlsx to the BCL tenant.

**Verification gates:**
- [ ] HC processes all 3 tabs
- [ ] AI extracts 4 components with correct primitives (bounded_lookup_2d, bounded_lookup_1d, scalar_multiply, conditional_gate)
- [ ] 2 variants extracted (Ejecutivo Senior, Ejecutivo)
- [ ] Rate tables populated in rule_sets.components
- [ ] Plan status set to 'active' (via Phase 1D mechanism)

### 3C: Import Roster

Upload BCL_Plantilla_Personal.xlsx.

**Verification gates:**
- [ ] 85 entities created in entities table
- [ ] entity_relationships populated from ID_Gerente column (85 relationships: each person → their manager)
- [ ] Variant assignment: 28 Senior, 57 Standard (from Nivel_Cargo)
- [ ] rule_set_assignments created: 85 assignments with correct variant

### 3D: Import Monthly Data Files

Upload all 6 monthly files (BCL_Datos_Oct2025.xlsx through BCL_Datos_Mar2026.xlsx).

**Verification gates:**
- [ ] 510 committed_data rows total (85 × 6)
- [ ] source_date populated correctly (2025-10-01, 2025-11-01, ... 2026-03-01)
- [ ] All metric columns preserved (Cumplimiento_Colocacion, Indice_Calidad_Cartera, Pct_Meta_Depositos, Cantidad_Productos_Cruzados, Infracciones_Regulatorias)
- [ ] Entity resolution: all 85 entities matched

### 3E: Period Creation

Create 6 periods for BCL:
- October 2025 (2025-10-01 to 2025-10-31)
- November 2025 (2025-11-01 to 2025-11-30)
- December 2025 (2025-12-01 to 2025-12-31)
- January 2026 (2026-01-01 to 2026-01-31)
- February 2026 (2026-02-01 to 2026-02-28)
- March 2026 (2026-03-01 to 2026-03-31)

If no period creation UI exists, create via SQL (mark as tech debt).

### 3F: Convergence Binding Verification

After import, verify convergence bindings for BCL:

| Component | Operation | Input Role | Expected Column |
|-----------|-----------|------------|-----------------|
| C1: Colocación de Crédito | bounded_lookup_2d | row | Cumplimiento_Colocacion |
| C1: Colocación de Crédito | bounded_lookup_2d | column | Indice_Calidad_Cartera |
| C2: Captación de Depósitos | bounded_lookup_1d | actual | Pct_Meta_Depositos |
| C3: Productos Cruzados | scalar_multiply | actual | Cantidad_Productos_Cruzados |
| C4: Cumplimiento Regulatorio | conditional_gate | actual | Infracciones_Regulatorias |

If convergence bindings are wrong, diagnose and fix before proceeding to calculation. AI column mapping is the mechanism (Decision 118: AI-Primary).

**Commit:** `OB-163 Phase 3: BCL provisioned — [N] entities, [N] committed_data, [N] periods, convergence bindings verified`

---

## PHASE 4: BCL CALCULATION + GT VERIFICATION

### 4A: Calculate All 6 Periods

Run calculation for each of the 6 periods. After EACH period calculation:

1. Check period total against GT
2. If wrong, compare component-by-component
3. The component deltas identify which evaluator has the bug
4. **Do NOT proceed to next period until current period matches GT exactly**

### 4B: Three-Anchor Verification

After all 6 periods are calculated, verify the three anchor entities against GT:

**Valentina Salazar (BCL-5012):**
- All 6 months: C1, C2, C3, C4, Total
- Trajectory: Oct lowest, Mar highest (accelerating arc)

**Diego Mora (BCL-5063):**
- All 6 months: C1, C2, C3 should be non-zero; C4 should be $0 EVERY MONTH
- Verify conditional_gate FAIL path works consistently

**Gabriela Vascones (BCL-5003):**
- All 6 months: highest-tier values in C1 and C2
- Zero infractions: C4 = $150 every month (Senior PASS value)

### 4C: Grand Total Verification

BCL Grand Total (6 months, 85 entities, 4 components) = $[EXACT VALUE FROM PHASE 2B]

This is the BCL equivalent of MX$185,063. Report the exact match or exact delta.

**Commit:** `OB-163 Phase 4: BCL calculation complete — $[EXACT] (0 delta across all 4 components, 6 periods)`

---

## PHASE 5: BRIEFING EXPERIENCE — INDIVIDUAL PERSONA

**The Briefing is the product. This is where the pipeline becomes visible.**

### Architecture Decision Record (MANDATORY)

```
ARCHITECTURE DECISION RECORD
============================
Problem: Build Briefing-first landing experience for Individual persona

G1 (Governing Standard): Which standard does this decision serve?
   → GAAP presentation (Decision 122), Cognitive Fit (DS-003), FIT (Kluger & DeNisi)

G2 (Research Derivation): What research governs this design?
   → Cleveland & McGill (1984): position along common scale for hero metric
   → Hull (1932), Kivetz (2006): Goal-Gradient Effect for tier bar
   → Festinger (1954), Li (2024): social comparison for relative leaderboard
   → Sweller (1988): cognitive load limits density to 7 elements

G3 (Abstraction Principle): Does it survive domain change?
   → All elements read from calculation_results + rule_sets — domain-agnostic

G4 (Korean Test): Zero hardcoded labels?
   → Component names from rule_sets. Entity names from entities. Currency from tenant.

G5 (Both-Branch): Handles empty state AND full state?
   → Empty: "Insufficient data for pace indicator" when < 2 periods
   → Full: All 7 elements render with 6 months of data

G6 (Scale): Works at 150K entities?
   → Leaderboard scoped to team (max ~10 entities). No full-population queries.

CHOSEN: Briefing component renders as /briefing route, persona-adapted
```

### 5A: Create Briefing Route

Create `/src/app/(protected)/briefing/page.tsx` as the Briefing landing page.

The Briefing component reads `effectivePersona` (from usePersona or equivalent) and renders persona-specific content. Start with Individual.

### 5B: Individual Briefing Elements (DS-011)

Render these elements for the Individual persona, using BCL data for Valentina Salazar (BCL-5012):

| # | Element | Data Source | Render |
|---|---------|-------------|--------|
| 1 | AI narrative line | Static text for V1 (Insight Agent integration is Phase 8) | "You've earned $[total]. You're at [X]% attainment — $[gap] from [next tier]. Your highest-leverage component is [component name]." |
| 2 | Hero: earnings | `calculation_results.total_payout` for latest period | Large number with currency format (USD, whole dollars ≥ $10K per PDR-01) |
| 3 | Attainment ring | Average of C1 and C2 attainment | Percentage with circular indicator |
| 4 | Goal-gradient bar | Current attainment vs tier boundaries from `rule_sets.components` | Multi-tier bar with landmarks and gap label |
| 5 | Pace indicator | 6-month trajectory extrapolation | "On track for [tier] by [month]" or "Insufficient data" if < 2 periods |
| 6 | Component stack | C1-C4 individual amounts from `calculation_results.components` | Stacked bar with amounts |
| 7 | Relative leaderboard | Ranked `calculation_results` for same team (via `entity_relationships`) | 3 above, 3 below, viewer highlighted, anonymous below median |

**Critical implementation rules:**
- Component names from `rule_sets.components[].name` — NEVER hardcoded
- Entity names from `entities.display_name` — NEVER hardcoded
- Currency format from tenant settings — NEVER hardcoded
- Leaderboard anonymizes entities below median (Li 2024)
- All amounts use the currency formatter (whole dollars ≥ $10K, cents below)

### 5C: Wayfinder Layer — Individual

Apply emerald ambient gradient for Individual persona:
```
from-slate-950 via-emerald-950/25 to-slate-950
```

The environment changes before the user reads a label.

### 5D: Proof Gates — Individual

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-01 | Hero shows Valentina's latest period total | Dollar amount matches `calculation_results.total_payout` for BCL-5012, March 2026. Value matches database query. |
| PG-02 | Goal-gradient shows tier position | Bar shows current attainment with tier landmarks sourced from `rule_sets.components`. |
| PG-03 | Component stack shows 4 components | C1-C4 with individual amounts that sum to hero value. Names from `rule_sets`. |
| PG-04 | Leaderboard shows relative position | Valentina appears with entities from her team (via `entity_relationships`). Below-median anonymous. |
| PG-05 | Emerald gradient visible | Background gradient includes emerald tint. |

**Paste evidence (code + rendered output) for every PG. Self-attestation rejected.**

**Commit:** `OB-163 Phase 5: Individual Briefing — 7 elements rendering with BCL data`

---

## PHASE 6: BRIEFING EXPERIENCE — MANAGER PERSONA

### 6A: Manager Briefing Elements (DS-011)

Render for Fernando Hidalgo (BCL-RM-COSTA, Costa regional manager, ~24 direct reports across 3 branches):

| # | Element | Data Source | Render |
|---|---------|-------------|--------|
| 1 | AI narrative line | Static text for V1 | "[N] on track, [N] need attention, [N] exceeding. [Name] is your highest-ROI coaching opportunity." |
| 2 | Hero: team total | `SUM(calculation_results.total_payout)` for entities where Fernando is manager (via entity_relationships) | Large number + trend (compare latest period vs prior period) |
| 3 | Coaching priority card | Entity × component with highest marginal return to next tier boundary | "[Name] → [Component]: +$[projected] if they reach [X]%" with action button |
| 4 | Entity × Component heatmap | Attainment % per entity per component, rows sorted by coaching priority | Rows = team members, Cols = C1-C4, Cell = color intensity (Cleveland: heatmap for 2D pattern) |
| 5 | Bloodwork attention | Conditional: gate failures + declining entities | Cards with resolution buttons. Silence = health (no card if clean). |

**Critical implementation rules:**
- Team membership from `entity_relationships` — manager's direct reports
- Heatmap rows sorted by coaching priority (proximity to tier boundary × trend direction)
- Roberto (BCL-5027, if in Fernando's team scope) should trigger a Bloodwork card for decline
- Diego (BCL-5063, if in Fernando's team scope) should trigger a Bloodwork card for gate blocking

### 6B: Wayfinder Layer — Manager

Apply amber ambient gradient:
```
from-slate-950 via-amber-950/25 to-slate-950
```

### 6C: Proof Gates — Manager

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-06 | Hero shows Costa team total | Dollar amount matches SUM of calculation_results for Fernando's direct reports. |
| PG-07 | Heatmap shows [N] rows × 4 columns | Correct number of team members. 4 component columns. Colors reflect attainment. |
| PG-08 | Coaching card names specific entity + component | Not hardcoded — computed from tier proximity analysis. |
| PG-09 | Amber gradient visible | Background gradient includes amber tint. |

**Commit:** `OB-163 Phase 6: Manager Briefing — 5 elements with team heatmap and coaching priority`

---

## PHASE 7: BRIEFING EXPERIENCE — ADMIN PERSONA

### 7A: Admin Briefing Elements (DS-011)

Render for Patricia Zambrano (admin@bancocumbre.ec, tenant-wide scope):

| # | Element | Data Source | Render |
|---|---------|-------------|--------|
| 1 | AI narrative line | Static text for V1 | "March 2026 calculated cleanly. 85 entities across 2 variants, $[total]. All 4 components verified. Ready for reconciliation." |
| 2 | Hero: system health | Aggregate `calculation_results` | Total payout + entity count + exception count + component count |
| 3 | Lifecycle stepper | Lifecycle state for current period | Import✓ → Classify✓ → Calculate✓ → Reconcile → Approve → Publish. Proximate action button. |
| 4 | Distribution histogram | All 85 entity totals for latest period | 6-bucket histogram with mean/median/σ |
| 5 | Optimization opportunity (Action Card) | Sensitivity analysis on tier boundaries | "[N] entities within 5% of next tier. Projected: +$[revenue] / +$[cost]. ROI: [X]x" |
| 6 | Bloodwork exceptions | Exception stream | Green confirmation if clean; prioritized list if populated |

### 7B: Wayfinder Layer — Admin

Apply indigo ambient gradient:
```
from-slate-950 via-indigo-950/40 to-slate-950
```

### 7C: Proof Gates — Admin

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-10 | Hero shows BCL total for latest period | Matches SUM(calculation_results.total_payout) for March 2026. |
| PG-11 | Distribution histogram renders | 6 buckets, correct count of entities in each bucket. |
| PG-12 | Gradient switch works | Switching between Admin/Manager/Individual visibly changes the ambient gradient. |
| PG-13 | Bloodwork: clean = green | When 0 exceptions, shows green confirmation message. Not a missing section. |

**Commit:** `OB-163 Phase 7: Admin Briefing — system health, distribution, optimization`

---

## PHASE 8: NAVIGATION RESTRUCTURE

### 8A: Briefing as Default Landing

On login, the user lands on `/briefing`. This is the active default. The sidebar shows "Briefing" as the active item.

### 8B: Sidebar Structure

**Admin sidebar:**
- Briefing (active default)
- Operate: Import Data, Calculate, Reconcile, Approve
- Configure: Plans, Periods, Entities, Settings

**Manager sidebar:**
- Briefing (active default)
- Team Detail
- Approvals

**Individual sidebar:**
- Briefing (active default)
- My Statements, My Plan, Submit Dispute

Sidebar links that point to non-existent pages should either be removed or show "Coming Soon" empty state. Do NOT link to stub pages that redirect.

### 8C: Persona Switching

Verify or implement persona switching mechanism:
- If `usePersona()` exists and works, use it
- If broken or missing, implement context-based persona switching (NO auth round-trip — context override only)
- Switching persona changes: Briefing content, sidebar structure, ambient gradient

### 8D: Proof Gates — Navigation

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-14 | Login lands on Briefing | After login, `/briefing` is the rendered page. Not `/operate`, not `/admin`, not `/dashboard`. |
| PG-15 | Sidebar shows persona-appropriate links | Admin sidebar differs from Manager sidebar differs from Individual sidebar. |
| PG-16 | Persona switch updates content without page reload | Switching persona changes Briefing content and gradient. No auth round-trip. |

**Commit:** `OB-163 Phase 8: Navigation — Briefing-first, persona sidebar, gradient switching`

---

## PHASE 9: SIGNAL CAPTURE INFRASTRUCTURE

### 9A: Interaction Signal Schema

Wire interaction signal capture for V2/V3 Briefing adaptation:

```typescript
// Signal types for Briefing interactions
interface BriefingSignal {
  signal_type: 'briefing_interaction';
  tenant_id: string;
  user_id: string;  // auth.uid()
  persona: 'admin' | 'manager' | 'individual';
  element_id: string;  // 'hero_metric' | 'coaching_card' | 'heatmap' | etc.
  action: 'view' | 'click' | 'expand' | 'navigate';
  dwell_ms?: number;
  destination?: string;  // if action='navigate', where they went
  timestamp: string;
}
```

Store in `classification_signals` table (same structure as SCI signals, different signal_type).

### 9B: Capture Points

Add signal capture to:
- Briefing page mount (view signal for each visible element)
- Element click/expand (click signal)
- Navigation from Briefing to detail page (navigate signal with destination)

This is V1 infrastructure. Adaptation is dormant. The signals accumulate for V2.

**Commit:** `OB-163 Phase 9: Signal capture — Briefing interaction signals wired to classification_signals`

---

## PHASE 10: DEMO PROFILE CREATION

### 10A: Create Demo Profiles

Create 3 additional profiles for BCL (beyond the admin Patricia Zambrano):

| Profile | Email | Role | Entity Linkage |
|---------|-------|------|----------------|
| Fernando Hidalgo | gerente@bancocumbre.ec | manager | BCL-RM-COSTA |
| Valentina Salazar | valentina@bancocumbre.ec | individual | BCL-5012 |

These profiles enable demo persona switching: log in as admin, switch to manager (Fernando) or individual (Valentina) to see their Briefing.

### 10B: Demo User Registration in Tenant Settings

Add demo_users to BCL tenant settings JSONB:

```json
{
  "demo_users": [
    { "email": "admin@bancocumbre.ec", "persona": "admin", "display_name": "Patricia Zambrano" },
    { "email": "gerente@bancocumbre.ec", "persona": "manager", "display_name": "Fernando Hidalgo", "entity_id": "BCL-RM-COSTA" },
    { "email": "valentina@bancocumbre.ec", "persona": "individual", "display_name": "Valentina Salazar", "entity_id": "BCL-5012" }
  ]
}
```

**Commit:** `OB-163 Phase 10: Demo profiles — 3 BCL personas configured`

---

## PHASE 11: BUILD + VERIFY + PR

### 11A: Full Build Verification

```bash
cd /path/to/spm-platform
rm -rf web/.next
cd web && npm run build && npm run dev
# Confirm localhost:3000 responds
# Navigate to /briefing as each persona
# Verify all proof gates
```

### 11B: Completion Report

Create `OB-163_COMPLETION_REPORT.md` in the repository root with:

1. **BCL Grand Total:** $[EXACT] — match/delta against GT
2. **Verification Anchors:** Valentina, Diego, Gabriela — all 6 months, all 4 components
3. **Proof Gates:** PG-01 through PG-16 with pasted evidence for each
4. **Phase 0 diagnostic output** (pasted, not summarized)
5. **Architecture Decision Records** (pasted, not referenced)
6. **Files changed** (list)
7. **Anti-Pattern Registry check** (AP-1 through AP-25, each PASS/FAIL)

### 11C: PR

```bash
cd /path/to/spm-platform
gh pr create --base main --head dev \
  --title "OB-163: BCL Proof Tenant + Briefing Experience — Vertical Slice" \
  --body "## What This Delivers

### Second Proof Tenant: Banco Cumbre del Litoral
- Ecuador, USD, es-EC locale
- 85 entities, 6 months, 4 components, team hierarchy
- 5 narrative entity arcs (accelerator, decliner, recoverer, gate-blocked, top performer)
- Grand total: \$[EXACT] (0 delta against GT)
- Decision 125 (BCL Proof Tenant Design) satisfied

### Briefing Experience (DS-011)
- Individual Briefing: hero, attainment, goal-gradient, pace, allocation, component stack, leaderboard
- Manager Briefing: team total, coaching priority, entity×component heatmap, bloodwork
- Admin Briefing: system health, lifecycle, distribution histogram, optimization, bloodwork
- Persona-adapted ambient gradients (emerald/amber/indigo)
- Briefing-first navigation: login → Briefing as default landing
- Interaction signal capture for V2/V3 adaptation

### Infrastructure Stabilization
- tenant-config 403 resolved
- Storage RLS for file upload resolved
- Single calculate page consolidated
- Plan status lifecycle functional

## Proof Gates: see OB-163_COMPLETION_REPORT.md
## Decisions: 122 (precision), 123 (compliance), 124 (research), 125 (BCL design)"
```

---

## PRODUCTION VERIFICATION (Andrew performs after merge)

After the PR is merged to main and Vercel deploys to production:

1. **Login to vialuce.ai** as platform@vialuce.com
2. **Navigate to BCL tenant**
3. **Verify Briefing renders** for Admin persona — hero shows BCL total for March 2026
4. **Switch to Manager persona** — verify team heatmap shows for Fernando
5. **Switch to Individual persona** — verify Valentina's earnings and trajectory
6. **Check Vercel Runtime Logs** — zero 500 errors on any Briefing route
7. **Verify Meridian still works** — MX$185,063 unchanged (regression check)

---

## CC FAILURE PATTERN WARNINGS

| Pattern | Risk | Mitigation |
|---------|------|------------|
| FP-60: Completion without production evidence | HIGH | Every PG requires pasted screenshot or log. Self-attestation rejected. |
| FP-49: SQL schema fabrication | HIGH | SQL Verification Gate: query live schema before any SQL. |
| FP-61: Ignoring GT | HIGH | GT-First Protocol after EVERY calculation run. |
| FP-62: Celebrating proximity | HIGH | $[EXACT] or it's wrong. |
| FP-64: Test only one branch | HIGH | Diego tests FAIL branch. Gabriela tests PASS branch. Both required. |
| FP-65: Operator mismatch | MEDIUM | Engine already fixed (HF-121). Verify with BCL's conditional_gate. |
| Vertical Slice violation | CRITICAL | NEVER report "engine works, UI pending." Engine + experience together. |
| Dashboard-first regression | CRITICAL | If ANY dashboard page is the landing, the OB has failed. Briefing or nothing. |

---

## WHAT SUCCESS LOOKS LIKE

When this OB is complete:

1. **BCL calculates exactly** — Grand total matches GT, all 4 components, all 6 months, all 85 entities
2. **Three personas see their Briefing** — Admin sees system health, Manager sees coaching heatmap, Individual sees personal trajectory
3. **Briefing is the landing page** — Login → Briefing, not dashboard
4. **Ambient gradients shift per persona** — Emerald, amber, indigo
5. **Interaction signals capture** — V2/V3 infrastructure in place
6. **Meridian still works** — MX$185,063 unchanged (zero regression)

**This is the most important OB since the pipeline proof. It proves the platform delivers value to every persona, not just correct numbers to a database.**

---

*End of prompt. Read completely before writing a single line of code.*

*"The engine produces the right numbers. The Briefing shows the right story. The personas see the right experience. One vertical slice. One PR."*
