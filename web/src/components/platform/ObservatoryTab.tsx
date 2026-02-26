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

export function ObservatoryTab() {
  const router = useRouter();
  const { setTenant } = useTenant();
  const [overview, setOverview] = useState<FleetOverview | null>(null);
  const [tenantCards, setTenantCards] = useState<TenantFleetCard[]>([]);
  const [queue, setQueue] = useState<OperationsQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectingTenant, setSelectingTenant] = useState<string | null>(null);
  const [showTestTenants, setShowTestTenants] = useState(false);

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
    try {
      await setTenant(tenantId);
      // HF-057: Explicit navigation after tenant selection.
      // setTenant calls router.push('/') but middleware may redirect VL Admin
      // back to /select-tenant. Navigate to a concrete route instead.
      const destination = targetRoute || '/operate';
      router.push(destination);
      router.refresh();
    } catch {
      setSelectingTenant(null);
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
    <div style={{ fontSize: '14px', color: '#E2E8F0', lineHeight: '1.5' }}>
      {/* ── Section: Heading ── */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#F8FAFC', fontSize: '18px', fontWeight: 700, margin: 0 }}>Command Center</h2>
        <p style={{ color: '#94A3B8', fontSize: '14px', marginTop: '4px' }}>Actionable fleet intelligence — every metric drives a decision</p>
      </div>

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
            iconColor="#94A3B8"
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
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '32px',
      }}>
        <h3 style={{
          color: '#F8FAFC',
          fontSize: '16px',
          fontWeight: 700,
          margin: '0 0 16px',
        }}>
          Operations Queue
          {queue.length > 0 && (
            <span style={{
              marginLeft: '8px',
              fontSize: '13px',
              color: '#94A3B8',
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
                info: { borderLeft: '4px solid #3B82F6', background: '#0F172A' },
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

                  <span style={{ color: '#F8FAFC', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {item.tenantName}
                  </span>
                  <span style={{ color: '#CBD5E1', fontSize: '14px', flex: 1 }}>
                    {item.message}
                  </span>

                  {item.action && (
                    <button
                      onClick={() => {
                        // HF-057: Navigate to contextually appropriate route
                        const ACTION_ROUTES: Record<string, string> = {
                          'Run Calculation': '/operate',
                          'Resume': '/operate',
                          'View Tenant': '/operate',
                        };
                        handleSelectTenant(item.tenantId, ACTION_ROUTES[item.action!.label] || '/operate');
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
          color: '#F8FAFC',
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
                color: '#94A3B8',
                background: 'transparent',
                border: '1px solid #334155',
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
              <button
                key={tenant.id}
                onClick={() => handleSelectTenant(tenant.id)}
                style={{
                  textAlign: 'left',
                  background: '#0F172A',
                  border: '1px solid #1E293B',
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
                    <span style={{ color: '#F8FAFC', fontSize: '16px', fontWeight: 700 }}>
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
                      <ChevronRight style={{ width: '16px', height: '16px', color: '#94A3B8' }} />
                    )}
                  </div>
                </div>

                {/* Industry / Country */}
                {(tenant.industry || tenant.country) && (
                  <p style={{ color: '#94A3B8', fontSize: '13px', margin: '0 0 12px' }}>
                    {[tenant.industry, tenant.country].filter(Boolean).join(' \u00B7 ')}
                  </p>
                )}

                {/* Stats row */}
                <div style={{ display: 'flex', gap: '24px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: '#94A3B8', fontSize: '13px' }}>Entities</span>
                    <p style={{ color: '#F8FAFC', fontSize: '14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '2px 0 0' }}>{tenant.entityCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <span style={{ color: '#94A3B8', fontSize: '13px' }}>Data Rows</span>
                    <p style={{ color: '#F8FAFC', fontSize: '14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '2px 0 0' }}>{(tenant.dataRowCount ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <span style={{ color: '#94A3B8', fontSize: '13px' }}>Users</span>
                    <p style={{ color: '#F8FAFC', fontSize: '14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '2px 0 0' }}>{tenant.userCount}</p>
                  </div>
                  <div>
                    <span style={{ color: '#94A3B8', fontSize: '13px' }}>Period</span>
                    <p style={{ color: '#CBD5E1', fontSize: '14px', margin: '2px 0 0' }}>{tenant.latestPeriodLabel || '\u2014'}</p>
                  </div>
                  {lastCalcDays !== null && (
                    <div>
                      <span style={{ color: '#94A3B8', fontSize: '13px' }}>Last calc</span>
                      <p style={{ color: '#CBD5E1', fontSize: '14px', margin: '2px 0 0' }}>{lastCalcDays === 0 ? 'Today' : `${lastCalcDays}d ago`}</p>
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
              </button>
            );
          })}

          {/* Create New Tenant */}
          <button
            onClick={() => router.push('/admin/tenants/new')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              background: 'rgba(15, 23, 42, 0.4)',
              border: '1px dashed #475569',
              borderRadius: '12px',
              padding: '32px',
              cursor: 'pointer',
              minHeight: '160px',
              transition: 'border-color 0.15s',
            }}
          >
            <PlusCircle style={{ width: '32px', height: '32px', color: '#94A3B8' }} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#94A3B8', fontSize: '14px', fontWeight: 600, margin: 0 }}>Create New Tenant</p>
              <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '4px' }}>Provision a new customer environment</p>
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
      background: '#0F172A',
      border: '1px solid #1E293B',
      borderRadius: '10px',
      padding: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Icon style={{ width: '16px', height: '16px', color: iconColor }} />
        <span style={{
          color: '#94A3B8',
          fontSize: '13px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {label}
        </span>
      </div>
      <p style={{
        color: '#F8FAFC',
        fontSize: '28px',
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        margin: 0,
      }}>
        {value}
      </p>
      <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '4px' }}>
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
      return { background: 'rgba(148, 163, 184, 0.15)', color: '#94A3B8', border: '1px solid rgba(148, 163, 184, 0.3)' };
    case 'REJECTED':
      return { background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)' };
    default:
      return { background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)' };
  }
}
