# OB-46A: DESIGN SYSTEM FOUNDATION
## NEVER ask, just build. Full autonomy. Do not stop for confirmation.

---

## CONTEXT

This is Part A of a 3-part UI rebuild (OB-46A/B/C) that implements a magnitude jump in ViaLuce's interface. Every page in the platform will be rebuilt against a new research-backed design system governed by TMR Addendum 7 (Persona-Driven Visualization Psychology) and the DS-001 interactive prototype.

**OB-46A (this batch):** Foundation — shared design system components, persona-aware layout wrapper, Wayfinder ambient color system, lifecycle state machine service, persona-scoped data query layer.

**OB-46B (next):** Surfaces — Dashboard (3 persona views), Perform workspace, Operate workspace, Queue/Cycle/Pulse as living system.

**OB-46C (after):** Chrome — Navigation, breadcrumbs, persona switcher, auth gates, tenant branding, sign out.

This batch creates the INFRASTRUCTURE that OB-46B and 46C build on. Nothing in this batch is user-visible. Everything in this batch is load-bearing.

---

## STANDING RULES

1. Always commit+push after every change
2. After every push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000
3. VL Admin: all users select preferred language. No forced English override.
4. CC prompts: single paste, full context. Autonomy Directive first line. Rule 29: prompt committed to git.
5. Never provide CC with answer values — fix logic not data
6. All handoffs include accumulated rules/preferences
7. Thermostat principle. ViaLuce is domain-agnostic. TMRs must not bias toward ICM.
8. DESIGN: Security/scale/performance by design not retrofitted. AI-first never hardcoded. Domain-agnostic always.
9. ViaLuce (formerly ClearComp). Domain: ViaLuce.ai. Supabase + Vercel + Cloudflare.
10. Production Discipline from Day One.
11. Final step: `gh pr create --base main --head dev` with descriptive title and body.
12. NO EMPTY SHELLS. Every component renders real data or explicit empty states with thermostat guidance.
13. NO HARDCODED DEMO DATA in components. Components accept props or query Supabase.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### CC ANTI-PATTERNS TO AVOID
- **Placeholder Syndrome:** No `// TODO` or `placeholder` in ANY component. Every component is functional.
- **Schema Disconnect:** Read the Supabase table names in this prompt. Write queries that match EXACTLY.
- **Silent Fallbacks:** If a query returns null/empty, render an explicit empty state with guidance, never a blank div.
- **Report Burial:** Completion report goes to PROJECT ROOT.

---

## SUPABASE SCHEMA REFERENCE

These are the REAL tables in production. Use EXACT names in all queries.

```
tenants           (id, name, slug, domain, settings JSONB, locale, currency, ...)
profiles          (id, tenant_id, user_id, display_name, role, entity_id, capabilities TEXT[], ...)
entities          (id, tenant_id, external_id, entity_type, display_name, attributes JSONB, status, ...)
entity_relationships (id, tenant_id, source_entity_id, target_entity_id, relationship_type, ...)
rule_sets         (id, tenant_id, name, domain, components JSONB, status, ...)
rule_set_assignments (id, tenant_id, entity_id, rule_set_id, variant_key, entity_overrides JSONB, ...)
periods           (id, tenant_id, period_key, period_type, label, start_date, end_date, status, ...)
calculation_batches (id, tenant_id, rule_set_id, period_id, lifecycle_state, entity_count, ...)
calculation_results (id, tenant_id, calculation_batch_id, entity_id, period_label, components JSONB, total_payout DECIMAL, ...)
entity_period_outcomes (tenant_id, period_key, entity_id, entity_type, rule_set_outcomes JSONB, total_payout DECIMAL, ...)
profile_scope     (profile_id, tenant_id, full_visibility_entity_ids UUID[], ...)
```

Key relationships:
- `profiles.entity_id` → `entities.id` (links a login to an operational entity)
- `entity_relationships` with `relationship_type = 'manages'` defines manager → report hierarchy
- `profile_scope.full_visibility_entity_ids` defines what entities a user can see
- `entity_period_outcomes` is the materialized view that dashboards read from
- `calculation_results` has per-component breakdown in `components JSONB`

---

## PHASE 0: RECONNAISSANCE

Before writing any code, audit the current state:

