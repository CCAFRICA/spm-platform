// Synaptic Content Ingestion — Composite Structural Signatures
// OB-159 — Fingerprints over checklists.
// When multiple structural signals align, set a confidence floor.
// Korean Test: ALL conditions use structural properties. Zero field-name matching.

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

  // ────────────────────────────────────────────────────────
  // TRANSACTION: "Repeated entities over time with numeric measurements"
  // ────────────────────────────────────────────────────────
  const hasHighRepeat = structure.identifierRepeatRatio > 1.5;
  const hasTemporalDimension = patterns.hasDateColumn || patterns.hasPeriodMarkers;
  const isDataHeavy = structure.numericFieldRatio > 0.40;

  console.log('[SCI SigCheck]', profile.tabName, 'repeated_entities_over_time', { hasHighRepeat, repeatRatio: structure.identifierRepeatRatio, hasTemporalDimension, hasDate: patterns.hasDateColumn, hasPeriodMarkers: patterns.hasPeriodMarkers, isDataHeavy, numericFieldRatio: structure.numericFieldRatio, matched: hasHighRepeat && hasTemporalDimension && isDataHeavy });
  if (hasHighRepeat && hasTemporalDimension && isDataHeavy) {
    matches.push({
      agent: 'transaction',
      confidence: 0.80,
      signatureName: 'repeated_entities_over_time',
      matchedConditions: [
        `identifierRepeatRatio: ${structure.identifierRepeatRatio.toFixed(1)} (>1.5)`,
        `temporal: ${patterns.hasPeriodMarkers ? 'period markers' : 'date column'}`,
        `numericFieldRatio: ${(structure.numericFieldRatio * 100).toFixed(0)}% (>40%)`,
      ],
    });
  }

  // ────────────────────────────────────────────────────────
  // ENTITY: "One row per unique individual with categorical attributes"
  // ────────────────────────────────────────────────────────
  const hasLowRepeat = structure.identifierRepeatRatio > 0 && structure.identifierRepeatRatio <= 1.5;
  const isCategoricalHeavy = structure.categoricalFieldRatio > 0.25;
  const hasId = patterns.hasEntityIdentifier;
  const hasName = patterns.hasStructuralNameColumn;

  console.log('[SCI SigCheck]', profile.tabName, 'one_per_entity_with_attributes', { hasLowRepeat, repeatRatio: structure.identifierRepeatRatio, isCategoricalHeavy, catRatio: structure.categoricalFieldRatio, hasId, hasName, matched: hasLowRepeat && isCategoricalHeavy && hasId && hasName });
  if (hasLowRepeat && isCategoricalHeavy && hasId && hasName) {
    matches.push({
      agent: 'entity',
      confidence: 0.85,
      signatureName: 'one_per_entity_with_attributes',
      matchedConditions: [
        `identifierRepeatRatio: ${structure.identifierRepeatRatio.toFixed(1)} (<=1.3)`,
        `categoricalFieldRatio: ${(structure.categoricalFieldRatio * 100).toFixed(0)}% (>25%)`,
        `hasEntityIdentifier: true`,
        `hasStructuralNameColumn: true`,
      ],
    });
  }

  // ────────────────────────────────────────────────────────
  // TARGET: "Per-entity numeric benchmarks without temporal repetition"
  // ────────────────────────────────────────────────────────
  const targetLowRepeat = structure.identifierRepeatRatio > 0 && structure.identifierRepeatRatio <= 1.5;
  const hasModerateNumeric = structure.numericFieldRatio > 0.30;
  const targetNoTemporal = !hasTemporalDimension;

  console.log('[SCI SigCheck]', profile.tabName, 'per_entity_benchmarks_static', { targetLowRepeat, repeatRatio: structure.identifierRepeatRatio, hasModerateNumeric, numericRatio: structure.numericFieldRatio, hasId, targetNoTemporal, matched: targetLowRepeat && hasModerateNumeric && hasId && targetNoTemporal });
  if (targetLowRepeat && hasModerateNumeric && hasId && targetNoTemporal) {
    matches.push({
      agent: 'target',
      confidence: 0.75,
      signatureName: 'per_entity_benchmarks_static',
      matchedConditions: [
        `identifierRepeatRatio: ${structure.identifierRepeatRatio.toFixed(1)} (<=1.5)`,
        `numericFieldRatio: ${(structure.numericFieldRatio * 100).toFixed(0)}% (>30%)`,
        `hasEntityIdentifier: true`,
        `noTemporalDimension: true`,
      ],
    });
  }

  // ────────────────────────────────────────────────────────
  // PLAN: "Sparse rule structure with mixed types and low row count"
  // ────────────────────────────────────────────────────────
  const isSparseOrAutoHeaders = structure.headerQuality === 'auto_generated' || structure.sparsity > 0.30;
  const isLowRowCount = structure.rowCount < 50;
  const noIdOrVeryLow = !hasId || structure.rowCount < 20;

  console.log('[SCI SigCheck]', profile.tabName, 'sparse_rule_structure', { isSparseOrAutoHeaders, sparsity: structure.sparsity, headerQuality: structure.headerQuality, isLowRowCount, rowCount: structure.rowCount, noIdOrVeryLow, matched: isSparseOrAutoHeaders && isLowRowCount && noIdOrVeryLow });
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
  // ────────────────────────────────────────────────────────
  const isSmall = structure.rowCount < 100;
  const notPersonLevel = !hasId || structure.identifierRepeatRatio <= 1.0;
  const hasCategoricalKey = structure.categoricalFieldCount >= 1;

  console.log('[SCI SigCheck]', profile.tabName, 'lookup_table', { isSmall, rowCount: structure.rowCount, notPersonLevel, hasId, repeatRatio: structure.identifierRepeatRatio, hasCategoricalKey, catCount: structure.categoricalFieldCount, notSparse: !isSparseOrAutoHeaders, matched: isSmall && notPersonLevel && hasCategoricalKey && !isSparseOrAutoHeaders });
  if (isSmall && notPersonLevel && hasCategoricalKey && !isSparseOrAutoHeaders) {
    matches.push({
      agent: 'reference',
      confidence: 0.75,
      signatureName: 'lookup_table',
      matchedConditions: [
        `rowCount: ${structure.rowCount} (<100)`,
        `not person-level identifier`,
        `categoricalFieldCount: ${structure.categoricalFieldCount}`,
      ],
    });
  }

  return matches;
}
