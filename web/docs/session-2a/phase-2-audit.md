# Session 2A - Phase 2: Audit Infrastructure
## Duration: 1.5 hours

### Objective
Create SOC2-compliant audit logging infrastructure.

---

## Task 2.1: Create Audit Types (10 min)

**File:** `src/types/audit.ts`

```typescript
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'view'
  | 'export'
  | 'approve'
  | 'reject'
  | 'login'
  | 'logout'
  | 'permission_denied';

export type EntityType =
  | 'user'
  | 'transaction'
  | 'payment'
  | 'plan'
  | 'config'
  | 'approval'
  | 'inquiry'
  | 'role';

export interface AuditChange {
  field: string;
  oldValue: any;
  newValue: any;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName?: string;
  action: AuditAction;
  entityType: EntityType;
  entityId?: string;
  entityName?: string;
  changes?: AuditChange[];
  reason?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

// Approval types (used in Phase 3)
export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'applied';
export type ApprovalTier = 1 | 2 | 3 | 4;

export interface ApprovalRequest {
  id: string;
  requestType: string;
  requesterId: string;
  requesterName?: string;
  approverId: string;
  approverName?: string;
  status: ApprovalStatus;
  tier: ApprovalTier;
  requestedAt: string;
  respondedAt?: string;
  changeData: Record<string, any>;
  reason: string;
  rejectionReason?: string;
}
```

---

## Task 2.2: Create Audit Service (30 min)

**File:** `src/lib/audit-service.ts`

```typescript
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
    metadata?: Record<string, any>;
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
    oldValue: Record<string, any>,
    newValue: Record<string, any>,
    reason?: string
  ): AuditLogEntry | null {
    const changes: AuditChange[] = [];

    // Find all changed fields
    const allKeys = new Set([
      ...Object.keys(oldValue || {}),
      ...Object.keys(newValue || {}),
    ]);

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
    } catch {}
    
    return 'anonymous';
  }

  private getCurrentUserName(): string {
    if (typeof window === 'undefined') return 'System';
    
    try {
      const user = localStorage.getItem('currentUser');
      if (user) return JSON.parse(user).name;
    } catch {}
    
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
```

---

## Task 2.3: Create Audit Log Viewer Page (40 min)

**File:** `src/app/admin/audit/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { 
  Search, RefreshCw, Download, Shield, Eye, Filter,
  LogIn, LogOut, Plus, Pencil, Trash, FileText, Check, X
} from 'lucide-react';
import { audit } from '@/lib/audit-service';
import { AuditLogEntry, AuditAction, EntityType } from '@/types/audit';
import { formatDistanceToNow } from 'date-fns';

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = () => {
    setIsLoading(true);
    const data = audit.getAuditLogs({ limit: 500 });
    setLogs(data);
    setIsLoading(false);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      searchTerm === '' ||
      log.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entityId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entityName?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesEntity = entityFilter === 'all' || log.entityType === entityFilter;

    return matchesSearch && matchesAction && matchesEntity;
  });

  const handleExport = () => {
    const csv = audit.exportAsCSV(filteredLogs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getActionIcon = (action: AuditAction) => {
    const icons: Record<AuditAction, React.ReactNode> = {
      create: <Plus className="h-3 w-3" />,
      update: <Pencil className="h-3 w-3" />,
      delete: <Trash className="h-3 w-3" />,
      view: <Eye className="h-3 w-3" />,
      export: <FileText className="h-3 w-3" />,
      approve: <Check className="h-3 w-3" />,
      reject: <X className="h-3 w-3" />,
      login: <LogIn className="h-3 w-3" />,
      logout: <LogOut className="h-3 w-3" />,
      permission_denied: <Shield className="h-3 w-3" />,
    };
    return icons[action];
  };

  const getActionBadge = (action: AuditAction) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      create: 'default',
      update: 'secondary',
      delete: 'destructive',
      view: 'outline',
      export: 'outline',
      approve: 'default',
      reject: 'destructive',
      login: 'outline',
      logout: 'outline',
      permission_denied: 'destructive',
    };
    
    return (
      <Badge variant={variants[action] || 'outline'} className="flex items-center gap-1 w-fit">
        {getActionIcon(action)}
        {action.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-muted-foreground text-sm">
              Complete history of system changes • SOC2 Compliant
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadLogs}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by user or entity..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="view">View</SelectItem>
                <SelectItem value="approve">Approve</SelectItem>
                <SelectItem value="reject">Reject</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="transaction">Transaction</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="config">Config</SelectItem>
                <SelectItem value="approval">Approval</SelectItem>
                <SelectItem value="inquiry">Inquiry</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No audit logs found</p>
              <p className="text-sm">Actions will appear here as they occur</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.slice(0, 100).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.userName || log.userId}
                      </TableCell>
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {log.entityType}
                          {log.entityId && (
                            <span className="text-muted-foreground font-mono text-xs ml-1">
                              #{log.entityId.slice(0, 8)}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {log.changes
                          ? `${log.changes.length} field(s) changed`
                          : log.reason || '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 text-sm text-muted-foreground">
                Showing {Math.min(filteredLogs.length, 100)} of {filteredLogs.length} entries
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit Entry Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">Timestamp</p>
                  <p className="font-mono text-xs">{selectedLog.timestamp}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">User</p>
                  <p>{selectedLog.userName || selectedLog.userId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Action</p>
                  {getActionBadge(selectedLog.action)}
                </div>
                <div>
                  <p className="text-muted-foreground">Entity</p>
                  <p>
                    {selectedLog.entityType}
                    {selectedLog.entityId && (
                      <span className="font-mono text-xs ml-1">
                        ({selectedLog.entityId})
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {selectedLog.changes && selectedLog.changes.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2">Changes</p>
                  <div className="bg-muted rounded-lg p-3 space-y-2 font-mono text-xs">
                    {selectedLog.changes.map((change, i) => (
                      <div key={i}>
                        <span className="text-muted-foreground">{change.field}:</span>{' '}
                        <span className="text-red-500 line-through">
                          {JSON.stringify(change.oldValue)}
                        </span>{' '}
                        →{' '}
                        <span className="text-green-500">
                          {JSON.stringify(change.newValue)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedLog.reason && (
                <div>
                  <p className="text-muted-foreground mb-1">Reason</p>
                  <p className="bg-muted rounded p-2">{selectedLog.reason}</p>
                </div>
              )}

              {selectedLog.sessionId && (
                <div>
                  <p className="text-muted-foreground">Session ID</p>
                  <p className="font-mono text-xs">{selectedLog.sessionId}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

---

## Task 2.4: Add Admin Navigation Link (10 min)

Update your sidebar navigation to include the audit log link for admin users.

In your sidebar component, add:

```typescript
// Only show for admin users
{user?.role === 'Admin' && (
  <NavItem
    href="/admin/audit"
    icon={Shield}
    label="Audit Log"
  />
)}
```

---

## Verification

After completing Phase 2:

```bash
npm run build
npm run dev
```

**Test:**
1. Navigate to `/admin/audit` → Page loads ✓
2. Create some actions (view transactions, etc.)
3. Refresh audit page → New entries appear ✓
4. Filter by action type → Filters work ✓
5. Click eye icon → Detail modal opens ✓
6. Export CSV → File downloads ✓

**If all tests pass, proceed to Phase 3.**
