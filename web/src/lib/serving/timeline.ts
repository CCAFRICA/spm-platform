/**
 * Shared serving-layer timeline finalizer (OB-257 O2a).
 *
 * Moved VERBATIM from api/financial/data/route.ts (AP-17 share surface): one definition, imported
 * back by the Financial route and consumed by the Revenue serving layer. No behavior change —
 * bodies are byte-identical to the pre-move route (DD-6 pre-SHA fa98dabb).
 */

import { round2 } from './math';

// OB-237 T1: shared timeline finalizer — groups (date -> revenue/checks/tips) maps into periods and
// builds the {data, brandData, brandNames, brandColors} response. Identical logic to the raw
// aggregateTimeline tail so the wired output is shape-identical.
export interface TlDateAgg { revenue: number; checks: number; tips: number; }
export function buildTimelineResponse(
  dateAll: Map<string, TlDateAgg>,
  dateBrand: Map<string, Map<string, TlDateAgg>>,
  brandColorMap: Map<string, string>,
  granularity: 'day' | 'week' | 'month',
) {
  const sortedDates = Array.from(dateAll.keys()).sort();
  if (sortedDates.length === 0) return null;

  interface PeriodAgg { label: string; revenue: number; checks: number; tips: number; brands: Map<string, TlDateAgg>; }

  function groupIntoPeriods(): PeriodAgg[] {
    const periods: PeriodAgg[] = [];
    if (granularity === 'day') {
      for (const dt of sortedDates) {
        const d = new Date(dt);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const label = `${dayNames[d.getDay()]} ${d.getDate()}`;
        const all = dateAll.get(dt)!;
        periods.push({ label, ...all, brands: dateBrand.get(dt) || new Map() });
      }
    } else if (granularity === 'week') {
      let currentWeek: PeriodAgg | null = null;
      let weekNum = 1;
      const firstDate = new Date(sortedDates[0]);
      for (const dt of sortedDates) {
        const d = new Date(dt);
        const diff = Math.floor((d.getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (!currentWeek || diff >= weekNum) {
          if (currentWeek) periods.push(currentWeek);
          weekNum = diff + 1;
          currentWeek = { label: `W${periods.length + 1}`, revenue: 0, checks: 0, tips: 0, brands: new Map() };
        }
        const all = dateAll.get(dt)!;
        currentWeek.revenue += all.revenue;
        currentWeek.checks += all.checks;
        currentWeek.tips += all.tips;
        const brandDay = dateBrand.get(dt) || new Map();
        for (const [brand, ba] of Array.from(brandDay.entries())) {
          const existing = currentWeek.brands.get(brand) || { revenue: 0, checks: 0, tips: 0 };
          existing.revenue += ba.revenue; existing.checks += ba.checks; existing.tips += ba.tips;
          currentWeek.brands.set(brand, existing);
        }
      }
      if (currentWeek) periods.push(currentWeek);
    } else {
      const monthMap = new Map<string, PeriodAgg>();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (const dt of sortedDates) {
        const d = new Date(dt);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        if (!monthMap.has(key)) monthMap.set(key, { label, revenue: 0, checks: 0, tips: 0, brands: new Map() });
        const p = monthMap.get(key)!;
        const all = dateAll.get(dt)!;
        p.revenue += all.revenue; p.checks += all.checks; p.tips += all.tips;
        const brandDay = dateBrand.get(dt) || new Map();
        for (const [brand, ba] of Array.from(brandDay.entries())) {
          const existing = p.brands.get(brand) || { revenue: 0, checks: 0, tips: 0 };
          existing.revenue += ba.revenue; existing.checks += ba.checks; existing.tips += ba.tips;
          p.brands.set(brand, existing);
        }
      }
      for (const p of Array.from(monthMap.values())) periods.push(p);
    }
    return periods;
  }

  const periods = groupIntoPeriods();
  const data = periods.map(p => ({
    label: p.label,
    revenue: round2(p.revenue),
    checks: p.checks,
    avgCheck: p.checks > 0 ? round2(p.revenue / p.checks) : 0,
    tips: round2(p.tips),
  }));
  const allBrands = Array.from(new Set(Array.from(brandColorMap.keys())));
  const brandData = periods.map(p => {
    const row: Record<string, number | string> = { label: p.label };
    for (const brand of allBrands) {
      const ba = p.brands.get(brand);
      row[brand] = ba ? round2(ba.revenue) : 0;
    }
    return row;
  });
  const brandColors: Record<string, string> = {};
  for (const [name, color] of Array.from(brandColorMap.entries())) brandColors[name] = color;
  return { data, brandData, brandNames: allBrands, brandColors };
}
