'use client';

import { useState, useEffect } from 'react';
import type { OnboardingTenant } from '@/lib/data/platform-queries';
import {
  Loader2,
  Building2,
  UserPlus,
  FileSpreadsheet,
  Database,
  Calculator,
  Rocket,
  CheckCircle,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STAGES = [
  { key: 'tenantCreated', label: 'Tenant', icon: Building2 },
  { key: 'usersInvited', label: 'Users', icon: UserPlus },
  { key: 'planImported', label: 'Plan', icon: FileSpreadsheet },
  { key: 'dataImported', label: 'Data', icon: Database },
  { key: 'firstCalculation', label: 'Calc', icon: Calculator },
  { key: 'goLive', label: 'Go-Live', icon: Rocket },
] as const;

export function OnboardingTab() {
  const [tenants, setTenants] = useState<OnboardingTenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/platform/observatory?tab=onboarding')
      .then(res => {
        if (!res.ok) throw new Error(`Onboarding API: ${res.status}`);
        return res.json();
      })
      .then((result: OnboardingTenant[]) => {
        if (!cancelled) {
          setTenants(result);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('[OnboardingTab] Fetch failed:', err);
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

  // Pipeline summary
  const totalTenants = tenants.length;
  const fullyOnboarded = tenants.filter(t => t.stage >= 6).length;
  const inProgress = tenants.filter(t => t.stage >= 2 && t.stage < 6).length;
  const notStarted = tenants.filter(t => t.stage <= 1).length;

  return (
    <div className="space-y-8">
      {/* Pipeline Summary */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Total Tenants" value={totalTenants} color="text-white" />
        <SummaryCard label="Fully Onboarded" value={fullyOnboarded} color="text-emerald-400" />
        <SummaryCard label="In Progress" value={inProgress} color="text-amber-400" />
        <SummaryCard label="Not Started" value={notStarted} color="text-zinc-500" />
      </div>

      {/* Per-Tenant Pipeline */}
      <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
        <h3 style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>
          Onboarding Pipeline
        </h3>

        {tenants.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">No tenants found.</p>
        ) : (
          <div className="space-y-4">
            {/* Header row */}
            <div className="grid grid-cols-[200px_1fr_120px] gap-4 px-3">
              <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Tenant</span>
              <div className="grid grid-cols-6 gap-1">
                {STAGES.map(s => (
                  <span key={s.key} className="text-[10px] text-zinc-600 text-center">{s.label}</span>
                ))}
              </div>
              <span className="text-[10px] text-zinc-600 uppercase tracking-widest text-right">Created</span>
            </div>

            {/* Tenant rows */}
            {tenants.map(tenant => (
              <div
                key={tenant.id}
                className="grid grid-cols-[200px_1fr_120px] gap-4 items-center px-3 py-3 rounded-lg border border-zinc-800 bg-zinc-900/30"
              >
                {/* Name + stats */}
                <div>
                  <p className="text-sm font-medium text-white truncate">{tenant.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-zinc-500">{tenant.userCount} users</span>
                    <span className="text-[10px] text-zinc-600">{tenant.dataCount} rows</span>
                    {tenant.latestLifecycleState && (
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full border',
                        tenant.latestLifecycleState === 'POSTED' || tenant.latestLifecycleState === 'PAID'
                          ? 'border-emerald-500/40 text-emerald-400'
                          : 'border-zinc-700 text-zinc-400'
                      )}>
                        {tenant.latestLifecycleState}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stage pipeline */}
                <div className="grid grid-cols-6 gap-1">
                  {STAGES.map((s, idx) => {
                    const completed = tenant.stages[s.key];
                    const isCurrent = tenant.stage === idx + 1;
                    return (
                      <div key={s.key} className="flex flex-col items-center gap-1">
                        {completed ? (
                          <CheckCircle className="h-5 w-5 text-emerald-400" />
                        ) : isCurrent ? (
                          <div className="relative">
                            <Circle className="h-5 w-5 text-amber-400" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                            </div>
                          </div>
                        ) : (
                          <Circle className="h-5 w-5 text-zinc-700" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Created date */}
                <span className="text-xs text-zinc-500 text-right tabular-nums">
                  {new Date(tenant.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
      <span style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      <p className={cn('text-2xl font-bold tabular-nums mt-1', color)}>{value}</p>
    </div>
  );
}