```bash
# Current component structure
find web/src/components -name "*.tsx" | head -40

# Current design system (if any)
find web/src -name "*design*" -o -name "*theme*" -o -name "*color*" | head -20

# Current data services
find web/src/lib -name "*service*" -o -name "*query*" | head -20

# Current layout wrappers
find web/src -name "*layout*" -o -name "*wrapper*" | head -20

# Current persona/role logic
grep -rn "role.*admin\|role.*manager\|role.*individual\|persona\|scope_level" web/src --include="*.tsx" --include="*.ts" | head -20

# Current lifecycle state
grep -rn "lifecycle_state\|lifecycle\|approved\|posted\|published" web/src --include="*.tsx" --include="*.ts" | head -20

# Supabase client location
find web/src -name "*supabase*" | head -10
```

Paste ALL output into completion report. This establishes the baseline.

**Commit:** `OB-46A Phase 0: Reconnaissance — current state audit`

---

## PHASE 1: DESIGN TOKEN SYSTEM

Create `web/src/lib/design/tokens.ts`:

### 1A: Persona Color Tokens

```typescript
export const PERSONA_TOKENS = {
  admin: {
    // Indigo — analytical thinking, trust, governance authority
    bg: 'from-slate-950 via-indigo-950/40 to-slate-950',
    accent: 'indigo',
    accentGrad: 'from-indigo-500 to-violet-500',
    heroGrad: 'from-indigo-600/80 to-violet-700/80',
    heroBorder: 'border-indigo-500/20',
    heroShadow: 'shadow-indigo-950/50',
    heroTextMuted: 'text-indigo-200/60',
    heroTextLabel: 'text-indigo-200/70',
    intent: 'Gobernar',
    intentDescription: 'Governance & System Health',
  },
  manager: {
    // Amber/Gold — warmth, mentorship, coaching, illumination
    bg: 'from-slate-950 via-amber-950/25 to-slate-950',
    accent: 'amber',
    accentGrad: 'from-amber-500 to-yellow-500',
    heroGrad: 'from-amber-600/70 to-yellow-700/60',
    heroBorder: 'border-amber-500/20',
    heroShadow: 'shadow-amber-950/50',
    heroTextMuted: 'text-amber-100/50',
    heroTextLabel: 'text-amber-100/60',
    intent: 'Acelerar',
    intentDescription: 'Development & Acceleration',
  },
  rep: {
    // Emerald→Lime — growth trajectory, progress, mastery
    bg: 'from-slate-950 via-emerald-950/25 to-slate-950',
    accent: 'emerald',
    accentGrad: 'from-emerald-500 to-lime-400',
    heroGrad: 'from-emerald-600/70 to-teal-700/70',
    heroBorder: 'border-emerald-500/20',
    heroShadow: 'shadow-emerald-950/50',
    heroTextMuted: 'text-emerald-100/50',
    heroTextLabel: 'text-emerald-100/60',
    intent: 'Crecer',
    intentDescription: 'Mastery & Progress',
  },
} as const;

export type PersonaKey = keyof typeof PERSONA_TOKENS;
```

### 1B: State Communication Tokens (Wayfinder Layer 2)

```typescript
// NEVER use stoplight red/yellow/green for state communication.
// Use completeness, opacity, and benchmark deviation.
export const STATE_TOKENS = {
  confirmed: 'opacity-100',
  proposed: 'opacity-70 border-dashed',
  attention: 'ring-1 ring-amber-500/30',
  neutral: 'opacity-50',
  // Performance states — based on benchmark deviation, not absolute color
  aboveBenchmark: 'text-emerald-400',
  atBenchmark: 'text-zinc-300',
  belowBenchmark: 'text-amber-400',
  criticallyBelow: 'text-rose-400',
} as const;
```

### 1C: Workspace Ambient Tokens (Wayfinder Layer 1)

```typescript
export const WORKSPACE_TOKENS = {
  operate: { density: 'normal', character: 'Control room: structured, sequential' },
  perform: { density: 'low', character: 'Motivational: warm, encouraging' },
  investigate: { density: 'high', character: 'Forensic lab: precise, evidence-based' },
  design: { density: 'low', character: 'Creative: open, sandbox-like' },
  configure: { density: 'normal', character: 'Organizational: spatial, structural' },
  govern: { density: 'high', character: 'Compliance: formal, audit-oriented' },
} as const;
```

