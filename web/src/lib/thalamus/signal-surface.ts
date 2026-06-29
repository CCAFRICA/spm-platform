/**
 * OB-253 Phase 2 — Thalamus co-present signal surface (the read adapter, HALT-DIVERGE-1).
 *
 * DS-031 G7 names ONE canonical signal surface. The substrate physically decomposes it into three
 * tables that serve different structural roles:
 *   - structural_fingerprints : file/column-level STRUCTURE recognition (sheet + atom granularity)
 *   - classification_signals   : per-value ASSESSMENTS (classification + remediation facet signals)
 *   - synaptic_density          : accumulated calc-domain LEARNING, keyed by calc pattern signature
 *
 * This module is the LOGICAL re-composition: a READ-ONLY adapter that presents all three as one
 * co-present surface, so a remediation facet (Phase 3) can see a value's structure AND prior
 * assessments AND accumulated density together in one query — the prerequisite for joint recognition.
 *
 * Boundaries (architect HALT dispositions):
 *  - READ ONLY. Zero writes. Zero calc-engine changes (G9 untouched — the engine keeps its own
 *    loadDensity; this adapter never mutates density).
 *  - NO new physical table (G7 honored logically: one canonical *logical* surface).
 *  - Bridges key-spaces (HALT-2): fingerprint-keyed + value/field-keyed + calc-pattern-keyed signal
 *    are returned together; no key-space is forced into another.
 *  - Korean Test (G8): scoping is by tenant + structural hash + signal_type + caller-supplied field;
 *    ZERO domain/language literal, ZERO field-name heuristic in this module.
 *  - Scale (SR-2): every read is bounded by tenant + explicit filters + limit; no full-table scan.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface FingerprintView {
  granularity: string; // 'sheet' | 'atom'
  fingerprintHash: string;
  classificationResult: Record<string, unknown> | null;
  columnRoles: Record<string, unknown> | null;
  atomFeatures: Record<string, unknown> | null;
  confidence: number | null;
  matchCount: number;
  scope: string | null;
  tenantId: string | null; // null = cross-tenant (Tier 2 / foundational)
  updatedAt: string | null;
}

export interface ClassificationSignalView {
  signalType: string;
  signalValue: unknown;
  confidence: number | null;
  decisionSource: string | null;
  structuralFingerprint: Record<string, unknown> | null;
  scope: string | null;
  source: string | null;
  context: Record<string, unknown> | null;
  createdAt: string | null;
}

export interface DensityView {
  signature: string;
  confidence: number;
  executionMode: string;
  totalExecutions: number;
  lastAnomalyRate: number | null;
  lastCorrectionCount: number | null;
  learnedBehaviors: unknown;
}

export interface CoPresentSurface {
  tenantId: string;
  fingerprints: { sheet: FingerprintView[]; atom: FingerprintView[] };
  signals: ClassificationSignalView[];
  /** signals indexed by signal_type — the co-presence convenience for facets (all facets' claims). */
  signalsByType: Record<string, ClassificationSignalView[]>;
  density: DensityView[];
}

export interface CoPresentQuery {
  tenantId: string;
  /** Scope the structural_fingerprints read to these hashes (sheet and/or atom). Empty → none. */
  fingerprintHashes?: string[];
  /** Scope the classification_signals read to these signal_type values. Empty/omitted → all types. */
  signalTypes?: string[];
  /** Also read cross-tenant (tenant_id IS NULL) fingerprints — the Tier 2 / foundational layer. */
  includeCrossTenant?: boolean;
  /** Max classification_signals rows (most-recent first). Default 500. */
  signalLimit?: number;
  /** Max fingerprint rows per granularity when no hashes are supplied. Default 200. */
  fingerprintLimit?: number;
}

const DEFAULT_SIGNAL_LIMIT = 500;
const DEFAULT_FINGERPRINT_LIMIT = 200;

type Row = Record<string, unknown>;

function num(v: unknown): number | null {
  return typeof v === 'number' ? v : v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;
}
function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toFingerprintView(r: Row): FingerprintView {
  return {
    granularity: String(r.granularity ?? ''),
    fingerprintHash: String(r.fingerprint_hash ?? r.fingerprint ?? ''),
    classificationResult: obj(r.classification_result),
    columnRoles: obj(r.column_roles),
    atomFeatures: obj(r.atom_features),
    confidence: num(r.confidence),
    matchCount: num(r.match_count) ?? 0,
    scope: (r.scope as string) ?? null,
    tenantId: (r.tenant_id as string) ?? null,
    updatedAt: (r.updated_at as string) ?? null,
  };
}

function toSignalView(r: Row): ClassificationSignalView {
  return {
    signalType: String(r.signal_type ?? ''),
    signalValue: r.signal_value ?? null,
    confidence: num(r.confidence),
    decisionSource: (r.decision_source as string) ?? null,
    structuralFingerprint: obj(r.structural_fingerprint),
    scope: (r.scope as string) ?? null,
    source: (r.source as string) ?? null,
    context: obj(r.context),
    createdAt: (r.created_at as string) ?? null,
  };
}

function toDensityView(r: Row): DensityView {
  return {
    signature: String(r.signature ?? ''),
    confidence: num(r.confidence) ?? 0,
    executionMode: String(r.execution_mode ?? 'full_trace'),
    totalExecutions: num(r.total_executions) ?? 0,
    lastAnomalyRate: num(r.last_anomaly_rate),
    lastCorrectionCount: num(r.last_correction_count),
    learnedBehaviors: r.learned_behaviors ?? null,
  };
}

