'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  Plus,
  X,
  Send,
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

const ROLE_OPTIONS = [
  { value: 'tenant_admin', label: 'Tenant Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'individual', label: 'Individual / Rep' },
];

export function OnboardingTab() {
  const router = useRouter();
  const [tenants, setTenants] = useState<OnboardingTenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [invitingTenantId, setInvitingTenantId] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState({ email: '', displayName: '', role: 'tenant_admin' });
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isInviting, setIsInviting] = useState(false);

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

  const handleInvite = async (tenantId: string) => {
    if (!inviteForm.email || !inviteForm.displayName) return;
    setIsInviting(true);
    setInviteStatus(null);

    try {
      const res = await fetch('/api/platform/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteForm.email,
          displayName: inviteForm.displayName,
          tenantId,
          roleTemplate: inviteForm.role,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setInviteStatus({ type: 'error', message: data.error || 'Invite failed' });
      } else {
        setInviteStatus({ type: 'success', message: `Invited ${data.user.email} as ${data.user.role}` });
        setInviteForm({ email: '', displayName: '', role: 'tenant_admin' });
        // Refresh tenants to update user counts
        setTimeout(() => {
          setInvitingTenantId(null);
          setInviteStatus(null);
        }, 2000);
      }
    } catch (_err) {
      setInviteStatus({ type: 'error', message: 'Network error' });
    } finally {
      setIsInviting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  const totalTenants = tenants.length;
  const fullyOnboarded = tenants.filter(t => t.stage >= 6).length;
  const inProgress = tenants.filter(t => t.stage >= 2 && t.stage < 6).length;
  const notStarted = tenants.filter(t => t.stage <= 1).length;

  return (
    <div className="space-y-8">
      {/* Header with Create Tenant action */}
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => router.push('/admin/tenants/new')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
            color: '#ffffff',
          }}
        >
          <Plus className="h-4 w-4" />
          Create Tenant
        </button>
      </div>

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
          <p className="text-sm text-zinc-500 py-4">No tenants found. Create your first tenant above.</p>
        ) : (
          <div className="space-y-3">
            {/* Header row */}
            <div className="grid grid-cols-[200px_1fr_80px_120px] gap-4 px-3">
              <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Tenant</span>
              <div className="grid grid-cols-6 gap-1">
                {STAGES.map(s => (
                  <span key={s.key} className="text-[10px] text-zinc-600 text-center">{s.label}</span>
                ))}
              </div>
              <span className="text-[10px] text-zinc-600 text-center">Actions</span>
              <span className="text-[10px] text-zinc-600 uppercase tracking-widest text-right">Created</span>
            </div>

            {/* Tenant rows */}
            {tenants.map(tenant => (
              <div key={tenant.id}>
                <div className="grid grid-cols-[200px_1fr_80px_120px] gap-4 items-center px-3 py-3 rounded-lg border border-zinc-800 bg-zinc-900/30">
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

                  {/* Actions */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => {
                        setInvitingTenantId(invitingTenantId === tenant.id ? null : tenant.id);
                        setInviteStatus(null);
                        setInviteForm({ email: '', displayName: '', role: 'tenant_admin' });
                      }}
                      className={cn(
                        'p-1.5 rounded-md transition-colors',
                        invitingTenantId === tenant.id
                          ? 'bg-violet-600/20 text-violet-400'
                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                      )}
                      title="Invite user"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Created date */}
                  <span className="text-xs text-zinc-500 text-right tabular-nums">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Inline Invite Form */}
                {invitingTenantId === tenant.id && (
                  <div className="mt-2 ml-4 mr-4 p-4 rounded-lg border border-violet-800/40 bg-violet-950/20">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-medium text-violet-300">
                        Invite User to {tenant.name}
                      </h4>
                      <button
                        onClick={() => { setInvitingTenantId(null); setInviteStatus(null); }}
                        className="text-zinc-500 hover:text-zinc-300 p-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="grid grid-cols-[1fr_1fr_140px_auto] gap-2 items-end">
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-1">Email</label>
                        <input
                          type="email"
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="user@company.com"
                          className="w-full h-8 px-2 text-sm rounded-md bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-1">Name</label>
                        <input
                          type="text"
                          value={inviteForm.displayName}
                          onChange={(e) => setInviteForm(f => ({ ...f, displayName: e.target.value }))}
                          placeholder="John Smith"
                          className="w-full h-8 px-2 text-sm rounded-md bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-1">Role</label>
                        <select
                          value={inviteForm.role}
                          onChange={(e) => setInviteForm(f => ({ ...f, role: e.target.value }))}
                          className="w-full h-8 px-2 text-sm rounded-md bg-zinc-900 border border-zinc-700 text-white focus:border-violet-500 focus:outline-none"
                        >
                          {ROLE_OPTIONS.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => handleInvite(tenant.id)}
                        disabled={isInviting || !inviteForm.email || !inviteForm.displayName}
                        className={cn(
                          'h-8 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors',
                          isInviting || !inviteForm.email || !inviteForm.displayName
                            ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                            : 'bg-violet-600 text-white hover:bg-violet-500'
                        )}
                      >
                        {isInviting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Invite
                      </button>
                    </div>

                    {inviteStatus && (
                      <div className={cn(
                        'mt-2 px-3 py-1.5 rounded text-xs',
                        inviteStatus.type === 'success'
                          ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40'
                          : 'bg-red-900/30 text-red-400 border border-red-800/40'
                      )}>
                        {inviteStatus.message}
                      </div>
                    )}
                  </div>
                )}
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
