// TEMP — OB-211 recovery scaffolding. Delete after the architect's walk-through.
// A platform-admin-only walkable index of the SUBSTANTIVE + PARTIAL orphaned pages
// (from docs/audits/OB-211_RECOVERY_VALUE_MAP_20260615.md), grouped by priority lane
// and tagged with substance class / MIR mapping / lineage cluster, so the architect can
// open each page in the platform and decide KEEP / ABSORB / DISCARD.
//
// SR-34: this is ADDITIVE and REVERSIBLE — it does NOT touch the four-agent nav
// (workspace-config.ts) or ChromeSidebar. Reverse with: rm web/src/app/recovery/page.tsx
//
// The EMPTY/stub pages are intentionally NOT listed here — they are the DISCARD list in
// the value-map doc (architect confirms, then they're removed). Empties are never walked.

import { redirect } from 'next/navigation';
import { getServerAuthState } from '@/lib/auth/server-auth';
import { resolveRole } from '@/lib/auth/permissions';

// Auth-gated, per-request (reads the session cookie via getServerAuthState) — never prerendered.
export const dynamic = 'force-dynamic';

type Lane = 'MIR-CRITICAL' | 'MIR-SUPPORTING' | 'VISION';
type Cls = 'SUBSTANTIVE' | 'PARTIAL';

interface Entry {
  path: string;
  name: string;
  cls: Cls;
  mir: string;       // capability + state, or '—'
  cluster: string;   // lineage cluster label (content-derived; architect confirms)
  metrics: string;   // L/J/H/D/S
}

