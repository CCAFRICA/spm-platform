/**
 * Page Status Configuration
 *
 * Based on OB-66 navigation audit. Every sidebar item gets a status:
 * - active: Real data queries, renders meaningful content
 * - preview: Renders with seed/demo data, not yet connected to real pipeline
 * - coming: Exists as stub, functionality planned
 * - restricted: User's role can't access (derived at render time, not configured here)
 */

export type PageStatus = 'active' | 'preview' | 'coming' | 'restricted';

export const PAGE_STATUS: Record<string, PageStatus> = {
  // ACTIVE — real data queries, functional
  '/':                             'active',
  '/data/import/enhanced':         'active',
  '/data/import':                  'active',
  '/operate/import':               'active',
  '/admin/launch/calculate':       'active',
  '/admin/launch/plan-import':     'active',
  '/admin/launch/reconciliation':  'active',
  '/admin/launch':                 'active',
  '/signup':                       'active',
  '/login':                        'active',
  '/operate/import/history':       'active',
  '/configure/users':              'active',
  '/configure/people':             'active',
  '/transactions/disputes':        'active',
  '/insights/disputes':            'active',

  // PREVIEW — renders with seed data
  '/my-compensation':              'preview',
  '/insights':                     'preview',
  '/insights/analytics':           'preview',
  '/insights/performance':         'preview',
  '/insights/my-team':             'preview',
  '/insights/compensation':        'preview',
  '/insights/trends':              'preview',
  '/financial':                    'preview',
  '/financial/performance':        'preview',
  '/financial/timeline':           'preview',
  '/financial/staff':              'preview',
  '/financial/leakage':            'preview',
  '/performance/plans':            'preview',
  '/performance/scenarios':        'preview',
  '/transactions':                 'preview',
  '/transactions/orders':          'preview',
  '/transactions/find':            'preview',
  '/operate/results':              'preview',
  '/operate/pay':                  'preview',
  '/operate/approve':              'preview',
  '/govern/calculation-approvals': 'preview',

  // COMING — stubs or placeholders
  '/insights/sales-finance':       'coming',
  '/transactions/inquiries':       'coming',
  '/performance':                  'coming',
  '/performance/goals':            'coming',
  '/performance/adjustments':      'coming',
  '/performance/approvals':        'coming',
  '/configuration':                'coming',
  '/configuration/personnel':      'coming',
  '/configuration/teams':          'coming',
  '/configuration/locations':      'coming',
  '/configuration/terminology':    'coming',
  '/data/operations':              'coming',
  '/data/quality':                 'coming',
  '/data/reports':                 'coming',
  '/data/readiness':               'coming',
  '/operations/audits':            'coming',
  '/operations/data-readiness':    'coming',
  '/operations/messaging':         'coming',
  '/operations/rollback':          'coming',
  '/approvals':                    'coming',
  '/admin/audit':                  'coming',
  '/admin/tenants/new':            'coming',
};

export function getPageStatus(path: string): PageStatus {
  return PAGE_STATUS[path] || 'coming';
}
