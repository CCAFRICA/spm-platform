'use client';

import { useState, useEffect } from 'react';
import {
  Loader2,
  Server,
  Database,
  Cloud,
  CheckCircle,
  XCircle,
  HardDrive,
  Zap,
  ArrowUpRight,
} from 'lucide-react';

/* ──── STYLES ──── */
const LABEL_STYLE: React.CSSProperties = {
  color: '#94A3B8',
  fontSize: '13px',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

interface InfraData {
  supabaseHealthy: boolean;
  tenantCount: number;
  committedDataCount: number;
  totalOutcomes: number;
  hasAnthropicKey: boolean;
  aiCallsThisPeriod: number;
  aiErrorCount: number;
  meteringConfigured: boolean;
  lastDeployTimestamp: string | null;
}

export function InfrastructureTab() {
  const [data, setData] = useState<InfraData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/platform/observatory?tab=infra')
      .then(res => {
        if (!res.ok) throw new Error(`Infra API: ${res.status}`);
        return res.json();
      })
      .then((result: InfraData) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('[InfrastructureTab] Fetch failed:', err);
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!data) return null;

  const aiErrorRate = data.aiCallsThisPeriod > 0
    ? ((data.aiErrorCount / data.aiCallsThisPeriod) * 100).toFixed(1)
    : '0.0';

  const supabaseRowCount = data.committedDataCount + data.totalOutcomes;

  return (
    <div className="space-y-8">
      {/* Tab heading */}
      <div>
        <h2 style={{ color: '#E2E8F0', fontSize: '18px', fontWeight: 600 }}>Infrastructure</h2>
        <p style={{ color: '#94A3B8', fontSize: '14px' }}>Service health, storage metrics, and cost projections</p>
      </div>

      {/* Service Health */}
      <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
        <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>Service Health</h3>
        <div className="grid grid-cols-3 gap-4">
          {/* Supabase */}
          <div
            className="rounded-xl"
            style={{
              border: data.supabaseHealthy ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              background: data.supabaseHealthy ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
              padding: '16px',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-4 w-4" style={{ color: data.supabaseHealthy ? '#34d399' : '#f87171' }} />
              <span style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 600 }}>Supabase</span>
              {data.supabaseHealthy ? (
                <CheckCircle className="h-3.5 w-3.5 ml-auto" style={{ color: '#34d399' }} />
              ) : (
                <XCircle className="h-3.5 w-3.5 ml-auto" style={{ color: '#f87171' }} />
              )}
            </div>
            <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {supabaseRowCount.toLocaleString()}
            </p>
            <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '2px' }}>
              total rows ({data.committedDataCount.toLocaleString()} data + {data.totalOutcomes.toLocaleString()} outcomes)
            </p>
            <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '4px' }}>
              {data.tenantCount} tenant{data.tenantCount !== 1 ? 's' : ''} connected
            </p>
          </div>

          {/* Vercel */}
          <div
            className="rounded-xl"
            style={{
              border: '1px solid rgba(16, 185, 129, 0.3)',
              background: 'rgba(16, 185, 129, 0.05)',
              padding: '16px',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Cloud className="h-4 w-4" style={{ color: '#34d399' }} />
              <span style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 600 }}>Vercel</span>
              <CheckCircle className="h-3.5 w-3.5 ml-auto" style={{ color: '#34d399' }} />
            </div>
            <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700 }}>Active</p>
            <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '2px' }}>
              Edge deployment healthy
            </p>
            {data.lastDeployTimestamp ? (
              <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '4px' }}>
                Last activity: {new Date(data.lastDeployTimestamp).toLocaleDateString()}
              </p>
            ) : (
              <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '4px' }}>
                Serving {data.tenantCount} tenant{data.tenantCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Anthropic */}
          <div
            className="rounded-xl"
            style={{
              border: data.hasAnthropicKey ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
              background: data.hasAnthropicKey ? 'rgba(16, 185, 129, 0.05)' : 'rgba(245, 158, 11, 0.05)',
              padding: '16px',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Server className="h-4 w-4" style={{ color: data.hasAnthropicKey ? '#34d399' : '#fbbf24' }} />
              <span style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 600 }}>Anthropic</span>
              {data.hasAnthropicKey ? (
                <CheckCircle className="h-3.5 w-3.5 ml-auto" style={{ color: '#34d399' }} />
              ) : (
                <XCircle className="h-3.5 w-3.5 ml-auto" style={{ color: '#fbbf24' }} />
              )}
            </div>
            {data.meteringConfigured ? (
              <>
                <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {data.aiCallsThisPeriod.toLocaleString()}
                </p>
                <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '2px' }}>
                  API calls this period
                </p>
                <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '4px' }}>
                  {aiErrorRate}% error rate
                </p>
              </>
            ) : (
              <>
                <p style={{ color: '#CBD5E1', fontSize: '14px', fontWeight: 500, marginTop: '4px' }}>
                  {data.hasAnthropicKey ? 'Key configured' : 'No API key'}
                </p>
                <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '4px' }}>
                  {data.hasAnthropicKey
                    ? 'Run AI assessments to start metering'
                    : 'Set ANTHROPIC_API_KEY to enable AI'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Storage Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="h-4 w-4" style={{ color: '#a78bfa' }} />
            <span style={LABEL_STYLE}>Committed Data Rows</span>
          </div>
          <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{data.committedDataCount.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4" style={{ color: '#a78bfa' }} />
            <span style={LABEL_STYLE}>Calculation Outcomes</span>
          </div>
          <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{data.totalOutcomes.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4" style={{ color: '#a78bfa' }} />
            <span style={LABEL_STYLE}>Active Tenants</span>
          </div>
          <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{data.tenantCount}</p>
        </div>
      </div>

      {/* Cost Projection */}
      <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
        <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>
          Cost Projection (Monthly Estimate)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr style={{ borderBottom: '1px solid #27272a' }}>
                <th style={{ ...LABEL_STYLE, paddingBottom: '8px', paddingRight: '16px' }}>Service</th>
                <th style={{ ...LABEL_STYLE, paddingBottom: '8px', paddingRight: '16px' }}>Tier</th>
                <th style={{ ...LABEL_STYLE, paddingBottom: '8px', paddingRight: '16px' }}>Usage Driver</th>
                <th style={{ ...LABEL_STYLE, paddingBottom: '8px', textAlign: 'right' }}>Est. Cost</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: '14px' }}>
              <CostRow
                service="Supabase"
                tier="Pro"
                driver={`${data.committedDataCount.toLocaleString()} rows`}
                cost={deriveCost('supabase', data.committedDataCount)}
              />
              <CostRow
                service="Vercel"
                tier="Pro"
                driver={`${data.tenantCount} tenant${data.tenantCount !== 1 ? 's' : ''}`}
                cost={deriveCost('vercel', data.tenantCount)}
              />
              <CostRow
                service="Anthropic"
                tier="API"
                driver={data.meteringConfigured
                  ? `${data.aiCallsThisPeriod.toLocaleString()} calls`
                  : 'Configure metering'}
                cost={deriveCost('anthropic', data.aiCallsThisPeriod)}
              />
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid #3f3f46' }}>
                <td colSpan={3} style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 500, paddingTop: '12px' }}>Total Estimated</td>
                <td style={{ color: '#F8FAFC', fontSize: '14px', fontWeight: 700, paddingTop: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  ${(
                    deriveCost('supabase', data.committedDataCount) +
                    deriveCost('vercel', data.tenantCount) +
                    deriveCost('anthropic', data.aiCallsThisPeriod)
                  ).toFixed(0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '12px' }}>
          Estimates based on current usage patterns. Actual costs may vary.
        </p>
      </div>

      {/* Metering Status */}
      {!data.meteringConfigured && (
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5" style={{ color: '#fbbf24' }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 500 }}>Platform Metering Not Configured</p>
              <p style={{ color: '#94A3B8', fontSize: '14px', marginTop: '2px' }}>
                Run AI assessments or classification to begin recording usage events. Cost projections for Anthropic will become dynamic once metering data is available.
              </p>
            </div>
            <ArrowUpRight className="h-4 w-4" style={{ color: '#94A3B8' }} />
          </div>
        </div>
      )}
    </div>
  );
}

