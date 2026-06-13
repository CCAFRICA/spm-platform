// OB-203 Phase 4 — Signal Spine vocabulary (R3/DI-5/DI-7).
//
// Decision-30 vocabulary extension: structural signal_type values on the ONE canonical surface
// (classification_signals) via the ONE canonical writer (G7 — new types, not a new channel).
// EPG-4.3: every signal_type below is structural — zero domain literals (Korean Test holds).
//
// DI-5: these are WRITE-side emitters only. Density (read-side, computeClassificationDensity)
// governs what is READ/surfaced; nothing here gates a write on density.
//
// DI-7 / architect redirect (2026-06-11): emission is FIRE-AND-FORGET with loud logging — a signal
// write failure must NEVER add latency or failure coupling to the import path (DI-1's spirit:
// remediation must not break the thing it remediates).

import { writeSignal, writeSignalBatch, type CanonicalSignalInput } from '@/lib/intelligence/canonical-signal-writer';

// ── signal_type vocabulary (architect-ratified 2026-06-11) ─────
export const SIGNAL = {
  atomRecognition: 'comprehension:atom_recognition',
  composition: 'comprehension:composition',
  tierResolution: 'comprehension:tier_resolution',
  sessionLifecycle: 'comprehension:session_lifecycle',
  resolution: 'comprehension:resolution',
  learningWriteBlocked: 'comprehension:learning_write_blocked',
  interactionImport: 'interaction:import',
  workbookGraph: 'comprehension:workbook_graph',
} as const;

const CTX = { phase: '4', ob: 'OB-203' };

// ── fire-and-forget core (DI-7 redirect) ──────────────────────
/**
 * Await a write but NEVER throw — surfaces failures loudly. Exported for tests
 * (forced-failure → caller unaffected + loud log).
 */
