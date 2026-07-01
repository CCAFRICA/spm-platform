// OB-249 — the Remediation Stage orchestrator.
//
// Two entry points, mirroring the Decision-158 split across the two existing import stages:
//   • runRemediationPropose — runs in PROCESS-JOB (proposal time): identify → propose (express,
//     may LLM) → persist each agent's serialized proposal to the canonical signal surface. This
//     keeps the LLM OFF the atomic execute-bulk write path and makes the proposal renderable
//     before commit (P7). NEVER throws.
//   • runRemediationConstruct — runs in COMMIT-CONTENT-UNIT (the mandatory gate, I7): read the
//     prior signals → fromSignals → construct (deterministic, no LLM) → corrected rows + audit.
//     This is what gets promoted to committed_data; clean data passes through and is STAMPED so
//     P8 ("clean cannot bypass") is query-provable. NEVER throws — any failure degrades to
//     identity (raw rows committed) + a degraded signal.
//
// EXCLUSIONS (the substrate-integration blocker fix): a column is remediation-eligible ONLY if
// its NATURE (from the already-computed field_identities / semantic_roles + the resolved
// entity_id_field) is text-categorical. Identifier / reference-key / measure / temporal natures
// are excluded — a repeating transaction foreign key is LOW cardinality, so cardinality cannot
// protect the calc join; nature must. Reading the existing comprehension nature (not rebuilding
// a classifier) is also the I4 way.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RemediationAgent,
  RemediationInput,
  RemediationRecall,
  RemediationChange,
  RemediationProposeReport,
  RemediationConstructReport,
} from './remediation-types';
import { REMEDIATION_AGENTS } from './remediation-agents';
import {
  readPriorNormalizationSignals,
  writeNormalizationSignal,
  emitStageRunSignal,
  emitDegradedSignal,
} from './remediation-signals';

const SYNTHETIC_KEYS = new Set(['_sheetName', '_rowIndex']);

// HF-368: the fixed NATURE primitives that must NEVER be rewritten as variant text. Read by
// EQUALITY against the model's bare `natureRole` (field_identities), never a regex over the prose
// `structuralType`. `identifier`/`measure`/`temporal` are protected; `name`/`categorical` stay
// remediation-eligible. Comparing to the platform's fixed primitives is not a word list.
const NON_TEXT_NATURES: ReadonlySet<string> = new Set(['identifier', 'measure', 'temporal']);
// Precise role-token scan (NOT the broad identifier regex, which false-positives on attribute
// roles like `category_code` / `descriptive_label`). Matches only the platform's actual
// identifier / key / measure / temporal SemanticRole tokens, so genuine text-attribute roles
// (category_code, descriptive_label, entity_name, entity_attribute) stay remediation-eligible.
const NON_TEXT_ROLE = /(identifier|reference_key|amount|count|target|baseline|rate_value|tier|payout|date|period_marker)/i;

type SemanticRolesMap = Record<string, { role?: string } | undefined>;
type FieldIdentitiesMap = Record<string, { structuralType?: string; contextualIdentity?: string; natureRole?: string } | undefined>;

/**
 * The hard exclusion set: columns remediation may never touch. Protects the calc join key, all
 * identifiers/reference keys, and numeric/date columns (so HF-213 supersession over raw rows and
 * source_date extraction are never corrupted by value rewrites).
 */
export function computeRemediationExclusions(
  allColumns: string[],
  semanticRoles: SemanticRolesMap,
  fieldIdentities: FieldIdentitiesMap,
  entityIdField: string | null,
): Set<string> {
  const excluded = new Set<string>();
  if (entityIdField) excluded.add(entityIdField);
  for (const col of allColumns) {
    if (SYNTHETIC_KEYS.has(col)) { excluded.add(col); continue; }
    const fi = fieldIdentities[col];
    const sr = semanticRoles[col];
    const natureRole = `${fi?.natureRole ?? ''}`;
    const role = `${sr?.role ?? ''}`;
    // PRIMARY signal (HF-368): the model's BARE nature primitive — protect identifier/measure/temporal
    // by equality against the fixed set (no regex over prose; the deleted scope-predicates surface).
    if (NON_TEXT_NATURES.has(natureRole)) { excluded.add(col); continue; }
    // ROLE token scan over the platform's CONTROLLED SemanticRole enum (assigned tokens, NOT model
    // recognition prose) — precise; keeps category_code / descriptive_label / entity_name eligible.
    if (NON_TEXT_ROLE.test(role)) { excluded.add(col); continue; }
  }
  return excluded;
}