**Commit:** `OB-46A Phase 1: Design token system — persona colors, state vocabulary, workspace ambient`

---

## PHASE 2: SHARED VISUALIZATION COMPONENTS

Create `web/src/components/design-system/` directory with these components:

### 2A: `AnimatedNumber.tsx`
Animated number counter with easing. Props: `value: number`, `prefix?: string`, `suffix?: string`, `duration?: number`. Uses requestAnimationFrame with cubic easing.

### 2B: `ProgressRing.tsx`
SVG circular progress indicator. Props: `pct: number`, `size?: number`, `stroke?: number`, `color?: string`, `children`. Animated stroke-dashoffset on mount.

### 2C: `BenchmarkBar.tsx`
Horizontal bar with benchmark reference line. Props: `value: number`, `benchmark: number`, `max?: number`, `label: string`, `sublabel?: string`, `rightLabel?: ReactNode`, `color?: string`. The benchmark line is a white tick mark. This is the primary "is that good?" component.

### 2D: `DistributionChart.tsx`
Histogram with 5 buckets (<70%, 70-85%, 85-100%, 100-120%, 120%+). Props: `data: number[]`, `benchmarkLine?: number`. Color-coded buckets. Shows statistical summary (mean, median, std dev). Admin uses this to see system shape.

### 2E: `ComponentStack.tsx`
Stacked horizontal bar (NOT pie) for part-of-whole. Props: `components: {name: string, value: number}[]`, `total: number`. Hover tooltips. Legend below. 6-color palette from the design tokens.

### 2F: `RelativeLeaderboard.tsx`
Shows user's position with ~3 neighbors above and below. Props: `yourRank: number`, `yourName: string`, `neighbors: {rank: number, name: string, value: number, anonymous: boolean}[]`. Bottom-ranked neighbors are anonymized (show "· · ·").

### 2G: `GoalGradientBar.tsx`
THE primary rep motivator. Progress bar with tier landmarks. Props: `currentPct: number`, `tiers: {pct: number, label: string}[]`. Gradient warms from emerald → lime → gold as approaching next tier. White dot marks current position. Shows gap text: "Solo MX$X más para [next tier]".

### 2H: `Sparkline.tsx`
Tiny embedded trend line. Props: `data: number[]`, `color?: string`, `width?: number`, `height?: number`. SVG polyline. No axes, no labels — pure trajectory signal.

### 2I: `StatusPill.tsx`
Small pill badge. Props: `children: ReactNode`, `color: 'emerald' | 'amber' | 'rose' | 'indigo' | 'zinc' | 'gold'`. Consistent styling across all persona views.

### 2J: `QueueItem.tsx`
Exception/action stream item. Props: `priority: 'high' | 'medium' | 'low'`, `text: string`, `action: string`, `accentColor: string`. Color-coded priority bar. Hover reveals action button.

### 2K: `AccelerationCard.tsx`
Prescriptive thermostat card. Props: `severity: 'opportunity' | 'watch' | 'critical'`, `title: string`, `description: string`, `actionLabel: string`, `onAction: () => void`. Color-coded border: emerald for opportunity, amber for watch, rose for critical.

**IMPORTANT:** All components must be pure presentation. No Supabase queries inside components. Data comes via props.

**Test:** After creating all components, create a temporary test page at `web/src/app/test-ds/page.tsx` that renders every component with sample data. Verify it renders at localhost:3000/test-ds.

**Commit:** `OB-46A Phase 2: 11 shared visualization components — design system library`

---

## PHASE 3: PERSONA CONTEXT PROVIDER

Create `web/src/contexts/persona-context.tsx`:

### 3A: Persona Derivation Logic

The persona is derived from the user's profile, NOT selected manually (the demo persona switcher is separate):

```typescript
function derivePersona(profile: Profile): PersonaKey {
  // VL Platform Admin or tenant admin → 'admin'
  if (profile.role === 'vl_admin' || profile.role === 'admin') return 'admin';
  // Manager capability or manages relationships → 'manager'
  if (profile.capabilities?.includes('manage_team') ||
      profile.capabilities?.includes('approve_outcomes')) return 'manager';
  // Default → 'rep' (individual contributor)
  return 'rep';
}
```

### 3B: Context Shape

