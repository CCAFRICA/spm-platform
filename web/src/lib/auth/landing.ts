/**
 * Per-persona post-auth landing (OB-247 DS-032 Slice A).
 *
 * The single source for "where does this role land after login". Decision 128
 * keeps /stream as the canonical landing for every operator role; the Customer
 * Data Administrator (CDA) is the one persona that lands directly in its focused
 * portal instead — a new CASE in the existing landing rule, not a parallel router.
 * Used by middleware (server) and the two client landing points (page.tsx,
 * tenant-context) so all three agree.
 */

import { resolveRole } from './permissions';

export function landingPathForRole(role: string | null | undefined): string {
  if (resolveRole(role ?? '') === 'cda') return '/portal';
  return '/stream';
}
