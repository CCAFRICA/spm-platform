// OB-249 — The Normalizer (remediation agent 1 of N).
//
// Collapses variant surface forms that denote the SAME real-world value to one canonical
// form, retaining the original as provenance. The Decision-158 split is exact:
//   • EXPRESS (propose): the LLM groups which OBSERVED values denote the same thing. It is
//     given ONLY values (never the column name → no name-based reasoning, Korean Test) and may
//     only return input strings; read-before-express skips the LLM on a known value set (I6).
//   • CONSTRUCT (construct): deterministic, no LLM. For each group it SELECTS the canonical
//     from the actually-observed values (chooseCanonical) and asserts it is observed — so a
//     committed value is ALWAYS one the data carried (I1/P2/I3: no authored/fabricated value).
//
// IDENTIFY is purely structural and runs only over the stage's allowedColumns (identifier /
// reference-key / measure / temporal natures + the entity_id_field are already excluded by the
// stage — the calc-join + date protection). No field-name or domain literal appears here.

import type { Json } from '@/lib/supabase/database.types';
import { streamAnthropicText, stripFences, parseJsonObjectTolerant } from '@/lib/ai/anthropic-stream';
import { defaultModel } from '@/lib/ai/model-policy';
import type {
  RemediationAgent,
  RemediationInput,
  RemediationConstructResult,
  RemediationChange,
  RemediationSignalPayload,
} from '../remediation-types';
import {
  rawString,
  valueFrequencies,
  structuralClusters,
  chooseCanonical,
  hasCollapseClusters,
  columnValueFingerprint,
} from '../text-normalization';

export const NORMALIZER_NAME = 'normalizer';

// ---- the Normalizer's agent-private proposal shape (opaque to the stage, I8) ----
export type NormalizationBasis = 'structural' | 'llm';
export interface NormalizationGroup {
  variants: string[];     // OBSERVED surface forms that denote the same real-world value
  basis: NormalizationBasis;
}
export interface NormalizationColumnProposal {
  column: string;
  fingerprint: string;    // hash of the column's distinct value SET (recall key, I6)
  expresser: string;      // 'llm' | 'structural-only' | 'recall'
  groups: NormalizationGroup[];
}
export interface NormalizationProposal {
  columns: NormalizationColumnProposal[];
}

/** The injectable EXPRESS dependency. Default = the live LLM. Tests/offline proofs inject a
 *  deterministic stub (with a call counter) so progressive-performance (P6) and determinism
 *  (P2) are provable without a live Anthropic endpoint. */
export type VariantExpresser = (input: { values: string[] }) => Promise<{ groups: string[][] }>;

const EXPRESS_SYSTEM = [
  'You are given a list of distinct text VALUES observed in a single column of a dataset.',
  'Some of these values may be different surface forms that denote the SAME real-world value',
  '(abbreviations, spelling variants, word reorderings, added/dropped qualifiers).',
  'Group ONLY the values that denote the same real-world thing. Judge by meaning, in the data\'s own terms.',
  'Use the EXACT input strings verbatim. Do NOT invent, reword, or normalize any value.',
  'A value with no equivalent is left out (singletons are not groups).',
  'Return ONLY JSON: {"groups": [["<exact value>","<exact value>", ...], ...]}.',
  'If no values are equivalent, return {"groups": []}.',
].join('\n');

/** Live LLM expresser (Decision-158 transport, mirrors surface-binding-recognition.ts). It
 *  filters the model's groups to INPUT values only (no hallucinated strings) — the construct
 *  step's canonical-is-observed assertion is the second, deterministic guard. */