export async function safeWrite(write: () => Promise<unknown>, signalType: string): Promise<void> {
  try {
    await write();
  } catch (e) {
    console.error(`[OB-203][signal] ${signalType} write failed (non-blocking): ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Fire a signal without awaiting — the import path is never blocked or coupled to the write. */
export function fireSignal(input: CanonicalSignalInput, supabaseUrl: string, supabaseServiceKey: string): void {
  void safeWrite(() => writeSignal(input, supabaseUrl, supabaseServiceKey), input.signalType);
}

/** Fire a batch without awaiting (one round-trip). Empty input is a no-op. */
export function fireSignalBatch(inputs: CanonicalSignalInput[], supabaseUrl: string, supabaseServiceKey: string): void {
  if (inputs.length === 0) return;
  void safeWrite(() => writeSignalBatch(inputs, supabaseUrl, supabaseServiceKey), inputs[0].signalType);
}

// ── builders (pure; return CanonicalSignalInput) ──────────────
export interface AtomRecognitionParams {
  tenantId: string; atomHash: string; role: string; recognitionConfidence: number; roleConfidence: number;
  sheetName?: string | null; importSessionId?: string | null;
}
export function buildAtomRecognitionSignal(p: AtomRecognitionParams): CanonicalSignalInput {
  return {
    tenantId: p.tenantId, signalType: SIGNAL.atomRecognition,
    signalValue: { atomHash: p.atomHash, role: p.role, recognitionConfidence: p.recognitionConfidence, roleConfidence: p.roleConfidence },
    confidence: p.recognitionConfidence, sheetName: p.sheetName ?? null, scope: 'tenant', source: 'sci_agent',
    context: { ...CTX, importSessionId: p.importSessionId ?? null },
  };
}

export interface CompositionParams {
  tenantId: string; unitId: string; sheetName?: string | null; compositionConfidence: number;
  knownCount: number; novelCount: number; importSessionId?: string | null;
}
export function buildCompositionSignal(p: CompositionParams): CanonicalSignalInput {
  return {
    tenantId: p.tenantId, signalType: SIGNAL.composition,
    signalValue: { unitId: p.unitId, compositionConfidence: p.compositionConfidence, knownCount: p.knownCount, novelCount: p.novelCount },
    confidence: p.compositionConfidence, sheetName: p.sheetName ?? null, scope: 'tenant', source: 'sci_agent',
    context: { ...CTX, importSessionId: p.importSessionId ?? null },
  };
}

export type Resolver = 'flywheel' | 'llm' | 'deterministic' | 'human';
export interface TierResolutionParams {
  tenantId: string; unitId: string; sheetName?: string | null; tier: number | null; resolver: Resolver;
  importSessionId?: string | null;
  // OB-203 §2: warm-path witness — fieldBindings injected from the flywheel for this Tier-1 sheet (0 on
  // the cold/LLM path). Recorded on the durable spine so the import-telemetry counter derives, never tallies.
  injectedBindings?: number;
}
export function buildTierResolutionSignal(p: TierResolutionParams): CanonicalSignalInput {
  return {
    tenantId: p.tenantId, signalType: SIGNAL.tierResolution,
    signalValue: { unitId: p.unitId, tier: p.tier, resolver: p.resolver, injectedBindings: p.injectedBindings ?? 0 },
    sheetName: p.sheetName ?? null, scope: 'tenant', source: 'sci_agent',
    context: { ...CTX, importSessionId: p.importSessionId ?? null },
  };
}

export type SessionPhase = 'open' | 'progressing' | 'settled';
export interface SessionLifecycleParams {
  tenantId: string; importSessionId: string; phase: SessionPhase; unitCount?: number | null;
}
export function buildSessionLifecycleSignal(p: SessionLifecycleParams): CanonicalSignalInput {
  return {
    tenantId: p.tenantId, signalType: SIGNAL.sessionLifecycle,
    signalValue: { importSessionId: p.importSessionId, phase: p.phase, unitCount: p.unitCount ?? null },
    scope: 'tenant', source: 'sci_agent',
    context: { ...CTX, importSessionId: p.importSessionId },
  };
}

export interface ResolutionParams {
  tenantId: string; unitId: string; sheetName?: string | null; from: string; to: string;
  source: 'user_corrected' | 'sci_agent'; importSessionId?: string | null;
}
export function buildResolutionSignal(p: ResolutionParams): CanonicalSignalInput {
  return {
    tenantId: p.tenantId, signalType: SIGNAL.resolution,
    signalValue: { unitId: p.unitId, from: p.from, to: p.to },
    sheetName: p.sheetName ?? null, scope: 'tenant', source: p.source,
    humanCorrectionFrom: p.source === 'user_corrected' ? p.from : null,
    context: { ...CTX, importSessionId: p.importSessionId ?? null },
  };
}

export type BlockedSurface = 'fingerprint_write' | 'tier1_read';
export interface LearningWriteBlockedParams {
  tenantId: string; surface: BlockedSurface; reason: string; fingerprintHash?: string | null;
  sheetName?: string | null; sourceFileName?: string | null;
}
export function buildLearningWriteBlockedSignal(p: LearningWriteBlockedParams): CanonicalSignalInput {
  return {
    tenantId: p.tenantId, signalType: SIGNAL.learningWriteBlocked,
    signalValue: { surface: p.surface, reason: p.reason, fingerprintHash: p.fingerprintHash ?? null },
    confidence: 0, decisionSource: 'failed_interpretation',
    sheetName: p.sheetName ?? null, sourceFileName: p.sourceFileName ?? null, scope: 'tenant', source: 'sci_agent',
    context: { ...CTX, di: 'DI-7' },
  };
}

export interface WorkbookGraphParams {
  tenantId: string; importSessionId?: string | null;
  roles: Record<string, string>;        // unitId -> graph role
  edgeCount: number;
  suppressedReferenceKeys: number;      // D3: reference_keys flagged as non-FK (spurious-entity prevention)
}
export function buildWorkbookGraphSignal(p: WorkbookGraphParams): CanonicalSignalInput {
  return {
    tenantId: p.tenantId, signalType: SIGNAL.workbookGraph,
    signalValue: { roles: p.roles, edgeCount: p.edgeCount, suppressedReferenceKeys: p.suppressedReferenceKeys },
    scope: 'tenant', source: 'sci_agent',
    context: { ...CTX, importSessionId: p.importSessionId ?? null },
  };
}

export type InteractionAction = 'view' | 'expand' | 'action_click' | 'correction' | 'dwell';
export interface InteractionParams {
  tenantId: string; surface: string; action: InteractionAction; unitId?: string | null;
  dwellMs?: number | null; importSessionId?: string | null; metadata?: Record<string, unknown>;
}
export function buildInteractionSignal(p: InteractionParams): CanonicalSignalInput {
  return {
    tenantId: p.tenantId, signalType: SIGNAL.interactionImport,
    signalValue: { surface: p.surface, action: p.action, unitId: p.unitId ?? null, dwellMs: p.dwellMs ?? null, ...(p.metadata ?? {}) },
    scope: 'tenant', source: 'user_interaction',
    context: { ...CTX, importSessionId: p.importSessionId ?? null },
  };
}
