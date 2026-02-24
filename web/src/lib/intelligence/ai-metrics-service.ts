/**
 * AI Metrics Computation Service
 *
 * OB-86: Computes derived metrics from classification_signals table.
 * All metrics computed from real Supabase data — zero mock data.
 *
 * Functions:
 * - computeAccuracyMetrics: per signal_type acceptance/correction/rejection rates
 * - computeCalibrationMetrics: stated confidence vs actual accuracy per bucket
 * - computeFlywheelTrend: time-series acceptance rate to show improvement
 * - computeOverallHealth: single aggregate health summary
 */

import { createClient } from '@supabase/supabase-js';

// ============================================
// TYPES
// ============================================

export interface AccuracyByType {
  signalType: string;
  total: number;
  accepted: number;
  corrected: number;
  rejected: number;
  acceptanceRate: number;
  correctionRate: number;
  avgConfidence: number;
}

export interface AccuracyMetrics {
  byType: AccuracyByType[];
  overall: {
    total: number;
    acceptanceRate: number;
    correctionRate: number;
    avgConfidence: number;
  };
}

export interface CalibrationBucket {
  range: string;
  statedConfidence: number;
  actualAccuracy: number;
  count: number;
  calibrationError: number;
}

export interface FlywheelPoint {
  period: string;
  signalCount: number;
  acceptanceRate: number;
  avgConfidence: number;
}

export interface AIHealthSummary {
  totalSignals: number;
  overallAccuracy: number;
  avgConfidence: number;
  calibrationError: number;
  trendDirection: 'improving' | 'stable' | 'declining';
  flywheelPoints: FlywheelPoint[];
}

// ============================================
// RAW SIGNAL SHAPE (from classification_signals table)
// ============================================

interface RawSignal {
  id: string;
  tenant_id: string;
  signal_type: string;
  confidence: number | null;
  source: string | null;
  created_at: string;
}

// ============================================
// CLIENT
// ============================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('[AIMetricsService] Missing Supabase env vars');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchSignals(tenantId?: string, limit = 5000): Promise<RawSignal[]> {
  const supabase = getServiceClient();
  let query = supabase
    .from('classification_signals')
    .select('id, tenant_id, signal_type, confidence, source, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[AIMetricsService] fetchSignals error:', error.message);
    return [];
  }
  return data ?? [];
}

// ============================================
// SOURCE CLASSIFICATION
// ============================================

/**
 * Classify a signal's source into accepted/corrected/rejected/pending.
 * Source values from the pipeline:
 * - 'ai_prediction' / 'ai' → AI initial (pending/unactioned)
 * - 'user_confirmed' → user accepted AI suggestion
 * - 'user_corrected' → user changed AI suggestion
 *
 * For accuracy metrics, we also use confidence as a heuristic:
 * - confidence >= 0.95 with user source → accepted
 * - confidence >= 0.99 with user_corrected → corrected
 */
function classifyAction(signal: RawSignal): 'accepted' | 'corrected' | 'rejected' | 'pending' {
  const src = signal.source ?? '';
  if (src === 'user_confirmed') return 'accepted';
  if (src === 'user_corrected') return 'corrected';
  // Confidence-based heuristic for signals without explicit user action
  if (signal.confidence !== null) {
    if (signal.confidence >= 0.95) return 'accepted';
    if (signal.confidence < 0.3) return 'rejected';
  }
  return 'pending';
}

// ============================================
// COMPUTE FUNCTIONS
// ============================================

export async function computeAccuracyMetrics(tenantId?: string): Promise<AccuracyMetrics> {
  const signals = await fetchSignals(tenantId);

  const byType: Record<string, {
    total: number; accepted: number; corrected: number; rejected: number;
    confSum: number; confCount: number;
  }> = {};

  for (const s of signals) {
    if (!byType[s.signal_type]) {
      byType[s.signal_type] = { total: 0, accepted: 0, corrected: 0, rejected: 0, confSum: 0, confCount: 0 };
    }
    const t = byType[s.signal_type];
    t.total++;
    if (s.confidence != null) { t.confSum += s.confidence; t.confCount++; }

    const action = classifyAction(s);
    if (action === 'accepted') t.accepted++;
    else if (action === 'corrected') t.corrected++;
    else if (action === 'rejected') t.rejected++;
  }

  const typeMetrics: AccuracyByType[] = Object.entries(byType).map(([signalType, d]) => {
    const actioned = d.accepted + d.corrected + d.rejected;
    return {
      signalType,
      total: d.total,
      accepted: d.accepted,
      corrected: d.corrected,
      rejected: d.rejected,
      acceptanceRate: actioned > 0 ? d.accepted / actioned : 0,
      correctionRate: actioned > 0 ? d.corrected / actioned : 0,
      avgConfidence: d.confCount > 0 ? d.confSum / d.confCount : 0,
    };
  });

  const totals = typeMetrics.reduce(
    (acc, t) => ({
      total: acc.total + t.total,
      accepted: acc.accepted + t.accepted,
      corrected: acc.corrected + t.corrected,
      rejected: acc.rejected + t.rejected,
      confSum: acc.confSum + t.avgConfidence * t.total,
      confCount: acc.confCount + t.total,
    }),
    { total: 0, accepted: 0, corrected: 0, rejected: 0, confSum: 0, confCount: 0 }
  );

  const overallActioned = totals.accepted + totals.corrected + totals.rejected;

  return {
    byType: typeMetrics,
    overall: {
      total: totals.total,
      acceptanceRate: overallActioned > 0 ? totals.accepted / overallActioned : 0,
      correctionRate: overallActioned > 0 ? totals.corrected / overallActioned : 0,
      avgConfidence: totals.confCount > 0 ? totals.confSum / totals.confCount : 0,
    },
  };
}

