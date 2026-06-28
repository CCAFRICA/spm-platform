/**
 * OB-253 Phase 3 — Joint recognition (the paradigm shift, DS-031 §2.3).
 *
 * Remediation stops being a sequential pipeline (normalize → reconcile → dedup → anomaly, each blind
 * to the others) and becomes ONE recognition where the four facets are CO-PRESENT and resolve a
 * value's surprise jointly. "normalization / reconciliation / deduplication / anomaly" are not
 * operations run in sequence — they are names for kinds of pattern the surface recognizes, and the
 * correct kind depends on ALL the evidence being visible at once.
 *
 * Shape (the negotiation protocol applied to repair):
 *   round 1  — each facet assess() independently (deterministic, structural; Decision 158 below the boundary)
 *   round 2  — each facet RE-assesses seeing every other facet's claim co-present; precedence + the
 *              "absence of a competing signal is itself a signal" rule adjust conviction. The
 *              load-bearing case: deduplication's distinct-identity evidence SUPPRESSES normalization's
 *              collapse — two entities that merely look alike are NOT merged. Sequential processing
 *              (normalize first) gets this wrong; joint co-presence gets it right.
 *   apex     — ONLY the residue no facet resolves deterministically (genuine novelty) escalates to ONE
 *              bounded LLM expression that sees all co-present assessments (Decision 158 at the boundary,
 *              injectable so tests/offline proofs need no live endpoint). Iterative-joint (architect Q1).
 *
 * Korean Test (G8): every facet judges by value distribution / numeric shape / row-context overlap /
 * structural distance — never header text, language, or domain vocabulary. Domain-agnostic (Principle 8).
 */

import { rawString, valueFrequencies, structuralClusters, structuralKey, chooseCanonical, editDistance } from '@/lib/remediation/text-normalization';

export type FacetKind = 'normalization' | 'reconciliation' | 'deduplication' | 'anomaly';
export type FacetClaim = 'variant' | 'unit_mismatch' | 'distinct_identity' | 'outlier' | 'none';
export type ResolutionAction = 'collapse' | 'align' | 'keep_distinct' | 'surface_anomaly' | 'none';

export interface FacetAssessment {
  facet: FacetKind;
  claim: FacetClaim;
  confidence: number; // [0,1] structural conviction (round-2 = co-present-adjusted)
  canonical?: string; // proposed canonical (variant/unit_mismatch)
  evidence: Record<string, unknown>;
}

export interface JointResolution {
  value: string;
  column: string;
  resolvedFacet: FacetKind | 'none';
  action: ResolutionAction;
  canonical?: string;
  confidence: number;
  rounds: number;
  apexUsed: boolean;
  reasoning: string;
  assessments: FacetAssessment[]; // ALL facets' co-present assessments (the audit / co-presence record)
}

/** Per-column context handed to every facet (computed once). */
export interface ColumnContext {
  column: string;
  values: ReadonlyArray<unknown>;          // every row's value in this column (row-aligned)
  rows: ReadonlyArray<Record<string, unknown>>;
  otherColumns: string[];                  // sibling columns (row-context for the deduplication facet)
  freq: Map<string, number>;
  distinct: string[];
}

export function buildColumnContext(rows: ReadonlyArray<Record<string, unknown>>, column: string, allColumns: string[]): ColumnContext {
  const values = rows.map((r) => r[column]);
  const freq = valueFrequencies(values);
  return {
    column,
    values,
    rows,
    otherColumns: allColumns.filter((c) => c !== column),
    freq,
    distinct: Array.from(freq.keys()),
  };
}

