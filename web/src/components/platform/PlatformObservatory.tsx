'use client';

/**
 * Platform Observatory — VL Admin Command Center
 *
 * OB-60 Phase 5: Consolidated from 6 tabs to 3:
 *   - Command Center: fleet health, operations queue, tenant cards
 *   - Intelligence: AI metrics, classification accuracy, data quality
 *   - Revenue: MRR breakdown, per-tenant billing, usage metering
 *
 * Infrastructure → merged into Command Center (issues show as queue items)
 * Onboarding → merged into Command Center (progress shows on tenant cards)
 * Ingestion → merged into Intelligence (data quality is part of AI story)
 */

import { useState, Suspense, lazy } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  Activity,
  Sparkles,
  Receipt,
  LogOut,
  Loader2,
} from 'lucide-react';

// Lazy-load tab components
const ObservatoryTab = lazy(() => import('./ObservatoryTab').then(m => ({ default: m.ObservatoryTab })));
const AIIntelligenceTab = lazy(() => import('./AIIntelligenceTab').then(m => ({ default: m.AIIntelligenceTab })));
const BillingUsageTab = lazy(() => import('./BillingUsageTab').then(m => ({ default: m.BillingUsageTab })));

type TabId = 'command-center' | 'intelligence' | 'revenue';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ style?: React.CSSProperties }> }[] = [
  { id: 'command-center', label: 'Command Center', icon: Activity },
  { id: 'intelligence', label: 'Intelligence', icon: Sparkles },
  { id: 'revenue', label: 'Revenue', icon: Receipt },
];

export function PlatformObservatory() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('command-center');

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#E2E8F0', fontSize: '14px' }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        borderBottom: '1px solid #1E293B',
        background: 'rgba(2, 6, 23, 0.95)',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 24px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #2D2F8F, #4845E4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF' }}>V</span>
            </div>
            <div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC' }}>Platform Observatory</span>
              <span style={{ color: '#94A3B8', fontSize: '13px', marginLeft: '8px' }}>Vialuce</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: '#94A3B8', fontSize: '14px' }}>{user?.email}</span>
            <button
              onClick={logout}
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
              }}
            >
              <LogOut style={{ width: '16px', height: '16px' }} />
            </button>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <div style={{ borderBottom: '1px solid #1E293B' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
          <nav style={{ display: 'flex', gap: '4px' }}>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 16px',
                    fontSize: '14px',
                    fontWeight: 500,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    borderBottom: `2px solid ${isActive ? '#E8A838' : 'transparent'}`,
                    color: isActive ? '#F8FAFC' : '#94A3B8',
                    transition: 'color 0.15s, border-color 0.15s',
                    marginBottom: '-1px',
                  }}
                >
                  <Icon style={{ width: '16px', height: '16px' }} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }}>
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <Loader2 style={{ width: '24px', height: '24px', color: '#7B7FD4', animation: 'spin 1s linear infinite' }} />
          </div>
        }>
          {activeTab === 'command-center' && <ObservatoryTab />}
          {activeTab === 'intelligence' && <AIIntelligenceTab />}
          {activeTab === 'revenue' && <BillingUsageTab />}
        </Suspense>
      </main>
    </div>
  );
}
