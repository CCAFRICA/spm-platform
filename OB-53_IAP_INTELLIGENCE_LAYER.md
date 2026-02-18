# OB-53: IAP INTELLIGENCE LAYER — NAVIGATION · READABILITY · AI ASSESSMENTS

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS OB EXISTS

CLT-51A browser verification (Feb 17, 2026) confirmed that OB-51 successfully delivered the global dark theme, glass card treatment, and persona color undertones. However, it also revealed 47 findings across 5 categories: readability failures (fonts too small/dull), navigation bloat (12+ items for a rep who needs 3), dead-end pages, duplicate routes, missing visualization diversity on Observatory tabs, and zero thermostat behavior — no AI assessments, no acceleration measures, no forward-looking intelligence on any surface.

The platform's tagline is **"Intelligence. Acceleration. Performance."** Every measure on every surface must satisfy all three pillars. This OB implements the IAP Gate: measures that fail all three pillars are cut, measures that fail one are redesigned, and new ●●● measures are added.

**Source document:** CLT51A_FINDINGS_AND_MEASURE_INVENTORY.md (Parts 1-9). All findings, measure inventory, IAP scorecards, and page consolidation proposals are defined there. This prompt is the implementation spec.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.
6. Commit this prompt to git as first action.
7. Inline styles as primary visual strategy (Tailwind failed 4x — OB-51 lesson). For any visual property that must not be overridden, use `style={{ }}`.
8. VL Admin: all users select preferred language. No forced English override.
9. Rule 25: Completion report is FIRST deliverable, not last. Create before final build, append results.
10. DS-003 Cognitive Fit Test is a proof gate. No page uses same visual form for two different cognitive tasks.
11. **NEW — Principle 9: IAP Gate.** Every measure must deliver Intelligence (insight beyond raw data), Acceleration (compels action with next step), Performance (communicable in <5 seconds). Measures failing all three are cut.

## CC ANTI-PATTERNS — THE FAILURES CLT-51A FOUND

| Anti-Pattern | What CLT-51A Found | Prevention |
|---|---|---|
| **Skin-only pass** | OB-51 applied dark theme but didn't rebuild content. Observatory tabs identical to before. | Every phase has content proof gates, not just styling gates. |
| **CLT feedback ignored** | Prior CLT comments on Infrastructure and Billing tabs were not incorporated. | This prompt embeds the specific CLT findings with exact fixes required. |
| **Navigation bloat** | 12 nav items for rep who needs 3. Single-child accordions. Dead-end pages. | Phase 1 consolidates navigation BEFORE building content. |
| **Thermometer measures** | Most metrics are raw numbers with no reference frame, no action, no intelligence. | IAP scorecard in proof gates — each new measure scored ●/○ for I/A/P. |

---

## PHASE 0: DIAGNOSTIC — CURRENT NAVIGATION AND PAGE INVENTORY

Before changing anything, audit what exists.

