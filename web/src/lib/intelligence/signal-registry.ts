/**
 * HF-198 E3 — Signal-type registry for read-before-derive structural partitioning.
 *
 * Every signal_type that the platform writes has a declaration here. Each
 * declaration names ≥1 reader per AUD-004 v3 §2 E3 read-coupling rules:
 *   - L1 Classification: at least one reader within originating flywheel
 *   - L2 Comprehension: readers within originating flywheel AND cross-flywheel
 *   - L3 Convergence: readers across all three flywheels
 *
 * F-006 closure: every signal write has at least one named reader.
 * F-011 closure: signals without declared readers are surfaced as
 *   SignalNotRegisteredError at validation time, not silently persisted.
 *
 * Korean Test (AP-25 / Decision 154): signal_type identifiers are governance
 * vocabulary (prefix:descriptor). No language-specific or domain-specific
 * lexicon. Reader citations are file paths (structural references).
 *
 * Composition with primitive-registry: signal_type declarations are a parallel
 * primitive class. Both registries share the structured-failure discipline
 * established by E1+E2.
 */

export type SignalLevel = 'L1' | 'L2' | 'L3';
export type FlywheelScope = 'tenant' | 'foundational' | 'domain';

export interface SignalTypeDeclaration {
  identifier: string;                  // e.g., 'comprehension:plan_interpretation'
  signal_level: SignalLevel;
  originating_flywheel: FlywheelScope;
  declared_writers: string[];          // file path or function citation
  declared_readers: string[];          // file path or function citation
  description: string;                 // structural purpose, not implementation detail
}

/**
 * Structured error class for unregistered signal_type writes (F-011 closure).
 * Caller decides whether to throw, log, or fall back per their discipline
 * (signal writes are typically fire-and-forget, so soft-warn is the default
 * at runtime; assertRegistered() throws for code paths that require it).
 */
export class SignalNotRegisteredError extends Error {
  constructor(
    public readonly signalType: string,
    public readonly callingContext: string,
    public readonly availableSignalTypes: string[],
  ) {
    super(
      `[SignalRegistry] Signal type '${signalType}' not registered. ` +
      `Calling context: ${callingContext}. ` +
      `Per AUD-004 v3 §2 E3, every signal_type must declare at least one reader before write. ` +
      `Available registered signal_types: ${availableSignalTypes.join(', ')}`,
    );
    this.name = 'SignalNotRegisteredError';
  }
}

// ──────────────────────────────────────────────
// Registry surface (module-scoped Map; one declaration per signal_type)
// ──────────────────────────────────────────────

const REGISTRY = new Map<string, SignalTypeDeclaration>();

/**
 * Register a signal_type declaration. Idempotent — re-registering with the
 * same identifier replaces the prior declaration (last-write-wins). Per E3
 * read-coupling rules, declared_readers must be non-empty:
 *   - L1: ≥1 reader (within originating flywheel)
 *   - L2: ≥1 reader (cross-flywheel coverage expected; not enforced here as
 *     reader location is a file path; coverage is a documentation property)
 *   - L3: ≥1 reader
 *
 * Readers are cited as file paths so the registry doubles as a navigation map
 * for future architects extending the signal surface.
 */
export function register(decl: SignalTypeDeclaration): void {
  if (decl.declared_readers.length === 0) {
    throw new Error(
      `[SignalRegistry] register: signal_type '${decl.identifier}' has zero declared readers. ` +
      `Per AUD-004 v3 §2 E3, every signal_type must declare at least one reader before write.`,
    );
  }
  REGISTRY.set(decl.identifier, decl);
}

export function lookup(signalType: string): SignalTypeDeclaration | null {
  return REGISTRY.get(signalType) ?? null;
}

export function all(): SignalTypeDeclaration[] {
  return Array.from(REGISTRY.values());
}

export function isRegistered(signalType: string): boolean {
  return REGISTRY.has(signalType);
}

/**
 * Throw SignalNotRegisteredError if signal_type is not in the registry. Used
 * by code paths that REQUIRE registration before persist (e.g., negative test
 * suite, structured failure tests).
 */
export function assertRegistered(signalType: string, callingContext: string): void {
  if (!REGISTRY.has(signalType)) {
    throw new SignalNotRegisteredError(signalType, callingContext, all().map(d => d.identifier));
  }
}

// ──────────────────────────────────────────────
// Foundational registrations — operative signal_types as of HF-198
//
// Each declaration cites declared_readers as file paths (structural reference).
// Adding a new signal_type requires registering it here BEFORE any write site;
// otherwise SignalNotRegisteredError fires (assertRegistered) or [SignalRegistry]
// soft-warn surfaces (persistSignal optional path — not enforced at fire-and-
// forget call sites yet; future hardening can opt in).
// ──────────────────────────────────────────────

register({
  identifier: 'classification:outcome',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/app/api/ingest/classification/route.ts',
    'web/src/lib/intelligence/classification-signal-service.ts',
    'web/src/lib/sci/signal-capture-service.ts (toPrefixSignalType: content_classification, content_classification_outcome)',
  ],
  declared_readers: [
    'web/src/lib/intelligence/convergence-service.ts (observations.crossRun query)',
    'web/src/lib/sci/signal-capture-service.ts (getSCISignals consumers)',
  ],
  description: 'Tenant-scoped content classification outcome from agent dispatch.',
});

