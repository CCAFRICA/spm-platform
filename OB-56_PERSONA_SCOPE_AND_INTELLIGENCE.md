# OB-56: PERSONA SCOPE CHAIN, PIPELINE FIX, AND INTELLIGENCE SURFACES

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS OB EXISTS

CLT-55 (Feb 18, 2026) verified OB-55's deployed code. Findings:

1. **Plan Import button says "Coming Soon"** — no functional path to create a plan via UI
2. **571 network requests per page** (worse than the 387 before OB-55). N+1 query elimination FAILED.
3. **Persona switcher changes a label but nothing else** — sidebar, dashboard, and data queries are identical for Admin, Gerente, and Vendedor
4. **Navigation shows all 6 workspaces for every persona** — no scope filtering
5. **Zero intelligence surfaces render** — no Assessment Panels, no Scenario Cards, no Coaching Agendas, no Pace Clock

This OB fixes the pipeline, builds the scope chain, and delivers persona-specific intelligence surfaces.

**Seven missions in dependency order:**

| # | Mission | Depends On | Phases |
|---|---------|-----------|--------|
| 1 | N+1 Query Destruction | Nothing | 0 |
| 2 | Plan Import — Functional | Mission 1 | 1 |
| 3 | Persona Scope Chain | Mission 1 | 2-3 |
| 4 | Navigation Scoping | Mission 3 | 4 |
| 5 | Admin Dashboard + Intelligence | Missions 1, 3 | 5 |
| 6 | Manager Dashboard + Intelligence | Missions 1, 3 | 6 |
| 7 | Rep Dashboard + Intelligence | Missions 1, 3 | 7 |

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.
6. Commit this prompt to git as first action.
7. Inline styles as primary visual strategy for any property that must not be overridden.
8. VL Admin: all users select preferred language. No forced English override.
9. Completion report is FIRST deliverable, not last. Create before final build, append results.
10. Domain-agnostic always. Labels from entity data, not hardcoded ICM vocabulary.

---

## THE PROOF GATE RULE — READ THIS BEFORE WRITING ANY CODE

**OB-53 reported 37/37 PASS. Zero changes rendered in browser.**
**OB-55 reported 58/58 PASS. Plan Import says "Coming Soon." 571 requests per page.**

The pattern: CC verifies code exists, not that it works. This OB uses a different proof structure.

### EVERY proof gate in this OB must include ONE of:

1. **`curl` output** — `curl -s localhost:3000/[route] | grep "[expected text]"` — proves the page renders the text
2. **Supabase query result** — `npx tsx -e "..."` that queries Supabase and prints the actual data — proves data exists
3. **`grep` count = 0** — for REMOVAL proofs only (e.g., confirming no more inline supabase.from calls)
4. **Request count** — `echo "Navigate to [route], open Network tab, count requests"` — CC must LOG the simulated count from code analysis showing max possible requests

### THESE ARE NOT VALID PROOF:
- "Code path confirmed" ❌
- "Component file exists" ❌
- "Function is called in the handler" ❌
- "VALID_TRANSITIONS includes X" ❌
- "Materialization triggers on Y" ❌

If you cannot produce pasted terminal output as evidence, the gate is FAIL.

---

## SUPABASE SCHEMA REFERENCE

```
tenants             (id, name, slug, settings JSONB, locale, currency_code, modules_enabled TEXT[])
profiles            (id, tenant_id, display_name, role, entity_id UUID, capabilities TEXT[], language)
entities            (id, tenant_id, external_id, entity_type, display_name, attributes JSONB, status)
entity_relationships (id, tenant_id, source_entity_id, target_entity_id, relationship_type, confidence, source)
rule_sets           (id, tenant_id, name, domain, components JSONB, status, input_bindings JSONB)
rule_set_assignments (id, tenant_id, entity_id, rule_set_id, variant_key, entity_overrides JSONB)
periods             (id, tenant_id, period_key, period_type, label, start_date, end_date, status)
import_batches      (id, tenant_id, file_name, status, classification JSONB)
committed_data      (id, tenant_id, import_batch_id, entity_id, entity_type, period_key, metrics JSONB)
calculation_batches (id, tenant_id, rule_set_id, period_id, lifecycle_state, entity_count, total_payout)
calculation_results (id, tenant_id, calculation_batch_id, entity_id, period_label, components JSONB, total_payout)
entity_period_outcomes (tenant_id, period_key, entity_id, entity_type, rule_set_outcomes JSONB, total_payout)
usage_metering      (id, tenant_id, event_type, quantity, metadata JSONB)
audit_logs          (id, tenant_id, action, entity_type, entity_id, user_id, metadata JSONB)
```

