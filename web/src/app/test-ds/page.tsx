'use client';

import { useState } from 'react';
import { PERSONA_TOKENS, type PersonaKey } from '@/lib/design/tokens';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { ProgressRing } from '@/components/design-system/ProgressRing';
import { BenchmarkBar } from '@/components/design-system/BenchmarkBar';
import { DistributionChart } from '@/components/design-system/DistributionChart';
import { ComponentStack } from '@/components/design-system/ComponentStack';
import { RelativeLeaderboard } from '@/components/design-system/RelativeLeaderboard';
import { GoalGradientBar } from '@/components/design-system/GoalGradientBar';
import { Sparkline } from '@/components/design-system/Sparkline';
import { StatusPill } from '@/components/design-system/StatusPill';
import { QueueItem } from '@/components/design-system/QueueItem';
import { AccelerationCard } from '@/components/design-system/AccelerationCard';
import { LIFECYCLE_DISPLAY } from '@/lib/lifecycle/lifecycle-service';

const PERSONAS: PersonaKey[] = ['admin', 'manager', 'rep'];

// Sample data for all components
const sampleDistribution = [65, 72, 78, 82, 85, 88, 91, 93, 95, 97, 100, 102, 105, 108, 110, 115, 125, 130, 55, 68, 90, 94, 99, 101, 103];
const sampleComponents = [
  { name: 'Base', value: 15000 },
  { name: 'Quota Attainment', value: 8500 },
  { name: 'Accelerator', value: 3200 },
  { name: 'SPIFF', value: 1800 },
  { name: 'Kicker', value: 900 },
];
const sampleNeighbors = [
  { rank: 3, name: 'Team Member A', value: 32500, anonymous: false },
  { rank: 4, name: 'Team Member B', value: 31200, anonymous: false },
  { rank: 5, name: 'You', value: 29400, anonymous: false },
  { rank: 6, name: 'Hidden', value: 28100, anonymous: true },
  { rank: 7, name: 'Hidden', value: 26800, anonymous: true },
];
const sampleTiers = [
  { pct: 80, label: 'Threshold' },
  { pct: 100, label: 'Target' },
  { pct: 120, label: 'Excellence' },
  { pct: 150, label: 'Stretch' },
];
const sampleSparkline = [12, 15, 13, 18, 22, 19, 25, 28, 24, 30, 33, 29];

