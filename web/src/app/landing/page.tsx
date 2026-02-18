'use client';

/**
 * Public Landing Page — Vialuce Marketing Surface
 *
 * Accessible without authentication. Shows hero, value props,
 * competitive comparison, interactive pricing calculator, and CTAs.
 *
 * OB-60 Phase 0: The front door for every customer, investor, and tester.
 */

import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';

/* ═══════════════════════════════════════════════════
   PRICING DATA — mirrors Excel calculator
   ═══════════════════════════════════════════════════ */

const PLATFORM_TIERS = [
  { name: 'Inicio', maxEntities: 100, price: 299 },
  { name: 'Crecimiento', maxEntities: 1000, price: 999 },
  { name: 'Profesional', maxEntities: 10000, price: 2999 },
  { name: 'Empresarial', maxEntities: 50000, price: 7999 },
];

const MODULE_PRICES: Record<string, Record<string, number>> = {
  ICM:        { Inicio: 199, Crecimiento: 499, Profesional: 1499, Empresarial: 3999 },
  TFI:        { Inicio: 199, Crecimiento: 499, Profesional: 1499, Empresarial: 3999 },
  Projection: { Inicio: 149, Crecimiento: 0,   Profesional: 0,    Empresarial: 0 },
  Manager:    { Inicio: 99,  Crecimiento: 299, Profesional: 899,  Empresarial: 1999 },
  Dispute:    { Inicio: 99,  Crecimiento: 199, Profesional: 499,  Empresarial: 999 },
  Compliance: { Inicio: 0,   Crecimiento: 0,   Profesional: 499,  Empresarial: 999 },
};

const BUNDLE_DISCOUNTS: Record<number, number> = { 1: 0, 2: 0.10, 3: 0.15, 4: 0.20, 5: 0.22, 6: 0.25 };
const EXPERIENCE_RATES: Record<string, number> = { 'Self-Service': 0, 'Guided': 0.12, 'Strategic': 0.17 };
const COMPETITOR_PER_PAYEE = 65;

function detectTier(entityCount: number) {
  for (const tier of PLATFORM_TIERS) {
    if (entityCount <= tier.maxEntities) return tier;
  }
  return PLATFORM_TIERS[PLATFORM_TIERS.length - 1];
}

/* ═══════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════ */