register({
  identifier: 'classification:human_correction',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/lib/intelligence/classification-signal-service.ts',
  ],
  declared_readers: [
    'web/src/lib/intelligence/convergence-service.ts (observations.crossRun query)',
  ],
  description: 'Human-applied classification correction signal.',
});

register({
  identifier: 'comprehension:plan_interpretation',
  signal_level: 'L2',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/lib/compensation/plan-comprehension-emitter.ts (HF-198 E5)',
    'web/src/lib/sci/signal-capture-service.ts (toPrefixSignalType: negotiation_round)',
  ],
  declared_readers: [
    'web/src/lib/intelligence/convergence-service.ts (loadMetricComprehensionSignals; Pass 4 metricContexts builder)',
  ],
  description: 'Plan-agent metric semantic intent (label, op, inputs, semantic_intent) per component, scoped to (tenant_id, rule_set_id).',
});

register({
  identifier: 'comprehension:header_binding',
  signal_level: 'L2',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/lib/sci/signal-capture-service.ts (toPrefixSignalType: field_binding, field_binding_outcome)',
  ],
  declared_readers: [
    'web/src/lib/intelligence/convergence-service.ts (observations.crossRun query)',
  ],
  description: 'Header → semantic-role binding evidence per content unit.',
});

register({
  identifier: 'convergence:calculation_validation',
  signal_level: 'L3',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/lib/intelligence/convergence-service.ts',
    'web/src/lib/sci/signal-capture-service.ts (toPrefixSignalType: convergence_outcome)',
  ],
  declared_readers: [
    'web/src/lib/intelligence/convergence-service.ts (observations.withinRun query)',
    'web/src/app/api/reconciliation/run/route.ts',
  ],
  description: 'Per-component convergence binding evaluation outcome.',
});

register({
  identifier: 'convergence:reconciliation_outcome',
  signal_level: 'L3',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/app/api/reconciliation/run/route.ts',
  ],
  declared_readers: [
    'web/src/app/api/reconciliation/run/route.ts (run-history queries)',
    'web/src/app/api/reconciliation/compare/route.ts',
  ],
  description: 'Reconciliation outcome scoped to (tenant, calculation_run_id).',
});

register({
  identifier: 'convergence:reconciliation_comparison',
  signal_level: 'L3',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/app/api/reconciliation/compare/route.ts',
  ],
  declared_readers: [
    'web/src/app/api/reconciliation/compare/route.ts (comparison-history queries)',
  ],
  description: 'Cross-run reconciliation comparison signal.',
});

register({
  identifier: 'convergence:dual_path_concordance',
  signal_level: 'L3',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/app/api/calculation/run/route.ts (OB-77 dual-path observation post-calc)',
  ],
  declared_readers: [
    // F-011 closure: reader citation. Convergence Pass 4 / health-monitor surface
    // queries this signal_type for dual-path concordance trend observation. As of
    // HF-198 the reader is the diagnostic surface and the runtime dashboard
    // (convergence health view); declared here so writes are not orphan signals.
    'web/src/lib/intelligence/convergence-service.ts (observations.crossRun query — see signal_type IN list extension below)',
    'docs/audits/AUD_004_Remediation_Design_Document_v3_20260427.md (§2 E3 declared reader; runtime consumer surface scheduled for OB-N where N succeeds HF-198)',
  ],
  description: 'Dual-path concordance observation: legacy-engine vs intent-executor path agreement rate per calculation run.',
});

register({
  identifier: 'cost:event',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/lib/sci/signal-capture-service.ts (toPrefixSignalType: cost_event)',
  ],
  declared_readers: [
    'web/src/lib/sci/signal-capture-service.ts (getSCISignals consumers)',
  ],
  description: 'Cost-tracking event signal (e.g., LLM token usage).',
});

register({
  identifier: 'lifecycle:assessment_generated',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/app/api/ai/assessment/route.ts',
  ],
  declared_readers: [
    'web/src/app/api/ai/assessment/route.ts (assessment history queries)',
  ],
  description: 'AI assessment generation lifecycle event.',
});

register({
  identifier: 'lifecycle:transition',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/app/api/approvals/[id]/route.ts',
  ],
  declared_readers: [
    'web/src/app/api/approvals/[id]/route.ts (transition history queries)',
  ],
  description: 'Approval lifecycle transition signal.',
});

register({
  identifier: 'lifecycle:stream',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/lib/signals/stream-signals.ts',
  ],
  declared_readers: [
    'web/src/lib/signals/stream-signals.ts (stream consumer queries)',
  ],
  description: 'Stream-context lifecycle signal.',
});

register({
  identifier: 'lifecycle:briefing',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/lib/signals/briefing-signals.ts',
  ],
  declared_readers: [
    'web/src/lib/signals/briefing-signals.ts (briefing consumer queries)',
  ],
  description: 'Briefing-surface lifecycle signal.',
});

register({
  identifier: 'lifecycle:synaptic_consolidation',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/lib/calculation/synaptic-surface.ts',
    'web/src/app/api/calculation/run/route.ts (post-calc consolidation)',
  ],
  declared_readers: [
    'web/src/lib/calculation/synaptic-surface.ts (consolidation queries)',
  ],
  description: 'Synaptic consolidation outcome per calculation run.',
});

register({
  identifier: 'lifecycle:user_action',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/lib/ai/training-signal-service.ts',
  ],
  declared_readers: [
    'web/src/lib/ai/training-signal-service.ts (training-signal aggregation queries)',
  ],
  description: 'User-action lifecycle signal (training-signal generation).',
});
