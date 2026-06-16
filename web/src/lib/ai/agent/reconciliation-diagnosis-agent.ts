/**
 * OB-212 N4 — Reconciliation Diagnosis Agent definition.
 *
 * The keystone agent (Phase-0 KEEP). Structural definition only — the multi-turn loop lives in
 * agent-runner (runAgent). Above the Deterministic Calculation Boundary (Decision 158): it reads
 * calc output + benchmark deltas and reasons; it never writes/participates in calculation.
 * Korean Test: the system prompt carries no domain/tenant vocabulary — only the structural task
 * (component, benchmark, calculation trace, band/boundary).
 */
import type { AgentDefinition } from './agent-runner';
import { createEntityDataTools, type ToolContext } from './tools/entity-data-tools';
import { createReconciliationTools } from './tools/reconciliation-tools';

const SYSTEM_PROMPT = `You are a read-only diagnostic agent. You investigate WHY a calculated value for an entity differs from an expected (benchmark) value, at the level of individual components. You never modify data — you only read facts through the provided tools and reason about them.

Method:
1. Read the benchmark delta for the entity (and the specific component, if one is named) to see where the engine (vlValue) and the expected value (fileValue) disagree.
2. Read the entity's calculation trace for the platform batch: per-component payout, raw vs rounded value, rounding adjustment and precision, and the convergence binding forensic (which source column / lookup / scale fed each component) with its verification confidence. Use the batch's rule_set_id from this trace for step 3.
3. If a disagreement could be a band/boundary effect, read the component's intent structure and use the boundary check to see whether the resolved value sits on or near a band edge.
4. When useful, check whether other entities show a similar delta, to judge whether the discrepancy is isolated or systemic.

Then produce a concise, structural diagnosis: the most likely cause of the disagreement, the specific evidence for it (which component, which forensic signal), and whether it appears isolated or systemic. If the evidence is insufficient to conclude, say so plainly rather than guessing.`;

/** Build the reconciliation_diagnosis agent definition, tools bound to a tenant-scoped context. */
export function createReconciliationDiagnosisAgent(ctx: ToolContext): AgentDefinition {
  const shared = createEntityDataTools(ctx);
  const recon = createReconciliationTools(ctx);
  return {
    name: 'reconciliation_diagnosis',
    systemPrompt: SYSTEM_PROMPT,
    tools: [...shared.definitions, ...recon.definitions],
    handlers: { ...shared.handlers, ...recon.handlers },
    maxTurns: 12,
    // model omitted → adapter's resolved model (claude-sonnet-4-6).
  };
}
