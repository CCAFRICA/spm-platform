import { AuditLogEntry, AuditAction, EntityType, AuditChange } from '@/types/audit';

class AuditService {
  private queue: AuditLogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start auto-flush in browser
    if (typeof window !== 'undefined') {
      this.flushTimer = setInterval(() => this.flush(), 1000);
    }
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
    // Flush pending entries first
    this.flush();

    // Get from storage
    let logs: AuditLogEntry[] = [];
    try {
      logs = JSON.parse(localStorage.getItem('audit_log') || '[]');
    } catch {
      logs = [];
    }

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
    localStorage.removeItem('audit_log');
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
    if (this.queue.length === 0) return;

    try {
      const existing = JSON.parse(localStorage.getItem('audit_log') || '[]');
      const batch = this.queue.splice(0, this.queue.length);
      localStorage.setItem('audit_log', JSON.stringify([...existing, ...batch]));
    } catch (error) {
      console.error('[AUDIT] Flush failed:', error);
    }
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private getCurrentUserId(): string {
    if (typeof window === 'undefined') return 'system';

    try {
      const user = localStorage.getItem('currentUser');
      if (user) return JSON.parse(user).id;
    } catch {
      // Ignore parse errors
    }

    return 'anonymous';
  }

  private getCurrentUserName(): string {
    if (typeof window === 'undefined') return 'System';

    try {
      const user = localStorage.getItem('currentUser');
      if (user) return JSON.parse(user).name;
    } catch {
      // Ignore parse errors
    }

    return 'Anonymous';
  }

  private getSessionId(): string {
    if (typeof window === 'undefined') return 'server';

    let sessionId = sessionStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  }
}

// Singleton export
export const audit = new AuditService();
