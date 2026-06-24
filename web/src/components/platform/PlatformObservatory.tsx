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
  Settings,
  LogOut,
  Loader2,
  Cpu,
  DollarSign,
  Users,
  Brain,
} from 'lucide-react';

// Lazy-load tab components
const ObservatoryTab = lazy(() => import('./ObservatoryTab').then(m => ({ default: m.ObservatoryTab })));
const AIIntelligenceTab = lazy(() => import('./AIIntelligenceTab').then(m => ({ default: m.AIIntelligenceTab })));
const BillingUsageTab = lazy(() => import('./BillingUsageTab').then(m => ({ default: m.BillingUsageTab })));
const FeatureFlagsTab = lazy(() => import('./FeatureFlagsTab').then(m => ({ default: m.FeatureFlagsTab })));
// OB-215: model governance — per-task model control + per-call cost.
const ModelConfigTab = lazy(() => import('./ModelConfigTab').then(m => ({ default: m.ModelConfigTab })));
const AIMetricsTab = lazy(() => import('./AIMetricsTab').then(m => ({ default: m.AIMetricsTab })));
// OB-230: User Operations Console — per-user observability + remediation (platform.system_config).
const UsersTab = lazy(() => import('./UsersTab').then(m => ({ default: m.UsersTab })));
// OB-235 P8: the visible recognition curve (non-amnesiac behaviour per tenant).
const RecognitionCurvePanel = lazy(() => import('./RecognitionCurvePanel').then(m => ({ default: m.RecognitionCurvePanel })));

type TabId = 'command-center' | 'users' | 'intelligence' | 'recognition' | 'ai-models' | 'ai-cost' | 'revenue' | 'settings';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ style?: React.CSSProperties }> }[] = [
  { id: 'command-center', label: 'Command Center', icon: Activity },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'intelligence', label: 'Intelligence', icon: Sparkles },
  { id: 'recognition', label: 'Recognition Curve', icon: Brain },
  { id: 'ai-models', label: 'Model Config', icon: Cpu },
  { id: 'ai-cost', label: 'AI Cost', icon: DollarSign },
  { id: 'revenue', label: 'Revenue', icon: Receipt },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function PlatformObservatory() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('command-center');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--strag-deep)', color: 'var(--strag-s2)', fontSize: '14px' }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        borderBottom: '1px solid var(--strag-s8)',
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
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--strag-s0)' }}>Platform Observatory</span>
              <span style={{ color: 'var(--strag-s4)', fontSize: '13px', marginLeft: '8px' }}>Vialuce</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#A78BFA',
              background: 'rgba(167, 139, 250, 0.1)',
              border: '1px solid rgba(167, 139, 250, 0.25)',
              borderRadius: '6px',
              padding: '2px 8px',
            }}>VL Admin</span>
            <span style={{ color: 'var(--strag-s4)', fontSize: '14px' }}>{user?.email}</span>
            <button
              onClick={logout}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--strag-s4)',
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
      <div style={{ borderBottom: '1px solid var(--strag-s8)' }}>
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
                    color: isActive ? 'var(--strag-s0)' : 'var(--strag-s4)',
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
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'intelligence' && <AIIntelligenceTab />}
          {activeTab === 'recognition' && <RecognitionCurvePanel />}
          {activeTab === 'ai-models' && <ModelConfigTab />}
          {activeTab === 'ai-cost' && <AIMetricsTab />}
          {activeTab === 'revenue' && <BillingUsageTab />}
          {activeTab === 'settings' && <FeatureFlagsTab />}
        </Suspense>
      </main>
    </div>
  );
}