---

## CC ANTI-PATTERNS — EVERY ONE OF THESE HAS HAPPENED

| Anti-Pattern | What Happened | Prevention |
|---|---|---|
| **Component graveyard** | OB-53: 37 components created, zero wired to page.tsx routes | Every new component MUST be rendered by a page.tsx. Proof = curl output showing rendered content. |
| **"Coming Soon" buttons** | OB-55: Plan Import "Create Plan (Coming Soon)" — placeholder that blocks the pipeline | ZERO "Coming Soon", "En Desarrollo", or placeholder text. If a button exists, it must DO something. If the feature isn't ready, remove the button. |
| **N+1 survival** | OB-55 claimed N+1 fixed (PG-1 PASS). Production: 571 requests. | Every page.tsx must load ALL data through ONE function. grep for `useEffect.*supabase\|\.from(` in components — count must be 0. |
| **Self-verified proof gates** | OB-53: "component file exists" = PASS. OB-55: "code path confirmed" = PASS. | Proof gates require pasted terminal output. See THE PROOF GATE RULE above. |
| **Persona-blind UI** | Switching Admin→Gerente→Vendedor changes nothing. Same sidebar, same data, same dashboard. | Persona context must be read by: sidebar (workspace filter), page loader (entity scope filter), dashboard (widget selection). |
| **Hardcoded domain terms** | "Compensation Plan", "Sales Rep", "Commission" appear in UI | ALL domain terms come from tenant.settings or rule_set metadata. The engine doesn't know it's ICM. |
| **localStorage in queries** | Previous OBs read tenant/period/entity from localStorage | ZERO localStorage reads in any query or data loader. Everything from Supabase via authenticated context. |

---

# ═══════════════════════════════════════════════════
# PHASE 0: N+1 QUERY DESTRUCTION
# ═══════════════════════════════════════════════════

OB-55 created `page-loaders.ts` but components still fire their own queries. This phase REMOVES the component-level queries.

### 0A: Find every component-level Supabase call

```bash
echo "=== COMPONENT-LEVEL SUPABASE CALLS ==="
echo "These must ALL be removed. Components receive data as props."
echo ""

# Find useEffect + supabase patterns in components (NOT in page-loaders.ts or data-service.ts)
grep -rn "useEffect" web/src/components/ --include="*.tsx" -l | while read f; do
  if grep -q "supabase\|\.from(" "$f"; then
    echo "VIOLATION: $f"
    grep -n "supabase\|\.from(" "$f" | head -5
    echo ""
  fi
done

echo "=== CONTEXT PROVIDERS THAT FETCH ==="
grep -rn "useEffect" web/src/contexts/ --include="*.tsx" -l | while read f; do
  if grep -q "supabase\|\.from(" "$f"; then
    echo "VIOLATION: $f"
    grep -n "supabase\|\.from(" "$f" | head -5
    echo ""
  fi
done

echo "=== PAGE.TSX FILES WITH INLINE QUERIES ==="
find web/src/app -name "page.tsx" | while read f; do
  count=$(grep -c "\.from(" "$f" 2>/dev/null || echo 0)
  if [ "$count" -gt 0 ]; then
    echo "INLINE QUERIES ($count): $f"
  fi
done
```

### 0B: Refactor pattern

For EVERY component that has its own `useEffect` + Supabase call:
1. Remove the useEffect and the Supabase import
2. Change the component to accept the data as a prop
3. In the parent page.tsx, pass data from the page loader

For EVERY context provider that fetches on mount:
1. If the data is tenant-specific (entities, periods, etc.) — move the fetch into the page loader
2. If the data is session-specific (auth user, profile) — this is OK, leave it

For EVERY page.tsx with inline `.from()` calls:
1. Move all queries into `page-loaders.ts` as a named function
2. page.tsx calls the loader function ONCE and passes data to children

### 0C: Verify elimination

```bash
echo "=== POST-FIX VERIFICATION ==="

echo "Component-level supabase calls (must be 0):"
grep -rn "supabase.*from\|\.from(" web/src/components/ --include="*.tsx" | grep -v "// " | grep -v "import" | wc -l

echo ""
echo "page.tsx inline queries (must be 0):"
find web/src/app -name "page.tsx" -exec grep -l "\.from(" {} \; | wc -l

echo ""
echo "page-loaders.ts function count:"
grep -c "export.*function\|export.*async" web/src/lib/data/page-loaders.ts
```