```typescript
interface PersonaContext {
  persona: PersonaKey;
  tokens: typeof PERSONA_TOKENS[PersonaKey];
  profile: Profile;
  tenant: Tenant;
  scope: {
    entityIds: string[];  // from profile_scope.full_visibility_entity_ids
    canSeeAll: boolean;   // admin flag
  };
}
```

### 3C: Scope Query

On mount, query `profile_scope` to get the user's visible entity IDs. This is what enforces data scoping — admin sees all, manager sees team, rep sees self.

```typescript
// Query profile_scope for current user
const { data: scopeData } = await supabase
  .from('profile_scope')
  .select('full_visibility_entity_ids')
  .eq('profile_id', profile.id)
  .single();
```

If no profile_scope row exists (common for admin), set `canSeeAll: true`.

### 3D: Demo Override

For demo purposes, expose a `setPersonaOverride(persona: PersonaKey)` that forces a specific persona. This is ONLY used by the demo persona switcher component (OB-46C). In production, persona is always derived from the real profile.

**Commit:** `OB-46A Phase 3: Persona context provider with scope derivation`

---

## PHASE 4: PERSONA-SCOPED DATA QUERY LAYER

Create `web/src/lib/data/persona-queries.ts`:

This is the single source of truth for ALL dashboard data queries. Every query is scoped by the persona context.

### 4A: Admin Queries

```typescript
export async function getAdminDashboardData(tenantId: string) {
  // Admin sees ALL entities for the tenant
  const { data: outcomes } = await supabase
    .from('entity_period_outcomes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period_key', currentPeriodKey);

  // Aggregate: total payout, entity count, distribution of attainment
  // Group by entity for store-level cards
  // Get lifecycle state from latest calculation_batch
  return {
    totalPayout: sum(outcomes.map(o => o.total_payout)),
    entityCount: outcomes.length,
    attainmentDistribution: outcomes.map(o => extractAttainment(o)),
    storeBreakdown: groupByStore(outcomes),
    lifecycleState: await getLifecycleState(tenantId, currentPeriodKey),
    exceptions: await getExceptions(tenantId),
    componentComposition: aggregateComponents(outcomes),
  };
}
```

### 4B: Manager Queries

```typescript
export async function getManagerDashboardData(tenantId: string, entityIds: string[]) {
  // Manager sees ONLY their scoped entities
  const { data: outcomes } = await supabase
    .from('entity_period_outcomes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period_key', currentPeriodKey)
    .in('entity_id', entityIds);

  // Get team member details with relationships
  const { data: entities } = await supabase
    .from('entities')
    .select('id, display_name, external_id, entity_type, attributes')
    .in('id', entityIds);

  // Get multi-period history for sparklines
  const { data: history } = await supabase
    .from('entity_period_outcomes')
    .select('entity_id, period_key, total_payout, rule_set_outcomes')
    .eq('tenant_id', tenantId)
    .in('entity_id', entityIds)
    .order('period_key', { ascending: true });

  return {
    teamTotal: sum(outcomes.map(o => o.total_payout)),
    teamMembers: enrichWithOutcomes(entities, outcomes, history),
    zoneAverage: average(outcomes.map(o => extractAttainment(o))),
    accelerationOpportunities: deriveAccelerationSignals(entities, outcomes, history),
  };
}
```

### 4C: Rep Queries

```typescript
export async function getRepDashboardData(tenantId: string, entityId: string) {
  // Rep sees ONLY their own data
  const { data: myOutcome } = await supabase
    .from('entity_period_outcomes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId)
    .eq('period_key', currentPeriodKey)
    .single();

  // Get detailed component breakdown from calculation_results
  const { data: myResult } = await supabase
    .from('calculation_results')
    .select('components, total_payout, period_label')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId)
    .order('period_label', { ascending: false });

  // Get relative position (rank among all entities for this period)
  const { data: allOutcomes } = await supabase
    .from('entity_period_outcomes')
    .select('entity_id, total_payout')
    .eq('tenant_id', tenantId)
    .eq('period_key', currentPeriodKey)
    .order('total_payout', { ascending: false });

  // Build relative leaderboard (neighbors only)
  const myRank = allOutcomes.findIndex(o => o.entity_id === entityId) + 1;
  const neighbors = buildRelativeNeighbors(allOutcomes, entityId, myRank);

  // Get tier thresholds from rule_set_assignments
  const { data: assignment } = await supabase
    .from('rule_set_assignments')
    .select('variant_key, entity_overrides, rule_set_id')
    .eq('entity_id', entityId)
    .single();

  return {
    totalPayout: myOutcome?.total_payout || 0,
    components: parseComponents(myResult?.[0]?.components),
    rank: myRank,
    totalEntities: allOutcomes.length,
    neighbors,
    history: myResult?.map(r => ({ period: r.period_label, payout: r.total_payout })),
    tierInfo: extractTierInfo(assignment),
    attainment: extractAttainment(myOutcome),
  };
}
```