const liveExpresser: VariantExpresser = async ({ values }) => {
  const known = new Set(values);
  const text = await streamAnthropicText({
    model: defaultModel(),
    system: EXPRESS_SYSTEM,
    user: JSON.stringify({ values }),
    maxTokens: 4096,
    label: 'remediation:normalize',
    // OB-249 review BLOCKER fix: remediation is best-effort + degradable, so cap retries low
    // (default is 6 ≈ 76s of backoff) — one slow column must not eat the express budget. On
    // failure the agent degrades that column to structural-only.
    retries: 2,
  });
  const parsed = parseJsonObjectTolerant(stripFences(text));
  const rawGroups = Array.isArray((parsed as { groups?: unknown }).groups) ? (parsed as { groups: unknown[] }).groups : [];
  const groups: string[][] = [];
  for (const g of rawGroups) {
    if (!Array.isArray(g)) continue;
    const members = Array.from(new Set(g.filter((v): v is string => typeof v === 'string' && known.has(v))));
    if (members.length >= 2) groups.push(members);
  }
  return { groups };
};

/** Is this column text-natured by its values? Defensive structural check on top of the stage's
 *  nature-based exclusion — skips columns that are predominantly numeric (a measure that slipped
 *  the nature filter). No literals; pure shape. */
function isTextColumn(values: ReadonlyArray<unknown>): boolean {
  let nonEmpty = 0;
  let numericish = 0;
  for (const v of values) {
    const s = rawString(v);
    if (s === null) continue;
    nonEmpty++;
    if (/^[\s$€£%+\-(]*\d[\d.,\s%)]*$/.test(s)) numericish++;
  }
  if (nonEmpty === 0) return false;
  return numericish / nonEmpty < 0.5;
}

const VSEP = '␟'; // variant-set key separator (Korean-clean)

/** Parse prior remediation signal payloads across ALL signals (not newest-only per column):
 *   - fingerprints   — every prior value-set fingerprint (read-before-express skip key)
 *   - groupedValues  — every value ever placed in a group (residue reduction)
 *   - mergedByColumn — per column, the UNION of all groups (deduped by variant-set), so construct
 *                      can apply any historically-valid grouping whose variants are present this
 *                      import. Stale groups are harmless: construct only collapses OBSERVED variants
 *                      and re-selects the canonical from current frequencies. */
function parsePrior(payloads: Json[]): {
  fingerprints: Set<string>;
  groupedValues: Set<string>;
  mergedByColumn: Map<string, NormalizationColumnProposal>;
} {
  const fingerprints = new Set<string>();
  const groupedValues = new Set<string>();
  const groupsByColumn = new Map<string, Map<string, NormalizationGroup>>();
  const fpByColumn = new Map<string, string>(); // newest fingerprint per column (payloads are newest-first)
  for (const p of payloads) {
    const obj = (p ?? {}) as Record<string, unknown>;
    const proposal = (obj.proposal ?? null) as NormalizationColumnProposal | null;
    if (!proposal || typeof proposal.column !== 'string' || !Array.isArray(proposal.groups)) continue;
    if (typeof proposal.fingerprint === 'string') {
      fingerprints.add(proposal.fingerprint);
      if (!fpByColumn.has(proposal.column)) fpByColumn.set(proposal.column, proposal.fingerprint);
    }
    let gmap = groupsByColumn.get(proposal.column);
    if (!gmap) { gmap = new Map(); groupsByColumn.set(proposal.column, gmap); }
    for (const g of proposal.groups) {
      if (!Array.isArray(g.variants) || g.variants.length < 2) continue;
      for (const v of g.variants) groupedValues.add(v);
      const key = g.variants.slice().sort().join(VSEP);
      if (!gmap.has(key)) gmap.set(key, { variants: g.variants, basis: (g.basis as NormalizationBasis) ?? 'structural' });
    }
  }
  const mergedByColumn = new Map<string, NormalizationColumnProposal>();
  for (const [col, gmap] of Array.from(groupsByColumn.entries())) {
    mergedByColumn.set(col, { column: col, fingerprint: fpByColumn.get(col) ?? '', expresser: 'recall', groups: Array.from(gmap.values()) });
  }
  return { fingerprints, groupedValues, mergedByColumn };
}