export default function LandingPage() {
  const pricingRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ background: '#020617', color: '#E2E8F0', fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh' }}>
      {/* ─── HERO ─── */}
      <section
        style={{
          background: 'linear-gradient(180deg, #020617 0%, #0F172A 100%)',
          padding: '80px 24px 60px',
        }}
      >
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: '48px', fontWeight: 800, color: '#2D2F8F', letterSpacing: '-0.03em', margin: 0 }}>
            VIALUCE
          </h1>
          <p style={{ fontSize: '18px', color: '#E8A838', fontWeight: 600, marginTop: '8px', letterSpacing: '0.08em' }}>
            Intelligence. Acceleration. Performance.
          </p>

          <h2 style={{
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 700,
            color: '#F8FAFC',
            marginTop: '40px',
            lineHeight: 1.2,
          }}>
            Stop paying $65/payee for software that takes 3 months to implement.
          </h2>
          <p style={{ fontSize: '18px', color: '#CBD5E1', marginTop: '20px', lineHeight: 1.6, maxWidth: '700px', marginLeft: 'auto', marginRight: 'auto' }}>
            AI-powered performance intelligence. Upload your plan. See your calculations in 5 minutes. No implementation fee. No annual contract.
          </p>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '36px', flexWrap: 'wrap' }}>
            <Link
              href="/signup"
              style={{
                background: '#2D2F8F',
                color: '#FFFFFF',
                fontSize: '16px',
                fontWeight: 600,
                padding: '14px 32px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block',
                transition: 'background 0.2s',
              }}
            >
              Start Free &rarr;
            </Link>
            <button
              onClick={() => pricingRef.current?.scrollIntoView({ behavior: 'smooth' })}
              style={{
                background: 'transparent',
                border: '1px solid #4845E4',
                color: '#CBD5E1',
                fontSize: '16px',
                padding: '14px 32px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}
            >
              See Pricing
            </button>
          </div>
        </div>
      </section>

      {/* ─── VALUE PROPOSITIONS ─── */}
      <section style={{ padding: '60px 24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
          <ValueCard
            title="Intelligence"
            titleColor="#7B7FD4"
            description="Every calculation is auditable and explainable. AI interprets your compensation plan, maps your data, and calculates outcomes. Every step visible with confidence scores."
          />
          <ValueCard
            title="Acceleration"
            titleColor="#E8A838"
            description="From spreadsheet to calculated results in 5 minutes. Upload your plan document. Upload your data. See your results. No implementation project. No consultants."
          />
          <ValueCard
            title="Performance"
            titleColor="#10B981"
            description="Reps see their commissions the day after they earn them. Managers get coaching agendas. Admins get governance assessments. Everyone gets transparency."
          />
        </div>
      </section>

      {/* ─── COMPETITIVE COMPARISON ─── */}
      <section style={{ padding: '60px 24px', maxWidth: '900px', margin: '0 auto' }}>
        <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#F8FAFC', textAlign: 'center', marginBottom: '32px' }}>
          How Vialuce Compares
        </h3>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px', minWidth: '500px' }}>
            <thead>
              <tr style={{ background: '#1E293B' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, position: 'sticky', left: 0, background: '#1E293B', zIndex: 1 }}>Feature</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94A3B8', fontWeight: 600 }}>Industry Standard</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#E8A838', fontWeight: 600 }}>Vialuce</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Time to first calculation', '8-12 weeks', '5 minutes'],
                ['Implementation fee', '$3,000 - $50,000', '$0'],
                ['Per-payee cost', '$55-$75/month', 'From $2.99/entity'],
                ['Contract', 'Annual minimum', 'Monthly, cancel anytime'],
                ['Languages', 'English only', 'Spanish, English, Portuguese'],
                ['Pricing transparency', '"Contact Sales"', 'Visible on this page'],
              ].map(([feature, industry, vialuce], i) => (
                <tr key={feature} style={{ background: i % 2 === 0 ? '#0F172A' : '#0B1120', borderBottom: '1px solid #1E293B' }}>
                  <td style={{ padding: '12px 16px', color: '#CBD5E1', fontWeight: 500, position: 'sticky', left: 0, background: i % 2 === 0 ? '#0F172A' : '#0B1120', zIndex: 1 }}>{feature}</td>
                  <td style={{ padding: '12px 16px', color: '#94A3B8' }}>{industry}</td>
                  <td style={{ padding: '12px 16px', color: '#10B981', fontWeight: 600 }}>{vialuce}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── PRICING CALCULATOR ─── */}
      <section ref={pricingRef} id="pricing" style={{ padding: '60px 24px', maxWidth: '900px', margin: '0 auto' }}>
        <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#F8FAFC', textAlign: 'center', marginBottom: '8px' }}>
          Transparent Pricing
        </h3>
        <p style={{ fontSize: '15px', color: '#94A3B8', textAlign: 'center', marginBottom: '40px' }}>
          Slide, check, and see your real cost — no &ldquo;Contact Sales&rdquo; gate.
        </p>
        <PricingCalculator />
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={{ borderTop: '1px solid #1E293B', padding: '40px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: '15px', color: '#94A3B8', margin: 0 }}>
          Vialuce — Intelligence. Acceleration. Performance.
        </p>
        <p style={{ fontSize: '14px', color: '#64748B', marginTop: '8px' }}>
          &copy; 2026 Vialuce. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════ */

function ValueCard({ title, titleColor, description }: { title: string; titleColor: string; description: string }) {
  return (
    <div style={{
      background: '#0F172A',
      border: '1px solid #1E293B',
      borderRadius: '12px',
      padding: '24px',
    }}>
      <h4 style={{ fontSize: '20px', fontWeight: 700, color: titleColor, marginBottom: '12px', marginTop: 0 }}>
        {title}
      </h4>
      <p style={{ fontSize: '15px', color: '#CBD5E1', lineHeight: 1.6, margin: 0 }}>
        {description}
      </p>
    </div>
  );
}

function PricingCalculator() {
  const [entityCount, setEntityCount] = useState(50);
  const [selectedModules, setSelectedModules] = useState<string[]>(['ICM']);
  const [experience, setExperience] = useState('Self-Service');

  const moduleKeys = Object.keys(MODULE_PRICES);

  const toggleModule = (mod: string) => {
    setSelectedModules(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );
  };

  const pricing = useMemo(() => {
    const tier = detectTier(entityCount);
    const platform = tier.price;

    let modulesTotal = 0;
    for (const mod of selectedModules) {
      modulesTotal += MODULE_PRICES[mod]?.[tier.name] ?? 0;
    }

    const bundleCount = Math.min(selectedModules.length, 6);
    const bundleDiscount = BUNDLE_DISCOUNTS[bundleCount] ?? 0.25;
    const afterBundle = modulesTotal * (1 - bundleDiscount);

    const experienceSurcharge = EXPERIENCE_RATES[experience] ?? 0;
    const subtotal = platform + afterBundle;
    const total = Math.round(subtotal * (1 + experienceSurcharge));

    const competitor = entityCount * COMPETITOR_PER_PAYEE;
    const savings = competitor - total;
    const savingsPercent = competitor > 0 ? ((savings / competitor) * 100).toFixed(1) : '0';

    return { tier: tier.name, platform, total, competitor, savings, savingsPercent };
  }, [entityCount, selectedModules, experience]);

  return (
    <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: '12px', padding: '32px' }}>
      {/* Entity Slider */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#CBD5E1', marginBottom: '10px' }}>
          <span>Entities (people or locations)</span>
          <span style={{ color: '#F8FAFC', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{entityCount.toLocaleString()}</span>
        </label>
        <input
          type="range"
          min={10}
          max={50000}
          step={10}
          value={entityCount}
          onChange={e => setEntityCount(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#E8A838', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
          <span>10</span>
          <span>50,000</span>
        </div>
      </div>

      {/* Module Checkboxes */}
      <div style={{ marginBottom: '28px' }}>
        <p style={{ fontSize: '14px', color: '#CBD5E1', marginBottom: '10px' }}>Modules</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {moduleKeys.map(mod => {
            const selected = selectedModules.includes(mod);
            return (
              <button
                key={mod}
                onClick={() => toggleModule(mod)}
                style={{
                  background: selected ? 'rgba(45, 47, 143, 0.3)' : 'rgba(30, 41, 59, 0.5)',
                  border: `1px solid ${selected ? '#4845E4' : '#334155'}`,
                  color: selected ? '#C7D2FE' : '#94A3B8',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {selected ? '\u2611' : '\u2610'} {mod}
              </button>
            );
          })}
        </div>
      </div>

      {/* Experience Tier */}
      <div style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '14px', color: '#CBD5E1', marginBottom: '10px' }}>Experience Tier</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {Object.keys(EXPERIENCE_RATES).map(tier => {
            const selected = experience === tier;
            return (
              <button
                key={tier}
                onClick={() => setExperience(tier)}
                style={{
                  background: selected ? 'rgba(232, 168, 56, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                  border: `1px solid ${selected ? '#E8A838' : '#334155'}`,
                  color: selected ? '#E8A838' : '#94A3B8',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {tier}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      <div style={{
        background: '#020617',
        borderRadius: '10px',
        padding: '24px',
        border: '1px solid #1E293B',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '13px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', marginTop: 0 }}>
          Your Monthly Cost ({pricing.tier} tier)
        </p>
        <p style={{ fontSize: '40px', fontWeight: 800, color: '#F8FAFC', margin: '0 0 16px', fontVariantNumeric: 'tabular-nums' }}>
          ${pricing.total.toLocaleString()}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', flexWrap: 'wrap', fontSize: '14px', marginBottom: '20px' }}>
          <div>
            <span style={{ color: '#94A3B8' }}>Competitor cost: </span>
            <span style={{ color: '#EF4444', textDecoration: 'line-through' }}>${pricing.competitor.toLocaleString()}</span>
          </div>
          <div>
            <span style={{ color: '#94A3B8' }}>You save: </span>
            <span style={{ color: '#10B981', fontWeight: 700 }}>
              ${pricing.savings > 0 ? pricing.savings.toLocaleString() : 0}/mo ({pricing.savingsPercent}%)
            </span>
          </div>
        </div>
        <Link
          href="/signup"
          style={{
            display: 'inline-block',
            background: '#2D2F8F',
            color: '#FFFFFF',
            fontSize: '16px',
            fontWeight: 600,
            padding: '14px 40px',
            borderRadius: '8px',
            textDecoration: 'none',
            transition: 'background 0.2s',
          }}
        >
          Start Free &rarr;
        </Link>
      </div>
    </div>
  );
}
