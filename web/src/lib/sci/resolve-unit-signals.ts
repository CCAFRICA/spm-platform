// OB-203 Phase 5 (D4) — pure mapping from a resolution ACTION to its outcome signals.
// EPG-5.1 (every action emits a signal) and EPG-5.2 (no action mutates state outside the signal
// path) are both provable against this function: an action's ENTIRE durable effect is the signals
// it returns — the route does nothing but emit them.
//
// SCOPE (architect HALT-6 item 2): assign is CLASSIFICATION-LEVEL only; binding-level is Phase 6.

import type { CanonicalSignalInput } from '@/lib/intelligence/canonical-signal-writer';
import type { UnitStateSignalParams } from './comprehension-state-service';
import { buildResolutionSignal, buildInteractionSignal } from './comprehension-signal-vocabulary';

export type ResolveAction = 'assign' | 'exclude';
const SURFACE = 'session_state_live';

export interface ResolveUnitInput {
  tenantId: string;
  importSessionId: string;
  unitId: string;
  sheetName?: string | null;
  action: ResolveAction;
  classification?: string;
}

export interface ResolveUnitSignals {
  /** durable unit-state transitions (awaited so the next poll reflects them). */
  states: UnitStateSignalParams[];
  /** fire-and-forget Phase 4 vocabulary signals (resolution / interaction). */
  signals: CanonicalSignalInput[];
}

/**
 * `assign` (manual classification): the unit becomes `resolved` (durable state) + a `resolution`
 * (user_corrected provenance) + a `correction` interaction.
 * `exclude`: a proposal-level decision — recorded as an `action_click` interaction (failed units are
 * already non-confirmable; nothing else mutates).
 */
export function resolveUnitSignals(p: ResolveUnitInput): ResolveUnitSignals {
  const common = { tenantId: p.tenantId, importSessionId: p.importSessionId, unitId: p.unitId, sheetName: p.sheetName ?? null };

  if (p.action === 'assign') {
    return {
      states: [{
        ...common, sourceFileName: null, state: 'resolved',
        classification: p.classification ?? null, humanCorrectionFrom: 'failed_interpretation', seq: 0,
      }],
      signals: [
        buildResolutionSignal({ ...common, from: 'failed_interpretation', to: 'classified', source: 'user_corrected' }),
        buildInteractionSignal({ tenantId: p.tenantId, surface: SURFACE, action: 'correction', unitId: p.unitId, importSessionId: p.importSessionId, metadata: { classification: p.classification } }),
      ],
    };
  }

  return {
    states: [],
    signals: [
      buildInteractionSignal({ tenantId: p.tenantId, surface: SURFACE, action: 'action_click', unitId: p.unitId, importSessionId: p.importSessionId, metadata: { control: 'exclude' } }),
    ],
  };
}