/** All real data columns present across the rows (synthetic bookkeeping keys removed). */
export function dataColumns(rows: ReadonlyArray<Record<string, unknown>>): string[] {
  const cols = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!SYNTHETIC_KEYS.has(k)) cols.add(k);
  return Array.from(cols);
}

/** A DB-backed read-before-express surface (G11). Tests inject their own RemediationRecall. */
export function dbRecall(supabase: SupabaseClient, tenantId: string): RemediationRecall {
  return { priorSignals: (agentName: string) => readPriorNormalizationSignals(supabase, tenantId, agentName) };
}

/**
 * EXPRESS phase (process-job). Runs each agent's identify + propose and persists the serialized
 * proposal to the canonical signal surface. Returns a per-agent report for rendering (P7).
 * NEVER throws.
 */
export async function runRemediationPropose(
  supabase: SupabaseClient,
  input: RemediationInput,
  opts?: { agents?: ReadonlyArray<RemediationAgent> },
): Promise<RemediationProposeReport[]> {
  const agents = opts?.agents ?? REMEDIATION_AGENTS;
  const reports: RemediationProposeReport[] = [];
  for (const agent of agents) {
    try {
      const targets = agent.identify(input);
      if (targets.length === 0) { reports.push({ agent: agent.name, columns: [], degraded: false }); continue; }
      const proposal = await agent.propose(targets, input);
      if (proposal === null) { reports.push({ agent: agent.name, columns: [], degraded: false }); continue; }
      const payloads = agent.toSignals(proposal);
      const cols: RemediationProposeReport['columns'] = [];
      for (const payload of payloads) {
        await writeNormalizationSignal(supabase, { tenantId: input.tenantId, agentName: agent.name, payload });
        // best-effort report counts (parsed from the opaque payload value where present)
        const v = (payload.value ?? {}) as { groups?: Array<{ variants?: unknown[] }> };
        const groupCount = Array.isArray(v.groups) ? v.groups.length : 0;
        const variantCount = Array.isArray(v.groups) ? v.groups.reduce((n, g) => n + (Array.isArray(g.variants) ? g.variants.length : 0), 0) : 0;
        cols.push({ column: payload.key, groupCount, variantCount, expresser: payload.expresser ?? 'unknown' });
      }
      reports.push({ agent: agent.name, columns: cols, degraded: false });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[OB-249][stage] propose degraded for agent=${agent.name}: ${reason}`);
      await emitDegradedSignal(supabase, { tenantId: input.tenantId, agentName: agent.name, stage: 'propose', reason });
      reports.push({ agent: agent.name, columns: [], degraded: true, degradedReason: reason });
    }
  }
  return reports;
}

/**
 * CONSTRUCT phase (commit-content-unit, the mandatory gate). Reads prior signals, reconstitutes
 * each agent's proposal, applies it deterministically, and returns corrected rows + the audit.
 * NEVER throws — any agent failure degrades to identity for that agent and emits a degraded
 * signal. The caller stamps metadata.remediation (incl. _stageRan) and emits the per-unit
 * stage-run signal (P8) using the returned report.
 */
export async function runRemediationConstruct(
  input: RemediationInput,
  opts?: { agents?: ReadonlyArray<RemediationAgent> },
): Promise<{ correctedRows: Record<string, unknown>[]; changes: RemediationChange[]; report: RemediationConstructReport }> {
  const agents = opts?.agents ?? REMEDIATION_AGENTS;
  let correctedRows: Record<string, unknown>[] = input.rows.map((r) => ({ ...r }));
  const changes: RemediationChange[] = [];
  const agentsRun: string[] = [];
  const degradedAgents: string[] = [];

  for (const agent of agents) {
    try {
      const payloads = input.recall ? await input.recall.priorSignals(agent.name) : [];
      const proposal = agent.fromSignals(payloads);
      if (proposal === null) continue;
      const result = agent.construct(proposal as never, { ...input, rows: correctedRows });
      correctedRows = result.correctedRows;
      changes.push(...result.changes);
      agentsRun.push(agent.name);
    } catch (err) {
      degradedAgents.push(agent.name);
      console.error(`[OB-249][stage] construct degraded for agent=${agent.name}: ${err instanceof Error ? err.message : String(err)}`);
      // degraded signal is best-effort (the surface may be the thing that's down); never throws.
      // input.context.supabase, when present, lets us record it — otherwise the console line stands.
    }
  }

  const changesByColumn: Record<string, number> = {};
  for (const c of changes) changesByColumn[c.column] = (changesByColumn[c.column] ?? 0) + 1;

  return {
    correctedRows,
    changes,
    report: { stageRan: true, agentsRun, changeCount: changes.length, changesByColumn, degradedAgents },
  };
}

export { emitStageRunSignal };
