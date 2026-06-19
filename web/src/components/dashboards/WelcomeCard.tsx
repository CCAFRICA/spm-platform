'use client';

/**
 * WelcomeCard — Guided Proof of Value Entry Point
 *
 * Shown when a tenant has zero calculation results.
 * Three steps to first calculation:
 *   1. Upload your plan
 *   2. Upload your data
 *   3. See your results
 *
 * OB-60 Phase 2: Replaces empty dashboard for new self-service tenants.
 */

import Link from 'next/link';
import { useTenant } from '@/contexts/tenant-context';
import { Upload, FileText, BarChart3, CheckCircle } from 'lucide-react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

interface WelcomeCardProps {
  hasPlans: boolean;
  hasData: boolean;
  hasResults: boolean;
}

export function WelcomeCard({ hasPlans, hasData, hasResults }: WelcomeCardProps) {
  const { currentTenant } = useTenant();
  const orgName = currentTenant?.name || 'your organization';
  const isVialuce = useIsVialuce(); // HF-315: white panel already (--strag-panel) but dark text/borders regress

  // Theme-aware surface chrome + text. Non-Vialuce keeps the exact dark literals (byte-identical).
  const cardBorder = isVialuce ? 'var(--vl-line)' : '#1E293B';
  const cardShadow = isVialuce ? 'var(--vl-sh-1)' : undefined;
  const headingColor = isVialuce ? 'var(--vl-text)' : '#F8FAFC';     // replaces #F8FAFC
  const bodyColor = isVialuce ? 'var(--vl-text-muted)' : '#CBD5E1';  // replaces #CBD5E1
  const stepBorder = isVialuce ? 'var(--vl-line)' : '#1E293B';
  const stepBg = isVialuce ? 'var(--vl-bg)' : 'rgba(30, 41, 59, 0.5)';
  const stepDesc = isVialuce ? 'var(--vl-text-soft)' : '#94A3B8';    // replaces #94A3B8
  const lockedColor = isVialuce ? 'var(--vl-text-soft)' : '#64748B'; // replaces #64748B

  const steps = [
    {
      number: 1,
      label: 'Upload Your Plan',
      description: 'Import your compensation plan document',
      href: '/operate/import',
      done: hasPlans,
      icon: FileText,
    },
    {
      number: 2,
      label: 'Upload Your Data',
      description: 'Import your sales or performance data',
      href: '/data/import',
      done: hasData,
      icon: Upload,
    },
    {
      number: 3,
      label: 'See Your Results',
      description: 'Run a calculation and view results',
      href: '/operate/calculate',
      done: hasResults,
      icon: BarChart3,
      locked: !hasPlans || !hasData,
    },
  ];

  return (
    <div style={{
      background: 'var(--strag-panel)',
      border: `1px solid ${cardBorder}`,
      borderRadius: isVialuce ? 'var(--vl-r-lg)' : '16px',
      padding: '40px 32px',
      maxWidth: '640px',
      margin: '0 auto',
      boxShadow: cardShadow,
    }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: headingColor, marginTop: 0, marginBottom: '8px' }}>
        Welcome to Vialuce, {orgName}!
      </h2>
      <p style={{ fontSize: '15px', color: bodyColor, marginBottom: '32px' }}>
        Let&apos;s get your first calculation running. Three steps, five minutes.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
        {steps.map(step => {
          const Icon = step.icon;
          const isLocked = 'locked' in step && step.locked;

          return (
            <div
              key={step.number}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px',
                background: step.done ? 'rgba(16, 185, 129, 0.08)' : stepBg,
                border: `1px solid ${step.done ? 'rgba(16, 185, 129, 0.3)' : stepBorder}`,
                borderRadius: '10px',
                opacity: isLocked ? 0.5 : 1,
              }}
            >
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: step.done ? 'rgba(16, 185, 129, 0.15)' : (isVialuce ? 'var(--vl-indigo-50)' : 'rgba(45, 47, 143, 0.15)'),
                flexShrink: 0,
              }}>
                {step.done ? (
                  <CheckCircle size={18} style={{ color: '#10B981' }} />
                ) : (
                  <Icon size={18} style={{ color: isVialuce ? 'var(--vialuce-indigo)' : '#7B7FD4' }} />
                )}
              </div>

              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 600, color: headingColor, margin: 0 }}>
                  {step.label}
                </p>
                <p style={{ fontSize: '13px', color: stepDesc, margin: '2px 0 0' }}>
                  {step.description}
                </p>
              </div>

              {!step.done && !isLocked && (
                <Link
                  href={step.href}
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    background: '#2D2F8F',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Start
                </Link>
              )}
              {isLocked && (
                <span style={{ fontSize: '13px', color: lockedColor, whiteSpace: 'nowrap' }}>
                  Complete steps 1 &amp; 2
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Trial badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        background: 'rgba(232, 168, 56, 0.1)',
        border: '1px solid rgba(232, 168, 56, 0.2)',
        borderRadius: '8px',
        fontSize: '14px',
        color: '#E8A838',
      }}>
        14-day free trial
      </div>
    </div>
  );
}
