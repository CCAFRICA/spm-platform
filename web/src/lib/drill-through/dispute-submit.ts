/**
 * OB-224 — submitDispute: the dispute writer.
 *
 * The disputes table exists with a full Insert type and a reader (loadAdjustmentsPageData) but had
 * no inserter anywhere in lib. This is it. Inserted under the user's auth context (browser client,
 * RLS) so filed_by + tenant scoping are correct. The structured 7-category funnel (OB-68) is a
 * future build ON TOP of this (R-4); this is the minimal honest writer.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import type { DisputeInput } from './types';

export async function submitDispute(
  tenantId: string,
  input: DisputeInput,
  client?: SupabaseClient<Database>,
): Promise<{ id: string }> {
  if (!tenantId) throw new Error('submitDispute: tenantId required');
  if (!input.entityId) throw new Error('submitDispute: entityId required');
  if (!input.description?.trim()) throw new Error('submitDispute: description required');
  const sb = client ?? createClient();

  const { data, error } = await sb
    .from('disputes')
    .insert({
      tenant_id: tenantId,
      entity_id: input.entityId,
      period_id: input.periodId ?? null,
      batch_id: input.batchId ?? null,
      status: 'open',
      category: input.category ?? null,
      description: input.description.trim(),
      amount_disputed: input.amountDisputed ?? null,
      filed_by: input.filedBy ?? null,
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id as string };
}