export default function TestDesignSystemPage() {
  const [persona, setPersona] = useState<PersonaKey>('admin');
  const [animValue, setAnimValue] = useState(29400);
  const tokens = PERSONA_TOKENS[persona];

  return (
    <div className={`min-h-screen bg-gradient-to-b ${tokens.bg} text-white transition-all duration-700 p-8`}>
      {/* Header */}
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Design System Test Page</h1>
            <p className="text-sm text-zinc-400 mt-1">
              OB-46A — All 11 visualization components + persona tokens + lifecycle states
            </p>
          </div>
          <div className="flex gap-2">
            {PERSONAS.map(p => (
              <button
                key={p}
                onClick={() => setPersona(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  persona === p
                    ? `bg-gradient-to-r ${PERSONA_TOKENS[p].accentGrad} text-white`
                    : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Persona info */}
        <div className={`p-4 rounded-xl bg-gradient-to-r ${tokens.heroGrad} ${tokens.heroBorder} border`}>
          <p className={`text-lg font-semibold ${tokens.heroTextLabel}`}>
            {tokens.intent} &mdash; {tokens.intentDescription}
          </p>
        </div>

        {/* Components Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 1. AnimatedNumber */}
          <Card title="AnimatedNumber">
            <div className="text-3xl font-bold">
              <AnimatedNumber value={animValue} prefix="$" />
            </div>
            <button
              onClick={() => setAnimValue(prev => prev + Math.floor(Math.random() * 5000))}
              className="mt-2 text-xs text-zinc-400 hover:text-zinc-200 underline"
            >
              Increment
            </button>
          </Card>

          {/* 2. ProgressRing */}
          <Card title="ProgressRing">
            <div className="flex gap-4 items-center">
              <ProgressRing pct={87} color="#6366f1">
                <span className="text-sm font-bold">87%</span>
              </ProgressRing>
              <ProgressRing pct={62} size={60} color="#f59e0b">
                <span className="text-xs font-bold">62%</span>
              </ProgressRing>
              <ProgressRing pct={100} size={50} stroke={4} color="#10b981">
                <span className="text-[10px] font-bold">100%</span>
              </ProgressRing>
            </div>
          </Card>

          {/* 3. BenchmarkBar */}
          <Card title="BenchmarkBar">
            <div className="space-y-3">
              <BenchmarkBar value={85} benchmark={100} label="Quota Attainment" sublabel="Q1 2026" rightLabel={<span className="text-amber-400">85%</span>} color="#f59e0b" />
              <BenchmarkBar value={112} benchmark={100} label="Revenue" sublabel="Q1 2026" rightLabel={<span className="text-emerald-400">112%</span>} color="#10b981" />
              <BenchmarkBar value={45} benchmark={100} label="Retention" sublabel="Q1 2026" rightLabel={<span className="text-rose-400">45%</span>} color="#f43f5e" />
            </div>
          </Card>

          {/* 4. DistributionChart */}
          <Card title="DistributionChart">
            <DistributionChart data={sampleDistribution} benchmarkLine={100} />
          </Card>

          {/* 5. ComponentStack */}
          <Card title="ComponentStack">
            <ComponentStack components={sampleComponents} total={29400} />
          </Card>

          {/* 6. RelativeLeaderboard */}
          <Card title="RelativeLeaderboard">
            <RelativeLeaderboard
              yourRank={5}
              yourName="You"
              neighbors={sampleNeighbors}
            />
          </Card>

          {/* 7. GoalGradientBar */}
          <Card title="GoalGradientBar">
            <GoalGradientBar currentPct={93} tiers={sampleTiers} />
          </Card>

          {/* 8. Sparkline */}
          <Card title="Sparkline">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-xs text-zinc-500 block mb-1">Indigo</span>
                <Sparkline data={sampleSparkline} color="#6366f1" width={100} height={30} />
              </div>
              <div>
                <span className="text-xs text-zinc-500 block mb-1">Emerald</span>
                <Sparkline data={[30, 28, 25, 22, 20, 18, 15, 12, 10, 8]} color="#10b981" width={100} height={30} />
              </div>
              <div>
                <span className="text-xs text-zinc-500 block mb-1">Amber</span>
                <Sparkline data={[5, 8, 7, 12, 11, 15, 14, 18, 20, 22]} color="#f59e0b" width={100} height={30} />
              </div>
            </div>
          </Card>

          {/* 9. StatusPill */}
          <Card title="StatusPill">
            <div className="flex flex-wrap gap-2">
              <StatusPill color="emerald">Active</StatusPill>
              <StatusPill color="amber">Pending</StatusPill>
              <StatusPill color="rose">Overdue</StatusPill>
              <StatusPill color="indigo">Preview</StatusPill>
              <StatusPill color="zinc">Draft</StatusPill>
              <StatusPill color="gold">Approved</StatusPill>
            </div>
          </Card>

          {/* 10. QueueItem */}
          <Card title="QueueItem">
            <div className="space-y-2">
              <QueueItem priority="high" text="3 entities with declining 3-month trend" action="Review" />
              <QueueItem priority="medium" text="Reconciliation variance > 5% on 2 entities" action="Investigate" />
              <QueueItem priority="low" text="Period close reminder: Q1 2026" action="View" />
            </div>
          </Card>

          {/* 11. AccelerationCard */}
          <Card title="AccelerationCard">
            <div className="space-y-3">
              <AccelerationCard
                severity="opportunity"
                title="Near-tier entity detected"
                description="Entity is 3.2% away from next tier threshold. Small coaching intervention could unlock accelerator."
                actionLabel="View entity detail"
                onAction={() => {}}
              />
              <AccelerationCard
                severity="watch"
                title="Declining attainment trend"
                description="3 consecutive periods of declining attainment. Investigate root cause."
                actionLabel="Open investigation"
                onAction={() => {}}
              />
              <AccelerationCard
                severity="critical"
                title="Certification gap"
                description="Required certification expired. Entity ineligible for premium tier until renewed."
                actionLabel="View certification status"
                onAction={() => {}}
              />
            </div>
          </Card>
        </div>

        {/* Lifecycle States */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Lifecycle States (9 states)</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(LIFECYCLE_DISPLAY).map(([state, display]) => (
              <div key={state} className="flex items-center gap-2 bg-zinc-900/60 rounded-lg px-3 py-2 border border-zinc-800/50">
                <div className={`w-2 h-2 rounded-full ${display.dotColor}`} />
                <span className="text-sm text-zinc-300">{display.label}</span>
                <span className="text-xs text-zinc-600">{state}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-medium text-zinc-400">{title}</h3>
      {children}
    </div>
  );
}
