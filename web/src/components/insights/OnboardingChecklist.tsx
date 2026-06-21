'use client';

/**
 * OB-227 — OnboardingChecklist (Cluster D). The empty-tenant → first-payout journey, replacing the
 * blank "No periods configured" landing. Step status derives from getTenantOnboardingState (real
 * substrate counts); CTAs route to the real pages. Korean Test: copy via useLocale().t with English
 * fallbacks; no tenant/field hardcoding.
 */
import { useRouter } from 'next/navigation';
import { Check, Circle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/contexts/locale-context';
import type { TenantOnboardingState } from '@/lib/insights';

interface Step {
  key: string;
  title: string;
  done: boolean;
  detail: string;
  cta?: { label: string; href: string };
  gated?: boolean;
  gatedMessage?: string;
}

export function OnboardingChecklist({ state }: { state: TenantOnboardingState; tenantId?: string }) {
  const router = useRouter();
  const { t } = useLocale();
  const tr = (k: string, fallback: string) => { const v = t(k); return v === k ? fallback : v; };

  const setupComplete = state.has_plan && state.has_data && state.has_periods;
  const approved = (state.latest_lifecycle_state ?? '').toUpperCase().startsWith('APPROV');

  const steps: Step[] = [
    { key: 'plan', title: tr('onboarding.plan', 'Upload your compensation plan'), done: state.has_plan,
      detail: state.has_plan ? (state.plan_name ?? '') : tr('onboarding.plan.detail', 'Define how reps earn — the platform interprets it for you.'),
      cta: state.has_plan ? undefined : { label: tr('onboarding.plan.cta', 'Upload Plan →'), href: '/data/import' } },
    { key: 'data', title: tr('onboarding.data', 'Upload your data'), done: state.has_data,
      detail: state.has_data ? `${state.import_count} ${tr('onboarding.data.imports', 'imports')}` : tr('onboarding.data.detail', 'Bring transactions, attainment, and roster.'),
      cta: state.has_data ? undefined : { label: tr('onboarding.data.cta', 'Upload Data →'), href: '/data/import' } },
    { key: 'periods', title: tr('onboarding.periods', 'Configure periods'), done: state.has_periods,
      detail: state.has_periods ? `${state.period_count} ${tr('onboarding.periods.count', 'periods')}` : tr('onboarding.periods.detail', 'Auto-detect from your data or create them manually.'),
      cta: state.has_periods ? undefined : { label: tr('onboarding.periods.cta', 'Configure Periods →'), href: '/configure/periods' } },
    { key: 'calc', title: tr('onboarding.calc', 'Run your first calculation'), done: state.has_calculations,
      detail: state.has_calculations ? `${state.calculation_count} ${tr('onboarding.calc.runs', 'calculation runs')}` : tr('onboarding.calc.detail', 'The engine computes every payout, auditable to the row.'),
      cta: state.has_calculations ? undefined : (setupComplete ? { label: tr('onboarding.calc.cta', 'Calculate →'), href: '/operate/calculate' } : undefined),
      gated: !setupComplete && !state.has_calculations, gatedMessage: tr('onboarding.calc.gated', 'Complete steps 1–3 first') },
    { key: 'results', title: tr('onboarding.results', 'Review and verify results'), done: state.has_results,
      detail: state.has_results ? tr('onboarding.results.done', 'Results ready to review.') : tr('onboarding.results.detail', 'Distribution, components, and per-entity drill-through.'),
      cta: state.has_results ? { label: tr('onboarding.results.cta', 'View Results →'), href: '/insights/compensation' } : undefined,
      gated: !state.has_calculations, gatedMessage: tr('onboarding.results.gated', 'Available after calculation') },
    { key: 'approve', title: tr('onboarding.approve', 'Approve and export'), done: approved,
      detail: approved ? tr('onboarding.approve.done', 'Approved — ready to pay.') : tr('onboarding.approve.detail', 'Approve the run and export for payroll.'),
      cta: approved ? { label: tr('onboarding.approve.cta', 'Export →'), href: '/approvals' } : undefined,
      gated: !state.has_results, gatedMessage: tr('onboarding.approve.gated', 'Available after approval') },
  ];

  const currentIndex = steps.findIndex(s => !s.done);

  const props = [
    { title: tr('onboarding.vp1', 'Every calculation auditable'), body: tr('onboarding.vp1.body', 'Trace any payout to the exact rows and rule that produced it.') },
    { title: tr('onboarding.vp2', 'Full rep transparency'), body: tr('onboarding.vp2.body', 'Reps see their components, attainment, and how each dollar was earned.') },
    { title: tr('onboarding.vp3', 'Real-time manager visibility'), body: tr('onboarding.vp3.body', 'Managers see team performance and payout distribution as it changes.') },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{tr('onboarding.title', 'Get started')}</h2>
        <p className="text-sm text-muted-foreground">{tr('onboarding.subtitle', 'From an empty workspace to your first verified payout.')}</p>
      </div>

      <Card className="divide-y">
        {steps.map((s, i) => {
          const isCurrent = i === currentIndex;
          return (
            <div key={s.key} className={`flex items-start gap-3 p-4 ${isCurrent ? 'bg-[color:var(--vl-cta-signal,#E8A838)]/5' : ''}`}>
              <div className="mt-0.5 shrink-0">
                {s.done ? <Check className="h-5 w-5 text-[color:var(--vl-success,#15936A)]" />
                  : isCurrent ? <Loader2 className="h-5 w-5 text-[color:var(--vl-cta-signal,#E8A838)]" />
                  : <Circle className="h-5 w-5 text-muted-foreground/40" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${s.done ? '' : isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                  <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>{s.title}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{s.detail}</div>
              </div>
              <div className="shrink-0">
                {s.cta ? (
                  <Button size="sm" variant={isCurrent ? 'default' : 'outline'} onClick={() => router.push(s.cta!.href)}>{s.cta.label}</Button>
                ) : s.gated ? (
                  <span className="text-[11px] text-muted-foreground italic">{s.gatedMessage}</span>
                ) : s.done ? (
                  <span className="text-[11px] text-[color:var(--vl-success,#15936A)] font-medium">{tr('onboarding.complete', 'Complete')}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {props.map(p => (
          <Card key={p.title} className="p-4">
            <div className="text-sm font-semibold">{p.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{p.body}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
