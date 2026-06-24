// OB-235 P3 — comprehension recall (the comprehension-layer Tenant loop). Before the LLM comprehension
// call, recall a stored comprehension for a matching structural fingerprint within the tenant. A warm hit
// reuses the stored comprehension and skips ALL comprehension-path LLM calls (the comprehension call, the
// HF-337 coverage-retry, AND the label/method call) — the latter because the hit requires the stored rows
// to already carry display_label + aggregation_method, so recognizeLabelsAndMethods finds nothing pending.
// NO REGISTRY: the recall keys on the structural fingerprint, never a field name or allowed-value set.

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractStructuralFeatures, fingerprintHash, type StructuralFeatures } from './structural-fingerprint-matcher';
import { comprehensionStore } from './stores/comprehension-store';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RecalledComprehension {
  hit: boolean;
  fingerprintHash: string;
  features: StructuralFeatures;
  stored: Array<{ field_name: string; characterization: string; data_nature: string | null; relationships: string | null; aggregation_behavior: string | null; identifies: string | null }>;
}

// Structural fingerprint from sampled fields — reconstruct pseudo-rows from the samples so the matcher
// reads structure only (column count / types / ranges / cardinality), never the names.
function fingerprintFromFields(fields: Array<{ field: string; samples: unknown[] }>): { hash: string; features: StructuralFeatures } {
  const maxLen = fields.reduce((m, f) => Math.max(m, f.samples.length), 0);
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < maxLen; i++) {
    const row: Record<string, unknown> = {};
    for (const f of fields) row[f.field] = f.samples[i];
    rows.push(row);
  }
  const features = extractStructuralFeatures(rows);
  return { hash: fingerprintHash(features), features };
}

export async function recallComprehension(
  sb: SupabaseClient,
  tenantId: string,
  fields: Array<{ field: string; samples: unknown[] }>,
): Promise<RecalledComprehension> {
  const { hash, features } = fingerprintFromFields(fields);
  const fpHit = await comprehensionStore.recall(sb, { scope: 'tenant', fingerprintHash: hash, tenantId });
  const names = fields.map((f) => f.field);
  const { data: rows } = await sb.from('comprehension_artifacts')
    .select('field_name, characterization, data_nature, relationships, aggregation_behavior, identifies, display_label, aggregation_method')
    .eq('tenant_id', tenantId).in('field_name', names);
  const byName = new Map<string, any>((rows ?? []).map((r: any) => [r.field_name, r]));
  // Coverage: every current field comprehended WITH label + method (so the label/method call also fires 0).
  const covered = names.length > 0 && names.every((n) => { const r = byName.get(n); return r && r.display_label && r.aggregation_method; });
  const hit = !!fpHit && covered;
  const stored = hit
    ? names.map((n) => byName.get(n)).filter(Boolean).map((r: any) => ({
        field_name: r.field_name, characterization: r.characterization, data_nature: r.data_nature,
        relationships: r.relationships, aggregation_behavior: r.aggregation_behavior, identifies: r.identifies,
      }))
    : [];
  return { hit, fingerprintHash: hash, features, stored };
}

/** Record the comprehension fingerprint after a cold comprehension pass (so the next encounter is warm). */
export async function persistComprehensionFingerprint(sb: SupabaseClient, tenantId: string, hash: string, features: StructuralFeatures): Promise<void> {
  await comprehensionStore.persist(sb, { tenantId, fingerprintHash: hash, features });
}
