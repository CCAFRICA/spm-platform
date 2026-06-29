/**
 * OB-253 Phase 3 — the apex expression (Decision 158 at the boundary).
 *
 * The four facets resolve almost everything deterministically against the co-present surface. ONLY
 * the residue no facet can settle (genuine novelty — structure no accumulated pattern predicts)
 * escalates here: ONE bounded LLM expression that sees ALL the co-present facet assessments and
 * returns a single resolution. The LLM does NOT drive the surface, does NOT orchestrate facets, does
 * NOT control the pipeline — it extends the model at irreducible surprise, and the result consolidates
 * back to the surface (recognition-signals.persistRecognition) so the same structure is predicted
 * (free) next time. cost-decreases-with-usage: the more the surface has seen, the less the apex fires.
 *
 * This re-founds the Normalizer's LLM call (OB-249): the Normalizer's deterministic grouping is now
 * the normalization facet (joint-recognition.assessNormalization); its LLM becomes THIS apex, invoked
 * only on residue and seeing all four facets co-present (not normalization alone).
 *
 * Injectable (ApexExpresser): tests/offline proofs pass a deterministic stub; production uses liveApex.
 * Korean Test (G8): the prompt judges by the STRUCTURAL evidence handed to it — value + facet
 * assessments — never by header text, language, or domain vocabulary.
 */

import { streamAnthropicText, stripFences, parseJsonObjectTolerant } from '@/lib/ai/anthropic-stream';
import { defaultModel } from '@/lib/ai/model-policy';
import type { ApexExpresser, FacetKind, ResolutionAction } from './joint-recognition';

const APEX_SYSTEM = [
  'You are the apex of a predictive-coding recognition surface. A single data VALUE could not be',
  'resolved by four deterministic facets, whose structural assessments you are given:',
  '  normalization (variant surface form), reconciliation (same magnitude, different unit/format),',
  '  deduplication (looks similar but is a different entity), anomaly (genuine distributional outlier).',
  'Judge ONLY from the structural evidence provided — never from the meaning of any column name or',
  'any domain knowledge. Decide which facet best explains the value, or none.',
  'Return ONLY JSON: {"resolvedFacet":"normalization|reconciliation|deduplication|anomaly|none",',
  '  "action":"collapse|align|keep_distinct|surface_anomaly|none","canonical":<string|null>,"reasoning":<short string>}.',
].join('\n');

const VALID_FACETS = new Set<FacetKind | 'none'>(['normalization', 'reconciliation', 'deduplication', 'anomaly', 'none']);
const VALID_ACTIONS = new Set<ResolutionAction>(['collapse', 'align', 'keep_distinct', 'surface_anomaly', 'none']);

export const liveApex: ApexExpresser = async ({ value, column, assessments }) => {
  const text = await streamAnthropicText({
    model: defaultModel(),
    system: APEX_SYSTEM,
    user: JSON.stringify({ value, column, assessments }),
    maxTokens: 1024,
    label: 'thalamus:apex',
    retries: 1, // bounded — the residue is small; a slow apex must not eat the run
  });
  const parsed = parseJsonObjectTolerant(stripFences(text)) as Record<string, unknown>;
  const resolvedFacet = (VALID_FACETS.has(parsed.resolvedFacet as FacetKind) ? parsed.resolvedFacet : 'none') as FacetKind | 'none';
  const action = (VALID_ACTIONS.has(parsed.action as ResolutionAction) ? parsed.action : 'none') as ResolutionAction;
  const canonical = typeof parsed.canonical === 'string' ? parsed.canonical : undefined;
  const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : 'apex expression';
  return { resolvedFacet, action, canonical, reasoning };
};
