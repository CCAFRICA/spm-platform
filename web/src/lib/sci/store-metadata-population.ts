/**
 * HF-239 Phase 0.4: Store-metadata population module.
 *
 * Extracted verbatim from execute/route.ts local postCommitConstruction
 * helper (OB-146 Step 1b block, lines ~1364-1461 at main @ 6ceb16a7).
 * Was invoked from executeTargetPipeline and executeTransactionPipeline
 * per-unit after commitContentUnit. After HF-239, execute-bulk's
 * processDataUnit calls this directly for target/transaction units; the
 * shared executePostCommitConstruction is invoked once per request at
 * the POST handler tail (entity resolution).
 *
 * Reads from the unit's parsed rows (server-side parse — the bulk
 * transport model has rows by sheet, not by content unit). Updates
 * entities.metadata with store_id, volume_tier, volume_key. Idempotent:
 * skips entities whose existing metadata.store_id already matches.
 *
 * Korean Test note: STORE_FIELDS, TIER_FIELDS, VOLUME_KEY_FIELDS are
 * recognized identifiers in the platform's substrate (HF-190 / OB-146).
 * These are NOT domain literals — they are structural column names the
 * platform consults at the post-commit boundary. The list is fixed and
 * narrow.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const BATCH = 200;

const STORE_FIELDS = ['storeId', 'num_tienda', 'No_Tienda', 'Tienda'];
const TIER_FIELDS = ['store_volume_tier', 'Rango_Tienda', 'Rango de Tienda'];
const VOLUME_KEY_FIELDS = ['LLave Tamaño de Tienda'];

export interface PopulateStoreMetadataResult {
  empCount: number;
  storeUpdated: number;
}

export async function populateStoreMetadata(
  supabase: SupabaseClient,
  tenantId: string,
  rows: Record<string, unknown>[],
  entityIdField: string | undefined,
): Promise<PopulateStoreMetadataResult> {
  const out: PopulateStoreMetadataResult = { empCount: 0, storeUpdated: 0 };
  if (!entityIdField) return out;

  const empToStore = new Map<string, string>();
  const empToTier = new Map<string, string>();
  const empToVolumeKey = new Map<string, string>();

  for (const row of rows) {
    const empId = String(row[entityIdField] ?? '').trim();
    if (!empId) continue;

    if (!empToStore.has(empId)) {
      for (const f of STORE_FIELDS) {
        const val = row[f];
        if (val != null && String(val).trim()) {
          empToStore.set(empId, String(val).trim());
          break;
        }
      }
    }

    if (!empToTier.has(empId)) {
      for (const f of TIER_FIELDS) {
        const val = row[f];
        if (val != null && String(val).trim()) {
          empToTier.set(empId, String(val).trim());
          break;
        }
      }
    }

    if (!empToVolumeKey.has(empId)) {
      for (const f of VOLUME_KEY_FIELDS) {
        const val = row[f];
        if (val != null && String(val).trim()) {
          empToVolumeKey.set(empId, String(val).trim());
          break;
        }
      }
    }
  }

  if (empToStore.size === 0) return out;

  const allEmpIds = Array.from(empToStore.keys());
  out.empCount = allEmpIds.length;

  for (let i = 0; i < allEmpIds.length; i += BATCH) {
    const slice = allEmpIds.slice(i, i + BATCH);
    const { data: ents } = await supabase
      .from('entities')
      .select('id, external_id, metadata')
      .eq('tenant_id', tenantId)
      .in('external_id', slice);

    if (!ents) continue;

    for (const ent of ents) {
      const extId = ent.external_id ?? '';
      const store = empToStore.get(extId);
      if (!store) continue;

      const existingMeta = (ent.metadata ?? {}) as Record<string, unknown>;
      if (existingMeta.store_id === store) continue;

      const newMeta: Record<string, unknown> = {
        ...existingMeta,
        store_id: store,
      };

      const tier = empToTier.get(extId);
      if (tier) newMeta.volume_tier = tier;

      const volKey = empToVolumeKey.get(extId);
      if (volKey) newMeta.volume_key = volKey;

      await supabase
        .from('entities')
        .update({ metadata: newMeta })
        .eq('id', ent.id)
        .eq('tenant_id', tenantId);
      out.storeUpdated++;
    }
  }

  if (out.storeUpdated > 0) {
    console.log(
      `[SCI store-metadata] Updated metadata for ${out.storeUpdated} entities ` +
      `(${empToStore.size} mapped from rows)`,
    );
  }

  return out;
}
