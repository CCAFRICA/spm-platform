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
import { AuditLogEntry, AuditAction } from '@/types/audit';
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Audit Log</h1>
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
          <Card className="border-0 shadow-lg">
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
          <Card className="border-0 shadow-lg">
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
      </div>
    </div>
  );
}
