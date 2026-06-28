'use client';

/**
 * ObservatoryTab — Command Center for VL Platform Admin
 *
 * OB-60 Phase 4: Redesigned with 6 actionable metrics (no vanity metrics)
 * and expanded Operations Queue as the primary surface.
 *
 * Every metric answers "what do I DO with this information?"
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context'; // HF-354: capability gate for the Manage-tenant entry
import { hasCapability } from '@/lib/auth/permissions'; // HF-354: platform.system_config gate (no role-string)
import { logAuthEventClient } from '@/lib/auth/auth-logger'; // HF-283 Phase 4: tenant-entry observability
import type {
  FleetOverview,
  TenantFleetCard,
  OperationsQueueItem,
} from '@/lib/data/platform-queries';
import {
  TrendingUp,
  Building2,
  AlertTriangle,
  Zap,
  Clock,
  Sparkles,
  AlertCircle,
  Info,
  ChevronRight,
  Loader2,
  CheckCircle,
  PlusCircle,
  Database,
  Settings2,
} from 'lucide-react';

/* ──── Lifecycle next actions ──── */
const NEXT_ACTIONS: Record<string, string> = {
  DRAFT: 'Run preview calculation',
  PREVIEW: 'Review and reconcile',
  RECONCILE: 'Advance to Official',
  OFFICIAL: 'Submit for approval',
  PENDING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Post results',
  POSTED: 'Close period',
  CLOSED: 'Mark as paid',
  PAID: 'Publish to reps',
  PUBLISHED: 'Period complete',
};

/**
 * OB-252 I0/I1: the fleet card's tenant-management entries stay WITHIN the Observatory.
 * `onManageTenant` switches the Observatory to the Tenant Admin tab with the tenant
 * pre-selected (NO router.push into the tenant-plane /admin/tenants route — that was the
 * plane leak). `onCreateTenant` opens the provisioning flow. Both are supplied by
 * PlatformObservatory; the router fallbacks keep the component standalone-safe.
 */
interface ObservatoryTabProps {
  onManageTenant?: (tenantId: string) => void;
  onCreateTenant?: () => void;
}

