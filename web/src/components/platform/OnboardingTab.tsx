'use client';

/**
 * OnboardingTab — Tenant Onboarding Pipeline + Creation Wizard
 * OB-57: 6-step qualifying wizard with pricing calculation
 */

import { useState, useEffect } from 'react';
import type { OnboardingTenant } from '@/lib/data/platform-queries';
import {
  calculateBill,
  PLATFORM_FEES,
  MODULE_FEES,
  MODULE_INFO,
  EXPERIENCE_INFO,
  SCALE_OPTIONS,
  INDUSTRIES,
  COUNTRIES,
  TIER_LABELS,
  TIER_ENTITY_LIMITS,
  type TenantTier,
  type ExperienceTier,
  type ModuleKey,
  type BillCalculation,
} from '@/lib/billing/pricing';
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
  ArrowLeft,
  ArrowRight,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ──── STYLES ──── */
const CARD_STYLE = {
  background: 'rgba(24, 24, 27, 0.8)',
  border: '1px solid rgba(39, 39, 42, 0.6)',
  borderRadius: '16px',
  padding: '20px',
};

const TEXT = {
  heading: { color: '#E2E8F0', fontSize: '18px', fontWeight: 600 } as React.CSSProperties,
  body: { color: '#E2E8F0', fontSize: '14px' } as React.CSSProperties,
  secondary: { color: '#94A3B8', fontSize: '13px' } as React.CSSProperties,
  label: { color: '#94A3B8', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.05em' } as React.CSSProperties,
  hero: { color: '#F8FAFC', fontSize: '28px', fontWeight: 700 } as React.CSSProperties,
};

/* ──── PIPELINE STAGES ──── */
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

/* ──── WIZARD STEPS ──── */
const WIZARD_STEPS = [
  { id: 'organization', label: 'Organization' },
  { id: 'scale', label: 'Scale' },
  { id: 'usecase', label: 'Use Case' },
  { id: 'complexity', label: 'Complexity' },
  { id: 'experience', label: 'Experience' },
  { id: 'review', label: 'Review & Confirm' },
] as const;

type WizardStep = typeof WIZARD_STEPS[number]['id'];

interface WizardState {
  name: string;
  slug: string;
  industry: string;
  country: string;
  currency: string;
  locale: string;
  tier: TenantTier;
  modules: ModuleKey[];
  complexity: string;
  experienceTier: ExperienceTier;
}

/* ──── MAIN COMPONENT ──── */
export function OnboardingTab() {
  const [tenants, setTenants] = useState<OnboardingTenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
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

  const refreshTenants = () => {
    fetch('/api/platform/observatory?tab=onboarding')
      .then(res => res.json())
      .then((result: OnboardingTenant[]) => setTenants(result))
      .catch(() => {});
  };

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
        setTimeout(() => {
          setInvitingTenantId(null);
          setInviteStatus(null);
        }, 2000);
      }
    } catch {
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

  // Show wizard if toggled
  if (showWizard) {
    return (
      <TenantWizard
        onClose={() => setShowWizard(false)}
        onCreated={() => {
          setShowWizard(false);
          refreshTenants();
        }}
      />
    );
  }

  const totalTenants = tenants.length;
  const fullyOnboarded = tenants.filter(t => t.stage >= 6).length;
  const inProgress = tenants.filter(t => t.stage >= 2 && t.stage < 6).length;
  const notStarted = tenants.filter(t => t.stage <= 1).length;

  return (
    <div className="space-y-6">
      {/* Tab heading */}
      <div className="flex items-center justify-between">
        <div>
          <h2 style={TEXT.heading}>Tenant Onboarding Pipeline</h2>
          <p style={TEXT.secondary}>Create and monitor tenant activation progress</p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors"
          style={{
            background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
            color: '#ffffff',
            fontSize: '14px',
          }}
        >
          <Plus className="h-4 w-4" />
          Create Tenant
        </button>
      </div>

      {/* Pipeline Summary */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Total Tenants" value={totalTenants} color="#F8FAFC" />
        <SummaryCard label="Fully Onboarded" value={fullyOnboarded} color="#34d399" />
        <SummaryCard label="In Progress" value={inProgress} color="#fbbf24" />
        <SummaryCard label="Not Started" value={notStarted} color="#71717a" />
      </div>

      {/* Per-Tenant Pipeline */}
      <div style={CARD_STYLE}>
        <h3 style={{ ...TEXT.label, marginBottom: '16px' }}>Onboarding Pipeline</h3>

        {tenants.length === 0 ? (
          <p style={{ ...TEXT.secondary, padding: '16px 0' }}>No tenants found. Create your first tenant above.</p>
        ) : (
          <div className="space-y-3">
            {/* Header row */}
            <div className="grid grid-cols-[200px_1fr_80px_120px] gap-4 px-3">
              <span style={TEXT.label}>Tenant</span>
              <div className="grid grid-cols-6 gap-1">
                {STAGES.map(s => (
                  <span key={s.key} style={{ ...TEXT.label, textAlign: 'center' }}>{s.label}</span>
                ))}
              </div>
              <span style={{ ...TEXT.label, textAlign: 'center' }}>Actions</span>
              <span style={{ ...TEXT.label, textAlign: 'right' }}>Created</span>
            </div>

            {/* Tenant rows */}
            {tenants.map(tenant => (
              <div key={tenant.id}>
                <div className="grid grid-cols-[200px_1fr_80px_120px] gap-4 items-center px-3 py-3 rounded-lg border border-zinc-800 bg-zinc-900/30">
                  <div>
                    <p style={{ ...TEXT.body, fontWeight: 600 }} className="truncate">{tenant.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span style={{ ...TEXT.secondary, fontSize: '12px' }}>{tenant.userCount} users</span>
                      <span style={{ color: '#64748B', fontSize: '12px' }}>{tenant.dataCount} rows</span>
                      {tenant.latestLifecycleState && (
                        <span className={cn(
                          'px-1.5 py-0.5 rounded-full border',
                          tenant.latestLifecycleState === 'POSTED' || tenant.latestLifecycleState === 'PAID'
                            ? 'border-emerald-500/40 text-emerald-400'
                            : 'border-zinc-700 text-zinc-400'
                        )} style={{ fontSize: '12px' }}>
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
                  <span style={{ color: '#94A3B8', fontSize: '13px', textAlign: 'right' }} className="tabular-nums">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Inline Invite Form */}
                {invitingTenantId === tenant.id && (
                  <div className="mt-2 ml-4 mr-4 p-4 rounded-lg border border-violet-800/40 bg-violet-950/20">
                    <div className="flex items-center justify-between mb-3">
                      <h4 style={{ ...TEXT.body, color: '#c4b5fd' }}>
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
                        <label style={{ ...TEXT.label, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Email</label>
                        <input
                          type="email"
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="user@company.com"
                          className="w-full h-8 px-2 rounded-md bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                          style={{ fontSize: '14px' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...TEXT.label, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Name</label>
                        <input
                          type="text"
                          value={inviteForm.displayName}
                          onChange={(e) => setInviteForm(f => ({ ...f, displayName: e.target.value }))}
                          placeholder="John Smith"
                          className="w-full h-8 px-2 rounded-md bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                          style={{ fontSize: '14px' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...TEXT.label, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Role</label>
                        <select
                          value={inviteForm.role}
                          onChange={(e) => setInviteForm(f => ({ ...f, role: e.target.value }))}
                          className="w-full h-8 px-2 rounded-md bg-zinc-900 border border-zinc-700 text-white focus:border-violet-500 focus:outline-none"
                          style={{ fontSize: '14px' }}
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
                          'h-8 px-3 rounded-md font-medium flex items-center gap-1.5 transition-colors',
                          isInviting || !inviteForm.email || !inviteForm.displayName
                            ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                            : 'bg-violet-600 text-white hover:bg-violet-500'
                        )}
                        style={{ fontSize: '14px' }}
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
                        'mt-2 px-3 py-1.5 rounded',
                        inviteStatus.type === 'success'
                          ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40'
                          : 'bg-red-900/30 text-red-400 border border-red-800/40'
                      )} style={{ fontSize: '13px' }}>
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

/* ──── SUMMARY CARD ──── */
function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={CARD_STYLE}>
      <span style={TEXT.label}>{label}</span>
      <p className="tabular-nums mt-1" style={{ ...TEXT.hero, color }}>{value}</p>
    </div>
  );
}

/* ──── TENANT CREATION WIZARD ──── */
function TenantWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<WizardStep>('organization');
  const [isCreating, setIsCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ success: boolean; tenantId?: string; error?: string } | null>(null);
  const [wizard, setWizard] = useState<WizardState>({
    name: '',
    slug: '',
    industry: '',
    country: 'MX',
    currency: 'MXN',
    locale: 'es-MX',
    tier: 'inicio',
    modules: [],
    complexity: 'moderate',
    experienceTier: 'self_service',
  });

  const stepIndex = WIZARD_STEPS.findIndex(s => s.id === step);
  const bill: BillCalculation = calculateBill(wizard.tier, wizard.modules, wizard.experienceTier);

  const updateSlug = (name: string) => {
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
    setWizard(w => ({ ...w, name, slug }));
  };

  const canNext = (): boolean => {
    switch (step) {
      case 'organization': return Boolean(wizard.name && wizard.industry && wizard.country);
      case 'scale': return true;
      case 'usecase': return wizard.modules.length > 0;
      case 'complexity': return Boolean(wizard.complexity);
      case 'experience': return true;
      case 'review': return true;
      default: return false;
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setCreateResult(null);
    try {
      const res = await fetch('/api/platform/tenants/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wizard.name,
          slug: wizard.slug,
          industry: wizard.industry,
          country: wizard.country,
          currency: wizard.currency,
          locale: wizard.locale,
          modules: wizard.modules,
          tier: wizard.tier,
          experienceTier: wizard.experienceTier,
          billing: {
            modules: Object.fromEntries(
              wizard.modules.map(m => [m, { enabled: true, license: MODULE_FEES[m]?.[wizard.tier] || 0 }])
            ),
            platform_fee: PLATFORM_FEES[wizard.tier],
            bundle_discount: bill.bundleDiscount,
            experience_tier: wizard.experienceTier,
            experience_fee: bill.experienceFee,
            monthly_total: bill.monthlyTotal,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateResult({ success: false, error: data.error || `HTTP ${res.status}` });
      } else {
        setCreateResult({ success: true, tenantId: data.tenant?.id || data.tenantId });
      }
    } catch (err) {
      setCreateResult({ success: false, error: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setIsCreating(false);
    }
  };

  const goNext = () => {
    if (step === 'review') {
      handleCreate();
      return;
    }
    const next = stepIndex + 1;
    if (next < WIZARD_STEPS.length) setStep(WIZARD_STEPS[next].id);
  };

  const goBack = () => {
    if (stepIndex > 0) setStep(WIZARD_STEPS[stepIndex - 1].id);
    else onClose();
  };

  // Post-creation success screen with invite form
  if (createResult?.success) {
    return (
      <PostCreationScreen
        tenantName={wizard.name}
        tenantId={createResult.tenantId || ''}
        onDone={onCreated}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Back to pipeline */}
      <button onClick={onClose} className="flex items-center gap-2 transition-colors hover:opacity-80" style={TEXT.secondary}>
        <ArrowLeft className="h-4 w-4" /> Back to Pipeline
      </button>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full transition-colors"
              style={{
                background: i < stepIndex ? '#34d399' : i === stepIndex ? '#7c3aed' : 'rgba(39,39,42,0.8)',
                color: i <= stepIndex ? '#fff' : '#71717a',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span style={{ ...TEXT.secondary, color: i === stepIndex ? '#E2E8F0' : '#64748B', fontSize: '13px' }}>{s.label}</span>
            {i < WIZARD_STEPS.length - 1 && <div style={{ width: '24px', height: '2px', background: i < stepIndex ? '#34d399' : '#27272a' }} />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={CARD_STYLE}>
        {/* Step 1: Organization */}
        {step === 'organization' && (
          <div className="space-y-5">
            <h3 style={TEXT.heading}>Organization Details</h3>
            <p style={TEXT.secondary}>Tell us about the organization being onboarded.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ ...TEXT.label, display: 'block', marginBottom: '6px' }}>Tenant Name *</label>
                <input
                  value={wizard.name}
                  onChange={(e) => updateSlug(e.target.value)}
                  placeholder="Company Name"
                  className="w-full h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                  style={{ fontSize: '14px' }}
                />
              </div>
              <div>
                <label style={{ ...TEXT.label, display: 'block', marginBottom: '6px' }}>Slug</label>
                <input
                  value={wizard.slug}
                  onChange={(e) => setWizard(w => ({ ...w, slug: e.target.value }))}
                  placeholder="company-name"
                  className="w-full h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-400 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                  style={{ fontSize: '14px' }}
                />
              </div>
            </div>
            <div>
              <label style={{ ...TEXT.label, display: 'block', marginBottom: '6px' }}>Industry *</label>
              <div className="grid grid-cols-2 gap-2">
                {INDUSTRIES.map(ind => (
                  <button
                    key={ind}
                    onClick={() => setWizard(w => ({ ...w, industry: ind }))}
                    className="text-left px-3 py-2 rounded-lg border transition-colors"
                    style={{
                      background: wizard.industry === ind ? 'rgba(124, 58, 237, 0.15)' : 'rgba(39,39,42,0.5)',
                      borderColor: wizard.industry === ind ? '#7c3aed' : 'rgba(39,39,42,0.6)',
                      color: '#E2E8F0',
                      fontSize: '14px',
                    }}
                  >
                    {ind}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label style={{ ...TEXT.label, display: 'block', marginBottom: '6px' }}>Country *</label>
                <select
                  value={wizard.country}
                  onChange={(e) => {
                    const c = COUNTRIES.find(x => x.code === e.target.value);
                    setWizard(w => ({
                      ...w,
                      country: e.target.value,
                      currency: c?.currency || w.currency,
                      locale: c?.locale || w.locale,
                    }));
                  }}
                  className="w-full h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-violet-500 focus:outline-none"
                  style={{ fontSize: '14px' }}
                >
                  {COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ ...TEXT.label, display: 'block', marginBottom: '6px' }}>Currency</label>
                <input
                  value={wizard.currency}
                  onChange={(e) => setWizard(w => ({ ...w, currency: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-violet-500 focus:outline-none"
                  style={{ fontSize: '14px' }}
                />
              </div>
              <div>
                <label style={{ ...TEXT.label, display: 'block', marginBottom: '6px' }}>Locale</label>
                <input
                  value={wizard.locale}
                  onChange={(e) => setWizard(w => ({ ...w, locale: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-violet-500 focus:outline-none"
                  style={{ fontSize: '14px' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Scale */}
        {step === 'scale' && (
          <div className="space-y-5">
            <h3 style={TEXT.heading}>How many people or locations do you manage?</h3>
            <p style={TEXT.secondary}>This determines the recommended subscription tier.</p>
            <div className="space-y-3">
              {SCALE_OPTIONS.map(opt => (
                <button
                  key={opt.tier}
                  onClick={() => setWizard(w => ({
                    ...w,
                    tier: opt.tier,
                    experienceTier: opt.tier === 'inicio' || opt.tier === 'crecimiento' ? w.experienceTier === 'strategic' ? 'guided' : w.experienceTier : w.experienceTier,
                  }))}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors"
                  style={{
                    background: wizard.tier === opt.tier ? 'rgba(124, 58, 237, 0.15)' : 'rgba(39,39,42,0.5)',
                    borderColor: wizard.tier === opt.tier ? '#7c3aed' : 'rgba(39,39,42,0.6)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                      style={{ borderColor: wizard.tier === opt.tier ? '#7c3aed' : '#52525b' }}
                    >
                      {wizard.tier === opt.tier && <div className="w-3 h-3 rounded-full" style={{ background: '#7c3aed' }} />}
                    </div>
                    <span style={{ ...TEXT.body, fontWeight: 500 }}>{opt.label}</span>
                  </div>
                  <div className="text-right">
                    <span style={{ color: '#a5b4fc', fontSize: '14px', fontWeight: 600 }}>{TIER_LABELS[opt.tier]}</span>
                    <span style={{ ...TEXT.secondary, display: 'block', fontSize: '12px' }}>${PLATFORM_FEES[opt.tier].toLocaleString()}/mo platform</span>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ background: 'rgba(124, 58, 237, 0.08)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
              <p style={{ ...TEXT.body, fontWeight: 600 }}>Recommended: {TIER_LABELS[wizard.tier]}</p>
              <p style={TEXT.secondary}>{TIER_ENTITY_LIMITS[wizard.tier]} entities — ${PLATFORM_FEES[wizard.tier].toLocaleString()}/month platform fee</p>
            </div>
          </div>
        )}

        {/* Step 3: Use Case */}
        {step === 'usecase' && (
          <div className="space-y-5">
            <h3 style={TEXT.heading}>What do you want to automate?</h3>
            <p style={TEXT.secondary}>Select at least one module. Each module adds domain-specific capabilities.</p>
            <div className="space-y-3">
              {(Object.entries(MODULE_INFO) as [ModuleKey, typeof MODULE_INFO.icm][]).map(([key, info]) => {
                const selected = wizard.modules.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setWizard(w => ({
                        ...w,
                        modules: selected ? w.modules.filter(m => m !== key) : [...w.modules, key],
                      }));
                    }}
                    className="w-full flex items-center justify-between px-4 py-4 rounded-lg border transition-colors text-left"
                    style={{
                      background: selected ? 'rgba(52, 211, 153, 0.08)' : 'rgba(39,39,42,0.5)',
                      borderColor: selected ? '#34d399' : 'rgba(39,39,42,0.6)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0"
                        style={{
                          borderColor: selected ? '#34d399' : '#52525b',
                          background: selected ? '#34d399' : 'transparent',
                        }}
                      >
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div>
                        <p style={{ ...TEXT.body, fontWeight: 600 }}>{info.name}</p>
                        <p style={TEXT.secondary}>{info.description}</p>
                      </div>
                    </div>
                    <span style={{ color: '#94A3B8', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      ${MODULE_FEES[key]?.[wizard.tier]?.toLocaleString()}/mo
                    </span>
                  </button>
                );
              })}
            </div>
            {wizard.modules.length >= 2 && (
              <div style={{ background: 'rgba(52, 211, 153, 0.08)', borderRadius: '12px', padding: '12px 16px', border: '1px solid rgba(52, 211, 153, 0.2)' }}>
                <p style={{ color: '#34d399', fontSize: '14px', fontWeight: 500 }}>
                  {Math.round(bill.bundleDiscount * 100)}% bundle discount applied
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Complexity */}
        {step === 'complexity' && (
          <div className="space-y-5">
            <h3 style={TEXT.heading}>How complex are your rules?</h3>
            <p style={TEXT.secondary}>This helps us estimate your consumption requirements.</p>
            <div className="space-y-3">
              {[
                { value: 'simple', label: 'Simple', desc: '1-2 metrics per person/location' },
                { value: 'moderate', label: 'Moderate', desc: '3-5 metrics with tiers' },
                { value: 'complex', label: 'Complex', desc: '6+ metrics, multiple plans, gates, accelerators' },
                { value: 'unsure', label: 'Not sure', desc: 'Default to Moderate' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setWizard(w => ({ ...w, complexity: opt.value === 'unsure' ? 'moderate' : opt.value }))}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left"
                  style={{
                    background: wizard.complexity === opt.value || (opt.value === 'unsure' && wizard.complexity === 'moderate') ? 'rgba(124, 58, 237, 0.15)' : 'rgba(39,39,42,0.5)',
                    borderColor: wizard.complexity === opt.value ? '#7c3aed' : 'rgba(39,39,42,0.6)',
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: wizard.complexity === opt.value ? '#7c3aed' : '#52525b' }}
                  >
                    {wizard.complexity === opt.value && <div className="w-3 h-3 rounded-full" style={{ background: '#7c3aed' }} />}
                  </div>
                  <div>
                    <p style={{ ...TEXT.body, fontWeight: 500 }}>{opt.label}</p>
                    <p style={TEXT.secondary}>{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Experience */}
        {step === 'experience' && (
          <div className="space-y-5">
            <h3 style={TEXT.heading}>What level of support do you need?</h3>
            <p style={TEXT.secondary}>Choose the experience tier that best fits the team.</p>
            <div className="space-y-3">
              {(Object.entries(EXPERIENCE_INFO) as [ExperienceTier, typeof EXPERIENCE_INFO.self_service][]).map(([key, info]) => {
                const restricted = info.restriction && SCALE_OPTIONS.findIndex(s => s.tier === info.restriction) > SCALE_OPTIONS.findIndex(s => s.tier === wizard.tier);
                const selected = wizard.experienceTier === key;
                const rateLabel = info.rate === 0 ? 'Included' : `+${Math.round(info.rate * 100)}% of contract`;
                return (
                  <button
                    key={key}
                    onClick={() => !restricted && setWizard(w => ({ ...w, experienceTier: key as ExperienceTier }))}
                    disabled={Boolean(restricted)}
                    className="w-full flex items-center justify-between px-4 py-4 rounded-lg border transition-colors text-left"
                    style={{
                      background: selected ? 'rgba(124, 58, 237, 0.15)' : 'rgba(39,39,42,0.5)',
                      borderColor: selected ? '#7c3aed' : 'rgba(39,39,42,0.6)',
                      opacity: restricted ? 0.4 : 1,
                      cursor: restricted ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: selected ? '#7c3aed' : '#52525b' }}
                      >
                        {selected && <div className="w-3 h-3 rounded-full" style={{ background: '#7c3aed' }} />}
                      </div>
                      <div>
                        <p style={{ ...TEXT.body, fontWeight: 600 }}>{info.name}</p>
                        <p style={TEXT.secondary}>{info.description}</p>
                        {restricted && <p style={{ color: '#f87171', fontSize: '12px', marginTop: '4px' }}>Requires {TIER_LABELS[info.restriction as TenantTier]}+ tier</p>}
                      </div>
                    </div>
                    <span style={{ color: info.rate === 0 ? '#34d399' : '#a5b4fc', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {rateLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 6: Review & Confirm */}
        {step === 'review' && (
          <div className="space-y-5">
            <h3 style={TEXT.heading}>Review & Confirm</h3>
            <p style={TEXT.secondary}>Verify the configuration before creating the tenant.</p>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <span style={TEXT.label}>Organization</span>
                  <p style={{ ...TEXT.body, fontWeight: 600, marginTop: '4px' }}>{wizard.name}</p>
                  <p style={TEXT.secondary}>{wizard.industry} · {COUNTRIES.find(c => c.code === wizard.country)?.name} · {wizard.currency}</p>
                </div>
                <div>
                  <span style={TEXT.label}>Tier</span>
                  <p style={{ ...TEXT.body, fontWeight: 600, marginTop: '4px' }}>{TIER_LABELS[wizard.tier]} ({TIER_ENTITY_LIMITS[wizard.tier]} entities)</p>
                  <p style={TEXT.secondary}>${PLATFORM_FEES[wizard.tier].toLocaleString()}/month platform</p>
                </div>
                <div>
                  <span style={TEXT.label}>Modules</span>
                  <div className="mt-1 space-y-1">
                    {wizard.modules.map(m => (
                      <p key={m} style={TEXT.body}>{MODULE_INFO[m].name} — ${MODULE_FEES[m]?.[wizard.tier]?.toLocaleString()}/mo</p>
                    ))}
                    {bill.bundleDiscount > 0 && (
                      <p style={{ color: '#34d399', fontSize: '13px' }}>{Math.round(bill.bundleDiscount * 100)}% bundle discount</p>
                    )}
                  </div>
                </div>
                <div>
                  <span style={TEXT.label}>Experience</span>
                  <p style={{ ...TEXT.body, fontWeight: 600, marginTop: '4px' }}>
                    {EXPERIENCE_INFO[wizard.experienceTier].name}
                    {bill.experienceFee > 0 && ` — $${bill.experienceFee.toLocaleString()}/mo`}
                    {bill.experienceFee === 0 && ' — Included'}
                  </p>
                </div>
              </div>

              {/* Pricing summary */}
              <div style={{ background: 'rgba(124, 58, 237, 0.08)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
                <span style={TEXT.label}>Pricing Summary</span>
                <div className="space-y-2 mt-3">
                  <div className="flex justify-between">
                    <span style={TEXT.secondary}>Platform fee</span>
                    <span style={{ ...TEXT.body, fontVariantNumeric: 'tabular-nums' }}>${bill.platformFee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={TEXT.secondary}>Modules</span>
                    <span style={{ ...TEXT.body, fontVariantNumeric: 'tabular-nums' }}>${bill.discountedModules.toLocaleString()}</span>
                  </div>
                  {bill.experienceFee > 0 && (
                    <div className="flex justify-between">
                      <span style={TEXT.secondary}>Experience</span>
                      <span style={{ ...TEXT.body, fontVariantNumeric: 'tabular-nums' }}>${bill.experienceFee.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid rgba(124, 58, 237, 0.3)', paddingTop: '8px', marginTop: '8px' }}>
                    <div className="flex justify-between">
                      <span style={{ ...TEXT.body, fontWeight: 700 }}>Monthly</span>
                      <span style={{ ...TEXT.hero, fontSize: '24px' }}>${bill.monthlyTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span style={TEXT.secondary}>Annual (20% off)</span>
                      <span style={{ color: '#34d399', fontSize: '16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${bill.annualTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {createResult && !createResult.success && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '12px 16px' }}>
                <p style={{ color: '#f87171', fontSize: '14px' }}>{createResult.error}</p>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6" style={{ borderTop: '1px solid rgba(39,39,42,0.6)' }}>
          <button
            onClick={goBack}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ ...TEXT.body, color: '#94A3B8' }}
          >
            <ArrowLeft className="h-4 w-4" />
            {stepIndex === 0 ? 'Cancel' : 'Back'}
          </button>
          <button
            onClick={goNext}
            disabled={!canNext() || isCreating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors"
            style={{
              background: canNext() && !isCreating ? (step === 'review' ? '#34d399' : '#7c3aed') : '#27272a',
              color: canNext() && !isCreating ? '#fff' : '#52525b',
              fontSize: '14px',
              cursor: canNext() && !isCreating ? 'pointer' : 'not-allowed',
            }}
          >
            {isCreating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
            ) : step === 'review' ? (
              <><Rocket className="h-4 w-4" /> Create Tenant</>
            ) : (
              <>Next <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──── POST-CREATION SCREEN WITH INVITE ──── */
function PostCreationScreen({ tenantName, tenantId, onDone }: { tenantName: string; tenantId: string; onDone: () => void }) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('tenant_admin');
  const [inviteLang, setInviteLang] = useState('es');
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [invitedUsers, setInvitedUsers] = useState<Array<{ email: string; role: string }>>([]);

  const handleInvite = async () => {
    if (!inviteEmail || !inviteName) return;
    setIsInviting(true);
    setInviteStatus(null);

    try {
      const res = await fetch('/api/platform/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          displayName: inviteName,
          tenantId,
          roleTemplate: inviteRole,
          language: inviteLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteStatus({ type: 'error', message: data.error || 'Invite failed' });
      } else {
        setInviteStatus({ type: 'success', message: `${inviteEmail} invited as ${data.user.role}` });
        setInvitedUsers(prev => [...prev, { email: inviteEmail, role: data.user.role }]);
        setInviteEmail('');
        setInviteName('');
      }
    } catch {
      setInviteStatus({ type: 'error', message: 'Network error' });
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success banner */}
      <div style={CARD_STYLE} className="text-center py-8">
        <CheckCircle className="h-14 w-14 mx-auto" style={{ color: '#34d399' }} />
        <h2 style={{ ...TEXT.heading, marginTop: '12px' }}>Tenant Created</h2>
        <p style={{ ...TEXT.body, marginTop: '4px' }}>{tenantName} is ready for onboarding.</p>
      </div>

      {/* Invite admin form */}
      <div style={CARD_STYLE}>
        {!showInvite ? (
          <div className="flex items-center justify-between">
            <div>
              <h3 style={TEXT.heading}>Invite First Admin</h3>
              <p style={TEXT.secondary}>Create the initial admin user for this tenant.</p>
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium"
              style={{ background: '#7c3aed', color: '#fff', fontSize: '14px' }}
            >
              <UserPlus className="h-4 w-4" /> Invite Admin
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 style={TEXT.heading}>Invite User to {tenantName}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ ...TEXT.label, display: 'block', marginBottom: '6px' }}>Email *</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="w-full h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                  style={{ fontSize: '14px' }}
                />
              </div>
              <div>
                <label style={{ ...TEXT.label, display: 'block', marginBottom: '6px' }}>Display Name *</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                  style={{ fontSize: '14px' }}
                />
              </div>
              <div>
                <label style={{ ...TEXT.label, display: 'block', marginBottom: '6px' }}>Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-violet-500 focus:outline-none"
                  style={{ fontSize: '14px' }}
                >
                  <option value="tenant_admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="individual">Rep</option>
                </select>
              </div>
              <div>
                <label style={{ ...TEXT.label, display: 'block', marginBottom: '6px' }}>Language</label>
                <select
                  value={inviteLang}
                  onChange={(e) => setInviteLang(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-violet-500 focus:outline-none"
                  style={{ fontSize: '14px' }}
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleInvite}
                disabled={isInviting || !inviteEmail || !inviteName}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors"
                style={{
                  background: inviteEmail && inviteName ? '#7c3aed' : '#27272a',
                  color: inviteEmail && inviteName ? '#fff' : '#52525b',
                  fontSize: '14px',
                  cursor: inviteEmail && inviteName ? 'pointer' : 'not-allowed',
                }}
              >
                {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isInviting ? 'Inviting...' : 'Send Invite'}
              </button>
            </div>
            {inviteStatus && (
              <div
                className="px-4 py-2 rounded-lg"
                style={{
                  background: inviteStatus.type === 'success' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${inviteStatus.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  color: inviteStatus.type === 'success' ? '#34d399' : '#f87171',
                  fontSize: '14px',
                }}
              >
                {inviteStatus.message}
              </div>
            )}
            {invitedUsers.length > 0 && (
              <div className="mt-3">
                <span style={TEXT.label}>Invited Users</span>
                <div className="mt-2 space-y-1">
                  {invitedUsers.map((u, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" style={{ color: '#34d399' }} />
                      <span style={TEXT.body}>{u.email}</span>
                      <span style={{ ...TEXT.secondary, fontSize: '12px' }}>({u.role})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Done button */}
      <div className="flex justify-end">
        <button
          onClick={onDone}
          className="px-5 py-2.5 rounded-lg font-medium"
          style={{ background: '#34d399', color: '#0A0E1A', fontSize: '14px' }}
        >
          Done — Back to Pipeline
        </button>
      </div>
    </div>
  );
}
