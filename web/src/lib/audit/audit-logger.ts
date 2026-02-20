/**
 * Centralized Audit Logger
 *
 * Writes to the audit_logs table (SCHEMA_REFERENCE.md verified).
 * Columns: id, tenant_id, profile_id, action, resource_type, resource_id, changes, metadata, ip_address, created_at
 *
 * Used by: dispute API, approval API, lifecycle transitions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditEntry {
  tenant_id: string;
  profile_id: string | null;
  action: string;          // e.g. 'dispute.created', 'approval.requested', 'lifecycle.transition'
  resource_type: string;   // e.g. 'dispute', 'approval_request', 'calculation_batch'
  resource_id: string;
  changes: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Write an audit log entry to Supabase.
 * Accepts any Supabase client (service role or authenticated).
 * Non-fatal: logs error but does not throw.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: AuditEntry
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      tenant_id: entry.tenant_id,
      profile_id: entry.profile_id,
      action: entry.action,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      changes: entry.changes,
      metadata: entry.metadata || {},
    });

    if (error) {
      console.error('[AuditLogger] Failed to write audit log:', error.message);
    }
  } catch (err) {
    console.error('[AuditLogger] Unexpected error:', err);
  }
}
