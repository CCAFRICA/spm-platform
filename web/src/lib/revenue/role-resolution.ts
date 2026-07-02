/**
 * Revenue role resolution (OB-257 O2, ADR Decision 1 -- Option B).
 *
 * One thin adapter from the HF-337 recognition layer to the Revenue role vocabulary: for each
 * declared surface (types.ts REVENUE_SURFACES) ask recognize() which comprehended tenant field
 * satisfies its free-form purpose. recognize() is read-path-first (cached surface_bindings, no LLM
 * on re-encounter) and SELF-PRIMING on a cold miss (one temp-0 LLM call per tenant per surface) --
 * that priming is intended (ADR Decision 1). Unresolved -> a structured absence carrying the
 * recognizer's own reason (C2), never a fallback or a silent blank.
 *
 * KOREAN TEST: zero field names here -- field selection is entirely recognition output.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { recognize } from '@/lib/comprehension/surface-binding-recognition';
import {
  REVENUE_SURFACES,
  type ResolvedRevenueRole,
  type RevenueRoleKey,
  type RevenueRoles,
  type RoleAbsence,
} from './types';

/** Resolve every Revenue role via surface-binding recognition. Absences are returned alongside the
 *  full role map so callers can render/store both without re-deriving (C2 structured absence). */
export async function resolveRevenueRoles(
  sb: SupabaseClient,
  tenantId: string,
): Promise<{ roles: RevenueRoles; absences: RoleAbsence[] }> {
  const roles = {} as RevenueRoles;
  const absences: RoleAbsence[] = [];

  for (const key of Object.keys(REVENUE_SURFACES) as RevenueRoleKey[]) {
    const spec = REVENUE_SURFACES[key];
    const r = await recognize(sb, tenantId, spec.surface, spec.purpose);
    let role: ResolvedRevenueRole;
    if (r.status === 'resolved' && r.fields[0]) {
      // Best field first (recognize orders by confidence). field_name is the committed_data
      // row_data key -- the value the materializer reads with (Decision 158 split).
      role = {
        status: 'resolved',
        field_name: r.fields[0].field_name,
        display_label: r.fields[0].display_label,
        confidence: r.fields[0].confidence,
      };
    } else {
      // C2: carry the recognizer's named reason verbatim -- never a synthesized default.
      const reason = r.status === 'unresolved' ? r.reason : 'recognition returned no fields';
      role = { status: 'unresolved', reason };
      absences.push({ role: key, reason });
    }
    roles[key] = role;
  }

  return { roles, absences };
}