// ── structural numeric normalization (reconciliation facet) — strip currency/separators/space; Korean-clean ──
export function numericForm(s: string): number | null {
  const t = s.trim().replace(/[\s$€£¥%]/g, '');
  if (t === '') return null;
  // thousands-comma + dot-decimal (1,000.50) OR dot-thousands + comma-decimal (1.000,50)
  let cleaned = t;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) cleaned = t.replace(/\./g, '').replace(',', '.');
  else cleaned = t.replace(/,/g, '');
  if (!/^[+-]?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** The row-context signature of a value: the multiset of sibling-column value-tuples where column===value.
 *  Used by the deduplication facet to tell "same entity, variant spelling" from "different entity, similar spelling". */
function rowContextSignature(ctx: ColumnContext, value: string): Set<string> {
  const sigs = new Set<string>();
  for (const r of ctx.rows) {
    if (rawString(r[ctx.column]) !== value) continue;
    const tuple = ctx.otherColumns.map((c) => `${c}=${rawString(r[c]) ?? '∅'}`).join('|');
    sigs.add(tuple);
  }
  return sigs;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  a.forEach((x) => { if (b.has(x)) inter++; });
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

// ───────────────────────── the four facets (round-1 deterministic assess) ─────────────────────────

/** normalization — is `value` a variant surface form of a more-canonical observed value? (string structure)
 *  Two deterministic structural heuristics (Korean-clean), mirroring hasCollapseClusters:
 *   (a) structural cluster — same key after case/whitespace/punctuation fold (e.g. "Acme Corp" ≡ "Acme Corp.")
 *   (b) fuzzy proximity   — within a small edit distance (typos / minor spelling drift, e.g. "Mexcio" ≈ "Mexico") */
export function assessNormalization(value: string, ctx: ColumnContext): FacetAssessment {
  // (a) structural cluster (case/whitespace/punctuation variance)
  const clusters = structuralClusters(ctx.values);
  for (const variants of Array.from(clusters.values())) {
    if (variants.length < 2 || !variants.includes(value)) continue;
    const canonical = chooseCanonical(variants, ctx.freq) ?? variants[0];
    if (canonical === value) continue; // value IS the canonical
    const maxLen = Math.max(value.length, canonical.length) || 1;
    const similarity = 1 - editDistance(value, canonical) / maxLen;
    return { facet: 'normalization', claim: 'variant', confidence: Math.max(0.6, Math.min(1, similarity)), canonical, evidence: { canonical, basis: 'structural-cluster', similarity: Number(similarity.toFixed(3)), clusterSize: variants.length } };
  }
  // (b) fuzzy proximity — nearest distinct value within editDistance ≤ 2 (min length ≥ 4 so it is meaningful).
  // NUMBERS are excluded: a different number is a different number, not a spelling variant (its surprise is
  // reconciliation/anomaly territory, not normalization). This keeps the facet off identifier/measure columns.
  if (numericForm(value) !== null) return { facet: 'normalization', claim: 'none', confidence: 0, evidence: {} };
  let best: { other: string; d: number; sim: number } | null = null;
  for (const other of ctx.distinct) {
    if (other === value || numericForm(other) !== null) continue;
    if (Math.min(value.length, other.length) < 4) continue;
    const d = editDistance(value, other);
    if (d === 0 || d > 2) continue;
    const sim = 1 - d / Math.max(value.length, other.length);
    if (!best || sim > best.sim) best = { other, d, sim };
  }
  if (best) {
    const canonical = chooseCanonical([value, best.other], ctx.freq) ?? best.other;
    if (canonical !== value) {
      return { facet: 'normalization', claim: 'variant', confidence: Math.max(0, Math.min(1, best.sim)), canonical, evidence: { canonical, basis: 'fuzzy', editDistance: best.d, similarity: Number(best.sim.toFixed(3)) } };
    }
  }
  return { facet: 'normalization', claim: 'none', confidence: 0, evidence: {} };
}

/** reconciliation — is `value` the same quantity as another value in a different unit/format? (numeric shape) */
export function assessReconciliation(value: string, ctx: ColumnContext): FacetAssessment {
  const n = numericForm(value);
  if (n === null) return { facet: 'reconciliation', claim: 'none', confidence: 0, evidence: {} };
  for (const other of ctx.distinct) {
    if (other === value) continue;
    const m = numericForm(other);
    if (m !== null && m === n) {
      // same magnitude, different surface form → unit/format mismatch. Canonical = more frequent form.
      const canonical = (ctx.freq.get(other) ?? 0) >= (ctx.freq.get(value) ?? 0) ? other : value;
      return { facet: 'reconciliation', claim: 'unit_mismatch', confidence: 0.9, canonical, evidence: { equivalentTo: other, normalized: n } };
    }
  }
  return { facet: 'reconciliation', claim: 'none', confidence: 0, evidence: {} };
}

/** deduplication — does `value` LOOK like a variant of another value but associate with a DIFFERENT entity?
 *  (row-context divergence). This is the facet that, co-present, can override normalization. */
export function assessDeduplication(value: string, ctx: ColumnContext): FacetAssessment {
  // numbers are not "look-alike entities" — skip (mirrors the normalization numeric guard).
  if (numericForm(value) !== null) return { facet: 'deduplication', claim: 'none', confidence: 0, evidence: {} };
  // ONLY a value that normalization WOULD collapse `value` into is a dedup concern: same structural
  // key (case/ws/punct) OR within editDistance ≤ 2 (min length ≥ 4). This keeps dedup precise — it
  // exists to PREVENT a wrong merge, so it only fires where a merge is actually at risk (not on every
  // vaguely-similar distinct value).
  const vKey = structuralKey(value);
  let best: { other: string; similarity: number } | null = null;
  for (const other of ctx.distinct) {
    if (other === value || numericForm(other) !== null) continue;
    const d = editDistance(value, other);
    const inCollapseZone = structuralKey(other) === vKey || (Math.min(value.length, other.length) >= 4 && d <= 2);
    if (!inCollapseZone) continue;
    const sim = 1 - d / (Math.max(value.length, other.length) || 1);
    if (!best || sim > best.similarity) best = { other, similarity: sim };
  }
  if (!best) return { facet: 'deduplication', claim: 'none', confidence: 0, evidence: {} };
  // string-similar — but do they describe the same entity? Compare row-context signatures.
  const sigV = rowContextSignature(ctx, value);
  const sigO = rowContextSignature(ctx, best.other);
  if (sigV.size === 0 || sigO.size === 0) return { facet: 'deduplication', claim: 'none', confidence: 0, evidence: {} };
  const contextOverlap = jaccard(sigV, sigO);
  // similar STRINGS but DISJOINT row-contexts → distinct identities that merely look alike.
  if (contextOverlap < 0.34) {
    const confidence = best.similarity * (1 - contextOverlap); // strong when very similar AND fully disjoint
    return { facet: 'deduplication', claim: 'distinct_identity', confidence: Math.max(0, Math.min(1, confidence)), canonical: best.other, evidence: { lookalike: best.other, stringSimilarity: Number(best.similarity.toFixed(3)), contextOverlap: Number(contextOverlap.toFixed(3)) } };
  }
  return { facet: 'deduplication', claim: 'none', confidence: 0, evidence: { lookalike: best.other, contextOverlap: Number(contextOverlap.toFixed(3)) } };
}

/** anomaly — is `value` a genuine distributional outlier (numeric tail or lone rare structural form)?
 *  Uses the median + MAD modified z-score (robust: an outlier does not mask itself the way mean/sd does). */
export function assessAnomaly(value: string, ctx: ColumnContext): FacetAssessment {
  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const allNums = ctx.values.map((v) => numericForm(rawString(v) ?? '')).filter((x): x is number => x !== null);
  const distinctNums = ctx.distinct.map(numericForm).filter((x): x is number => x !== null);
  const isNumericCol = distinctNums.length >= Math.max(3, ctx.distinct.length * 0.6);
  const n = numericForm(value);
  if (isNumericCol && n !== null && allNums.length >= 5) {
    const med = median(allNums);
    const mad = median(allNums.map((x) => Math.abs(x - med)));
    if (mad > 0) {
      const mz = (0.6745 * Math.abs(n - med)) / mad; // modified z-score (Iglewicz–Hoaglin)
      if (mz >= 3.5) return { facet: 'anomaly', claim: 'outlier', confidence: Math.min(1, 0.6 + (mz - 3.5) / 20), evidence: { modifiedZ: Number(mz.toFixed(2)), median: med, mad } };
    } else if (n !== med) {
      // MAD 0 (a tight mode) — any departure from the mode is anomalous.
      return { facet: 'anomaly', claim: 'outlier', confidence: 0.7, evidence: { median: med, mad: 0, note: 'departs from a tight mode' } };
    }
    return { facet: 'anomaly', claim: 'none', confidence: 0, evidence: {} };
  }
  // categorical: a singleton form among an otherwise-clustered column is a candidate outlier (weak alone)
  const count = ctx.freq.get(value) ?? 0;
  if (count === 1 && ctx.distinct.length >= 5) {
    const rarity = 1 / ctx.distinct.length;
    return { facet: 'anomaly', claim: 'outlier', confidence: Math.min(0.5, rarity * 2), evidence: { frequency: 1, distinct: ctx.distinct.length } };
  }
  return { facet: 'anomaly', claim: 'none', confidence: 0, evidence: {} };
}

// ───────────────────────── the joint resolver (round 2 + precedence + apex) ─────────────────────────

/** Confidence floors below which a facet does not own a value (structural floors, not a registry). */
export const FACET_FLOORS: Record<FacetKind, number> = {
  deduplication: 0.45,
  reconciliation: 0.6,
  normalization: 0.5,
  anomaly: 0.55,
};

/** The injectable apex expression (Decision 158 boundary). Default = the live LLM (one bounded call). */
export type ApexExpresser = (input: {
  value: string;
  column: string;
  assessments: FacetAssessment[];
}) => Promise<{ resolvedFacet: FacetKind | 'none'; action: ResolutionAction; canonical?: string; reasoning: string } | null>;

/**
 * Resolve ONE value jointly from its four co-present assessments.
 * The co-presence rules (round 2): deduplication's distinct-identity suppresses normalization's collapse;
 * reconciliation outranks anomaly; anomaly wins only when no other facet competes (absence-is-signal).
 */
export function resolveJointly(
  value: string,
  column: string,
  assessments: FacetAssessment[],
): JointResolution {
  const by = (k: FacetKind) => assessments.find((a) => a.facet === k) ?? { facet: k, claim: 'none' as FacetClaim, confidence: 0, evidence: {} };
  const dedup = by('deduplication');
  const recon = by('reconciliation');
  const norm = by('normalization');
  const anom = by('anomaly');

  const base = (facet: FacetKind, action: ResolutionAction, a: FacetAssessment, reasoning: string): JointResolution => ({
    value, column, resolvedFacet: facet, action, canonical: a.canonical, confidence: a.confidence, rounds: 2, apexUsed: false, reasoning, assessments,
  });

  // 1. CO-PRESENCE FLIP: similar strings but distinct entities → keep distinct, SUPPRESS normalization collapse.
  if (dedup.claim === 'distinct_identity' && dedup.confidence >= FACET_FLOORS.deduplication) {
    const suppressed = norm.claim === 'variant' ? ` (suppresses normalization's collapse to "${norm.canonical}" — same-looking, different entity)` : '';
    return base('deduplication', 'keep_distinct', dedup, `distinct identity: row-context disjoint from "${dedup.canonical}"${suppressed}`);
  }
  // 2. reconciliation outranks anomaly/normalization for a true format/unit match.
  if (recon.claim === 'unit_mismatch' && recon.confidence >= FACET_FLOORS.reconciliation) {
    return base('reconciliation', 'align', recon, `unit/format match of magnitude ${JSON.stringify(recon.evidence.normalized)} with "${recon.evidence.equivalentTo}"`);
  }
  // 3. normalization collapse (only when dedup did NOT veto).
  if (norm.claim === 'variant' && norm.confidence >= FACET_FLOORS.normalization) {
    return base('normalization', 'collapse', norm, `variant surface form of canonical "${norm.canonical}" (no competing identity signal)`);
  }
  // 4. anomaly wins ONLY when no other facet competes (the absence of a competing signal is itself a signal).
  const othersQuiet = norm.confidence === 0 && recon.confidence === 0 && dedup.claim === 'none';
  if (anom.claim === 'outlier' && anom.confidence >= FACET_FLOORS.anomaly && othersQuiet) {
    return base('anomaly', 'surface_anomaly', anom, `genuine outlier; no facet claims it (absence-of-competing-signal)`);
  }
  // 5. residue — no facet resolves deterministically → apex (handled by recognizeColumn).
  return { value, column, resolvedFacet: 'none', action: 'none', confidence: 0, rounds: 2, apexUsed: false, reasoning: 'unresolved residue → apex', assessments };
}

export interface RecognizeOptions {
  apex?: ApexExpresser;     // injectable; if omitted, residue stays 'none' (deterministic-only mode)
  maxApexValues?: number;   // bound the apex (cost); default 25
}

/**
 * Run joint recognition over the surprising values of one column. A "surprising value" is any distinct
 * value at least one facet flags (round 1). Resolved deterministically where co-presence settles it;
 * the residue escalates to the bounded apex expression. Returns one JointResolution per assessed value.
 */
export async function recognizeColumn(ctx: ColumnContext, opts: RecognizeOptions = {}): Promise<JointResolution[]> {
  const resolutions: JointResolution[] = [];
  const residue: { value: string; assessments: FacetAssessment[] }[] = [];

  for (const value of ctx.distinct) {
    // round 1 (independent) + round 2 is folded into resolveJointly (co-present precedence).
    const assessments: FacetAssessment[] = [
      assessNormalization(value, ctx),
      assessReconciliation(value, ctx),
      assessDeduplication(value, ctx),
      assessAnomaly(value, ctx),
    ];
    // only values some facet flags are "surprising"; a fully-quiet value is silently predicted (no work).
    if (assessments.every((a) => a.claim === 'none')) continue;
    const res = resolveJointly(value, ctx.column, assessments);
    if (res.resolvedFacet === 'none') residue.push({ value, assessments });
    else resolutions.push(res);
  }

  // apex — bounded LLM expression over the unresolved residue (Decision 158 at the boundary).
  const apex = opts.apex;
  const cap = opts.maxApexValues ?? 25;
  if (apex && residue.length > 0) {
    for (const r of residue.slice(0, cap)) {
      try {
        const out = await apex({ value: r.value, column: ctx.column, assessments: r.assessments });
        if (out) {
          resolutions.push({ value: r.value, column: ctx.column, resolvedFacet: out.resolvedFacet, action: out.action, canonical: out.canonical, confidence: 0.5, rounds: 3, apexUsed: true, reasoning: `apex: ${out.reasoning}`, assessments: r.assessments });
          continue;
        }
      } catch { /* apex down → leave as unresolved residue (degrade, never crash) */ }
      resolutions.push({ value: r.value, column: ctx.column, resolvedFacet: 'none', action: 'none', confidence: 0, rounds: 3, apexUsed: true, reasoning: 'apex returned no resolution', assessments: r.assessments });
    }
  }
  return resolutions;
}