export function ObservatoryTab({ onManageTenant, onCreateTenant }: ObservatoryTabProps = {}) {
  const router = useRouter();
  const { setTenant } = useTenant();
  // HF-354: the Manage-tenant entry is gated on platform.system_config (the HF-352 surface's own
  // capability). The Observatory is already platform-admin-only, so this is the explicit, defensible
  // expression of I4 — no role-string, no new role.
  const { user } = useAuth();
  const canManageTenants = !!user && hasCapability(user.role, 'platform.system_config');
  const [overview, setOverview] = useState<FleetOverview | null>(null);
  const [tenantCards, setTenantCards] = useState<TenantFleetCard[]>([]);
  const [queue, setQueue] = useState<OperationsQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectingTenant, setSelectingTenant] = useState<string | null>(null);
  const [showTestTenants, setShowTestTenants] = useState(false);
  // HF-283 Phase 4.1: tenant-load failure made user-visible (was a silent spinner-reset).
  const [entryError, setEntryError] = useState<{ tenantName: string; message: string } | null>(null);

  // OB-89: Filter test/development tenants from demo view
  const TEST_TENANT_PATTERNS = /test|pipeline|retailco|frmx|retail conglomerate|demo seed/i;
  // HF-067: Show tenants with entities OR data rows OR completed calculations
  const demoTenants = tenantCards.filter(t =>
    showTestTenants || (!TEST_TENANT_PATTERNS.test(t.name) && (t.entityCount > 0 || (t.dataRowCount ?? 0) > 0 || t.latestLifecycleState !== null))
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetch('/api/platform/observatory')
      .then(res => {
        if (!res.ok) throw new Error(`Observatory API: ${res.status}`);
        return res.json();
      })
      .then((data: { overview: FleetOverview; tenantCards: TenantFleetCard[]; queue: OperationsQueueItem[] }) => {
        if (!cancelled) {
          setOverview(data.overview);
          setTenantCards(data.tenantCards);
          setQueue(data.queue);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('[ObservatoryTab] Failed to fetch data:', err);
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const handleSelectTenant = async (tenantId: string, targetRoute?: string) => {
    setSelectingTenant(tenantId);
    setEntryError(null);
    const tenantName = tenantCards.find(t => t.id === tenantId)?.name ?? tenantId;
    try {
      await setTenant(tenantId);
      // HF-283 Phase 4.2: observable entry — exactly one event per selection
      // (handleSelectTenant runs once per card click), via the HF-282 plumbing.
      logAuthEventClient('tenant.entered', { tenantId, tenantName });
      // HF-292 / OB-211 WS-1: tenant-card entry lands on /stream. setTenant already
      // pushed /stream (tenant-context.tsx — Decision 128 / OB-206 F-1), and middleware
      // converges every role on /stream. Only override when the caller supplies an
      // EXPLICIT deep-link target — the Operations Queue action buttons pass a concrete
      // route (preserved). A plain card click leaves setTenant's /stream standing instead
      // of clobbering it with /operate (the SR-34 fix-at-source; no counter-redirect).
      if (targetRoute) {
        router.push(targetRoute);
      }
      router.refresh();
    } catch (err) {
      // HF-283 Phase 4.1: surface the failure (was a silent spinner-reset that
      // made the DIAG-061 class invisible) + 4.3 observability.
      const message = err instanceof Error ? err.message : String(err);
      setEntryError({ tenantName, message });
      setSelectingTenant(null);
      logAuthEventClient('tenant.load_failed', { tenantId, tenantName, message });
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <Loader2 style={{ width: '24px', height: '24px', color: '#7B7FD4', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ fontSize: '14px', color: 'var(--strag-s2)', lineHeight: '1.5' }}>
      {/* ── Section: Heading ── */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: 'var(--strag-s0)', fontSize: '18px', fontWeight: 700, margin: 0 }}>Command Center</h2>
        <p style={{ color: 'var(--strag-s4)', fontSize: '14px', marginTop: '4px' }}>Actionable fleet intelligence — every metric drives a decision</p>
      </div>

      {/* HF-283 Phase 4.1: inline, user-visible tenant-load failure (replaces the silent spinner-reset) */}
      {entryError && (
        <div role="alert" style={{
          marginBottom: '24px',
          background: '#2A1115',
          border: '1px solid #7F1D1D',
          borderRadius: '10px',
          padding: '14px 16px',
          color: '#FCA5A5',
          fontSize: '14px',
        }}>
          <span style={{ fontWeight: 700, color: '#F87171' }}>Could not enter {entryError.tenantName}.</span>{' '}
          {entryError.message}
        </div>
      )}

      {/* ── Section: 6 Actionable Metrics ── */}
      {overview && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}>
          <ActionMetricCard
            icon={TrendingUp}
            iconColor="#10B981"
            label="MRR"
            value={`$${overview.mrr.toLocaleString()}`}
            subtitle="Monthly recurring"
          />
          <ActionMetricCard
            icon={Building2}
            iconColor="#7B7FD4"
            label="ACTIVE / TOTAL"
            value={`${overview.activeTenantCount} / ${overview.tenantCount}`}
            subtitle="Tenants with activity"
          />
          <ActionMetricCard
            icon={AlertTriangle}
            iconColor={overview.openAttentionItems > 0 ? '#F59E0B' : '#10B981'}
            label="ATTENTION ITEMS"
            value={String(overview.openAttentionItems)}
            subtitle={overview.openAttentionItems === 0 ? 'All clear' : 'Need review'}
          />
          <ActionMetricCard
            icon={Zap}
            iconColor="#E8A838"
            label="THROUGHPUT"
            value={String(overview.lifecycleThroughput)}
            subtitle="Completed this month"
          />
          <ActionMetricCard
            icon={Clock}
            iconColor="var(--strag-s4)"
            label="AVG DAYS"
            value={overview.avgDaysInLifecycle > 0 ? `${overview.avgDaysInLifecycle}d` : '--'}
            subtitle="Draft to Paid"
          />
          <ActionMetricCard
            icon={Sparkles}
            iconColor="#7B7FD4"
            label="AI CONFIDENCE"
            value={overview.avgAiConfidence > 0 ? `${(overview.avgAiConfidence * 100).toFixed(0)}%` : '--'}
            subtitle="Classification accuracy"
          />
          <ActionMetricCard
            icon={Database}
            iconColor="#38BDF8"
            label="DATA ROWS"
            value={overview.totalDataRows?.toLocaleString() ?? '0'}
            subtitle="Committed pipeline data"
          />
        </div>
      )}

      {/* ── Section: Operations Queue (PRIMARY SURFACE) ── */}
      <div style={{
        background: 'var(--strag-panel)',
        border: '1px solid var(--strag-s8)',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '32px',
      }}>
        <h3 style={{
          color: 'var(--strag-s0)',
          fontSize: '16px',
          fontWeight: 700,
          margin: '0 0 16px',
        }}>
          Operations Queue
          {queue.length > 0 && (
            <span style={{
              marginLeft: '8px',
              fontSize: '13px',
              color: 'var(--strag-s4)',
              fontWeight: 500,
            }}>
              ({queue.length} {queue.length === 1 ? 'item' : 'items'})
            </span>
          )}
        </h3>

        {queue.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '16px',
            color: '#10B981',
            fontSize: '16px',
          }}>
            <CheckCircle style={{ width: '20px', height: '20px' }} />
            All tenants healthy — no items require attention
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {queue.map((item, i) => {
              const severityStyles = {
                critical: { borderLeft: '4px solid #EF4444', background: 'rgba(239, 68, 68, 0.06)' },
                warning: { borderLeft: '4px solid #F59E0B', background: 'rgba(245, 158, 11, 0.06)' },
                info: { borderLeft: '4px solid #3B82F6', background: 'var(--strag-panel)' },
              };
              const style = severityStyles[item.severity];

              return (
                <div
                  key={`${item.tenantId}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    ...style,
                  }}
                >
                  {item.severity === 'critical' && <AlertCircle style={{ width: '16px', height: '16px', color: '#EF4444', flexShrink: 0 }} />}
                  {item.severity === 'warning' && <AlertTriangle style={{ width: '16px', height: '16px', color: '#F59E0B', flexShrink: 0 }} />}
                  {item.severity === 'info' && <Info style={{ width: '16px', height: '16px', color: '#3B82F6', flexShrink: 0 }} />}

                  <span style={{ color: 'var(--strag-s0)', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {item.tenantName}
                  </span>
                  <span style={{ color: 'var(--strag-s3)', fontSize: '14px', flex: 1 }}>
                    {item.message}
                  </span>

                  {item.action && (
                    <button
                      onClick={() => {
                        // HF-353: every queue action does the same thing — enter the tenant and land
                        // on /operate. The prior label-keyed ACTION_ROUTES map made three labels
                        // ("Run Calculation"/"Resume"/"View Tenant") all resolve to /operate, dressing
                        // one behavior in three names. Behavior is unchanged (still /operate); the
                        // honest single label now comes from the API ("Go to tenant").
                        handleSelectTenant(item.tenantId, '/operate');
                      }}
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#7B7FD4',
                        background: 'rgba(123, 127, 212, 0.1)',
                        border: '1px solid rgba(123, 127, 212, 0.3)',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'background 0.15s',
                      }}
                    >
                      {item.action.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section: Tenant Fleet Cards ── */}
      <div>
        <h3 style={{
          color: 'var(--strag-s0)',
          fontSize: '16px',
          fontWeight: 700,
          margin: '0 0 16px',
        }}>
          Tenant Fleet ({demoTenants.length})
          {tenantCards.length !== demoTenants.length && (
            <button
              onClick={() => setShowTestTenants(!showTestTenants)}
              style={{
                fontSize: '12px',
                color: 'var(--strag-s4)',
                background: 'transparent',
                border: '1px solid var(--strag-s7)',
                borderRadius: '6px',
                padding: '2px 8px',
                marginLeft: '8px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              {showTestTenants ? 'Hide' : 'Show'} {tenantCards.length - demoTenants.length} test
            </button>
          )}
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}>
          {demoTenants.map(tenant => {
            // HF-067: Use dataRowCount for truth — a tenant has data if committed_data exists
            const hasData = (tenant.dataRowCount ?? 0) > 0 || tenant.entityCount > 0;
            const healthColor = tenant.latestLifecycleState
              ? (['POSTED', 'CLOSED', 'PAID', 'PUBLISHED'].includes(tenant.latestLifecycleState) ? '#10B981' : '#F59E0B')
              : (hasData ? '#F59E0B' : '#EF4444');

            const nextAction = tenant.latestLifecycleState
              ? (NEXT_ACTIONS[tenant.latestLifecycleState] || 'Continue lifecycle')
              : (hasData ? 'Run first calculation' : 'Upload data');

            const lastCalcDays = tenant.lastActivity
              ? Math.floor((Date.now() - new Date(tenant.lastActivity).getTime()) / (1000 * 60 * 60 * 24))
              : null;

            return (
              // HF-353: the card is a clickable region (enter the tenant → /stream) that ALSO carries
              // a distinct "Manage" entry (→ the HF-352 Tenant Management surface for this tenant). A
              // role="button" div (not a <button>) so the real Manage <button> can nest validly.
              <div
                key={tenant.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectTenant(tenant.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectTenant(tenant.id); } }}
                style={{
                  textAlign: 'left',
                  background: 'var(--strag-panel)',
                  border: '1px solid var(--strag-s8)',
                  borderRadius: '12px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                  width: '100%',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: healthColor,
                      flexShrink: 0,
                    }} />
                    <span style={{ color: 'var(--strag-s0)', fontSize: '16px', fontWeight: 700 }}>
                      {tenant.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {tenant.latestLifecycleState && (
                      <span style={{
                        fontSize: '13px',
                        padding: '2px 10px',
                        borderRadius: '12px',
                        fontWeight: 600,
                        ...lifecycleBadgeStyle(tenant.latestLifecycleState),
                      }}>
                        {tenant.latestLifecycleState}
                      </span>
                    )}
                    {selectingTenant === tenant.id ? (
                      <Loader2 style={{ width: '16px', height: '16px', color: '#7B7FD4', animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <ChevronRight style={{ width: '16px', height: '16px', color: 'var(--strag-s4)' }} />
                    )}
                  </div>
                </div>

                {/* Industry / Country */}
                {(tenant.industry || tenant.country) && (
                  <p style={{ color: 'var(--strag-s4)', fontSize: '13px', margin: '0 0 12px' }}>
                    {[tenant.industry, tenant.country].filter(Boolean).join(' \u00B7 ')}
                  </p>
                )}

                {/* Stats row */}
                <div style={{ display: 'flex', gap: '24px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: 'var(--strag-s4)', fontSize: '13px' }}>Entities</span>
                    <p style={{ color: 'var(--strag-s0)', fontSize: '14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '2px 0 0' }}>{tenant.entityCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--strag-s4)', fontSize: '13px' }}>Data Rows</span>
                    <p style={{ color: 'var(--strag-s0)', fontSize: '14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '2px 0 0' }}>{(tenant.dataRowCount ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--strag-s4)', fontSize: '13px' }}>Users</span>
                    <p style={{ color: 'var(--strag-s0)', fontSize: '14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '2px 0 0' }}>{tenant.userCount}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--strag-s4)', fontSize: '13px' }}>Period</span>
                    <p style={{ color: 'var(--strag-s3)', fontSize: '14px', margin: '2px 0 0' }}>{tenant.latestPeriodLabel || '\u2014'}</p>
                  </div>
                  {lastCalcDays !== null && (
                    <div>
                      <span style={{ color: 'var(--strag-s4)', fontSize: '13px' }}>Last calc</span>
                      <p style={{ color: 'var(--strag-s3)', fontSize: '14px', margin: '2px 0 0' }}>{lastCalcDays === 0 ? 'Today' : `${lastCalcDays}d ago`}</p>
                    </div>
                  )}
                </div>

                {/* Next action */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#E8A838',
                  fontSize: '13px',
                  fontWeight: 500,
                }}>
                  <span>&rarr;</span>
                  <span>{nextAction}</span>
                </div>

                {/* HF-354: the PROMINENT, unmistakable tenant-management entry point (the deliverable).
                    The card body click enters the tenant (→ /stream); THIS opens the HF-352 management
                    surface (agents/features toggle, Clean Slate, Delete Tenant) scoped to this tenant.
                    A full-width labeled button, not a buried icon. Capability-gated (platform.system_config);
                    stopPropagation so it never triggers the card's enter-tenant click. */}
                {canManageTenants && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // OB-252 I1: open the in-Observatory Tenant Admin surface (no plane leak).
                      if (onManageTenant) onManageTenant(tenant.id);
                      else router.push(`/admin/tenants?tenant=${tenant.id}`);
                    }}
                    title="Manage tenant — identity, agent entitlement, admin users"
                    aria-label={`Manage ${tenant.name}`}
                    style={{
                      marginTop: '16px',
                      width: '100%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#C7D2FE',
                      background: 'rgba(123, 127, 212, 0.15)',
                      border: '1px solid rgba(123, 127, 212, 0.40)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    <Settings2 style={{ width: '15px', height: '15px' }} /> Manage tenant
                  </button>
                )}
              </div>
            );
          })}

          {/* Create New Tenant — OB-252: provisioning flow lands back in the Tenant Admin tab. */}
          <button
            onClick={() => { if (onCreateTenant) onCreateTenant(); else router.push('/admin/tenants/new'); }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              background: 'rgba(15, 23, 42, 0.4)',
              border: '1px dashed var(--strag-s6)',
              borderRadius: '12px',
              padding: '32px',
              cursor: 'pointer',
              minHeight: '160px',
              transition: 'border-color 0.15s',
            }}
          >
            <PlusCircle style={{ width: '32px', height: '32px', color: 'var(--strag-s4)' }} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--strag-s4)', fontSize: '14px', fontWeight: 600, margin: 0 }}>Create New Tenant</p>
              <p style={{ color: 'var(--strag-s4)', fontSize: '13px', marginTop: '4px' }}>Provision a new customer environment</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function ActionMetricCard({
  icon: Icon,
  iconColor,
  label,
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  iconColor: string;
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div style={{
      background: 'var(--strag-panel)',
      border: '1px solid var(--strag-s8)',
      borderRadius: '10px',
      padding: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Icon style={{ width: '16px', height: '16px', color: iconColor }} />
        <span style={{
          color: 'var(--strag-s4)',
          fontSize: '13px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {label}
        </span>
      </div>
      <p style={{
        color: 'var(--strag-s0)',
        fontSize: '28px',
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        margin: 0,
      }}>
        {value}
      </p>
      <p style={{ color: 'var(--strag-s4)', fontSize: '13px', marginTop: '4px' }}>
        {subtitle}
      </p>
    </div>
  );
}

function lifecycleBadgeStyle(state: string): React.CSSProperties {
  switch (state) {
    case 'POSTED':
    case 'CLOSED':
    case 'PAID':
    case 'PUBLISHED':
      return { background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.3)' };
    case 'APPROVED':
    case 'OFFICIAL':
      return { background: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.3)' };
    case 'PREVIEW':
    case 'DRAFT':
      return { background: 'rgba(148, 163, 184, 0.15)', color: 'var(--strag-s4)', border: '1px solid rgba(148, 163, 184, 0.3)' };
    case 'REJECTED':
      return { background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)' };
    default:
      return { background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)' };
  }
}
