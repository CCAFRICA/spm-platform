import { AuditLogEntry, AuditAction, EntityType, AuditChange } from '@/types/audit';

class AuditService {
  private queue: AuditLogEntry[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // no-op: localStorage removed, auto-flush disabled
  }

  /**
   * Log an audit event
   */
  log(params: {
    action: AuditAction;
    entityType: EntityType;
    entityId?: string;
    entityName?: string;
    changes?: AuditChange[];
    reason?: string;
    metadata?: Record<string, unknown>;
  }): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      userId: this.getCurrentUserId(),
      userName: this.getCurrentUserName(),
      sessionId: this.getSessionId(),
      ...params,
    };

    this.queue.push(entry);

    // Console log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUDIT] ${entry.action} ${entry.entityType}`, entry.entityId || '');
    }

    return entry;
  }

  /**
   * Log field-level changes between two objects
   */
  logChange(
    entityType: EntityType,
    entityId: string,
    oldValue: Record<string, unknown>,
    newValue: Record<string, unknown>,
    reason?: string
  ): AuditLogEntry | null {
    const changes: AuditChange[] = [];

    // Find all changed fields
    const allKeys = Array.from(new Set([
      ...Object.keys(oldValue || {}),
      ...Object.keys(newValue || {}),
    ]));

    for (const key of allKeys) {
      const oldVal = oldValue?.[key];
      const newVal = newValue?.[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          field: key,
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    }

    if (changes.length === 0) return null;

    return this.log({
      action: 'update',
      entityType,
      entityId,
      changes,
      reason,
    });
  }

  /**
   * Get audit logs with optional filters
   */
  getAuditLogs(filters?: {
    userId?: string;
    entityType?: EntityType;
    action?: AuditAction;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): AuditLogEntry[] {
    // Return queued entries as the log source (localStorage removed)
    let logs: AuditLogEntry[] = [...this.queue];

    // Apply filters
    if (filters?.userId) {
      logs = logs.filter((e) => e.userId === filters.userId);
    }
    if (filters?.entityType) {
      logs = logs.filter((e) => e.entityType === filters.entityType);
    }
    if (filters?.action) {
      logs = logs.filter((e) => e.action === filters.action);
    }
    if (filters?.startDate) {
      logs = logs.filter((e) => e.timestamp >= filters.startDate!);
    }
    if (filters?.endDate) {
      logs = logs.filter((e) => e.timestamp <= filters.endDate!);
    }

    // Sort newest first
    logs.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply limit
    if (filters?.limit) {
      logs = logs.slice(0, filters.limit);
    }

    return logs;
  }

  /**
   * Clear all audit logs (admin only)
   */
  clearLogs(): void {
    this.queue = [];
  }

  /**
   * Export logs as CSV
   */
  exportAsCSV(logs: AuditLogEntry[]): string {
    const headers = ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Changes', 'Reason'];
    const rows = logs.map((log) => [
      log.timestamp,
      log.userName || log.userId,
      log.action,
      log.entityType,
      log.entityId || '',
      log.changes ? JSON.stringify(log.changes) : '',
      log.reason || '',
    ]);

    return [
      headers.join(','),
      ...rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
  }

  // Private methods

  private flush(): void {
    // no-op: localStorage removed
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private getCurrentUserId(): string {
    return 'anonymous';
  }

  private getCurrentUserName(): string {
    return 'Anonymous';
  }

  private getSessionId(): string {
    return 'server';
  }
}

// Singleton export
export const audit = new AuditService();