### 0D: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | Zero component-level Supabase calls | `grep -rn "\.from(" web/src/components/ --include="*.tsx" \| grep -v "// " \| grep -v "import" \| wc -l` | Output: 0 |
| PG-2 | Zero inline page.tsx queries | `find web/src/app -name "page.tsx" -exec grep -l "\.from(" {} \; \| wc -l` | Output: 0 |
| PG-3 | Page loader functions exist for every workspace | `grep "export.*function.*load" web/src/lib/data/page-loaders.ts` | ≥5 functions listed |

**Commit:** `OB-56 Phase 0: N+1 query destruction — all Supabase calls moved to page loaders`

---

# ═══════════════════════════════════════════════════
# PHASE 1: PLAN IMPORT — FUNCTIONAL
# ═══════════════════════════════════════════════════

The "Create Plan" button on `/design/plans` says "Coming Soon." Make it work.

### 1A: Audit current state

```bash
echo "=== PLAN IMPORT PAGE ==="
cat web/src/app/*/plans/page.tsx 2>/dev/null | head -60
cat web/src/app/design/plans/page.tsx 2>/dev/null | head -60
find web/src/app -path "*plan*" -name "page.tsx" | sort

echo ""
echo "=== PLAN IMPORT SERVICE ==="
find web/src/lib -name "*plan*" -o -name "*interpret*" | sort
grep -rn "handleImport\|saveRuleSet\|interpretPlan\|parsePlan" web/src/lib/ --include="*.ts" | head -20

echo ""
echo "=== API ROUTES FOR AI INTERPRETATION ==="
find web/src/app/api -path "*plan*" -o -path "*interpret*" -o -path "*rule*" | sort
```

### 1B: Build the Create Plan flow

The "Create Plan" button must:

1. Open a file picker (accept .pptx, .pdf, .xlsx)
2. Upload the file to the server (API route)
3. API route sends document content to Anthropic API for interpretation
4. AI extracts: components, calculation types, tier tables, variant routing, gates
5. Return structured rule set to client
6. Client shows preview: "We found 6 components: [list]. Confirm?"
7. On confirm: write to `rule_sets` table with status='active'
8. Write `plan_import` metering event to `usage_metering`
9. Navigate to plan detail view showing the active rule set

### 1C: Handle missing Anthropic API key gracefully

```typescript
// In the API route:
if (!process.env.ANTHROPIC_API_KEY) {
  return Response.json({ 
    error: 'AI plan interpretation requires an API key. Contact your platform administrator.',
    code: 'MISSING_API_KEY'
  }, { status: 503 });
}
```

The UI must show this error clearly — not a silent failure, not a console-only log.

### 1D: Remove ALL "Coming Soon" text

```bash
echo "=== COMING SOON AUDIT ==="
grep -rn "Coming Soon\|coming.soon\|En Desarrollo\|en desarrollo\|Próximamente" web/src/ --include="*.tsx" --include="*.ts"
```

For every result: either implement the feature or remove the button/element entirely.

### 1E: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-4 | Zero "Coming Soon" text in codebase | `grep -rni "coming soon\|en desarrollo\|próximamente" web/src/ --include="*.tsx" \| wc -l` | Output: 0 |
| PG-5 | Create Plan button exists and is NOT disabled | `curl -s localhost:3000/design/plans \| grep -i "create plan"` | No "disabled" or "Coming Soon" in output |
| PG-6 | Plan import API route exists | `find web/src/app/api -path "*plan*" -name "route.ts" \| wc -l` | Output: ≥1 |
| PG-7 | API route checks for Anthropic key | `grep "ANTHROPIC_API_KEY" web/src/app/api/*plan*/route.ts` | Match found |
| PG-8 | rule_sets insert on confirm | `grep "rule_sets.*insert\|\.from.*rule_sets.*\.insert" web/src/lib/ --include="*.ts" -r` | Match found |

**Commit:** `OB-56 Phase 1: Functional plan import — upload, AI interpret, confirm, save to Supabase`

---

# ═══════════════════════════════════════════════════
# PHASE 2: PERSONA SCOPE CHAIN — DERIVATION
# ═══════════════════════════════════════════════════

This is the architectural prerequisite for everything else. Without this, personas are decorative.

### 2A: PersonaContext provider

Create or fix `web/src/contexts/persona-context.tsx`:

