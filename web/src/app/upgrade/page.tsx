'use client';

/**
 * Upgrade / Pricing Page
 *
 * Displays platform tiers with module add-ons.
 * Calls /api/billing/checkout to create Stripe Checkout Session.
 * Auto-recommends tier based on tenant entity count.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import {
  PLATFORM_TIERS,
  MODULE_PRICES,
  calculateMonthlyTotal,
  getBundleDiscount,
} from '@/lib/stripe/config';

export default function UpgradePage() {
  const { currentTenant } = useTenant();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get('cancelled') === 'true';

  const [selectedTier, setSelectedTier] = useState<string>('crecimiento');
  const [selectedModules, setSelectedModules] = useState<string[]>(['icm']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Billable tiers only (skip Free and Corporativo)
  const billableTiers = PLATFORM_TIERS.filter(t => t.monthlyPrice > 0 && t.id !== 'corporativo');
  const addOnModules = MODULE_PRICES.filter(m => m.monthlyPrice > 0);

  const monthlyTotal = useMemo(
    () => calculateMonthlyTotal(selectedTier, selectedModules),
    [selectedTier, selectedModules],
  );

  const bundleDiscount = useMemo(
    () => getBundleDiscount(selectedModules.length),
    [selectedModules.length],
  );

  function toggleModule(moduleId: string) {
    setSelectedModules(prev =>
      prev.includes(moduleId)
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId],
    );
  }

  async function handleSubscribe() {
    if (!currentTenant?.id) {
      setError('No tenant selected.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: currentTenant.id,
          tier: selectedTier,
          modules: selectedModules,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create checkout session');

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#020617', padding: '40px 24px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#F8FAFC', marginBottom: '8px' }}>
            Choose Your Plan
          </h1>
          <p style={{ fontSize: '16px', color: '#94A3B8', maxWidth: '600px', margin: '0 auto' }}>
            Scale your sales performance management with the right tier and modules for your team.
          </p>
          {cancelled && (
            <div style={{
              marginTop: '16px',
              padding: '12px 20px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '8px',
              color: '#F59E0B',
              fontSize: '14px',
              display: 'inline-block',
            }}>
              Checkout was cancelled. You can try again when you&apos;re ready.
            </div>
          )}
        </div>

        {/* Tier Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '40px',
        }}>
          {billableTiers.map(tier => {
            const isSelected = selectedTier === tier.id;
            const isRecommended = tier.recommended;

            return (
              <div
                key={tier.id}
                onClick={() => !tier.contactSales && setSelectedTier(tier.id)}
                style={{
                  background: isSelected ? 'rgba(45, 47, 143, 0.2)' : '#0F172A',
                  border: isSelected
                    ? '2px solid #2D2F8F'
                    : isRecommended
                      ? '2px solid rgba(232, 168, 56, 0.4)'
                      : '1px solid #1E293B',
                  borderRadius: '12px',
                  padding: '24px',
                  cursor: tier.contactSales ? 'default' : 'pointer',
                  position: 'relative',
                  transition: 'border-color 0.2s',
                }}
              >
                {isRecommended && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#E8A838',
                    color: '#0F172A',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 12px',
                    borderRadius: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    Recommended
                  </div>
                )}

                <div style={{ fontSize: '18px', fontWeight: 600, color: '#F8FAFC', marginBottom: '4px' }}>
                  {tier.name}
                </div>
                <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '16px' }}>
                  {tier.description}
                </div>

                <div style={{ marginBottom: '16px' }}>
                  {tier.contactSales ? (
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#E8A838' }}>
                      Contact Us
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: '32px', fontWeight: 700, color: '#F8FAFC' }}>
                        ${tier.monthlyPrice.toLocaleString()}
                      </span>
                      <span style={{ fontSize: '14px', color: '#64748B' }}>/mo</span>
                    </>
                  )}
                </div>

                <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '8px' }}>
                  Up to {tier.entityLimit.toLocaleString()} entities
                </div>
                <div style={{ fontSize: '13px', color: '#94A3B8' }}>
                  {tier.userLimit} users
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
                  {tier.features.map((feat, i) => (
                    <li key={i} style={{
                      fontSize: '12px',
                      color: '#CBD5E1',
                      padding: '3px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <span style={{ color: '#22C55E', fontSize: '14px' }}>&#10003;</span>
                      {feat}
                    </li>
                  ))}
                </ul>

                {isSelected && !tier.contactSales && (
                  <div style={{
                    marginTop: '12px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: '#2D2F8F',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    Selected
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Module Add-Ons */}
        <div style={{
          background: '#0F172A',
          border: '1px solid #1E293B',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '32px',
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#F8FAFC', marginBottom: '4px' }}>
            Add-On Modules
          </h2>
          <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '16px' }}>
            Extend your platform with specialized capabilities.
            {bundleDiscount > 0 && (
              <span style={{ color: '#22C55E', fontWeight: 600, marginLeft: '8px' }}>
                {Math.round(bundleDiscount * 100)}% bundle discount applied!
              </span>
            )}
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}>
            {addOnModules.map(mod => {
              const isSelected = selectedModules.includes(mod.id);
              return (
                <div
                  key={mod.id}
                  onClick={() => toggleModule(mod.id)}
                  style={{
                    background: isSelected ? 'rgba(45, 47, 143, 0.15)' : '#0B1120',
                    border: isSelected ? '1px solid #2D2F8F' : '1px solid #1E293B',
                    borderRadius: '8px',
                    padding: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    border: isSelected ? '2px solid #2D2F8F' : '2px solid #475569',
                    background: isSelected ? '#2D2F8F' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}>
                    {isSelected && (
                      <span style={{ color: 'white', fontSize: '12px', fontWeight: 700 }}>&#10003;</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC' }}>
                      {mod.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                      {mod.description}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#E8A838', marginTop: '6px' }}>
                      +${mod.monthlyPrice}/mo
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Summary + Subscribe */}
        <div style={{
          background: '#0F172A',
          border: '1px solid #E8A838',
          borderRadius: '12px',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <div>
            <div style={{ fontSize: '14px', color: '#94A3B8' }}>Monthly Total</div>
            <div style={{ fontSize: '36px', fontWeight: 700, color: '#F8FAFC' }}>
              ${monthlyTotal.toLocaleString()}
              <span style={{ fontSize: '16px', color: '#64748B', fontWeight: 400 }}>/mo</span>
            </div>
            {bundleDiscount > 0 && (
              <div style={{ fontSize: '12px', color: '#22C55E' }}>
                Includes {Math.round(bundleDiscount * 100)}% bundle discount
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            {error && (
              <div style={{ fontSize: '13px', color: '#EF4444' }}>
                {error}
              </div>
            )}
            <button
              onClick={handleSubscribe}
              disabled={loading}
              style={{
                background: loading ? '#475569' : '#2D2F8F',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '14px 40px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'background 0.2s',
              }}
            >
              {loading ? 'Redirecting to Checkout...' : 'Subscribe'}
            </button>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              Secure payment via Stripe. Cancel anytime.
            </div>
          </div>
        </div>

        {/* Corporativo CTA */}
        <div style={{
          textAlign: 'center',
          marginTop: '32px',
          padding: '24px',
          background: '#0F172A',
          border: '1px solid #1E293B',
          borderRadius: '12px',
        }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#F8FAFC', marginBottom: '4px' }}>
            Enterprise / Corporativo
          </div>
          <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '12px' }}>
            For organizations with 10,000+ entities or custom requirements.
          </p>
          <a
            href="mailto:sales@compensationcloud.io"
            style={{
              display: 'inline-block',
              background: 'transparent',
              color: '#E8A838',
              border: '1px solid #E8A838',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            Contact Sales
          </a>
        </div>

      </div>
    </div>
  );
}