const WALK: Record<Lane, Entry[]> = {
  'MIR-CRITICAL': [
    { path: '/performance/adjustments', name: 'Adjustments (credits / corrections)', cls: 'SUBSTANTIVE', mir: 'Disputes / Adjustments 🔴', cluster: 'C3 Adjustments (canonical)', metrics: '476/20/13/23/4' },
    { path: '/approvals', name: 'Approval Center (all requests)', cls: 'SUBSTANTIVE', mir: 'Approvals 🟠', cluster: 'C2 Approvals — likely canonical hub', metrics: '378/30/5/13/3' },
    { path: '/performance/approvals', name: 'Approvals — Pending', cls: 'SUBSTANTIVE', mir: 'Approvals 🟠', cluster: 'C2 Approvals — variant', metrics: '338/23/4/12/0' },
    { path: '/performance/approvals/plans', name: 'Plan Approvals', cls: 'SUBSTANTIVE', mir: 'Approvals 🟠', cluster: 'C2 Approvals — variant', metrics: '424/23/4/12/0' },
    { path: '/govern/calculation-approvals', name: 'Calculation Approval Center (AI risk)', cls: 'SUBSTANTIVE', mir: 'Approvals 🟠', cluster: 'C2 Approvals — variant', metrics: '297/21/6/9/1' },
    { path: '/perform/statements', name: 'Commission Statement (entity-scoped)', cls: 'SUBSTANTIVE', mir: 'Statements 🟠', cluster: 'C4 Statements — most mature', metrics: '655/10/7/28/1' },
    { path: '/my-compensation', name: 'My Compensation (rep dashboard)', cls: 'SUBSTANTIVE', mir: 'Statements 🟠', cluster: 'C4 Statements — variant', metrics: '522/33/4/16/0' },
    { path: '/admin/audit', name: 'Audit — Total Entries', cls: 'SUBSTANTIVE', mir: 'Audit 🟠', cluster: 'C5 Audit — canonical candidate', metrics: '575/41/8/9/3' },
    { path: '/operations/audits', name: 'Audit log (ops)', cls: 'PARTIAL', mir: 'Audit 🟠', cluster: 'C5 Audit — older/stubby', metrics: '563/36/5/7/12' },
    { path: '/operations/audits/logins', name: 'Login audit', cls: 'PARTIAL', mir: 'Audit 🟠', cluster: 'C5 Audit — older/stubby', metrics: '303/27/4/6/11' },
  ],
  'MIR-SUPPORTING': [
    { path: '/perform', name: 'Module-aware persona dashboard (OB-105)', cls: 'SUBSTANTIVE', mir: 'Company view 🟡', cluster: 'C1 Dashboards — KEEP candidate', metrics: '515/13/6/15/0' },
    { path: '/insights', name: 'Insights overview', cls: 'SUBSTANTIVE', mir: 'Results 🟡', cluster: 'C1 Insights BI (1/7)', metrics: '374/23/1/9/0' },
    { path: '/insights/analytics', name: 'Advanced Analytics Dashboard', cls: 'SUBSTANTIVE', mir: 'Results 🟡', cluster: 'C1 Insights BI (2/7)', metrics: '526/32/13/8/0' },
    { path: '/insights/performance', name: 'Team Performance Score', cls: 'SUBSTANTIVE', mir: 'Results 🟡', cluster: 'C1 Insights BI (3/7)', metrics: '730/35/1/6/1' },
    { path: '/insights/compensation', name: 'Compensation — Current Period', cls: 'SUBSTANTIVE', mir: 'Results 🟡', cluster: 'C1 Insights BI (4/7)', metrics: '581/36/1/7/2' },
    { path: '/insights/trends', name: 'Trends', cls: 'SUBSTANTIVE', mir: 'Results 🟡', cluster: 'C1 Insights BI (5/7)', metrics: '587/35/2/3/1' },
    { path: '/insights/my-team', name: 'Team performance overview', cls: 'SUBSTANTIVE', mir: 'Results 🟡', cluster: 'C1 Insights BI (6/7)', metrics: '398/16/1/6/2' },
    { path: '/insights/sales-finance', name: 'Sales-Finance Overview', cls: 'SUBSTANTIVE', mir: 'Results 🟡', cluster: 'C1 Insights BI (7/7)', metrics: '330/16/0/9/1' },
    { path: '/data/reports', name: 'Reports — Total Revenue', cls: 'SUBSTANTIVE', mir: 'Results 🟡', cluster: 'C1/C8 Reporting', metrics: '224/21/4/4/0' },
    { path: '/data/quality', name: 'Data Quality', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C8 Quality/readiness (5 variants)', metrics: '404/24/5/14/0' },
    { path: '/operations/data-readiness', name: 'Data Readiness', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C8 Quality/readiness', metrics: '539/41/11/3/4' },
    { path: '/operate/monitor/quality', name: 'Monitor — Data Quality', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C8 Quality/readiness', metrics: '174/13/2/2/0' },
    { path: '/data/transactions', name: 'All Transactions', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C8 Data console', metrics: '199/14/9/8/4' },
    { path: '/operate/import/quarantine', name: 'Quarantine Resolution', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C11 Import quality', metrics: '314/13/9/10/0' },
    { path: '/data', name: 'Data console — Records Today', cls: 'PARTIAL', mir: '—', cluster: 'C8 Data console (no data-hooks)', metrics: '367/22/0/0/1' },
    { path: '/data/operations', name: 'Data operations', cls: 'PARTIAL', mir: '—', cluster: 'C8 Data console', metrics: '247/23/2/1/1' },
    { path: '/data/readiness', name: 'Readiness (thin)', cls: 'PARTIAL', mir: '—', cluster: 'C8 Quality/readiness', metrics: '44/5/1/4/0' },
    { path: '/operate/monitor/readiness', name: 'Monitor — Readiness', cls: 'PARTIAL', mir: '—', cluster: 'C8 Quality/readiness', metrics: '170/11/0/1/0' },
    { path: '/operate/monitor/operations', name: 'Monitor — Operations', cls: 'PARTIAL', mir: '—', cluster: 'C8 Data console', metrics: '87/7/0/1/0' },
    { path: '/data/import/enhanced', name: 'Data Package Import (OLD, large)', cls: 'PARTIAL', mir: '—', cluster: 'C8 superseded by /operate/import', metrics: '4306/44/25/68/5' },
  ],
  'VISION': [
    { path: '/acceleration', name: 'Accelerator — Participants (SPIFF)', cls: 'SUBSTANTIVE', mir: '— (no MIR map)', cluster: 'C14 Standalone', metrics: '635/26/3/2/1' },
    { path: '/notifications', name: 'Notifications center (global)', cls: 'SUBSTANTIVE', mir: '— (global chrome candidate)', cluster: 'C14 Standalone', metrics: '514/25/12/16/2' },
    { path: '/spm/alerts', name: 'Alerts', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C14 Standalone', metrics: '398/25/10/5/3' },
    { path: '/integrations/catalog', name: 'Integrations Catalog', cls: 'PARTIAL', mir: '—', cluster: 'C14 Standalone', metrics: '509/38/18/7/12' },
    { path: '/admin/access-control', name: 'Access Control (RBAC editor)', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C6 RBAC (3 expressions)', metrics: '397/35/11/15/0' },
    { path: '/workforce/permissions', name: 'Permissions (RBAC matrix)', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C6 RBAC', metrics: '492/35/10/14/3' },
    { path: '/workforce/roles', name: 'Roles', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C6 People/RBAC', metrics: '491/31/15/16/1' },
    { path: '/workforce/personnel', name: 'Personnel', cls: 'PARTIAL', mir: '—', cluster: 'C6 People (high stub)', metrics: '853/44/21/15/17' },
    { path: '/workforce/teams', name: 'Teams', cls: 'PARTIAL', mir: '—', cluster: 'C6 People (high stub)', metrics: '584/48/16/6/14' },
    { path: '/configuration', name: 'Config landing (View Only Mode)', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C7 Config landing (2 landings)', metrics: '276/29/1/3/4' },
    { path: '/configuration/terminology', name: 'Terminology customization', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C7 unique capability', metrics: '381/27/12/11/2' },
    { path: '/configuration/locations', name: 'Locations (config)', cls: 'PARTIAL', mir: '—', cluster: 'C6/C7 (high stub)', metrics: '407/36/12/7/15' },
    { path: '/configure/users/invite', name: 'User Invite + entity promotion', cls: 'SUBSTANTIVE', mir: '— (Platform Core)', cluster: 'C6 broken drill from /configure/users', metrics: '305/31/8/15/3' },
    { path: '/admin/launch/calculate', name: 'Period Close / Calculation (OLD)', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C9 superseded by /operate/calculate', metrics: '1124/51/18/40/2' },
    { path: '/admin/launch/calculate/diagnostics', name: 'Calculation Diagnostics (prereq checker)', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C9 recover as diagnostics tool?', metrics: '409/19/2/17/1' },
    { path: '/operate/pay', name: 'Payroll Overview', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C10 Payroll', metrics: '342/20/4/14/0' },
    { path: '/operations/rollback', name: 'Rollback Management (checkpoints/resets)', cls: 'SUBSTANTIVE', mir: '—', cluster: 'C13 Ops tooling', metrics: '587/38/16/18/4' },
    { path: '/operations/messaging', name: 'Messaging', cls: 'PARTIAL', mir: '—', cluster: 'C13 Ops (high stub)', metrics: '405/29/6/6/16' },
    { path: '/admin/tenants/new', name: 'New Tenant (onboarding)', cls: 'PARTIAL', mir: '—', cluster: 'C15 Platform provisioning', metrics: '831/23/17/9/6' },
    { path: '/financial/patterns', name: 'Operational Patterns (POS heatmap)', cls: 'SUBSTANTIVE', mir: '— (Finance, feature-gated)', cluster: 'C12 Finance extras', metrics: '378/22/3/14/1' },
    { path: '/financial/products', name: 'Product Mix Dashboard', cls: 'SUBSTANTIVE', mir: '— (Finance)', cluster: 'C12 Finance extras', metrics: '368/30/1/9/0' },
    { path: '/financial/summary', name: 'Operating Summary (P&L)', cls: 'SUBSTANTIVE', mir: '— (Finance)', cluster: 'C12 Finance extras', metrics: '340/23/1/9/0' },
    { path: '/configure', name: 'Configure landing', cls: 'PARTIAL', mir: '—', cluster: 'C7 Config landing', metrics: '169/7/1/2/0' },
    { path: '/configure/locations', name: 'Locations (configure)', cls: 'PARTIAL', mir: '—', cluster: 'C7 Config', metrics: '71/5/2/1/0' },
    { path: '/configure/teams', name: 'Teams (configure)', cls: 'PARTIAL', mir: '—', cluster: 'C7 Config', metrics: '67/4/2/1/0' },
  ],
};

const LANE_ORDER: Lane[] = ['MIR-CRITICAL', 'MIR-SUPPORTING', 'VISION'];
const LANE_BLURB: Record<Lane, string> = {
  'MIR-CRITICAL': 'Serves a 🔴/🟠 MIR demo capability (Disputes/Adjustments, Approvals, Statements, Audit). Walk these first.',
  'MIR-SUPPORTING': 'Serves a 🟡 MIR capability (Results dashboard, Company view, data quality/readiness).',
  'VISION': 'Substantive design work with no MIR map — recoverable capital (Insights BI, RBAC, accelerator, payroll, rollback, finance extras).',
};

export default async function RecoveryPage() {
  const { profile, isAuthenticated } = await getServerAuthState();
  const isPlatform = resolveRole(profile?.role ?? '') === 'platform' || (profile?.capabilities ?? []).includes('manage_tenants');
  if (!isAuthenticated || !isPlatform) redirect('/unauthorized');

  const total = LANE_ORDER.reduce((n, l) => n + WALK[l].length, 0);

  return (
    <div className="mx-auto max-w-5xl p-6 text-slate-800">
      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>TEMPORARY — OB-211 recovery scaffolding.</strong> Platform-admin-only evaluation surface, NOT the customer nav.
        It lists {total} substantive/partial orphaned pages for you to walk and decide KEEP / ABSORB / DISCARD. Empty stubs are
        excluded (see the DISCARD list in <code>docs/audits/OB-211_RECOVERY_VALUE_MAP_20260615.md</code>). Remove with{' '}
        <code>rm web/src/app/recovery/page.tsx</code>.
      </div>
      <h1 className="mb-1 text-2xl font-semibold">Recovery — orphaned pages, by priority lane</h1>
      <p className="mb-6 text-sm text-slate-500">
        Each card: inferred name · substance class · MIR mapping · lineage cluster (content-derived, confirm by viewing) ·
        metrics L/J/H/D/S (lines/components/handlers/data-hooks/stub-markers). Links open in a new tab.
      </p>

      {LANE_ORDER.map((lane) => (
        <section key={lane} className="mb-8">
          <h2 className="text-lg font-semibold">{lane} <span className="text-slate-400">({WALK[lane].length})</span></h2>
          <p className="mb-3 text-xs text-slate-500">{LANE_BLURB[lane]}</p>
          <div className="grid gap-2">
            {WALK[lane].map((e) => (
              <div key={e.path} className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{e.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${e.cls === 'SUBSTANTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'}`}>{e.cls}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-xs text-slate-500">{e.path}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    <span className="mr-3">MIR: {e.mir}</span>
                    <span className="mr-3">{e.cluster}</span>
                    <span className="text-slate-400">L/J/H/D/S {e.metrics}</span>
                  </div>
                </div>
                <a href={e.path} target="_blank" rel="noopener noreferrer" className="ml-4 shrink-0 rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100">open ↗</a>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
