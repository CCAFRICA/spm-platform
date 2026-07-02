/**
 * Shared serving-layer math helpers (OB-257 O2a).
 *
 * Pure functions moved VERBATIM from api/financial/data/route.ts (AP-17 share surface): one
 * definition, imported back by the Financial route and consumed by the Revenue serving layer.
 * No behavior change — bodies are byte-identical to the pre-move route (DD-6 pre-SHA fa98dabb).
 */

export function n(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const p = parseFloat(v); return isNaN(p) ? 0 : p; }
  return 0;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function makeBuckets(daily: Map<string, number>, count: number): number[] {
  const sorted = Array.from(daily.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  if (sorted.length === 0) return Array(count).fill(0);
  const size = Math.ceil(sorted.length / count);
  const buckets: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * size;
    const end = Math.min(start + size, sorted.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += sorted[j][1];
    buckets.push(Math.round(sum));
  }
  return buckets;
}

export function weekIndex(dateStr: string, allDates: string[]): number {
  if (allDates.length === 0) return 0;
  const first = allDates[0];
  const d = new Date(dateStr);
  const s = new Date(first);
  const diff = d.getTime() - s.getTime();
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
}

export function percentileRank(sorted: number[], value: number): number {
  if (sorted.length <= 1) return 1;
  let below = 0;
  for (const v of sorted) {
    if (v < value) below++;
  }
  return below / (sorted.length - 1);
}