export function createNormalizer(deps?: { expresser?: VariantExpresser }): RemediationAgent<NormalizationProposal> {
  const expresser = deps?.expresser ?? liveExpresser;

  return {
    name: NORMALIZER_NAME,

    // STRUCTURAL candidate selection (I2/P3): text columns (within the allowed set) that carry
    // collapse-clusters OR sit in a categorical cardinality band where variant representations
    // plausibly live. The LLM (not code) decides whether semantic variants actually exist.
    identify(input: RemediationInput): string[] {
      const out: string[] = [];
      const total = input.rows.length;
      for (const col of input.allowedColumns) {
        const values = input.rows.map((r) => r[col]);
        if (!isTextColumn(values)) continue;
        const distinct = new Set(values.map(rawString).filter((s): s is string => s !== null));
        if (distinct.size < 2) continue; // nothing to collapse
        const categorical = total > 0 && distinct.size / total <= 0.6;
        if (hasCollapseClusters(values) || categorical) out.push(col);
      }
      return out;
    },

    // EXPRESS (may LLM). Read-before-express → bounded/zero LLM on a known value set (I6/P6).
    async propose(targets: string[], input: RemediationInput): Promise<NormalizationProposal | null> {
      const priorPayloads = input.recall ? await input.recall.priorSignals(NORMALIZER_NAME) : [];
      // read-before-express: ALL prior value-set fingerprints (skip a known set, zero LLM) + ALL
      // previously-grouped values (residue reduction) — across every prior signal, not newest-only.
      const { fingerprints: knownFingerprints, groupedValues: knownGroupedValues } = parsePrior(priorPayloads);

      const columns: NormalizationColumnProposal[] = [];
      for (const col of targets) {
        const values = input.rows.map((r) => r[col]);
        const freq = valueFrequencies(values);
        const distinct = Array.from(freq.keys());
        if (distinct.length < 2) continue;
        const fingerprint = columnValueFingerprint(distinct);

        // exact value-set recall (I6/P6): this value set was already expressed AND persisted
        // (including a "no variance" negative result) → reuse it, ZERO LLM, and do NOT re-emit
        // (the prior signal already carries it; construct in commit reads it). This is what makes
        // the 2nd encounter of the same data — clean OR variant — cost zero LLM calls.
        if (knownFingerprints.has(fingerprint)) continue;

        // structural grouping (deterministic, always available even if the LLM is down).
        const clusters = structuralClusters(values);
        const structuralGroups: NormalizationGroup[] = [];
        const repToCluster = new Map<string, string[]>(); // representative value → its cluster's variants
        for (const variants of Array.from(clusters.values())) {
          const rep = chooseCanonical(variants, freq) ?? variants[0];
          repToCluster.set(rep, variants);
          if (variants.length > 1) structuralGroups.push({ variants, basis: 'structural' });
        }

        // residue = cluster representatives not already grouped in a prior import.
        const representatives = Array.from(repToCluster.keys());
        const residue = representatives.filter((r) => !knownGroupedValues.has(r));

        const semanticGroups: NormalizationGroup[] = [];
        let expresserTag = 'structural-only';
        if (residue.length >= 2 && residue.length <= 400) {
          try {
            const { groups } = await expresser({ values: residue });
            for (const g of groups) {
              // merge each semantic group's representatives back to their full structural clusters
              const merged = new Set<string>();
              for (const rep of g) for (const v of (repToCluster.get(rep) ?? [rep])) merged.add(v);
              if (merged.size >= 2) semanticGroups.push({ variants: Array.from(merged), basis: 'llm' });
            }
            expresserTag = 'llm';
          } catch (err) {
            // LLM down / parse failure → degrade to structural-only (the stage emits a degraded signal).
            console.warn(`[OB-249][normalizer] express failed for a column (degrading to structural-only): ${err instanceof Error ? err.message : String(err)}`);
            expresserTag = 'structural-only';
          }
        }

        // de-duplicate: a structural cluster fully contained in a semantic group is dropped (the
        // semantic group supersedes it). Keep standalone structural groups.
        const semanticMembers = new Set<string>();
        for (const g of semanticGroups) for (const v of g.variants) semanticMembers.add(v);
        const standaloneStructural = structuralGroups.filter((g) => !g.variants.every((v) => semanticMembers.has(v)));

        const groups = [...semanticGroups, ...standaloneStructural];
        // EMIT even when empty: a "no variance for this value set" NEGATIVE CACHE so that a
        // re-import of the same clean column is also ZERO LLM (read-before-express finds the
        // fingerprint and skips). Without this, clean categorical columns re-express every import
        // (the cold-start-every-time failure P6 forbids). Empty-group columns apply nothing in
        // construct; they exist only to register the fingerprint.
        columns.push({ column: col, fingerprint, expresser: expresserTag, groups });
      }

      return columns.length > 0 ? { columns } : null;
    },

    toSignals(proposal: NormalizationProposal): RemediationSignalPayload[] {
      return proposal.columns.map((c) => {
        const totalVariants = c.groups.reduce((n, g) => n + g.variants.length, 0);
        const groupedReduction = c.groups.reduce((n, g) => n + (g.variants.length - 1), 0);
        // coverage as a normalized [0,1] confidence: fraction of grouped variants that collapse.
        const confidence = totalVariants > 0 ? Math.min(1, groupedReduction / totalVariants) : null;
        return {
          key: c.column,
          fingerprint: c.fingerprint,
          confidence,
          expresser: c.expresser,
          value: c as unknown as Json,
        };
      });
    },

    fromSignals(payloads: Json[]): NormalizationProposal | null {
      // UNION groups per column across ALL prior signals (not newest-only) so construct can apply
      // any historically-expressed grouping whose variants are present this import; construct's
      // observed-filter + canonical-from-observed keep stale groups safe (review MINOR fix).
      const { mergedByColumn } = parsePrior(payloads);
      const columns = Array.from(mergedByColumn.values());
      return columns.length > 0 ? { columns } : null;
    },

    // CONSTRUCT — deterministic, no LLM (P2). Canonical is SELECTED from observed values and
    // asserted observed (I1/I3). Excluded columns are skipped defensively (calc-join safety).
    construct(proposal: NormalizationProposal, input: RemediationInput): RemediationConstructResult {
      const allowed = new Set(input.allowedColumns);
      const correctedRows = input.rows.map((r) => ({ ...r }));
      const changes: RemediationChange[] = [];

      for (const cp of proposal.columns) {
        if (!allowed.has(cp.column)) {
          console.warn(`[OB-249][normalizer] construct skipping excluded column "${cp.column}" (defense-in-depth: identifier/key/date protection).`);
          continue;
        }
        const values = input.rows.map((r) => r[cp.column]);
        const freq = valueFrequencies(values);
        const variantToCanonical = new Map<string, string>();
        for (const g of cp.groups) {
          const observedVariants = g.variants.filter((v) => (freq.get(v) ?? 0) > 0);
          if (observedVariants.length < 2) continue; // nothing present to collapse in THIS import
          const canonical = chooseCanonical(observedVariants, freq);
          // FAIL-LOUD canonical-is-observed assertion (P2/I3): never emit a value the data lacks.
          if (canonical === null || (freq.get(canonical) ?? 0) === 0) {
            console.error(`[OB-249][normalizer] canonical selection produced a non-observed value for column "${cp.column}" — skipping group (no fabricated value committed).`);
            continue;
          }
          for (const v of observedVariants) if (v !== canonical) variantToCanonical.set(v, canonical);
        }
        if (variantToCanonical.size === 0) continue;

        for (let i = 0; i < correctedRows.length; i++) {
          const cur = rawString(correctedRows[i][cp.column]);
          if (cur === null) continue;
          const canonical = variantToCanonical.get(cur);
          if (canonical !== undefined && canonical !== cur) {
            changes.push({ rowIndex: i, column: cp.column, original: input.rows[i][cp.column], canonical, basis: groupBasisFor(cp, cur), agent: NORMALIZER_NAME });
            correctedRows[i][cp.column] = canonical;
          }
        }
      }
      return { correctedRows, changes };
    },
  };
}

function groupBasisFor(cp: NormalizationColumnProposal, value: string): NormalizationBasis {
  for (const g of cp.groups) if (g.variants.includes(value)) return g.basis;
  return 'structural';
}