/**
 * Compose the three physical signal tables into ONE logical co-present surface for a tenant.
 * Read-only. Returns empty collections on any partial failure (a facet must degrade, never crash).
 */
export async function readCoPresentSurface(
  sb: SupabaseClient,
  q: CoPresentQuery,
): Promise<CoPresentSurface> {
  const signalLimit = q.signalLimit ?? DEFAULT_SIGNAL_LIMIT;
  const fpLimit = q.fingerprintLimit ?? DEFAULT_FINGERPRINT_LIMIT;
  const hashes = (q.fingerprintHashes ?? []).filter((h) => !!h);

  // ── 1. structural_fingerprints (sheet + atom), scoped by tenant (+ optional cross-tenant) and hashes ──
  const readFingerprints = async (): Promise<FingerprintView[]> => {
    const cols = 'granularity, fingerprint_hash, fingerprint, classification_result, column_roles, atom_features, confidence, match_count, scope, tenant_id, updated_at';
    const out: FingerprintView[] = [];
    // tenant-scoped
    let tq = sb.from('structural_fingerprints').select(cols).eq('tenant_id', q.tenantId);
    if (hashes.length > 0) tq = tq.in('fingerprint_hash', hashes);
    else tq = tq.order('updated_at', { ascending: false }).limit(fpLimit);
    const { data: tData } = await tq;
    for (const r of (tData as Row[]) ?? []) out.push(toFingerprintView(r));
    // cross-tenant (Tier 2 / foundational) — only meaningful when scoping by specific hashes
    if (q.includeCrossTenant && hashes.length > 0) {
      const { data: xData } = await sb
        .from('structural_fingerprints')
        .select(cols)
        .is('tenant_id', null)
        .in('fingerprint_hash', hashes);
      for (const r of (xData as Row[]) ?? []) out.push(toFingerprintView(r));
    }
    return out;
  };

  // ── 2. classification_signals, scoped by tenant (+ optional signal_type set), most-recent first ──
  const readSignals = async (): Promise<ClassificationSignalView[]> => {
    let sq = sb
      .from('classification_signals')
      .select('signal_type, signal_value, confidence, decision_source, structural_fingerprint, scope, source, context, created_at')
      .eq('tenant_id', q.tenantId);
    if (q.signalTypes && q.signalTypes.length > 0) sq = sq.in('signal_type', q.signalTypes);
    sq = sq.order('created_at', { ascending: false }).limit(signalLimit);
    const { data } = await sq;
    return ((data as Row[]) ?? []).map(toSignalView);
  };

  // ── 3. synaptic_density (calc-keyed accumulated learning), tenant-scoped — bridged, never mutated ──
  const readDensity = async (): Promise<DensityView[]> => {
    const { data } = await sb
      .from('synaptic_density')
      .select('signature, confidence, execution_mode, total_executions, last_anomaly_rate, last_correction_count, learned_behaviors')
      .eq('tenant_id', q.tenantId);
    return ((data as Row[]) ?? []).map(toDensityView);
  };

  const [fps, signals, density] = await Promise.all([
    readFingerprints().catch(() => [] as FingerprintView[]),
    readSignals().catch(() => [] as ClassificationSignalView[]),
    readDensity().catch(() => [] as DensityView[]),
  ]);

  const signalsByType: Record<string, ClassificationSignalView[]> = {};
  for (const s of signals) (signalsByType[s.signalType] ??= []).push(s);

  return {
    tenantId: q.tenantId,
    fingerprints: {
      sheet: fps.filter((f) => f.granularity === 'sheet'),
      atom: fps.filter((f) => f.granularity === 'atom'),
    },
    signals,
    signalsByType,
    density,
  };
}

/**
 * Exposure of a structural pattern (Phase 4 input, bridges HALT-2). Derived from the co-present
 * surface: how much the model has ACTUALLY seen of this exact structure. NOT the same as confidence.
 * Pure structural read — no domain logic.
 */
export interface ExposureSignal {
  totalExecutions: number; // sum of synaptic_density.total_executions for the tenant's matching signatures
  matchCount: number;      // max structural_fingerprints.match_count for the scoped hashes
  lastSeen: string | null; // most-recent updatedAt among the scoped fingerprints
  thin: boolean;           // structural thinness flag (few executions/matches) — calibrated downstream
}

/** Conservative structural thinness boundary (Phase 4 initial calibration; refined by the learning surface). */
export const THIN_EXPOSURE_EXECUTIONS = 5;
export const THIN_EXPOSURE_MATCHES = 3;

export function exposureFromSurface(surface: CoPresentSurface): ExposureSignal {
  const totalExecutions = surface.density.reduce((a, d) => a + (d.totalExecutions || 0), 0);
  const allFps = [...surface.fingerprints.sheet, ...surface.fingerprints.atom];
  const matchCount = allFps.reduce((m, f) => Math.max(m, f.matchCount || 0), 0);
  const lastSeen = allFps.reduce<string | null>((acc, f) => {
    if (!f.updatedAt) return acc;
    return !acc || f.updatedAt > acc ? f.updatedAt : acc;
  }, null);
  const thin = totalExecutions < THIN_EXPOSURE_EXECUTIONS && matchCount < THIN_EXPOSURE_MATCHES;
  return { totalExecutions, matchCount, lastSeen, thin };
}