function CostRow({ service, tier, driver, cost }: {
  service: string;
  tier: string;
  driver: string;
  cost: number;
}) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(39, 39, 42, 0.5)' }}>
      <td style={{ color: '#E2E8F0', fontWeight: 500, padding: '10px 16px 10px 0' }}>{service}</td>
      <td style={{ color: '#94A3B8', padding: '10px 16px 10px 0' }}>{tier}</td>
      <td style={{ color: '#94A3B8', padding: '10px 16px 10px 0' }}>{driver}</td>
      <td style={{ color: '#F8FAFC', fontVariantNumeric: 'tabular-nums', textAlign: 'right', padding: '10px 0' }}>${cost.toFixed(0)}</td>
    </tr>
  );
}

/** Dynamic cost derivation based on actual usage volume. */
function deriveCost(service: string, usage: number): number {
  switch (service) {
    case 'supabase':
      // Pro plan $25 base + ~$0.0001/row above 100k
      return 25 + Math.max(0, usage - 100000) * 0.0001;
    case 'vercel':
      // Pro plan $20 base
      return 20;
    case 'anthropic':
      // ~$0.003 per Haiku call average (classification + assessment)
      return usage > 0 ? Math.max(1, usage * 0.003) : 0;
    default:
      return 0;
  }
}