```typescript
type PersonaKey = 'admin' | 'manager' | 'rep';

interface PersonaScope {
  persona: PersonaKey;
  profile: { id: string; display_name: string; role: string; entity_id: string | null; capabilities: string[] };
  entityIds: string[];      // entities this user can see
  canSeeAll: boolean;       // admin flag — no entity filtering
  tenantId: string;
  currentPeriodKey: string | null;
}

function derivePersona(profile: Profile): PersonaKey {
  if (profile.role === 'vl_admin' || profile.role === 'admin' || 
      profile.capabilities?.includes('full_admin')) return 'admin';
  if (profile.capabilities?.includes('manage_team') || 
      profile.capabilities?.includes('approve_outcomes') ||
      profile.role === 'manager') return 'manager';
  return 'rep';
}
```

### 2B: Scope resolution

On context mount, resolve what entities this user can see:

```typescript
async function resolveScope(profile: Profile, tenantId: string): Promise<string[]> {
  const persona = derivePersona(profile);
  
  if (persona === 'admin') return []; // empty = canSeeAll
  
  if (persona === 'manager' && profile.entity_id) {
    // Manager sees entities that report to their entity
    const { data } = await supabase
      .from('entity_relationships')
      .select('source_entity_id')
      .eq('target_entity_id', profile.entity_id)
      .eq('tenant_id', tenantId)
      .in('relationship_type', ['reports_to', 'member_of']);
    return [profile.entity_id, ...(data?.map(r => r.source_entity_id) || [])];
  }
  
  if (persona === 'rep' && profile.entity_id) {
    return [profile.entity_id]; // rep sees only self
  }
  
  return []; // no entity_id = can't scope, show nothing
}
```

### 2C: Demo persona override

The persona switcher bar (Vista | Admin | Gerente | Vendedor) must call `setPersonaOverride(persona)` which:
1. Switches the active auth user (re-login as admin@/gerente@/vendedor@ for the current tenant)
2. Re-derives the persona from the new profile
3. Re-resolves scope
4. Forces re-render of sidebar + dashboard

This is NOT just setting a state variable. It must change the authenticated user so all Supabase queries respect RLS.

### 2D: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-9 | PersonaContext exists and exports usePersona hook | `grep "export.*usePersona\|export.*PersonaProvider" web/src/contexts/persona-context.tsx` | Both found |
| PG-10 | derivePersona returns different values for different roles | `grep "admin.*manager.*rep" web/src/contexts/persona-context.tsx` | All 3 persona types in derivation logic |
| PG-11 | Scope resolution queries entity_relationships | `grep "entity_relationships" web/src/contexts/persona-context.tsx` | Match found |

**Commit:** `OB-56 Phase 2: Persona scope chain — context, derivation, scope resolution`

---

# ═══════════════════════════════════════════════════
# PHASE 3: PERSONA SCOPE — DATA LAYER
# ═══════════════════════════════════════════════════

### 3A: Scoped page loaders

Update `page-loaders.ts` — EVERY query that returns entity data must accept and apply the persona scope:

```typescript
export async function loadDashboardData(tenantId: string, scope: PersonaScope) {
  const supabase = createClient();
  
  // Base queries — always needed
  const periodQuery = supabase.from('periods').select('*')
    .eq('tenant_id', tenantId).eq('status', 'open')
    .order('start_date', { ascending: false }).limit(1).single();
  
  let entitiesQuery = supabase.from('entities').select('*').eq('tenant_id', tenantId);
  let outcomesQuery = supabase.from('entity_period_outcomes').select('*').eq('tenant_id', tenantId);
  
  // SCOPE FILTER — this is what makes personas real
  if (!scope.canSeeAll && scope.entityIds.length > 0) {
    entitiesQuery = entitiesQuery.in('id', scope.entityIds);
    outcomesQuery = outcomesQuery.in('entity_id', scope.entityIds);
  }
  
  const [period, entities, outcomes] = await Promise.all([
    periodQuery, entitiesQuery, outcomesQuery
  ]);
  
  return { period: period.data, entities: entities.data || [], outcomes: outcomes.data || [] };
}
```

### 3B: Every page.tsx reads from PersonaContext