### 4D: Helper Functions

Create the utility functions: `extractAttainment`, `groupByStore`, `aggregateComponents`, `buildRelativeNeighbors`, `deriveAccelerationSignals`, `extractTierInfo`, `parseComponents`.

For `deriveAccelerationSignals` — this is the thermostat:
- Check for entities with certification gaps (attributes JSONB has cert status)
- Check for entities trending down (3+ periods of declining attainment)
- Check for entities near tier threshold (within 5% of next tier)
- Each signal includes: entity name, opportunity description, estimated MX$ impact, recommended action

### 4E: Period Resolution

Create `getCurrentPeriodKey(tenantId: string)` that queries the `periods` table for the most recent period with status = 'open' or the latest period if all are closed.

**Commit:** `OB-46A Phase 4: Persona-scoped data query layer — admin, manager, rep`

---

## PHASE 5: LIFECYCLE STATE MACHINE SERVICE

Create `web/src/lib/lifecycle/lifecycle-service.ts`:

### 5A: State Definitions

```typescript
export const LIFECYCLE_STATES = [
  'draft',
  'preview',
  'reconcile',
  'official',
  'approved',
  'posted',
  'closed',
  'paid',
  'published',
] as const;

export type LifecycleState = typeof LIFECYCLE_STATES[number];

export const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  draft: ['preview'],
  preview: ['reconcile', 'draft'],        // can go back to draft
  reconcile: ['official', 'preview'],      // can go back to preview
  official: ['approved', 'reconcile'],     // can go back to reconcile
  approved: ['posted', 'official'],        // can go back to official
  posted: ['closed'],                      // no going back
  closed: ['paid'],
  paid: ['published'],
  published: [],                           // terminal
};
```

### 5B: State Transition Logic

```typescript
export async function transitionLifecycle(
  tenantId: string,
  periodKey: string,
  newState: LifecycleState
): Promise<{ success: boolean; error?: string }> {
  // Get current state from latest calculation_batch
  const current = await getCurrentLifecycleState(tenantId, periodKey);
  
  // Validate transition
  if (!VALID_TRANSITIONS[current]?.includes(newState)) {
    return { success: false, error: `Cannot transition from ${current} to ${newState}` };
  }
  
  // Update calculation_batch lifecycle_state
  const { error } = await supabase
    .from('calculation_batches')
    .update({ lifecycle_state: newState })
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId);
  
  // Log to audit
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'lifecycle_transition',
    details: { from: current, to: newState, period_key: periodKey },
  });

  return { success: true };
}
```

### 5C: State Display Helpers

```typescript
export function getNextAction(state: LifecycleState): { label: string; nextState: LifecycleState } | null {
  const actions: Partial<Record<LifecycleState, { label: string; nextState: LifecycleState }>> = {
    draft: { label: 'Ejecutar Vista Previa', nextState: 'preview' },
    preview: { label: 'Iniciar Reconciliacion', nextState: 'reconcile' },
    reconcile: { label: 'Marcar como Oficial', nextState: 'official' },
    official: { label: 'Aprobar Resultados', nextState: 'approved' },
    approved: { label: 'Publicar a Entidades', nextState: 'posted' },
    posted: { label: 'Cerrar Periodo', nextState: 'closed' },
    closed: { label: 'Confirmar Pago', nextState: 'paid' },
    paid: { label: 'Publicar Resultados', nextState: 'published' },
  };
  return actions[state] || null;
}

export function getCompletedSteps(state: LifecycleState): number {
  return LIFECYCLE_STATES.indexOf(state) + 1;
}
```

**Commit:** `OB-46A Phase 5: 9-state lifecycle service with transition validation and audit logging`

---

## PHASE 6: PERSONA-AWARE LAYOUT WRAPPER

Create `web/src/components/layout/PersonaLayout.tsx`:

