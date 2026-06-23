// OB-233 (DS-030 §4.5) — insight structural-shape capture.
// The LLM emits a FREE-FORM shape_description (temperature 0, stripped of all tenant content);
// deterministic code hashes it into a stable fingerprint. No fixed field set, no implied value set
// (C0). Korean-Test-clean: it never reads a field name, tenant id, metric name, or value — only the
// LLM's structural prose (with a structural numeric/scope fallback if the LLM omitted it).
import { createHash } from 'crypto';
import type { GeneratedInsight, InsightShape } from './insight-types';

export function computeInsightShape(ins: GeneratedInsight): InsightShape {
  let desc = (ins.shape_description ?? '').trim();
  if (!desc) {
    // Structural fallback (no fixed vocabulary, no registry): scope + delta direction, derived only
    // from the presence of an entity_id and the numeric sign of the first delta. Never a label set.
    const deltas = (ins.data_references || [])
      .map((r) => r.delta_pct)
      .filter((d): d is number => typeof d === 'number' && Number.isFinite(d));
    const d = deltas.length > 0 ? deltas[0] : 0;
    const dir = d > 1 ? 'increase' : d < -1 ? 'decrease' : 'flat';
    const scope = ins.entity_id ? 'single-entity' : 'network-level';
    desc = `${scope}, ${dir} movement`;
  }
  const structural_fingerprint_hash = createHash('sha256').update(desc).digest('hex');
  return { shape_description: desc, structural_fingerprint_hash };
}