```bash
echo "============================================"
echo "OB-53 PHASE 0: NAVIGATION + PAGE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: ALL PAGE ROUTES ==="
find web/src/app -name "page.tsx" | sort

echo ""
echo "=== 0B: SIDEBAR NAVIGATION COMPONENT ==="
find web/src -name "*sidebar*" -o -name "*nav*" -o -name "*rail*" | grep -E "\.tsx$" | sort
# Read the primary sidebar/navigation component
for f in $(find web/src/components -name "*sidebar*" -o -name "*nav*" | grep -E "\.tsx$" | head -5); do
  echo "--- FILE: $f ---"
  head -80 "$f"
done

echo ""
echo "=== 0C: PERSONA-SPECIFIC NAV ITEMS ==="
grep -rn "admin\|gerente\|vendedor\|manager\|rep\|seller" web/src/components/navigation/ --include="*.tsx" | head -30

echo ""
echo "=== 0D: ROUTE DEFINITIONS ==="
grep -rn "href\|pathname\|router.push\|Link " web/src/components/navigation/ --include="*.tsx" | head -40

echo ""
echo "=== 0E: CURRENT FONT SIZES IN SIDEBAR ==="
grep -rn "text-xs\|text-sm\|text-base\|text-lg\|font-size\|fontSize" web/src/components/navigation/ --include="*.tsx" --include="*.css" | head -20

echo ""
echo "=== 0F: OBSERVATORY TAB COMPONENTS ==="
find web/src -path "*observatory*" -name "*.tsx" | sort
for f in $(find web/src -path "*observatory*" -name "*.tsx" | head -10); do
  echo "--- $f: visual forms ---"
  grep -n "Chart\|Graph\|Sparkline\|Gauge\|Hero\|Bench\|Distribution\|Ring\|Goal\|Leaderboard\|Stack\|Pipeline\|Flow\|Radar" "$f" | head -10
done

echo ""
echo "=== 0G: AI ASSESSMENT — DOES ANYTHING EXIST? ==="
grep -rn "assessment\|aiSummary\|aiInsight\|anthropic.*summary\|generateAssessment" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== 0H: DASHBOARD PAGES PER PERSONA ==="
echo "Admin:"
find web/src/app -path "*admin*" -o -path "*gobernar*" -o -path "*govern*" | grep "page.tsx" | sort
echo "Manager:"
find web/src/app -path "*manager*" -o -path "*gerente*" -o -path "*acelerar*" | grep "page.tsx" | sort
echo "Rep:"
find web/src/app -path "*rep*" -o -path "*vendedor*" -o -path "*crecer*" -o -path "*compensation*" | grep "page.tsx" | sort

echo ""
echo "============================================"
echo "PASTE FULL OUTPUT INTO COMPLETION REPORT"
echo "============================================"
```

**Commit:** `OB-53 Phase 0: Navigation and page inventory diagnostic`

---

## PHASE 1: READABILITY — GLOBAL FONT AND CONTRAST FIX

This is the P0 finding from CLT-51A. Every page has the same problem: text too small, labels too dull.

### 1A: Sidebar readability

In the sidebar/navigation component(s):
- All workspace names: minimum `text-sm` (14px), color `slate-200` (not slate-400/500)
- Active workspace: `text-base` (16px), `font-semibold`, `text-white`
- Lifecycle states (Import, Calculate, Reconcile, etc.): minimum `text-sm`, color `slate-300`
- Section headers (WORKSPACES, PERFORM, etc.): `text-xs`, `uppercase`, `tracking-wider`, `slate-400`
- Use inline styles as insurance: `style={{ fontSize: '14px', color: '#e2e8f0' }}`

### 1B: Form labels and input text

In login page and any form-containing pages:
- Labels: `text-sm`, color `slate-200` (not slate-500)
- Input text: `text-base`, color `white`
- Placeholder text: `slate-400`
- Use inline styles on login form: `style={{ color: '#e2e8f0', fontSize: '14px' }}`

### 1C: Chart labels and axis text

Find all recharts/chart components:
```bash
grep -rn "fontSize\|tick\|label\|axis" web/src/components/ --include="*.tsx" | grep -i "chart\|recharts\|spark" | head -20
```
- Axis labels: minimum 12px, color `#94a3b8` (slate-400)
- Axis tick values: minimum 11px, color `#cbd5e1` (slate-300)
- Chart legends: minimum 12px, color `#e2e8f0` (slate-200)
- Tooltip text: 13px, color white on dark background

### 1D: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-1 | Sidebar text minimum 14px on all items | grep for text-xs in navigation — count must be 0 except section headers |
| PG-2 | Login form labels readable (slate-200 or brighter) | grep login page for slate-400/500/600 on labels — count must be 0 |
| PG-3 | No zinc-500 or darker used for readable body text anywhere | `grep -rn "text-zinc-500\|text-zinc-600\|text-slate-500\|text-slate-600" web/src/ --include="*.tsx" \| grep -v "label\|subtitle\|caption\|muted" \| wc -l` — only acceptable on intentionally muted captions |

**Commit:** `OB-53 Phase 1: Global readability fix — fonts, contrast, sidebar`

---

## PHASE 2: NAVIGATION CONSOLIDATION

### 2A: Remove duplicate routes

