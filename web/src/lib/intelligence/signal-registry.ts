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
  confidence_required: boolean;        // OB-199 Phase 2 (DS-023 §5.2/§5.3 + F-AUD-006-007 closure):
                                       // explicit per-signal-type declaration of whether confidence
                                       // is mandatory. When true, missing-required outcome at the
                                       // canonical writer = persist row with confidence:null +
                                       // observability:write_failure signal. When false (telemetry
                                       // / lifecycle), missing confidence persists null with no
                                       // failure signal.
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
  // OB-199 Phase 2: confidence_required must be explicitly declared per signal_type.
  // Defense-in-depth against silent default drift. The TypeScript interface marks
  // the field required at compile time; the runtime check below catches any cast/
  // 'as unknown as' bypass at registration time. Closes F-AUD-006-007 by
  // registry-driven specification rather than blanket-rule.
  if (typeof decl.confidence_required !== 'boolean') {
    throw new Error(
      `[SignalRegistry] register: signal_type '${decl.identifier}' missing explicit confidence_required:boolean. ` +
      `Per OB-199 Phase 2 (DS-023 §5.2/§5.3), every registration must declare whether confidence is mandatory.`,
    );
  }
  REGISTRY.set(decl.identifier, decl);
}

/**
 * OB-199 Phase 2 (DS-023 §5.3): lookup signal_type identifier for an AITaskType.
 * Replaces the parallel AI_TASK_LEVEL_MAP in training-signal-service.ts. AI training
 * signals are emitted by every AIService.* call via the training-signal pipeline.
 * The 16 AITaskType → signal_type mappings live as registered declarations below
 * (search for `classification:ai_`, `comprehension:ai_`, `convergence:ai_`,
 * `lifecycle:ai_` prefixes). This helper provides a single lookup point so future
 * AITaskType additions surface as registration omissions at compile/test time
 * rather than silent fall-through.
 */
const AI_TASK_TO_SIGNAL_TYPE = new Map<string, string>();

export function registerAITaskMapping(aiTaskType: string, signalType: string): void {
  AI_TASK_TO_SIGNAL_TYPE.set(aiTaskType, signalType);
}

export function lookupAITaskSignalType(aiTaskType: string): string | null {
  return AI_TASK_TO_SIGNAL_TYPE.get(aiTaskType) ?? null;
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
  confidence_required: true,
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
  confidence_required: true,
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
  confidence_required: true,
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
  confidence_required: true,
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
  confidence_required: true,
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
  confidence_required: true,
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
  confidence_required: true,
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
  confidence_required: true,
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
  confidence_required: true,
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
  confidence_required: true,
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
  // OB-199 Phase 2: approval lifecycle has no AI confidence; persists null.
  confidence_required: false,
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
  // OB-199 Phase 2: UI telemetry; F-AUD-006-007 closure via registry declaration.
  confidence_required: false,
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
  // OB-199 Phase 2: UI telemetry; F-AUD-006-007 closure via registry declaration.
  confidence_required: false,
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
  // OB-199 Phase 2: calc post-event; no AI confidence.
  confidence_required: false,
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
  confidence_required: true,
});

// ──────────────────────────────────────────────
// OB-199 Phase 2 — NEW registrations (DS-023 §5.3 + F-AUD-006-005 closure)
//
// observability:write_failure — emitted by the canonical signal writer when
// a §5.2 structural contract validation fails (out-of-range confidence,
// missing-where-required, unregistered signal_type at validation boundary).
// Carries (offending_field, expected_range, actual_value, producing_module,
// source_signal_type) per DS-023 §5.2.
// ──────────────────────────────────────────────

register({
  identifier: 'observability:write_failure',
  signal_level: 'L3',
  originating_flywheel: 'tenant',
  declared_writers: [
    'web/src/lib/intelligence/canonical-signal-writer.ts (DS-023 §5.2 structural-failure observability emission)',
  ],
  declared_readers: [
    // Phase 2 minimum: registry test asserts presence. Architect-channel adds
    // operational reader (Vercel logs query, monitoring dashboard, etc.) post-OB.
    'web/src/lib/intelligence/__tests__/signal-registry.test.ts (registration coverage assertion)',
    'web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals universal reader; computes write-failure trend)',
  ],
  description: 'Canonical-writer structural-failure observability signal: emitted when a §5.2 validation outcome rejects a confidence value or detects a missing-where-required field. Closes F-AUD-006-002 silent-clamping observability gap.',
  confidence_required: false,
});

// ──────────────────────────────────────────────
// OB-199 Phase 2 — AI_TASK_LEVEL_MAP collapse (F-AUD-006-005 closure)
//
// The 16 ai_-prefix signal_types previously defined inline in
// training-signal-service.ts (`AI_TASK_LEVEL_MAP`) collapse into the registry
// per DS-023 §5.3. Each is registered with `confidence_required: true` because
// AI training signals carry the AI's self-asserted confidence by construction.
//
// All 16 share a universal reader: `ai-metrics-service.ts:fetchSignals` (no
// signal_type filter; reads every classification_signals row for calibration
// metrics, flywheel trend, and cross-tenant aggregation per OB-86). Per-task
// readers cited additionally where present.
//
// The `ai_` prefix is structural (denotes AI-source-origin), not domain-
// specific. Korean Test (Decision 154) compliant: the suffix uses platform
// vocabulary (file_classification, plan_interpretation, etc.) which is
// governance vocabulary, not language-specific.
//
// `registerAITaskMapping(taskType, signalType)` populates the lookup the
// training-signal pipeline calls. Replaces the deleted inline AI_TASK_LEVEL_MAP.
// ──────────────────────────────────────────────

