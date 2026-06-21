'use client';

/**
 * HF-327 O5 — Financial-tenant Intelligence view for /stream.
 *
 * The Intelligence page (/stream) assumes the ICM pipeline. For a Financial Agent tenant (Sabor:
 * pos_cheque data present, no ICM calculation_results that are meaningful), the ICM sections are
 * irrelevant and misleading ("X periods ready to calculate", "Total payout" from archived rule
 * sets). This sibling renders financial intelligence instead — SYSTEM HEALTH from the financial data
 * layer (network revenue, locations, leakage rate, tip rate) + financial attention items — from the
 * pre-loaded NetworkPulseData. It does NOT add a /financial/intelligence route (Decision 14, one
 * canonical surface). ICM tenants (BCL: null pulse) never reach here.
 */
import { Zap, DollarSign, MapPin, AlertTriangle, TrendingUp } from 'lucide-react';
import { useCurrency } from '@/contexts/tenant-context';
import type { NetworkPulseData } from '@/lib/financial/financial-data-service';

export function FinancialStream({ pulse, bgClass }: { pulse: NetworkPulseData; bgClass: string }) {
  const { format } = useCurrency();
  const m = pulse.networkMetrics;
  const leakageHigh = m.leakageRate > m.leakageThreshold;
  const tipLow = m.tipRate < m.tipTarget;

  const cards = [
    { icon: DollarSign, label: 'Network Revenue', value: format(m.netRevenue), detail: `${m.checksServed.toLocaleString()} checks` },
    { icon: MapPin, label: 'Active Locations', value: `${m.activeLocations}/${m.totalLocations}`, detail: `${format(m.avgCheck)} avg check` },
    { icon: AlertTriangle, label: 'Leakage Rate', value: `${m.leakageRate.toFixed(1)}%`, detail: `threshold ${m.leakageThreshold}%`, down: leakageHigh },
    { icon: TrendingUp, label: 'Tip Rate', value: `${m.tipRate.toFixed(1)}%`, detail: `target ${m.tipTarget}%`, down: tipLow },
  ];

  return (
    <div className={`min-h-screen bg-gradient-to-br ${bgClass}`}>
      <div className="max-w-5xl mx-auto px-6 py-6 lg:py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: 'var(--vl-kpi-accent, #4446B8)' }}>
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Intelligence</h1>
            <p className="text-sm text-zinc-500">Financial performance overview</p>
          </div>
        </div>

        {/* SYSTEM HEALTH — financial (PG-14): network revenue / locations / leakage / tip rate */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c, i) => (
            <div key={i} className="rounded-lg p-4 bg-zinc-900/50 border border-zinc-800/60">
              <div className="flex items-center gap-2 text-xs text-zinc-400"><c.icon className="h-3.5 w-3.5" />{c.label}</div>
              <div className={`mt-1.5 text-xl font-semibold tabular-nums ${c.down ? 'text-[color:var(--vl-danger,#DC5454)]' : 'text-zinc-100'}`}>{c.value}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">{c.detail}</div>
            </div>
          ))}
        </div>

        {/* Attention Required — financial (PG-16): leakage / tip, NOT ICM attainment benchmarks */}
        <div className="rounded-lg p-5 bg-zinc-900/50 border border-zinc-800/60">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Attention Required</div>
          {!leakageHigh && !tipLow ? (
            <p className="text-sm text-zinc-400">All financial metrics within target — no attention items.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {leakageHigh && (
                <li className="flex items-center gap-2 text-[color:var(--vl-danger,#DC5454)]">
                  <AlertTriangle className="h-4 w-4" /> Leakage at {m.leakageRate.toFixed(1)}% exceeds the {m.leakageThreshold}% threshold.
                </li>
              )}
              {tipLow && (
                <li className="flex items-center gap-2 text-[color:var(--vl-danger,#DC5454)]">
                  <AlertTriangle className="h-4 w-4" /> Tip rate {m.tipRate.toFixed(1)}% is below the {m.tipTarget}% target.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
