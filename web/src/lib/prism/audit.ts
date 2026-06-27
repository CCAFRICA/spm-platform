/**
 * Prism file audit — append-only `file.*` events on the tenant audit trail.
 *
 * Thin typed wrapper over the canonical writeAuditLog helper (lib/audit).
 * file.* events are TENANT-SCOPED resource audit and belong in audit_logs
 * (NOT platform_events, which is service-role-only agent observability).
 * resource_type is always 'file_object'; resource_id is the file_objects row id.
 * Every confirmation/notification the user sees is a render of one of these
 * rows + the file_objects.state — verified truth (DS-031 §6A).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { writeAuditLog } from '@/lib/audit/audit-logger';
import type { FileAuditAction } from './types';

export async function writeFileAudit(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    profileId: string | null;
    action: FileAuditAction;
    fileObjectId: string;
    changes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await writeAuditLog(supabase, {
    tenant_id: params.tenantId,
    profile_id: params.profileId,
    action: params.action,
    resource_type: 'file_object',
    resource_id: params.fileObjectId,
    changes: params.changes ?? {},
    metadata: params.metadata,
  });
}