// L1 — classification:ai_*
register({
  identifier: 'classification:ai_file_classification',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: file_classification)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: file-classification task outcome (per OB-198 AITaskType mapping).',
  confidence_required: true,
});
registerAITaskMapping('file_classification', 'classification:ai_file_classification');

register({
  identifier: 'classification:ai_sheet_classification',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: sheet_classification)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: sheet-classification task outcome.',
  confidence_required: true,
});
registerAITaskMapping('sheet_classification', 'classification:ai_sheet_classification');

register({
  identifier: 'classification:ai_document_analysis',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: document_analysis)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: document-analysis task outcome.',
  confidence_required: true,
});
registerAITaskMapping('document_analysis', 'classification:ai_document_analysis');

// L2 — comprehension:ai_*
register({
  identifier: 'comprehension:ai_field_mapping',
  signal_level: 'L2',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: field_mapping)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: field-mapping task outcome.',
  confidence_required: true,
});
registerAITaskMapping('field_mapping', 'comprehension:ai_field_mapping');

register({
  identifier: 'comprehension:ai_field_mapping_second_pass',
  signal_level: 'L2',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: field_mapping_second_pass)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: field-mapping second-pass task outcome.',
  confidence_required: true,
});
registerAITaskMapping('field_mapping_second_pass', 'comprehension:ai_field_mapping_second_pass');

register({
  identifier: 'comprehension:ai_import_field_mapping',
  signal_level: 'L2',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: import_field_mapping)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: import-field-mapping task outcome.',
  confidence_required: true,
});
registerAITaskMapping('import_field_mapping', 'comprehension:ai_import_field_mapping');

register({
  identifier: 'comprehension:ai_header_comprehension',
  signal_level: 'L2',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: header_comprehension)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: header-comprehension task outcome.',
  confidence_required: true,
});
registerAITaskMapping('header_comprehension', 'comprehension:ai_header_comprehension');

register({
  identifier: 'comprehension:ai_plan_interpretation',
  signal_level: 'L2',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: plan_interpretation)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: plan-interpretation task outcome (parallel to comprehension:plan_interpretation written by the emitter).',
  confidence_required: true,
});
registerAITaskMapping('plan_interpretation', 'comprehension:ai_plan_interpretation');

register({
  identifier: 'comprehension:ai_workbook_analysis',
  signal_level: 'L2',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: workbook_analysis)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: workbook-analysis task outcome.',
  confidence_required: true,
});
registerAITaskMapping('workbook_analysis', 'comprehension:ai_workbook_analysis');

register({
  identifier: 'comprehension:ai_entity_extraction',
  signal_level: 'L2',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: entity_extraction)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: entity-extraction task outcome.',
  confidence_required: true,
});
registerAITaskMapping('entity_extraction', 'comprehension:ai_entity_extraction');

// L3 — convergence:ai_*
register({
  identifier: 'convergence:ai_convergence_mapping',
  signal_level: 'L3',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: convergence_mapping)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: convergence-mapping task outcome.',
  confidence_required: true,
});
registerAITaskMapping('convergence_mapping', 'convergence:ai_convergence_mapping');

register({
  identifier: 'convergence:ai_anomaly_detection',
  signal_level: 'L3',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: anomaly_detection)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: anomaly-detection task outcome.',
  confidence_required: true,
});
registerAITaskMapping('anomaly_detection', 'convergence:ai_anomaly_detection');

// Lifecycle — lifecycle:ai_*
register({
  identifier: 'lifecycle:ai_recommendation',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: recommendation)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: recommendation task outcome.',
  confidence_required: true,
});
registerAITaskMapping('recommendation', 'lifecycle:ai_recommendation');

register({
  identifier: 'lifecycle:ai_narration',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: narration)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: narration task outcome.',
  confidence_required: true,
});
registerAITaskMapping('narration', 'lifecycle:ai_narration');

register({
  identifier: 'lifecycle:ai_dashboard_assessment',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: dashboard_assessment)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: dashboard-assessment task outcome.',
  confidence_required: true,
});
registerAITaskMapping('dashboard_assessment', 'lifecycle:ai_dashboard_assessment');

register({
  identifier: 'lifecycle:ai_natural_language_query',
  signal_level: 'L1',
  originating_flywheel: 'tenant',
  declared_writers: ['web/src/lib/ai/training-signal-service.ts (captureAIResponse for AITaskType: natural_language_query)'],
  declared_readers: ['web/src/lib/intelligence/ai-metrics-service.ts (fetchSignals — universal reader for AI training signals)'],
  description: 'AI training signal: natural-language-query task outcome.',
  confidence_required: true,
});
registerAITaskMapping('natural_language_query', 'lifecycle:ai_natural_language_query');