### 6A: Layout Component

This wraps ALL page content. It applies:
- Background gradient from persona tokens (Wayfinder Layer 1)
- Transition animation when persona changes (200ms fade)
- Provides persona context to all children

```typescript
export function PersonaLayout({ children }: { children: React.ReactNode }) {
  const { persona, tokens } = usePersona();
  
  return (
    <div className={`min-h-screen bg-gradient-to-b ${tokens.bg} text-white transition-all duration-700`}>
      {children}
    </div>
  );
}
```

### 6B: Top Bar Component

Create `web/src/components/layout/TopBar.tsx` that shows:
- ViaLuce logo (gradient from persona accent)
- Tenant name
- Persona intent label (italic, subtle)
- User avatar + name + role

### 6C: Integration Point

Do NOT replace the existing layout yet — OB-46B will do that. Create these components as standalone, ready to be wired in.

**Commit:** `OB-46A Phase 6: PersonaLayout wrapper and TopBar with Wayfinder ambient system`

---

## PHASE 7: VERIFICATION

### 7A: Test Page

Verify the test page at `/test-ds` renders:
1. All 11 visualization components with sample data
2. Toggle between 3 persona contexts (admin/manager/rep)
3. Background gradient changes on persona switch
4. Lifecycle state display for all 9 states
5. BenchmarkBar with visible reference line

### 7B: Type Safety

```bash
npx tsc --noEmit 2>&1 | head -30
```

Zero type errors in new files.

### 7C: Build

```bash
rm -rf .next && npm run build
```

Must pass with zero errors.

---

## PROOF GATE

| # | Gate | Criteria | Evidence Required |
|---|------|----------|-------------------|
| PG-1 | Token file exists | `web/src/lib/design/tokens.ts` exports PERSONA_TOKENS, STATE_TOKENS, WORKSPACE_TOKENS | `cat` file, verify exports |
| PG-2 | 11 components exist | All files in `web/src/components/design-system/` | `ls -la` directory |
| PG-3 | Components are pure | No Supabase imports in any design-system component | `grep -rn "supabase" web/src/components/design-system/` returns 0 |
| PG-4 | Persona context exists | `web/src/contexts/persona-context.tsx` exports `usePersona` hook | `cat` file |
| PG-5 | Query layer exists | `web/src/lib/data/persona-queries.ts` exports admin/manager/rep functions | `grep "export.*function" web/src/lib/data/persona-queries.ts` |
| PG-6 | Queries are scoped | Manager queries use `.in('entity_id', entityIds)`, rep uses `.eq('entity_id', entityId)` | `grep "entity_id" web/src/lib/data/persona-queries.ts` |
| PG-7 | Lifecycle service | `web/src/lib/lifecycle/lifecycle-service.ts` with 9 states and transition validation | `cat` file |
| PG-8 | PersonaLayout exists | `web/src/components/layout/PersonaLayout.tsx` applies bg gradient from tokens | `cat` file |
| PG-9 | Test page renders | localhost:3000/test-ds shows all components | Manual verification or curl |
| PG-10 | Build passes | `npm run build` exits 0 | Paste build output |
| PG-11 | No type errors | `npx tsc --noEmit` exits 0 | Paste output |
| PG-12 | No hardcoded demo data | `grep -rn "Polanco\|Carlos Garcia\|Optica Luminar" web/src/components/design-system/` returns 0 | Paste grep output |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-46A_COMPLETION_REPORT.md` in PROJECT ROOT (same level as package.json)
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## CLT PHASE

After all phases pass, verify in browser:

1. Navigate to localhost:3000/test-ds
2. Confirm all 11 components render with sample data
3. Confirm persona toggle changes background gradient
4. Confirm no console errors
5. Screenshot or describe what renders

Add CLT results to completion report.

---

## FINAL STEP

```bash
gh pr create --base main --head dev --title "OB-46A: Design System Foundation" --body "Part A of 3-part UI rebuild. Creates shared design system components (11), persona context provider, persona-scoped data query layer, 9-state lifecycle service, and PersonaLayout wrapper. No user-visible changes — this is infrastructure for OB-46B (surfaces) and OB-46C (chrome)."
```

---

*ViaLuce.ai — The Way of Light*
*OB-46A: The foundation upon which the magnitude jump is built.*
*"You don't see the foundation. But everything you see stands on it."*
