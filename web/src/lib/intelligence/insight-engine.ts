/**
 * Insight Engine — Deterministic computation from dashboard data
 *
 * OB-98 Phase 2: Pure functions that take dashboard data structures and produce
 * structured InsightCard objects. No LLM calls. No Supabase calls.
 * Korean Test applies — zero hardcoded domain terms.
 *
 * Input: AdminDashboardData | ManagerDashboardData | RepDashboardData
 * Output: InsightCard[]
 *
 * Each insight passes the IAP gate:
 *   Intelligence — surfaces a pattern the user didn't see
 *   Acceleration — tells them what to do about it
 *   Performance  — drives a measurable improvement
 */

import type { AdminDashboardData, ManagerDashboardData, RepDashboardData } from '@/lib/data/persona-queries';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface InsightCard {
  id: string;
  type: 'observation' | 'recommendation' | 'warning' | 'opportunity';
  icon: string;             // lucide icon name
  title: string;            // short headline
  body: string;             // 1-2 sentence explanation
  metric?: number;          // quantified value
  metricLabel?: string;     // formatted string: "$89,000" or "12%" or "47 entities"
  action?: string;          // suggested next step
  actionRoute?: string;     // link to relevant page
  iapScore: {
    intelligence: boolean;
    acceleration: boolean;
    performance: boolean;
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ──────────────────────────────────────────────
// Admin Insights
// ──────────────────────────────────────────────

export function computeAdminInsights(data: AdminDashboardData): InsightCard[] {
  const insights: InsightCard[] = [];

  // 1. Component concentration — if one component > 60% of total
  if (data.componentComposition.length > 0 && data.totalPayout > 0) {
    const sorted = [...data.componentComposition].sort((a, b) => b.value - a.value);
    const topComponent = sorted[0];
    const topPct = (topComponent.value / data.totalPayout) * 100;

    if (topPct > 60) {
      insights.push({
        id: 'admin-concentration',
        type: 'warning',
        icon: 'AlertTriangle',
        title: 'High component concentration',
        body: `${topComponent.name} represents ${topPct.toFixed(1)}% of total compensation. High concentration creates risk if the underlying metric shifts.`,
        metric: topPct,
        metricLabel: `${topPct.toFixed(1)}%`,
        action: 'Review plan design for diversification',
        actionRoute: '/configure',
        iapScore: { intelligence: true, acceleration: true, performance: true },
      });
    } else if (topPct > 40 && sorted.length >= 2) {
      // Healthy distribution observation
      insights.push({
        id: 'admin-distribution',
        type: 'observation',
        icon: 'BarChart3',
        title: 'Balanced component mix',
        body: `Top component (${topComponent.name}) is ${topPct.toFixed(1)}% of total. ${sorted.length} components contribute to a diversified payout structure.`,
        metric: sorted.length,
        metricLabel: `${sorted.length} components`,
        iapScore: { intelligence: true, acceleration: false, performance: true },
      });
    }
  }

  // 2. Zero-payout entities
  if (data.storeBreakdown.length > 0) {
    const zeroPayoutEntities = data.storeBreakdown.filter(e => e.totalPayout === 0);
    if (zeroPayoutEntities.length > 0) {
      const zeroPct = (zeroPayoutEntities.length / data.entityCount) * 100;
      insights.push({
        id: 'admin-zero-payout',
        type: zeroPct > 20 ? 'warning' : 'observation',
        icon: 'AlertCircle',
        title: `${zeroPayoutEntities.length} entities with zero payout`,
        body: `${zeroPct.toFixed(1)}% of entities received no compensation. This may indicate missing data, below-threshold attainment, or incomplete configuration.`,
        metric: zeroPayoutEntities.length,
        metricLabel: `${zeroPayoutEntities.length} entities`,
        action: 'Review zero-payout entities for data completeness',
        actionRoute: '/operate/results',
        iapScore: { intelligence: true, acceleration: true, performance: true },
      });
    }
  }

  // 3. Exception severity distribution
  if (data.exceptions.length > 0) {
    const critical = data.exceptions.filter(e => e.severity === 'critical').length;
    const watch = data.exceptions.filter(e => e.severity === 'watch').length;
    const opportunity = data.exceptions.filter(e => e.severity === 'opportunity').length;

    if (critical > 0) {
      insights.push({
        id: 'admin-critical-exceptions',
        type: 'warning',
        icon: 'ShieldAlert',
        title: `${critical} critical exception${critical !== 1 ? 's' : ''} detected`,
        body: `${critical} critical, ${watch} watch, and ${opportunity} near-threshold entities require review before results are finalized.`,
        metric: critical,
        metricLabel: `${critical} critical`,
        action: 'Review exceptions before advancing lifecycle',
        actionRoute: '/operate/results',
        iapScore: { intelligence: true, acceleration: true, performance: true },
      });
    } else if (opportunity > 0) {
      insights.push({
        id: 'admin-near-threshold',
        type: 'opportunity',
        icon: 'TrendingUp',
        title: `${opportunity} entities near tier threshold`,
        body: `${opportunity} entities are close to advancing to a higher payout tier. Small performance changes could shift significant compensation.`,
        metric: opportunity,
        metricLabel: `${opportunity} near threshold`,
        iapScore: { intelligence: true, acceleration: true, performance: true },
      });
    }
  }

  // 4. Attainment distribution analysis
  if (data.attainmentDistribution.length > 0) {
    const attValues = data.attainmentDistribution;
    const avg = attValues.reduce((s, v) => s + v, 0) / attValues.length;
    const sd = stdDev(attValues);
    const med = median(attValues);

    // Skew detection: if median is significantly different from mean
    const skew = avg > 0 ? ((avg - med) / avg) * 100 : 0;
    if (Math.abs(skew) > 15) {
      const direction = skew > 0 ? 'right' : 'left';
      insights.push({
        id: 'admin-skew',
        type: 'observation',
        icon: 'BarChart2',
        title: `Attainment distribution ${direction}-skewed`,
        body: `Average attainment (${avg.toFixed(0)}%) differs from median (${med.toFixed(0)}%) by ${Math.abs(skew).toFixed(1)}%. A ${direction}-skew suggests ${direction === 'right' ? 'a few high performers pulling up the average' : 'most entities are outperforming the average'}.`,
        metric: Math.abs(skew),
        metricLabel: `${Math.abs(skew).toFixed(1)}% skew`,
        iapScore: { intelligence: true, acceleration: false, performance: true },
      });
    }

    // High variation
    if (sd > 30 && avg > 0) {
      insights.push({
        id: 'admin-variation',
        type: 'observation',
        icon: 'Activity',
        title: 'High performance variation',
        body: `Standard deviation of ${sd.toFixed(1)}% indicates wide spread in entity performance. Consider whether plan design or data quality is driving the variance.`,
        metric: sd,
        metricLabel: `${sd.toFixed(1)}% std dev`,
        iapScore: { intelligence: true, acceleration: true, performance: true },
      });
    }
  }

  // 5. Payout per entity outliers (store breakdown)
  if (data.storeBreakdown.length > 2) {
    const payouts = data.storeBreakdown.map(e => e.totalPayout).filter(p => p > 0);
    if (payouts.length > 2) {
      const avg = payouts.reduce((s, v) => s + v, 0) / payouts.length;
      const sd = stdDev(payouts);
      const outliers = data.storeBreakdown.filter(e => e.totalPayout > avg + 2 * sd);
      if (outliers.length > 0) {
        insights.push({
          id: 'admin-outliers',
          type: 'observation',
          icon: 'Zap',
          title: `${outliers.length} high-payout outlier${outliers.length !== 1 ? 's' : ''}`,
          body: `${outliers.length} entities have payouts more than 2 standard deviations above average. Verify these results are data-accurate before publishing.`,
          metric: outliers.length,
          metricLabel: `${outliers.length} outlier${outliers.length !== 1 ? 's' : ''}`,
          action: 'Verify outlier entity data',
          actionRoute: '/operate/results',
          iapScore: { intelligence: true, acceleration: true, performance: true },
        });
      }
    }
  }

  // 6. AI quality metrics
  if (data.aiMetrics) {
    if (data.aiMetrics.acceptanceRate < 0.8) {
      insights.push({
        id: 'admin-ai-quality',
        type: 'warning',
        icon: 'Brain',
        title: 'AI classification accuracy below target',
        body: `AI acceptance rate is ${(data.aiMetrics.acceptanceRate * 100).toFixed(1)}% (target: 80%+). Review field mappings and classification feedback.`,
        metric: data.aiMetrics.acceptanceRate * 100,
        metricLabel: `${(data.aiMetrics.acceptanceRate * 100).toFixed(1)}%`,
        action: 'Review classification signals',
        iapScore: { intelligence: true, acceleration: true, performance: false },
      });
    }
  }

  return insights;
}

// ──────────────────────────────────────────────
// Manager Insights
// ──────────────────────────────────────────────

export function computeManagerInsights(data: ManagerDashboardData): InsightCard[] {
  const insights: InsightCard[] = [];
  const members = data.teamMembers;

  if (members.length === 0) return insights;

  // 1. Team performance summary
  const avgAttainment = members.reduce((s, m) => s + m.attainment, 0) / members.length;
  const aboveQuota = members.filter(m => m.attainment >= 100).length;
  const onTrack = members.filter(m => m.attainment >= 80 && m.attainment < 100).length;
  const belowTarget = members.filter(m => m.attainment < 80).length;

  insights.push({
    id: 'mgr-team-summary',
    type: 'observation',
    icon: 'Users',
    title: `Team averaging ${avgAttainment.toFixed(0)}% attainment`,
    body: `${aboveQuota} above quota, ${onTrack} on track, ${belowTarget} below target across ${members.length} team members.`,
    metric: avgAttainment,
    metricLabel: `${avgAttainment.toFixed(0)}%`,
    iapScore: { intelligence: true, acceleration: false, performance: true },
  });

  // 2. Attention needed — members with declining trends
  const decliningMembers = members.filter(m => {
    if (m.trend.length < 2) return false;
    const recent = m.trend.slice(-2);
    return recent[1] < recent[0];
  });

  // Members who dropped significantly (> 20% attainment drop)
  const significantDrops = members.filter(m => {
    if (m.trend.length < 2) return false;
    const prev = m.trend[m.trend.length - 2];
    const curr = m.trend[m.trend.length - 1];
    if (prev === 0) return false;
    return pctChange(curr, prev) < -20;
  });

  if (significantDrops.length > 0) {
    insights.push({
      id: 'mgr-attention',
      type: 'warning',
      icon: 'AlertTriangle',
      title: `${significantDrops.length} member${significantDrops.length !== 1 ? 's' : ''} need${significantDrops.length === 1 ? 's' : ''} attention`,
      body: `${significantDrops.length} team member${significantDrops.length !== 1 ? 's' : ''} dropped more than 20% versus prior period. Investigate for territory, account, or data changes.`,
      metric: significantDrops.length,
      metricLabel: `${significantDrops.length} declining`,
      action: 'Review individual performance details',
      actionRoute: '/perform/team',
      iapScore: { intelligence: true, acceleration: true, performance: true },
    });
  } else if (decliningMembers.length > members.length * 0.4) {
    insights.push({
      id: 'mgr-broad-decline',
      type: 'warning',
      icon: 'TrendingDown',
      title: 'Broad team decline detected',
      body: `${decliningMembers.length} of ${members.length} members show declining trends. This may indicate market shifts or systemic issues rather than individual performance.`,
      metric: decliningMembers.length,
      metricLabel: `${decliningMembers.length} declining`,
      iapScore: { intelligence: true, acceleration: true, performance: true },
    });
  }

  // 3. Recognition opportunity — top performer
  if (members.length >= 3) {
    const sorted = [...members].sort((a, b) => b.attainment - a.attainment);
    const top = sorted[0];
    if (top.attainment >= 100) {
      insights.push({
        id: 'mgr-recognition',
        type: 'opportunity',
        icon: 'Award',
        title: `${top.entityName} at ${top.attainment.toFixed(0)}% attainment`,
        body: `Highest performer on the team. Consider recognition or stretch assignment to maintain engagement.`,
        metric: top.attainment,
        metricLabel: `${top.attainment.toFixed(0)}%`,
        iapScore: { intelligence: true, acceleration: true, performance: true },
      });
    }
  }

  // 4. Tier proximity — members close to a threshold
  const nearThreshold = members.filter(m =>
    (m.attainment >= 95 && m.attainment < 100) ||
    (m.attainment >= 75 && m.attainment < 80) ||
    (m.attainment >= 115 && m.attainment < 120)
  );
  if (nearThreshold.length > 0) {
    insights.push({
      id: 'mgr-tier-proximity',
      type: 'opportunity',
      icon: 'Target',
      title: `${nearThreshold.length} member${nearThreshold.length !== 1 ? 's' : ''} near tier threshold`,
      body: `Small performance improvements could push ${nearThreshold.length} team member${nearThreshold.length !== 1 ? 's' : ''} into a higher payout tier. Targeted coaching can have outsized impact.`,
      metric: nearThreshold.length,
      metricLabel: `${nearThreshold.length} near tier`,
      action: 'Focus coaching on near-threshold members',
      actionRoute: '/perform/team',
      iapScore: { intelligence: true, acceleration: true, performance: true },
    });
  }

  // 5. Acceleration opportunities from the data
  if (data.accelerationOpportunities.length > 0) {
    const highImpact = data.accelerationOpportunities.filter(a => a.estimatedImpact > 0);
    if (highImpact.length > 0) {
      insights.push({
        id: 'mgr-acceleration',
        type: 'recommendation',
        icon: 'Rocket',
        title: `${highImpact.length} acceleration opportunit${highImpact.length !== 1 ? 'ies' : 'y'}`,
        body: `Addressing ${highImpact.length} identified opportunities could improve team outcomes. Focus on highest-impact items first.`,
        metric: highImpact.length,
        metricLabel: `${highImpact.length} actions`,
        action: 'Review acceleration opportunities',
        actionRoute: '/perform/team',
        iapScore: { intelligence: true, acceleration: true, performance: true },
      });
    }
  }

  return insights;
}

// ──────────────────────────────────────────────
// Rep Insights
// ──────────────────────────────────────────────

export function computeRepInsights(data: RepDashboardData): InsightCard[] {
  const insights: InsightCard[] = [];

  // 1. Overall performance position
  if (data.totalEntities > 0 && data.rank > 0) {
    const percentile = ((data.totalEntities - data.rank + 1) / data.totalEntities) * 100;
    insights.push({
      id: 'rep-rank',
      type: percentile >= 75 ? 'observation' : percentile >= 50 ? 'observation' : 'recommendation',
      icon: percentile >= 75 ? 'Trophy' : percentile >= 50 ? 'BarChart3' : 'ArrowUp',
      title: `Ranked #${data.rank} of ${data.totalEntities}`,
      body: percentile >= 75
        ? `Top ${(100 - percentile + 1).toFixed(0)}% performer. Strong position — maintain momentum.`
        : percentile >= 50
        ? `Middle of the pack at the ${percentile.toFixed(0)}th percentile. Room to advance with focused effort.`
        : `Below the midpoint. Review component breakdown to identify the biggest improvement opportunity.`,
      metric: percentile,
      metricLabel: `${percentile.toFixed(0)}th percentile`,
      iapScore: { intelligence: true, acceleration: true, performance: true },
    });
  }

  // 2. Attainment assessment
  if (data.attainment > 0) {
    if (data.attainment >= 120) {
      insights.push({
        id: 'rep-attainment-excellent',
        type: 'observation',
        icon: 'Star',
        title: `${data.attainment.toFixed(0)}% attainment — exceptional`,
        body: `Well above target. This level of performance may qualify for accelerator bonuses or stretch goals.`,
        metric: data.attainment,
        metricLabel: `${data.attainment.toFixed(0)}%`,
        iapScore: { intelligence: true, acceleration: false, performance: true },
      });
    } else if (data.attainment >= 100) {
      insights.push({
        id: 'rep-attainment-target',
        type: 'observation',
        icon: 'CheckCircle',
        title: `${data.attainment.toFixed(0)}% attainment — on target`,
        body: `Meeting or exceeding plan target. Look for accelerator opportunities in the component breakdown.`,
        metric: data.attainment,
        metricLabel: `${data.attainment.toFixed(0)}%`,
        iapScore: { intelligence: true, acceleration: true, performance: true },
      });
    } else if (data.attainment >= 80) {
      insights.push({
        id: 'rep-attainment-near',
        type: 'recommendation',
        icon: 'Target',
        title: `${data.attainment.toFixed(0)}% attainment — ${(100 - data.attainment).toFixed(0)}% to target`,
        body: `Close to target. Focus on your strongest component to close the gap most efficiently.`,
        metric: data.attainment,
        metricLabel: `${(100 - data.attainment).toFixed(0)}% to go`,
        action: 'Review component opportunities below',
        iapScore: { intelligence: true, acceleration: true, performance: true },
      });
    }
  }

  // 3. Component opportunity — find largest headroom
  if (data.components.length > 0 && data.totalPayout > 0) {
    const componentsByPct = data.components.map(c => ({
      ...c,
      pct: (c.value / data.totalPayout) * 100,
    }));

    // Find smallest contributing component (potential for improvement)
    const sorted = [...componentsByPct].sort((a, b) => a.value - b.value);
    const weakest = sorted[0];
    const strongest = sorted[sorted.length - 1];

    if (weakest && strongest && weakest.name !== strongest.name && data.components.length >= 2) {
      insights.push({
        id: 'rep-component-gap',
        type: 'opportunity',
        icon: 'ArrowUpRight',
        title: `${weakest.name} is your biggest growth area`,
        body: `${weakest.name} contributes only ${weakest.pct.toFixed(1)}% of your payout, while ${strongest.name} drives ${strongest.pct.toFixed(1)}%. Improving the weaker component may have the largest impact.`,
        metric: weakest.pct,
        metricLabel: `${weakest.pct.toFixed(1)}%`,
        action: 'Focus on improving your lowest component',
        iapScore: { intelligence: true, acceleration: true, performance: true },
      });
    }
  }

  // 4. Trend analysis from history
  if (data.history.length >= 2) {
    const recent = data.history.slice(-2);
    const change = pctChange(recent[1].payout, recent[0].payout);

    if (change > 10) {
      insights.push({
        id: 'rep-trend-up',
        type: 'observation',
        icon: 'TrendingUp',
        title: `Payout up ${change.toFixed(0)}% vs prior period`,
        body: `Strong momentum. Your payout increased from the previous period — keep this trajectory going.`,
        metric: change,
        metricLabel: `+${change.toFixed(0)}%`,
        iapScore: { intelligence: true, acceleration: false, performance: true },
      });
    } else if (change < -10) {
      insights.push({
        id: 'rep-trend-down',
        type: 'recommendation',
        icon: 'TrendingDown',
        title: `Payout down ${Math.abs(change).toFixed(0)}% vs prior period`,
        body: `Your compensation decreased from the previous period. Check which components declined and whether it reflects a data or performance shift.`,
        metric: Math.abs(change),
        metricLabel: `${change.toFixed(0)}%`,
        action: 'Review component changes',
        iapScore: { intelligence: true, acceleration: true, performance: true },
      });
    }
  }

  // 5. Neighbor gap — how far from next rank
  if (data.neighbors.length > 0 && data.totalPayout > 0) {
    const above = data.neighbors.filter(n => n.rank < data.rank && n.rank > 0);
    if (above.length > 0) {
      const nextAbove = above[above.length - 1]; // closest above
      const gap = nextAbove.value - data.totalPayout;
      if (gap > 0) {
        const gapPct = (gap / data.totalPayout) * 100;
        insights.push({
          id: 'rep-rank-gap',
          type: 'opportunity',
          icon: 'ChevronUp',
          title: `${gapPct.toFixed(1)}% gap to next rank`,
          body: `You're ${gapPct.toFixed(1)}% behind rank #${nextAbove.rank}. Closing this gap moves you up the leaderboard.`,
          metric: gapPct,
          metricLabel: `${gapPct.toFixed(1)}% gap`,
          iapScore: { intelligence: true, acceleration: true, performance: true },
        });
      }
    }
  }

  return insights;
}

// ──────────────────────────────────────────────
// Generic Entry Point
// ──────────────────────────────────────────────

export function computeInsights(
  persona: 'admin' | 'manager' | 'rep',
  data: AdminDashboardData | ManagerDashboardData | RepDashboardData
): InsightCard[] {
  switch (persona) {
    case 'admin':
      return computeAdminInsights(data as AdminDashboardData);
    case 'manager':
      return computeManagerInsights(data as ManagerDashboardData);
    case 'rep':
      return computeRepInsights(data as RepDashboardData);
  }
}
