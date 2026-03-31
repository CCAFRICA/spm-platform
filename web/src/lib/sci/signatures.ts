// Synaptic Content Ingestion — Composite Structural Signatures
// OB-159, OB-160A, OB-160C — Fingerprints over checklists.
// When multiple structural signals align, set a confidence floor.
// Korean Test: ALL conditions use structural properties. Zero field-name matching.
// OB-160C: Header comprehension REINFORCES signatures (ADDITIVE — signatures fire on structural signals alone).

import type { ContentProfile, AgentType } from './sci-types';

export interface SignatureMatch {
  agent: AgentType;
  confidence: number;
  signatureName: string;
  matchedConditions: string[];
}

export function detectSignatures(profile: ContentProfile): SignatureMatch[] {
  const matches: SignatureMatch[] = [];
  const { structure, patterns } = profile;

  // Header comprehension column role counts (when available)
  const hc = profile.headerComprehension;
  let hcTemporalCount = 0;
  let hcMeasureCount = 0;
  let hcNameCount = 0;
  let hcAttributeCount = 0;
  let hcReferenceKeyCount = 0;
  if (hc) {
    for (const interp of Array.from(hc.interpretations.values())) {
      switch (interp.columnRole) {
        case 'temporal': hcTemporalCount++; break;
        case 'measure': hcMeasureCount++; break;
        case 'name': hcNameCount++; break;
        case 'attribute': hcAttributeCount++; break;
        case 'reference_key': hcReferenceKeyCount++; break;
      }
    }
  }

  // ────────────────────────────────────────────────────────
  // TRANSACTION: "Repeated entities over time with numeric measurements"
  // Fires on structural signals alone. HC boosts confidence.
  // ────────────────────────────────────────────────────────
  const hasHighRepeat = structure.identifierRepeatRatio > 1.5;
  const hasTemporalDimension = patterns.hasDateColumn || patterns.hasTemporalColumns;
  const isDataHeavy = structure.numericFieldRatio > 0.40;

  if (hasHighRepeat && hasTemporalDimension && isDataHeavy) {
    let confidence = 0.80;
    const conditions = [
      `identifierRepeatRatio: ${structure.identifierRepeatRatio.toFixed(1)} (>1.5)`,
      `temporal: ${patterns.hasTemporalColumns ? 'temporal columns' : 'date column'}`,
      `numericFieldRatio: ${(structure.numericFieldRatio * 100).toFixed(0)}% (>40%)`,
    ];
    if (hcTemporalCount >= 1) {
      confidence += 0.05;
      conditions.push(`HC confirms: ${hcTemporalCount} temporal column(s)`);
    }
    if (hcMeasureCount >= 3) {
      confidence += 0.05;
      conditions.push(`HC confirms: ${hcMeasureCount} measure columns`);
    }
    matches.push({
      agent: 'transaction',
      confidence: Math.min(0.95, confidence),
      signatureName: 'repeated_entities_over_time',
      matchedConditions: conditions,
    });
  }

  // ────────────────────────────────────────────────────────
  // ENTITY: "One row per unique individual with categorical attributes"
  // Fires on structural signals alone. HC boosts confidence.
  // ────────────────────────────────────────────────────────
  const hasLowRepeat = structure.identifierRepeatRatio > 0 && structure.identifierRepeatRatio <= 1.5;
  const isCategoricalHeavy = structure.categoricalFieldRatio > 0.25;
  const hasId = patterns.hasEntityIdentifier;
  const hasName = patterns.hasStructuralNameColumn;

  if (hasLowRepeat && isCategoricalHeavy && hasId && hasName) {
    let confidence = 0.85;
    const conditions = [
      `identifierRepeatRatio: ${structure.identifierRepeatRatio.toFixed(1)} (<=1.5)`,
      `categoricalFieldRatio: ${(structure.categoricalFieldRatio * 100).toFixed(0)}% (>25%)`,
      `hasEntityIdentifier: true`,
      `hasStructuralNameColumn: true`,
    ];
    if (hcNameCount >= 1) {
      confidence += 0.05;
      conditions.push(`HC confirms: ${hcNameCount} name column(s)`);
    }
    if (hcAttributeCount >= 2) {
      confidence += 0.03;
      conditions.push(`HC confirms: ${hcAttributeCount} attribute columns`);
    }
    matches.push({
      agent: 'entity',
      confidence: Math.min(0.95, confidence),
      signatureName: 'one_per_entity_with_attributes',
      matchedConditions: conditions,
    });
  }

  // ────────────────────────────────────────────────────────
  // TARGET: "Per-entity numeric benchmarks without temporal repetition"
  // Fires on structural signals alone. HC boosts confidence.
  // ────────────────────────────────────────────────────────
  const targetLowRepeat = structure.identifierRepeatRatio > 0 && structure.identifierRepeatRatio <= 1.5;
  const hasModerateNumeric = structure.numericFieldRatio > 0.30;
  const targetNoTemporal = !hasTemporalDimension;

  if (targetLowRepeat && hasModerateNumeric && hasId && targetNoTemporal) {
    let confidence = 0.75;
    const conditions = [
      `identifierRepeatRatio: ${structure.identifierRepeatRatio.toFixed(1)} (<=1.5)`,
      `numericFieldRatio: ${(structure.numericFieldRatio * 100).toFixed(0)}% (>30%)`,
      `hasEntityIdentifier: true`,
      `noTemporalDimension: true`,
    ];
    // HC reinforcement: no temporal columns confirms target pattern
    if (hc && hcTemporalCount === 0) {
      confidence += 0.05;
      conditions.push('HC confirms: zero temporal columns');
    }
    if (hcMeasureCount >= 2) {
      confidence += 0.03;
      conditions.push(`HC confirms: ${hcMeasureCount} measure columns`);
    }
    matches.push({
      agent: 'target',
      confidence: Math.min(0.90, confidence),
      signatureName: 'per_entity_benchmarks_static',
      matchedConditions: conditions,
    });
  }

  // ────────────────────────────────────────────────────────
  // TARGET: "Entity-referencing file with temporal dimension"
  // Fires on structural signals alone. HC boosts confidence.
  // Captures quota/target files that have a temporal column (effective_date)
  // and low numeric ratio — structurally similar to entity rosters but
  // with a temporal dimension that rosters lack.
  // Korean Test: ALL conditions use structural properties. Zero field-name matching.
  // ────────────────────────────────────────────────────────
  const hasNonIdNumericField = profile.fields.some(f =>
    (f.dataType === 'integer' || f.dataType === 'decimal' || f.dataType === 'currency') &&
    !f.nameSignals.containsId &&
    !f.distribution.isSequential
  );
  const isSmallDataset = structure.rowCount < 200;

  if (hasLowRepeat && hasId && hasTemporalDimension && hasNonIdNumericField && isSmallDataset) {
    let confidence = 0.80;
    const conditions = [
      `identifierRepeatRatio: ${structure.identifierRepeatRatio.toFixed(1)} (<=1.5)`,
      `hasEntityIdentifier: true`,
      `hasTemporalDimension: true`,
      `hasNonIdNumericField: true`,
      `rowCount: ${structure.rowCount} (<200)`,
    ];
    if (hcTemporalCount >= 1 && hcMeasureCount >= 1) {
      confidence += 0.05;
      conditions.push(`HC confirms: ${hcTemporalCount} temporal + ${hcMeasureCount} measure columns`);
    }
    matches.push({
      agent: 'target',
      confidence: Math.min(0.90, confidence),
      signatureName: 'entity_referencing_with_temporal',
      matchedConditions: conditions,
    });
  }

  // ────────────────────────────────────────────────────────
  // PLAN: "Sparse rule structure with mixed types and low row count"
  // Fires on structural signals alone. No HC reinforcement (plan data rarely has meaningful headers).
  // ────────────────────────────────────────────────────────
  const isSparseOrAutoHeaders = structure.headerQuality === 'auto_generated' || structure.sparsity > 0.30;
  const isLowRowCount = structure.rowCount < 50;
  const noIdOrVeryLow = !hasId || structure.rowCount < 20;

  if (isSparseOrAutoHeaders && isLowRowCount && noIdOrVeryLow) {
    matches.push({
      agent: 'plan',
      confidence: 0.85,
      signatureName: 'sparse_rule_structure',
      matchedConditions: [
        `sparse/auto headers: sparsity=${(structure.sparsity * 100).toFixed(0)}%, quality=${structure.headerQuality}`,
        `rowCount: ${structure.rowCount} (<50)`,
        `noEntityIdentifier or very low rows`,
      ],
    });
  }

  // ────────────────────────────────────────────────────────
  // REFERENCE: "Low-volume lookup table with categorical key"
  // Fires on structural signals alone. HC boosts confidence.
  // ────────────────────────────────────────────────────────
  const isSmall = structure.rowCount < 100;
  const notPersonLevel = !hasId || structure.identifierRepeatRatio <= 1.0;
  const hasCategoricalKey = structure.categoricalFieldCount >= 1;

  if (isSmall && notPersonLevel && hasCategoricalKey && !isSparseOrAutoHeaders) {
    let confidence = 0.75;
    const conditions = [
      `rowCount: ${structure.rowCount} (<100)`,
      `not person-level identifier`,
      `categoricalFieldCount: ${structure.categoricalFieldCount}`,
    ];
    if (hcReferenceKeyCount >= 1) {
      confidence += 0.05;
      conditions.push(`HC confirms: ${hcReferenceKeyCount} reference key column(s)`);
    }
    matches.push({
      agent: 'reference',
      confidence: Math.min(0.90, confidence),
      signatureName: 'lookup_table',
      matchedConditions: conditions,
    });
  }

  return matches;
}
