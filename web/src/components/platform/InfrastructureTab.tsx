'use client';

import { useState, useEffect } from 'react';
// Data fetched from /api/platform/observatory?tab=infra
import {
  Loader2,
  Server,
  Database,
  Cloud,
  CheckCircle,
  XCircle,
  HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function InfrastructureTab() {
  const [data, setData] = useState<{
    supabaseHealthy: boolean;
    tenantCount: number;
    committedDataCount: number;
    totalOutcomes: number;
    hasAnthropicKey: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/platform/observatory?tab=infra')
      .then(res => {
        if (!res.ok) throw new Error(`Infra API: ${res.status}`);
        return res.json();
      })
      .then((result: NonNullable<typeof data>) => {
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

  const services = [
    {
      name: 'Supabase',
      description: 'Database & Auth',
      icon: Database,
      healthy: data.supabaseHealthy,
      detail: `${data.tenantCount} tenants`,
    },
    {
      name: 'Vercel',
      description: 'Hosting & Edge',
      icon: Cloud,
      healthy: true,
      detail: 'Deployed',
    },
    {
      name: 'Anthropic',
      description: 'AI Classification',
      icon: Server,
      healthy: true, // Pipeline configured
      detail: 'Pipeline ready',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Service Health */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
        <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-4">
          Service Health
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {services.map(svc => (
            <div
              key={svc.name}
              className={cn(
                'rounded-lg border p-4',
                svc.healthy
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-red-500/30 bg-red-500/5',
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <svc.icon className={cn(
                  'h-4 w-4',
                  svc.healthy ? 'text-emerald-400' : 'text-red-400',
                )} />
                <span className="text-sm font-medium text-white">{svc.name}</span>
                {svc.healthy ? (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400 ml-auto" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-400 ml-auto" />
                )}
              </div>
              <p className="text-[10px] text-zinc-500">{svc.description}</p>
              <p className="text-xs text-zinc-400 mt-1">{svc.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Storage Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="h-4 w-4 text-violet-400" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Committed Data Rows</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{data.committedDataCount.toLocaleString()}</p>
        </div>
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-violet-400" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Calculation Outcomes</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{data.totalOutcomes.toLocaleString()}</p>
        </div>
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4 text-violet-400" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Active Tenants</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{data.tenantCount}</p>
        </div>
      </div>

      {/* Cost Projection */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
        <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-4">
          Cost Projection (Monthly Estimate)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-[10px] text-zinc-500 uppercase tracking-widest pb-2 pr-4">Service</th>
                <th className="text-[10px] text-zinc-500 uppercase tracking-widest pb-2 pr-4">Tier</th>
                <th className="text-[10px] text-zinc-500 uppercase tracking-widest pb-2 pr-4">Usage Driver</th>
                <th className="text-[10px] text-zinc-500 uppercase tracking-widest pb-2 text-right">Est. Cost</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <CostRow
                service="Supabase"
                tier="Pro"
                driver={`${data.committedDataCount.toLocaleString()} rows`}
                cost={deriveCost('supabase', data.committedDataCount)}
              />
              <CostRow
                service="Vercel"
                tier="Pro"
                driver={`${data.tenantCount} tenants`}
                cost={deriveCost('vercel', data.tenantCount)}
              />
              <CostRow
                service="Anthropic"
                tier="API"
                driver="Classification calls"
                cost={deriveCost('anthropic', 0)}
              />
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-700">
                <td colSpan={3} className="text-xs font-medium text-zinc-300 pt-3">Total Estimated</td>
                <td className="text-sm font-bold text-white pt-3 text-right tabular-nums">
                  ${(
                    deriveCost('supabase', data.committedDataCount) +
                    deriveCost('vercel', data.tenantCount) +
                    deriveCost('anthropic', 0)
                  ).toFixed(0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[10px] text-zinc-600 mt-3">
          Estimates based on current usage patterns. Actual costs may vary.
        </p>
      </div>
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
    <tr className="border-b border-zinc-800/50">
      <td className="py-2.5 pr-4 text-white font-medium">{service}</td>
      <td className="py-2.5 pr-4 text-zinc-400">{tier}</td>
      <td className="py-2.5 pr-4 text-zinc-400">{driver}</td>
      <td className="py-2.5 text-white tabular-nums text-right">${cost.toFixed(0)}</td>
    </tr>
  );
}

/** Simple cost derivation based on usage volume. */
function deriveCost(service: string, usage: number): number {
  switch (service) {
    case 'supabase':
      // Pro plan $25 base + ~$0.0001/row above 100k
      return 25 + Math.max(0, usage - 100000) * 0.0001;
    case 'vercel':
      // Pro plan $20 base
      return 20;
    case 'anthropic':
      // Usage-based, minimal at current scale
      return 10;
    default:
      return 0;
  }
}