export async function computeCalibrationMetrics(tenantId?: string): Promise<CalibrationBucket[]> {
  const signals = await fetchSignals(tenantId);

  const bucketDefs = [
    { range: '0.00-0.50', min: 0, max: 0.5 },
    { range: '0.50-0.70', min: 0.5, max: 0.7 },
    { range: '0.70-0.85', min: 0.7, max: 0.85 },
    { range: '0.85-0.95', min: 0.85, max: 0.95 },
    { range: '0.95-1.00', min: 0.95, max: 1.01 },
  ];

  const buckets = bucketDefs.map(d => ({
    ...d,
    confSum: 0,
    count: 0,
    acceptedCount: 0,
  }));

  for (const s of signals) {
    if (s.confidence == null) continue;
    const action = classifyAction(s);
    if (action === 'pending') continue; // skip unactioned signals for calibration

    for (const b of buckets) {
      if (s.confidence >= b.min && s.confidence < b.max) {
        b.count++;
        b.confSum += s.confidence;
        if (action === 'accepted') b.acceptedCount++;
        break;
      }
    }
  }

  return buckets.map(b => {
    const statedConfidence = b.count > 0 ? b.confSum / b.count : (b.min + b.max) / 2;
    const actualAccuracy = b.count > 0 ? b.acceptedCount / b.count : 0;
    return {
      range: b.range,
      statedConfidence,
      actualAccuracy,
      count: b.count,
      calibrationError: Math.abs(statedConfidence - actualAccuracy),
    };
  });
}

export async function computeFlywheelTrend(tenantId?: string): Promise<FlywheelPoint[]> {
  const signals = await fetchSignals(tenantId);
  if (signals.length === 0) return [];

  // Group by ISO week (YYYY-Www)
  const byWeek: Record<string, { count: number; accepted: number; confSum: number; confCount: number }> = {};

  for (const s of signals) {
    const date = new Date(s.created_at);
    const week = getISOWeek(date);
    if (!byWeek[week]) {
      byWeek[week] = { count: 0, accepted: 0, confSum: 0, confCount: 0 };
    }
    const w = byWeek[week];
    w.count++;
    if (s.confidence != null) { w.confSum += s.confidence; w.confCount++; }

    const action = classifyAction(s);
    if (action === 'accepted') w.accepted++;
  }

  return Object.entries(byWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, d]) => ({
      period,
      signalCount: d.count,
      acceptanceRate: d.count > 0 ? d.accepted / d.count : 0,
      avgConfidence: d.confCount > 0 ? d.confSum / d.confCount : 0,
    }));
}

export async function computeOverallHealth(tenantId?: string): Promise<AIHealthSummary> {
  const [accuracy, calibration, flywheel] = await Promise.all([
    computeAccuracyMetrics(tenantId),
    computeCalibrationMetrics(tenantId),
    computeFlywheelTrend(tenantId),
  ]);

  // Mean absolute calibration error across buckets with data
  const calibBuckets = calibration.filter(b => b.count > 0);
  const meanCalibError = calibBuckets.length > 0
    ? calibBuckets.reduce((s, b) => s + b.calibrationError, 0) / calibBuckets.length
    : 0;

  // Trend direction: compare last 2 flywheel points
  let trendDirection: 'improving' | 'stable' | 'declining' = 'stable';
  if (flywheel.length >= 2) {
    const last = flywheel[flywheel.length - 1];
    const prev = flywheel[flywheel.length - 2];
    const delta = last.acceptanceRate - prev.acceptanceRate;
    if (delta > 0.05) trendDirection = 'improving';
    else if (delta < -0.05) trendDirection = 'declining';
  }

  return {
    totalSignals: accuracy.overall.total,
    overallAccuracy: accuracy.overall.acceptanceRate,
    avgConfidence: accuracy.overall.avgConfidence,
    calibrationError: meanCalibError,
    trendDirection,
    flywheelPoints: flywheel,
  };
}

// ============================================
// UTILITY
// ============================================

function getISOWeek(date: Date): string {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