- **Overview** and **Performance Dashboard** render the same content. Remove Performance Dashboard route. Overview becomes the sole dashboard landing page per persona.
- Verify by reading both page components — if they import the same component or render identical JSX, delete one.

### 2B: Collapse single-child sections

In the sidebar navigation component, implement this rule:
```typescript
// If a section has exactly 1 child, navigate directly on section click
// If a section has 2+ children, expand to show children
const handleSectionClick = (section) => {
  if (section.children.length === 1) {
    router.push(section.children[0].href);
  } else {
    toggleExpand(section.id);
  }
};
```

### 2C: Remove dead-end pages from navigation

Any page route that renders ONLY:
- An empty state with no content
- A title with no data or functionality
- A "Coming Soon" placeholder

...must be REMOVED from the sidebar navigation. The route can remain (for future use) but it must not appear in the nav. Users should never click a nav item and see nothing.

```bash
# Find pages with suspiciously little content
for page in $(find web/src/app -path "*perform*" -name "page.tsx"); do
  LINES=$(wc -l < "$page")
  echo "$page: $LINES lines"
done
```

Pages with <50 lines of JSX are likely placeholders. Verify and remove from nav.

### 2D: Consolidate per persona

**Rep sidebar (target: 3 items):**
- **Home** (Crecer dashboard — the DS-001 cockpit)
- **My Pay** (merge: My Compensation + Statement + Transactions + Find Transaction)
- **Disputes** (rename from Inquiries)

Everything else (Rankings, Performance Trends, Analytics, Team Performance) is either:
- Merged into Home (leaderboard, trend metrics, sparklines)
- Eliminated (Team Performance for a rep without reports)