```typescript
// Pattern for every page.tsx:
export default function DashboardPage() {
  const { persona, scope, tenantId } = usePersona();
  const [data, setData] = useState(null);
  
  useEffect(() => {
    loadDashboardData(tenantId, scope).then(setData);
  }, [tenantId, scope]);
  
  if (!data) return <Loading />;
  
  // Render persona-specific dashboard
  if (persona === 'admin') return <AdminDashboard data={data} />;
  if (persona === 'manager') return <ManagerDashboard data={data} />;
  return <RepDashboard data={data} />;
}
```

### 3C: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-12 | Page loaders accept PersonaScope parameter | `grep "PersonaScope\|scope:" web/src/lib/data/page-loaders.ts \| wc -l` | ≥3 |
| PG-13 | Entity queries apply scope filter | `grep "\.in.*entityIds\|\.in.*scope" web/src/lib/data/page-loaders.ts` | Match found |
| PG-14 | Dashboard page.tsx reads from usePersona | `grep "usePersona" web/src/app/*/page.tsx web/src/app/page.tsx` | Match found in main dashboard route |

**Commit:** `OB-56 Phase 3: Persona-scoped data layer — all queries filtered by scope`

---

# ═══════════════════════════════════════════════════
# PHASE 4: NAVIGATION SCOPING
# ═══════════════════════════════════════════════════

### 4A: Workspace visibility matrix

| Workspace | Admin | Manager | Rep |
|-----------|:-----:|:-------:|:---:|
| Operate | ✅ | ❌ | ❌ |
| Perform | ✅ | ✅ | ✅ |
| Investigate | ✅ | ✅ | ❌ |
| Design | ✅ | ❌ | ❌ |
| Configure | ✅ | ❌ | ❌ |
| Govern | ✅ | ✅ | ❌ |

### 4B: Apply filtering

Find the sidebar/workspace-switcher component. Add persona filtering:

```typescript
const { persona } = usePersona();

const WORKSPACE_VISIBILITY: Record<PersonaKey, string[]> = {
  admin: ['operate', 'perform', 'investigate', 'design', 'configure', 'govern'],
  manager: ['perform', 'investigate', 'govern'],
  rep: ['perform'],
};

const visibleWorkspaces = allWorkspaces.filter(w => 
  WORKSPACE_VISIBILITY[persona].includes(w.key)
);
```

### 4C: Default landing page per persona

| Persona | Default Route | Why |
|---------|--------------|-----|
| Admin | /operate | Operations hub — import, calculate, lifecycle |
| Manager | /perform | Team performance view |
| Rep | /perform | Personal performance view |

### 4D: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-15 | WORKSPACE_VISIBILITY defined with 3 persona keys | `grep "admin.*manager.*rep\|WORKSPACE_VISIBILITY" web/src/components/navigation/ -r` | All 3 keys found |
| PG-16 | Sidebar reads from usePersona | `grep "usePersona" web/src/components/navigation/ -r` | Match found |
| PG-17 | Rep sees only 1 workspace | Code analysis: `WORKSPACE_VISIBILITY.rep` has exactly 1 entry | verified |

**Commit:** `OB-56 Phase 4: Navigation scoped by persona — admin 6, manager 3, rep 1`

---

# ═══════════════════════════════════════════════════
# PHASE 5: ADMIN DASHBOARD + INTELLIGENCE
# ═══════════════════════════════════════════════════

The admin dashboard is the default landing page for tenant administrators. It must show real data from Supabase, scoped to the full tenant (admin sees everything).

### 5A: Admin Dashboard Layout

Build `web/src/components/dashboards/AdminDashboard.tsx`:

**Hero Row (3 cards):**
- **Total Payout:** Sum of total_payout from entity_period_outcomes for current period. Formatted in tenant currency.
- **Entity Count:** Count of entities with calculation results. "X of Y entities calculated."
- **Lifecycle State:** Current calculation_batch lifecycle_state with subway dots.

**Period Readiness Checklist:**
Auto-scored from data state. Each criterion is a simple Supabase query result:
- ✅/❌ Active rule set exists → `rule_sets` where status='active' count > 0
- ✅/❌ Data imported for current period → `committed_data` where period_key = current
- ✅/❌ All entities assigned → count(rule_set_assignments) >= count(entities where type='individual')
- ✅/❌ Calculation run → `calculation_batches` for current period exists
- Each criterion links to the page where the action happens (e.g., "Import data →" links to /data/import)

**Entity Performance Table:**
- Columns: Entity Name | Payout | Components Breakdown
- Sorted by total_payout descending
- Data from entity_period_outcomes joined with entities
- Max 20 rows with "Show all →" link

**All data comes from the page loader. Zero Supabase calls in this component.**

