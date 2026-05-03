/**
 * HF-196 Phase 1D — Single canonical declaration of data_type per D154/D155.
 *
 * data_type is the structural class of a committed_data row, derived from
 * SCI's informational_label classification (single canonical surface).
 *
 * Per D154: every boundary derives from this resolver. Private copies prohibited.
 * Per D155: 5 federated entries (one per SCI agent classification).
 * Per Korean Test (T1-E910): identity preservation — no domain/tenant literals.
 *
 * Identity not translation: data_type === informational_label. The simpler
 * shape is the substrate-aligned shape per D154 single canonical declaration.
 */

export type SemanticDataType = 'entity' | 'transaction' | 'target' | 'reference' | 'plan';

export type SCIClassification = 'entity' | 'transaction' | 'target' | 'reference' | 'plan';

/**
 * Resolve data_type from SCI classification.
 *
 * Identity: data_type === informational_label (no translation).
 * The SCI agent's classification IS the canonical structural class per D154/D155.
 */
export function resolveDataTypeFromClassification(
  classification: SCIClassification,
): SemanticDataType {
  // Exhaustiveness via discriminated union — TS compile-time guard
  switch (classification) {
    case 'entity':
      return 'entity';
    case 'transaction':
      return 'transaction';
    case 'target':
      return 'target';
    case 'reference':
      return 'reference';
    case 'plan':
      return 'plan';
    default: {
      // Compile-time exhaustiveness check (Rule 28 from HF-195)
      const _exhaustive: never = classification;
      throw new Error(`Unrecognized SCI classification: ${_exhaustive}`);
    }
  }
}