**Manager sidebar (target: 2-3 items):**
- **Home** (Acelerar dashboard)
- **My Team** (merge: Team Performance + Rankings)
- **My Pay** (manager's own compensation, if applicable)

**Admin sidebar (target: 3-4 items):**
- **Home** (Gobernar dashboard)
- **Operate** (lifecycle cockpit)
- **Configure** (plan management, entity management)
- Stubs for Investigate/Design/Govern — show only if they have content

### 2E: Fix workspace label

The dashboard is a **Perform** surface. When user is on their persona dashboard, sidebar should highlight "Perform", not "Operate". Operate is highlighted only when on lifecycle management pages.

### 2F: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-4 | Performance Dashboard route removed (no duplicate of Overview) | `find web/src/app -path "*performance-dashboard*" -name "page.tsx"` returns empty |
| PG-5 | Single-child sections navigate directly without expand | Code inspection of sidebar click handler |
| PG-6 | Zero dead-end pages in nav | Click every nav item as Rep — all land on pages with real content |
| PG-7 | Rep has ≤4 nav items | Count nav items visible when in Vendedor persona |
| PG-8 | Manager has ≤4 nav items | Count nav items visible when in Gerente persona |
| PG-9 | Dashboard highlights "Perform" in sidebar, not "Operate" | Visual check + code inspection |

**Commit:** `OB-53 Phase 2: Navigation consolidation — 12 items to 3-4 per persona`

---

## PHASE 3: AI ASSESSMENT PANEL — THE FLAGSHIP MEASURE

This is the single highest-leverage addition. One Anthropic API call per dashboard transforms every surface from thermometer to thermostat.

### 3A: Create the Assessment API route

Create `/web/src/app/api/ai/assessment/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { persona, data, locale } = await request.json();
    
    const systemPrompts: Record<string, string> = {
      admin: `You are a governance advisor for a compensation platform. Analyze the data and provide:
1. A 2-sentence summary of the current state
2. Any anomalies or patterns detected (e.g., identical deltas, missing data, outliers)
3. A specific recommended next action
Keep response under 100 words. Use ${locale === 'en' ? 'English' : 'the same language as the data labels'}.`,
      
      manager: `You are a coaching advisor for a sales manager. Analyze team performance data and provide:
1. A 1-sentence team summary
2. Top coaching opportunity (who needs attention and why)
3. A quick win (who is closest to a breakthrough)
4. A specific recommended action for this week
Keep response under 120 words. Use ${locale === 'en' ? 'English' : 'the same language as the data labels'}.`,
      
      rep: `You are a personal performance coach for a sales representative. Analyze their compensation data and provide:
1. A 1-sentence congratulatory or motivational opening based on their performance
2. Their strongest component and why
3. Their biggest growth opportunity with a specific dollar impact estimate
4. One specific action they can take today
Keep response under 100 words. Use ${locale === 'en' ? 'English' : 'the same language as the data labels'}.`,
    };

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompts[persona] || systemPrompts.admin,
      messages: [
        {
          role: 'user',
          content: `Analyze this dashboard data and provide your assessment:\n\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    });

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return NextResponse.json({ assessment: text });
  } catch (error) {
    console.error('Assessment API error:', error);
    return NextResponse.json(
      { assessment: null, error: 'Assessment generation failed' },
      { status: 500 }
    );
  }
}
```

### 3B: Create the AssessmentPanel component

Create `/web/src/components/design-system/AssessmentPanel.tsx`:

```typescript
'use client';
import { useState, useEffect } from 'react';
import { Lightbulb, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface AssessmentPanelProps {
  persona: 'admin' | 'manager' | 'rep';
  data: Record<string, any>;
  locale?: string;
  accentColor?: string; // persona accent hex
}

export function AssessmentPanel({ persona, data, locale = 'en', accentColor = '#6366f1' }: AssessmentPanelProps) {
  const [assessment, setAssessment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState(false);

  const fetchAssessment = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/ai/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, data, locale }),
      });
      const result = await res.json();
      if (result.assessment) {
        setAssessment(result.assessment);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      fetchAssessment();
    }
  }, [JSON.stringify(data)]);

  const titles: Record<string, string> = {
    admin: 'Governance Assessment',
    manager: 'Coaching Intelligence',
    rep: 'Personal Performance Insight',
  };

  return (
    <div
      style={{
        background: 'rgba(24,24,27,0.8)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${accentColor}33`,
        borderRadius: '12px',
        padding: expanded ? '20px' : '12px 20px',
        marginBottom: '16px',
        transition: 'all 0.2s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Lightbulb size={18} style={{ color: accentColor }} />
          <span style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 600 }}>
            {titles[persona] || 'AI Assessment'}
          </span>
          <span
            style={{
              background: `${accentColor}22`,
              color: accentColor,
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: 500,
            }}
          >
            AI
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); fetchAssessment(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <RefreshCw size={14} style={{ color: '#94a3b8' }} className={loading ? 'animate-spin' : ''} />
          </button>
          {expanded ? <ChevronUp size={16} style={{ color: '#94a3b8' }} /> : <ChevronDown size={16} style={{ color: '#94a3b8' }} />}
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: '12px' }}>
          {loading && (
            <p style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>
              Analyzing your dashboard data...
            </p>
          )}
          {error && (
            <p style={{ color: '#f87171', fontSize: '13px' }}>
              Assessment unavailable. Check API configuration.
            </p>
          )}
          {assessment && !loading && (
            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
              {assessment}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

### 3C: Integrate into all three persona dashboards

Add `<AssessmentPanel>` as the FIRST element below the page header on:
1. Admin dashboard (Gobernar) — pass all hero metrics + distribution + entity deltas
2. Manager dashboard (Acelerar) — pass zone total + team member attainments + acceleration flags
3. Rep dashboard (Crecer) — pass payout + attainment + component breakdown + tier position

The data payload for each persona should be the same data already fetched for the dashboard — no additional Supabase queries.

### 3D: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-10 | Assessment API route exists at `/api/ai/assessment` | `find web/src/app/api -path "*assessment*" -name "route.ts"` returns 1 result |
| PG-11 | AssessmentPanel component exists with persona prop | `grep -l "AssessmentPanel" web/src/components/design-system/` returns 1 file |
| PG-12 | Admin dashboard includes AssessmentPanel | `grep "AssessmentPanel" [admin dashboard page]` returns hit |
| PG-13 | Manager dashboard includes AssessmentPanel | `grep "AssessmentPanel" [manager dashboard page]` returns hit |
| PG-14 | Rep dashboard includes AssessmentPanel | `grep "AssessmentPanel" [rep dashboard page]` returns hit |
| PG-15 | API route handles missing ANTHROPIC_API_KEY gracefully (returns error, doesn't crash) | Code inspection: try/catch with error response |

**Commit:** `OB-53 Phase 3: AI Assessment Panel — Anthropic-powered intelligence on all persona dashboards`

---

## PHASE 4: ADMIN DASHBOARD — IAP MEASURE REBUILD

Enhance existing admin measures to pass IAP gate. Do NOT remove working visualizations — enhance them.

### 4A: Total Compensation hero — add context

The hero metric currently shows just a number (MX$20,662). Add:
- Budget context: "91% of budget" as subtitle (I)
- TrendArrow with delta vs prior period (I)
- "Advance to Official →" button when lifecycle is in Preview state (A)

### 4B: Distribution histogram — add click interaction

When admin clicks a histogram bucket, show a tooltip or popover listing the entities in that bucket. Add "Coach this group" action link if the bucket is <85% attainment.

### 4C: Lifecycle stepper — fix sizing and add action

The stepper was truncated (F-23). Fix:
- Ensure all phases are visible without overflow
- Add "Advance" button on the current active phase
- Reduce icon sizes if needed to fit all phases

### 4D: BenchmarkBars — add outlier flag

For any entity with a delta > 2 standard deviations from the mean, add a visual flag (warning icon). The -9.1% identical deltas should trigger an outlier detection — if all deltas are identical, flag as "Uniform delta — investigate data source."

### 4E: Period Readiness Checklist (new)

Add a new card below the existing layout:

```
PERIOD READINESS
[7/9 criteria met]
✅ Data imported (last: 2 days ago)
✅ Calculations run (batch: Feb-2026-001)
✅ All entities covered (12/12)
⬜ Manager review (0/2 zones reviewed)
⬜ Finance approval (pending)
...
[Advance to Official →]
```

Auto-score from Supabase data: data_imports existence, calculation_batches status, entity coverage, approval status.

### 4F: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-16 | Hero metric shows budget context and TrendArrow | Code inspection |
| PG-17 | Lifecycle stepper shows all phases without truncation | grep for overflow-hidden on stepper container — must not clip |
| PG-18 | Period Readiness card renders with at least 3 auto-scored criteria | Code inspection — readiness criteria are computed from data, not hardcoded |
| PG-19 | Admin dashboard passes Cognitive Fit: ≥7 distinct visual forms | Count: HeroMetric, Distribution, Stepper, BenchBar, ComponentStack, TrendArrow, AssessmentPanel, ReadinessChecklist = 8 ✓ |

**Commit:** `OB-53 Phase 4: Admin dashboard IAP measure rebuild`

---

## PHASE 5: MANAGER DASHBOARD — ACCELERATION MEASURES

### 5A: Tier Proximity Alert (new)

On the acceleration cards section, add a card type for "Near Threshold":
- Emerald card: Certification opportunity (existing)
- **Amber card: Tier proximity** — "Sofia is MX$200 from Premium tier. Focus: Clientes Nuevos this week."
- Rose card: Declining trend warning (existing)

Calculate tier proximity from `entity_period_outcomes`: for each team member, find their distance to the next tier threshold in their plan.

### 5B: Momentum Index

For each team member in the team list, add a momentum indicator:
- Calculate: weighted average of last 3 period deltas (most recent weighted 3x, middle 2x, oldest 1x)
- Display: colored arrow with magnitude (↑↑ strong improving, ↑ improving, → stable, ↓ declining, ↓↓ rapid decline)
- Color: emerald for positive, amber for flat, rose for negative

If <3 periods exist, show "—" instead.

### 5C: Pacing indicator

Add a pacing card to the hero row:
- "Team: On Pace" (green) or "Team: Behind Pace" (amber/red)
- Run rate: "Current: MX$X/day · Target: MX$Y/day"
- Projected finish: "At this pace, team finishes at 97% of target"

### 5D: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-20 | Tier Proximity Alert card renders for team members near threshold | Code inspection: query checks distance to next tier |
| PG-21 | Momentum indicator visible on team member rows | Code inspection: weighted calculation with 3-period lookback |
| PG-22 | Manager dashboard passes Cognitive Fit: ≥6 distinct visual forms | Count forms |
| PG-23 | Every new measure passes IAP: ●●● for I/A/P | Self-assessment in completion report |

**Commit:** `OB-53 Phase 5: Manager dashboard acceleration measures`

---

## PHASE 6: REP DASHBOARD — MASTERY MEASURES

### 6A: Verify data wiring first

The rep dashboard showed "No Outcome Results Yet" in CLT-51A (F-30). Before adding measures, verify:
- Is there a user-to-entity mapping in Supabase?
- When viewing as Vendedor via persona switcher, does the system know which entity to show?
- If VL Platform Admin doesn't map to an entity, handle gracefully: show a demo entity's data with a banner "Viewing as: [entity name]"

### 6B: Scenario Cards (new)

Below the GoalGradient bar, add three scenario cards:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  CURRENT PACE │  │    STRETCH    │  │   MAXIMUM     │
│   MX$3,200    │  │   MX$3,680    │  │   MX$4,100    │
│               │  │ +2 optical    │  │ +5 optical    │
│  95% attain.  │  │ 108% attain.  │  │ 122% attain.  │
│               │  │               │  │ Premium tier! │
└──────────────┘  └──────────────┘  └──────────────┘
```

Calculate from current attainment + plan rates. The middle card shows the most likely stretch. The right card shows maximum achievable this period.

### 6C: Pace Clock (new)

A circular progress indicator showing:
- Outer ring: days elapsed / days in period
- Inner number: attainment %
- Below: "MX$450/day needed to hit target"

This creates temporal urgency — the rep sees time passing and knows their run rate.

### 6D: Component Opportunity Map (new)

A horizontal bar chart showing each component with:
- Filled portion: current attainment
- Unfilled portion (lighter shade): "headroom" to 100%
- Dollar label on headroom: "each unit = ~MX$150"

Sort by headroom descending — biggest opportunity at top.

### 6E: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-24 | Rep dashboard renders data (not "No Outcome" empty state) for at least one entity | Navigate to Vendedor persona for Óptica Luminar — data visible |
| PG-25 | Scenario Cards render with 3 projections from real calculation data | Code inspection: projections computed from entity_period_outcomes + rule_sets |
| PG-26 | Pace Clock shows days remaining and run rate | Visual verification |
| PG-27 | Component Opportunity Map renders with headroom bars | Visual verification |
| PG-28 | Rep dashboard passes Cognitive Fit: ≥7 distinct visual forms | Count forms |
| PG-29 | Rep dashboard has ≤6 primary elements above the fold (density rule) | Visual inspection |

**Commit:** `OB-53 Phase 6: Rep dashboard mastery measures`

---

## PHASE 7: OBSERVATORY — CUT, REBUILD, WIRE

### 7A: Cut failing measures

- **Recent Activity log** → REMOVE entirely. Replace with empty section that Phase 7B fills.
- **Infrastructure static labels** ("3 tenants", "Deployed", "Pipeline ready") → Replace with dynamic metrics.
- **Cost Projection static table** ($25/$20/$10 = $55) → Replace with dynamic from `usage_metering` if OB-52 created it, else show "Metering not configured" with setup link.

### 7B: Billing & Usage — Replace Recent Activity

In place of the Recent Activity chronological log, add:
- **Tenant Growth Sparkline** — entities created per week (last 8 weeks)
- **Revenue Trend** — if usage_metering has data, show MRR trend. If not, show "Enable billing metering to track revenue."

### 7C: Infrastructure — Dynamic health metrics

Replace the three static cards with:
- **Supabase:** HeroMetric showing active connections or row count + Sparkline (if available from usage_metering)
- **Vercel:** HeroMetric showing deployment status + last deploy timestamp
- **Anthropic:** HeroMetric showing API calls this period + error rate

If real metrics aren't available (no usage_metering table), show the metric label with "Configure metering →" action link instead of hardcoded values.

### 7D: Ingestion — Wire to real data

The Ingestion tab shows all zeros (F-16). Wire it to Supabase:
```typescript
// Query committed_data count
const { count: committedCount } = await supabase
  .from('committed_data')
  .select('*', { count: 'exact', head: true });

// Query data_imports for import history
const { data: imports } = await supabase
  .from('data_imports')
  .select('status, created_at')
  .order('created_at', { ascending: false })
  .limit(50);

const committed = imports?.filter(i => i.status === 'committed').length || 0;
const quarantined = imports?.filter(i => i.status === 'quarantined').length || 0;
const rejected = imports?.filter(i => i.status === 'rejected').length || 0;
```

### 7E: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-30 | Recent Activity log removed from Billing tab | `grep -rn "Recent Activity\|recentActivity" web/src/ --include="*.tsx"` returns 0 hits |
| PG-31 | Infrastructure cards show dynamic data or "Configure metering →" link | No hardcoded dollar amounts ($25/$20/$10) in infrastructure tab |
| PG-32 | Ingestion tab shows non-zero values for tenants with imported data | Query verification |
| PG-33 | Each Observatory tab has ≥3 distinct visual forms | Count per tab |

**Commit:** `OB-53 Phase 7: Observatory cut, rebuild, wire — IAP compliant`

---

## PHASE 8: LANGUAGE ENFORCEMENT + VERIFICATION + PR

### 8A: Language enforcement for Admin

When persona is `admin` or `vl_admin`, ALL UI labels must render in English regardless of tenant locale. This is Standing Rule 3.

```bash
# Find where locale/language is applied to labels
grep -rn "locale\|i18n\|t(\|useTranslation\|intl" web/src/ --include="*.tsx" | grep -v node_modules | head -20
```

If labels are hardcoded in Spanish (Gobernar, Distribución, Ubicaciones), replace them with a locale-aware function that checks persona before applying translation. For admin → always English.

### 8B: Final verification

```bash
cd web
echo "=== TypeScript check ==="
npx tsc --noEmit 2>&1 | tail -10
echo "=== Build ==="
npm run build 2>&1 | tail -10
echo "=== Cognitive Fit Audit ==="
echo "Admin dashboard visual forms:"
grep -n "HeroMetric\|Distribution\|Stepper\|BenchBar\|ComponentStack\|TrendArrow\|Assessment\|Readiness\|Gauge\|Sparkline" [admin page path] | wc -l
echo "Manager dashboard visual forms:"
grep -n "HeroMetric\|AccelerationCard\|BenchBar\|Sparkline\|Streak\|Momentum\|Pacing\|Assessment" [manager page path] | wc -l
echo "Rep dashboard visual forms:"
grep -n "HeroMetric\|Ring\|GoalGradient\|ComponentStack\|Leaderboard\|Scenario\|PaceClock\|Opportunity\|Assessment" [rep page path] | wc -l
echo "=== Nav item count per persona ==="
grep -c "href\|pathname" [nav component for rep persona]
```

### 8C: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-34 | Admin sees English labels when in admin persona | Grep for "Gobernar" in rendered admin content — must be "Govern" |
| PG-35 | TypeScript: zero errors | `npx tsc --noEmit` exits 0 |
| PG-36 | Build: clean | `npm run build` exits 0 |
| PG-37 | localhost:3000 responds 200 | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` |

### 8D: Completion report

Create `OB-53_COMPLETION_REPORT.md` at PROJECT ROOT:

```markdown
# OB-53 COMPLETION REPORT
## IAP Intelligence Layer
## Date: [date]

## COMMITS
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
[All 37 gates listed with pasted evidence]

## IAP SCORECARD — NEW MEASURES
| Measure | Persona | I | A | P | Notes |
[Every new measure added in this OB scored against IAP]

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS/FAIL
- Rule 7 (inline styles for visual): PASS/FAIL
- Rule 9 (Principle 9 IAP Gate): PASS/FAIL
- Rule 25 (report before final build): PASS/FAIL

## NAVIGATION BEFORE/AFTER
| Persona | Nav Items Before | Nav Items After |

## KNOWN ISSUES

## VERIFICATION OUTPUT
```

### 8E: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-53: IAP Intelligence Layer — Navigation, Readability, AI Assessments" \
  --body "## CLT-51A Findings Addressed

### Phase 1: Readability
- Global font size increase, contrast fix
- Sidebar text brightened and enlarged

### Phase 2: Navigation Consolidation
- Rep: 12 items → 3-4
- Manager: 6 items → 2-3
- Duplicate routes eliminated, dead ends removed

### Phase 3: AI Assessment Panel
- Anthropic-powered intelligence brief on every persona dashboard
- Persona-aware prompts (governance/coaching/personal)
- Collapsible, refreshable, error-handled

### Phase 4: Admin IAP Measures
- Budget context on hero metric
- Period Readiness Checklist (auto-scored)
- Outlier detection on BenchmarkBars

### Phase 5: Manager Acceleration
- Tier Proximity Alerts
- Momentum Index per team member
- Team Pacing Indicator

### Phase 6: Rep Mastery
- Scenario Cards (3 futures)
- Pace Clock (temporal urgency)
- Component Opportunity Map (headroom)

### Phase 7: Observatory Rebuild
- Recent Activity CUT
- Infrastructure dynamic metrics
- Ingestion wired to Supabase

### Phase 8: Language + Verification
- Admin sees English (Standing Rule 3)

## Proof Gates: 37 — see OB-53_COMPLETION_REPORT.md
## New Standing Principle: Principle 9 — IAP Gate"
```

**Commit:** `OB-53 Phase 8: Language enforcement, verification, completion report, PR`

---

## PROOF GATE SUMMARY (37 gates)

| # | Gate | Phase |
|---|------|-------|
| PG-1 | Sidebar text ≥14px | 1 |
| PG-2 | Login labels slate-200+ | 1 |
| PG-3 | No zinc-500 on body text | 1 |
| PG-4 | Performance Dashboard route removed | 2 |
| PG-5 | Single-child sections direct-navigate | 2 |
| PG-6 | Zero dead-end pages in nav | 2 |
| PG-7 | Rep ≤4 nav items | 2 |
| PG-8 | Manager ≤4 nav items | 2 |
| PG-9 | Dashboard highlights Perform, not Operate | 2 |
| PG-10 | Assessment API route exists | 3 |
| PG-11 | AssessmentPanel component exists | 3 |
| PG-12 | Admin includes AssessmentPanel | 3 |
| PG-13 | Manager includes AssessmentPanel | 3 |
| PG-14 | Rep includes AssessmentPanel | 3 |
| PG-15 | API handles missing key gracefully | 3 |
| PG-16 | Admin hero shows budget context + trend | 4 |
| PG-17 | Lifecycle stepper not truncated | 4 |
| PG-18 | Period Readiness renders with auto-scored criteria | 4 |
| PG-19 | Admin ≥7 distinct visual forms | 4 |
| PG-20 | Tier Proximity Alert renders | 5 |
| PG-21 | Momentum Index on team rows | 5 |
| PG-22 | Manager ≥6 distinct visual forms | 5 |
| PG-23 | New measures pass IAP ●●● | 5 |
| PG-24 | Rep renders data (not empty state) | 6 |
| PG-25 | Scenario Cards with real projections | 6 |
| PG-26 | Pace Clock shows days + run rate | 6 |
| PG-27 | Component Opportunity Map with headroom | 6 |
| PG-28 | Rep ≥7 distinct visual forms | 6 |
| PG-29 | Rep ≤6 elements above fold | 6 |
| PG-30 | Recent Activity removed | 7 |
| PG-31 | Infrastructure dynamic (no hardcoded $) | 7 |
| PG-32 | Ingestion non-zero for active tenants | 7 |
| PG-33 | Observatory ≥3 forms per tab | 7 |
| PG-34 | Admin sees English labels | 8 |
| PG-35 | TypeScript zero errors | 8 |
| PG-36 | Build clean | 8 |
| PG-37 | localhost:3000 responds 200 | 8 |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-53_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

*OB-53 — February 17, 2026*
*"Intelligence. Acceleration. Performance." is not a tagline. It is a design specification.*
*"Every measure earns its place by satisfying all three pillars. Measures that fail are cut."*