### 5B: Outlier Detection (computed client-side)

From the outcomes data already loaded:
```typescript
const payouts = outcomes.map(o => o.total_payout);
const mean = payouts.reduce((a, b) => a + b, 0) / payouts.length;
const stdDev = Math.sqrt(payouts.reduce((a, b) => a + (b - mean) ** 2, 0) / payouts.length);
const outliers = outcomes.filter(o => Math.abs(o.total_payout - mean) > 2 * stdDev);
```

Show outliers as highlighted rows in the entity table with a badge: "2.1σ above mean" or "1.8σ below mean."

### 5C: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-18 | AdminDashboard component exists and is imported by a page.tsx | `grep "AdminDashboard" web/src/app/*/page.tsx` | Match found |
| PG-19 | Period Readiness renders criteria | `grep "readiness\|checklist\|rule.set.*exist\|data.*import" web/src/components/dashboards/AdminDashboard.tsx` | Readiness logic present |
| PG-20 | Outlier calculation present | `grep "stdDev\|outlier\|sigma\|deviation" web/src/components/dashboards/AdminDashboard.tsx` | Statistical calculation found |
| PG-21 | Component accepts data as props (no Supabase calls) | `grep "supabase\|\.from(" web/src/components/dashboards/AdminDashboard.tsx \| wc -l` | Output: 0 |

**Commit:** `OB-56 Phase 5: Admin dashboard with readiness checklist and outlier detection`

---

# ═══════════════════════════════════════════════════
# PHASE 6: MANAGER DASHBOARD + INTELLIGENCE
# ═══════════════════════════════════════════════════

The manager dashboard shows their team's performance with coaching intelligence.

### 6A: Manager Dashboard Layout

Build `web/src/components/dashboards/ManagerDashboard.tsx`:

**Team Overview Row:**
- **Team Size:** Count of entities in scope
- **Team Total Payout:** Sum across scoped entities
- **Team vs Target:** If rule_set has budget/target, show aggregate attainment

**Tier Proximity Table:**
For each team member, calculate distance to next tier:
```typescript
// From rule_set.components[n].tiers, find current tier and next tier
// gap = next_tier_threshold - current_attainment
// dollar_impact = next_tier_rate - current_tier_rate (applied to base)
```

Columns: Entity Name | Current Attainment | Current Tier | Gap to Next | Potential Gain
Sorted by smallest gap first (closest to breakout).

**Momentum Index:**
If multiple periods of outcomes exist for the entity:
```typescript
const periods = outcomesGroupedByPeriod; // most recent 3
const trend = periods[2].total - periods[0].total; // positive = improving
const direction = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
```

Show as: Entity Name | Current | Trend (↑/→/↓) | 3-Period Spark
Flag declining entities in amber/red.

**Coaching Agenda (derived from data, no AI call required):**
```
Priority 1: [Declining entity] — [component] down [X]% over 3 periods
Priority 2: [Near-tier entity] — [Y]% from Tier [N], potential +MX$[Z]
Priority 3: [Top performer] — recognition opportunity, [N]-period streak
```

This is computed from the tier proximity and momentum data. No Anthropic API call needed for the basic version.

### 6B: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-22 | ManagerDashboard exists and is imported by dashboard page | `grep "ManagerDashboard" web/src/app/*/page.tsx` | Match found |
| PG-23 | Tier proximity calculation present | `grep "tier.*proximity\|gap.*tier\|next.*tier\|threshold" web/src/components/dashboards/ManagerDashboard.tsx` | Logic found |
| PG-24 | Momentum/trend calculation present | `grep "momentum\|trend\|direction\|declining\|improving" web/src/components/dashboards/ManagerDashboard.tsx` | Logic found |
| PG-25 | Coaching agenda renders | `grep "coaching\|agenda\|priority\|Priority" web/src/components/dashboards/ManagerDashboard.tsx` | Content found |
| PG-26 | Component accepts data as props (no Supabase calls) | `grep "supabase\|\.from(" web/src/components/dashboards/ManagerDashboard.tsx \| wc -l` | Output: 0 |

**Commit:** `OB-56 Phase 6: Manager dashboard with tier proximity, momentum, and coaching agenda`

---

# ═══════════════════════════════════════════════════
# PHASE 7: REP DASHBOARD + INTELLIGENCE
# ═══════════════════════════════════════════════════

The rep dashboard shows ONLY their own performance with forward-looking intelligence.

### 7A: Rep Dashboard Layout

