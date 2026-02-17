'use client';

/**
 * Platform Observatory — VL Admin Command Center
 *
 * OB-47: Scope-based experience at /select-tenant.
 * Platform-scope users see the full Observatory with 5 tabs.
 * Own tab bar navigation (NOT ChromeSidebar).
 */

import { useState, Suspense, lazy } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import {
  Activity,
  Sparkles,
  Receipt,
  Server,
  Rocket,
  LogOut,
  Loader2,
} from 'lucide-react';

// Lazy-load tab components to reduce initial bundle (Observatory loads only active tab)
const ObservatoryTab = lazy(() => import('./ObservatoryTab').then(m => ({ default: m.ObservatoryTab })));
const AIIntelligenceTab = lazy(() => import('./AIIntelligenceTab').then(m => ({ default: m.AIIntelligenceTab })));
const BillingUsageTab = lazy(() => import('./BillingUsageTab').then(m => ({ default: m.BillingUsageTab })));
const InfrastructureTab = lazy(() => import('./InfrastructureTab').then(m => ({ default: m.InfrastructureTab })));
const OnboardingTab = lazy(() => import('./OnboardingTab').then(m => ({ default: m.OnboardingTab })));

type TabId = 'observatory' | 'ai' | 'billing' | 'infrastructure' | 'onboarding';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'observatory', label: 'Observatory', icon: Activity },
  { id: 'ai', label: 'AI Intelligence', icon: Sparkles },
  { id: 'billing', label: 'Billing & Usage', icon: Receipt },
  { id: 'infrastructure', label: 'Infrastructure', icon: Server },
  { id: 'onboarding', label: 'Onboarding', icon: Rocket },
];

export function PlatformObservatory() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('observatory');

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-[#1E293B] bg-[#0A0E1A]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <span className="text-sm font-bold text-white">V</span>
            </div>
            <div>
              <span className="text-sm font-bold text-white">Platform Observatory</span>
              <span className="text-[10px] text-zinc-500 ml-2">ViaLuce</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-400">{user?.email}</span>
            <button
              onClick={logout}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1.5 rounded-md hover:bg-white/5"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <div className="border-b border-[#1E293B]">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 -mb-px">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                    isActive
                      ? 'border-violet-500 text-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>}>
          {activeTab === 'observatory' && <ObservatoryTab />}
          {activeTab === 'ai' && <AIIntelligenceTab />}
          {activeTab === 'billing' && <BillingUsageTab />}
          {activeTab === 'infrastructure' && <InfrastructureTab />}
          {activeTab === 'onboarding' && <OnboardingTab />}
        </Suspense>
      </main>
    </div>
  );
}