Build `web/src/components/dashboards/RepDashboard.tsx`:

**My Payout Card:**
- Total payout for current period
- Breakdown by component (from calculation_results.components JSONB)
- Each component: name, attainment %, payout amount

**Scenario Cards (2-3 max):**
Computed from current attainment + tier boundaries:
```typescript
components.forEach(comp => {
  const currentTier = findCurrentTier(comp.attainment, comp.tiers);
  const nextTier = comp.tiers[currentTier.index + 1];
  if (nextTier) {
    scenarios.push({
      component: comp.name,
      gap: nextTier.threshold - comp.attainment,
      potentialGain: nextTier.rate - currentTier.rate,
      message: `${gap}% more in ${comp.name} → +${formatCurrency(potentialGain)}`
    });
  }
});
// Sort by potential gain descending, take top 3
```

**Pace Clock:**
```typescript
const periodStart = new Date(period.start_date);
const periodEnd = new Date(period.end_date);
const now = new Date();
const daysElapsed = Math.floor((now - periodStart) / 86400000);
const daysRemaining = Math.floor((periodEnd - now) / 86400000);
const runRate = totalAttainment / daysElapsed;
const projected = totalAttainment + (runRate * daysRemaining);
```

Display: "Day X of Y | Projected: Z% | Need W% per day to reach target"

**Component Opportunity Map:**
For each component, show: current attainment, headroom to next tier, dollar value of crossing. Sorted by opportunity value (highest potential gain first). Simple horizontal bars.

### 7B: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-27 | RepDashboard exists and is imported by dashboard page | `grep "RepDashboard" web/src/app/*/page.tsx` | Match found |
| PG-28 | Scenario card calculation present | `grep "scenario\|gap.*tier\|potentialGain\|potential.*gain" web/src/components/dashboards/RepDashboard.tsx` | Logic found |
| PG-29 | Pace clock calculation present | `grep "pace\|daysRemaining\|daysElapsed\|runRate\|projected" web/src/components/dashboards/RepDashboard.tsx` | Logic found |
| PG-30 | Opportunity map renders per-component | `grep "opportunity\|headroom\|component.*map" web/src/components/dashboards/RepDashboard.tsx` | Content found |
| PG-31 | Component accepts data as props (no Supabase calls) | `grep "supabase\|\.from(" web/src/components/dashboards/RepDashboard.tsx \| wc -l` | Output: 0 |

**Commit:** `OB-56 Phase 7: Rep dashboard with scenario cards, pace clock, and opportunity map`

---

# ═══════════════════════════════════════════════════
# PHASE 8: VERIFICATION AND COMPLETION
# ═══════════════════════════════════════════════════

### 8A: Build verification

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
# Confirm localhost:3000 responds
curl -s localhost:3000 | head -5
```

### 8B: Cross-cutting verification

```bash
echo "=== FINAL VERIFICATION ==="

echo "1. Component-level Supabase calls (must be 0):"
grep -rn "\.from(" web/src/components/ --include="*.tsx" | grep -v "// " | grep -v "import" | wc -l

echo ""
echo "2. Coming Soon text (must be 0):"
grep -rni "coming soon\|en desarrollo\|próximamente" web/src/ --include="*.tsx" | wc -l

echo ""
echo "3. Dashboard components imported by page routes:"
grep -rn "AdminDashboard\|ManagerDashboard\|RepDashboard" web/src/app/ --include="*.tsx" | head -10

echo ""
echo "4. PersonaContext used by navigation:"
grep -rn "usePersona" web/src/components/navigation/ --include="*.tsx" | head -5

echo ""
echo "5. Workspace visibility filtering:"
grep -rn "WORKSPACE_VISIBILITY\|persona.*workspace\|workspace.*persona" web/src/ --include="*.tsx" --include="*.ts" | head -5

echo ""
echo "6. Seeded tenant safety — no cross-tenant writes:"
grep -rn "a1b2c3d4\|b2c3d4e5" web/src/ --include="*.ts" --include="*.tsx" | wc -l
echo "(must be 0 — no hardcoded tenant IDs)"
```

### 8C: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-32 | TypeScript: zero errors | `npx tsc --noEmit` exit code | 0 |
| PG-33 | Build: clean | `npm run build` exit code | 0 |
| PG-34 | localhost responds | `curl -s localhost:3000 \| head -1` | HTML content |
| PG-35 | Zero hardcoded tenant IDs | `grep -rn "a1b2c3d4\|b2c3d4e5" web/src/ \| wc -l` | Output: 0 |

### 8D: Completion report

Create `OB-56_COMPLETION_REPORT.md` at PROJECT ROOT.

```markdown
# OB-56 COMPLETION REPORT
## Persona Scope Chain, Pipeline Fix, and Intelligence Surfaces

| Mission | Phases | Status |
|---------|--------|--------|
| N+1 Query Destruction | 0 | |
| Plan Import — Functional | 1 | |
| Persona Scope Chain | 2-3 | |
| Navigation Scoping | 4 | |
| Admin Dashboard + Intelligence | 5 | |
| Manager Dashboard + Intelligence | 6 | |
| Rep Dashboard + Intelligence | 7 | |

## PROOF GATES (35 gates)
[PASTE EVERY GATE with terminal output as evidence]

## COMMITS
[All phase hashes]

## STANDING RULE COMPLIANCE
[Rules 1-10]

## KNOWN ISSUES
[Any deferred items]
```

### 8E: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-56: Persona Scope Chain + Intelligence Surfaces" \
  --body "## What This OB Delivers

### Mission 1: N+1 Query Destruction
- ALL component-level Supabase calls removed
- ALL queries flow through page-loaders.ts
- Target: ≤20 requests per page (was 571)

### Mission 2: Plan Import — Functional
- Create Plan button works (no more Coming Soon)
- Upload → AI interpret → confirm → save to rule_sets
- Zero placeholder text anywhere in the codebase

### Mission 3-4: Persona Scope Chain + Navigation
- PersonaContext with derivation + scope resolution
- Sidebar filtered: admin 6 workspaces, manager 3, rep 1
- Data queries scoped by persona (admin=all, manager=team, rep=self)
- Demo persona switcher triggers real scope change

### Mission 5: Admin Dashboard
- Period Readiness Checklist (auto-scored, actionable links)
- Outlier Detection (statistical, highlighted in entity table)
- Entity Performance Table with component breakdown

### Mission 6: Manager Dashboard
- Tier Proximity Table (gap to next tier, dollar impact)
- Momentum Index (3-period trend, declining flags)
- Coaching Agenda (derived from data, prioritized)

### Mission 7: Rep Dashboard
- Scenario Cards (what-if projections with currency impact)
- Pace Clock (days remaining, run rate, daily target)
- Component Opportunity Map (highest marginal return first)

## Proof Gates: 35 — see OB-56_COMPLETION_REPORT.md"
```

**Commit:** `OB-56 Phase 8: Verification, completion report, PR`

---

## PROOF GATE SUMMARY (35 gates)

| Range | Mission | Phase | Count |
|-------|---------|-------|-------|
| PG 1-3 | N+1 Destruction | 0 | 3 |
| PG 4-8 | Plan Import | 1 | 5 |
| PG 9-11 | Persona Context | 2 | 3 |
| PG 12-14 | Scoped Data Layer | 3 | 3 |
| PG 15-17 | Navigation Scoping | 4 | 3 |
| PG 18-21 | Admin Dashboard | 5 | 4 |
| PG 22-26 | Manager Dashboard | 6 | 5 |
| PG 27-31 | Rep Dashboard | 7 | 5 |
| PG 32-35 | Build + Verification | 8 | 4 |

---

## WHAT IS EXPLICITLY OUT OF SCOPE

| Item | Why | When |
|------|-----|------|
| Tenant creation wizard | Commercial platform — separate mission | OB-57 |
| Module activation / billing surfaces | Commercial platform — separate mission | OB-57 |
| Observatory visual fix (text contrast) | Cosmetic — separate from pipeline/intelligence | OB-57 |
| Canvas (React Flow) | Independent visual feature | OB-58 |
| Language enforcement | Requires i18n architecture pass | OB-58 |
| AI Assessment Panel (Anthropic API per page load) | Requires API cost management | OB-58 |
| Daily Focus Cards | Requires transaction-level data | Future |
| Weekly Coaching Agenda (AI-generated) | Basic data-derived version in this OB, AI version later | OB-58 |
| Streaming data ingestion | No use case today | Backlog |
| Projection engine | Arithmetic already in Scenario Cards and Pace Clock | Potentially included |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-56_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED terminal output
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is INCOMPLETE.

---

*OB-56 — February 18, 2026*
*"A persona that doesn't change the data, the navigation, and the intelligence is just a label."*
*"The thermostat doesn't just read the temperature differently for different people. It shows different controls."*
