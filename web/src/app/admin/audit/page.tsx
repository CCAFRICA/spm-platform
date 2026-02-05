'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  LogIn, LogOut, Plus, Pencil, Trash, FileText, Check, X, Clock
} from 'lucide-react';
import { audit } from '@/lib/audit-service';
import { AuditLogEntry, AuditAction } from '@/types/audit';
import { formatDistanceToNow, format } from 'date-fns';
import { pageVariants, containerVariants, itemVariants, modalVariants } from '@/lib/animations';
import { TableSkeleton } from '@/components/ui/skeleton-loaders';
import { LoadingButton } from '@/components/ui/loading-button';
import { EmptyState } from '@/components/ui/empty-state';
import { AccessControl, ADMIN_ROLES } from '@/components/access-control';
import { useTenant } from '@/contexts/tenant-context';

export default function AuditPage() {
  return (
    <AccessControl allowedRoles={ADMIN_ROLES}>
      <AuditPageContent />
    </AccessControl>
  );
}

function AuditPageContent() {
  const { currentTenant } = useTenant();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    loadLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenant?.id]);

  const loadLogs = async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    // Simulate network delay for demo
    await new Promise(r => setTimeout(r, showRefresh ? 500 : 800));

    // Filter audit logs by current tenant
    const allLogs = audit.getAuditLogs({ limit: 500 });
    const tenantFilteredLogs = currentTenant
      ? allLogs.filter(log => !log.metadata?.tenantId || log.metadata.tenantId === currentTenant.id)
      : allLogs;

    setLogs(tenantFilteredLogs);
    setIsLoading(false);
    setIsRefreshing(false);

    if (showRefresh) {
      toast.success('Refreshed', {
        description: `Loaded ${tenantFilteredLogs.length} audit entries`
      });
    }
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

  const handleExport = async () => {
    setIsExporting(true);
    await new Promise(r => setTimeout(r, 1000));

    const csv = audit.exportAsCSV(filteredLogs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setIsExporting(false);
    toast.success('Export Complete', {
      description: `Exported ${filteredLogs.length} audit entries to CSV`
    });
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
        <span className="hidden sm:inline">{action.replace('_', ' ')}</span>
      </Badge>
    );
  };

  // Stats for the header
  const stats = {
    total: logs.length,
    today: logs.filter(l => new Date(l.timestamp).toDateString() === new Date().toDateString()).length,
    actions: new Set(logs.map(l => l.action)).size,
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900"
    >
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="p-2 bg-primary/10 rounded-lg"
              >
                <Shield className="h-6 w-6 text-primary" />
              </motion.div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  Audit Log
                </h1>
                <p className="text-muted-foreground text-sm">
                  Complete history of system changes • SOC2 Compliant
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <LoadingButton
                variant="outline"
                onClick={() => loadLogs(true)}
                loading={isRefreshing}
                loadingText="Refreshing..."
                size="sm"
                className="flex-1 sm:flex-none"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </LoadingButton>
              <LoadingButton
                variant="outline"
                onClick={handleExport}
                loading={isExporting}
                loadingText="Exporting..."
                size="sm"
                className="flex-1 sm:flex-none"
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </LoadingButton>
            </div>
          </div>

          {/* Stats Cards */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-3 md:gap-4 grid-cols-3"
          >
            <motion.div variants={itemVariants}>
              <Card className="border-0 shadow-md">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total Entries</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={itemVariants}>
              <Card className="border-0 shadow-md">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Today</p>
                  <p className="text-2xl font-bold">{stats.today}</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={itemVariants}>
              <Card className="border-0 shadow-md">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Action Types</p>
                  <p className="text-2xl font-bold">{stats.actions}</p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>

          {/* Filters */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 md:pt-6">
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
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
                  <SelectTrigger className="w-full sm:w-[150px]">
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
                  <SelectTrigger className="w-full sm:w-[150px]">
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

          {/* Desktop Table View */}
          <Card className="border-0 shadow-lg hidden md:block">
            <CardContent className="pt-6">
              {isLoading ? (
                <TableSkeleton rows={10} cols={6} />
              ) : filteredLogs.length === 0 ? (
                <EmptyState
                  icon={Shield}
                  title="No audit logs found"
                  description="Actions will appear here as they occur"
                />
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
                      {filteredLogs.slice(0, 100).map((log, index) => (
                        <motion.tr
                          key={log.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02 }}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setSelectedLog(log)}
                        >
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
                            <LoadingButton
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLog(log);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </LoadingButton>
                          </TableCell>
                        </motion.tr>
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

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="border-0 shadow-md">
                  <CardContent className="p-4">
                    <div className="space-y-2 animate-pulse">
                      <div className="h-4 bg-muted rounded w-1/3" />
                      <div className="h-5 bg-muted rounded w-1/2" />
                      <div className="h-4 bg-muted rounded w-2/3" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : filteredLogs.length === 0 ? (
              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <EmptyState
                    icon={Shield}
                    title="No audit logs found"
                    description="Actions will appear here as they occur"
                  />
                </CardContent>
              </Card>
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-3"
              >
                {filteredLogs.slice(0, 50).map((log) => (
                  <motion.div key={log.id} variants={itemVariants}>
                    <Card
                      className="border-0 shadow-md cursor-pointer transition-all hover:shadow-lg active:scale-[0.99]"
                      onClick={() => setSelectedLog(log)}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                          </div>
                          {getActionBadge(log.action)}
                        </div>
                        <p className="font-medium">{log.userName || log.userId}</p>
                        <p className="text-sm text-muted-foreground">
                          {log.entityType}
                          {log.entityId && (
                            <span className="font-mono text-xs ml-1">
                              #{log.entityId.slice(0, 8)}
                            </span>
                          )}
                        </p>
                        {(log.changes || log.reason) && (
                          <p className="text-xs text-muted-foreground mt-2 truncate">
                            {log.changes
                              ? `${log.changes.length} field(s) changed`
                              : log.reason}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}

                <p className="text-sm text-muted-foreground text-center py-2">
                  Showing {Math.min(filteredLogs.length, 50)} of {filteredLogs.length} entries
                </p>
              </motion.div>
            )}
          </div>

          {/* Detail Modal */}
          <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <AnimatePresence mode="wait">
                {selectedLog && (
                  <motion.div
                    key="detail"
                    variants={modalVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Audit Entry Details
                      </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 text-sm mt-4">
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-2 gap-4"
                      >
                        <div>
                          <p className="text-muted-foreground text-xs uppercase">Timestamp</p>
                          <p className="font-mono text-xs mt-1">
                            {format(new Date(selectedLog.timestamp), 'PPpp')}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs uppercase">User</p>
                          <p className="mt-1">{selectedLog.userName || selectedLog.userId}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs uppercase mb-1">Action</p>
                          {getActionBadge(selectedLog.action)}
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs uppercase">Entity</p>
                          <p className="mt-1">
                            {selectedLog.entityType}
                            {selectedLog.entityId && (
                              <span className="font-mono text-xs ml-1 block truncate">
                                {selectedLog.entityId}
                              </span>
                            )}
                          </p>
                        </div>
                      </motion.div>

                      {selectedLog.changes && selectedLog.changes.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                        >
                          <p className="text-muted-foreground text-xs uppercase mb-2">Changes</p>
                          <div className="bg-muted rounded-lg p-3 space-y-2 font-mono text-xs overflow-x-auto">
                            {selectedLog.changes.map((change, i) => (
                              <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1 + i * 0.05 }}
                              >
                                <span className="text-muted-foreground">{change.field}:</span>{' '}
                                <span className="text-red-500 line-through">
                                  {JSON.stringify(change.oldValue)}
                                </span>{' '}
                                →{' '}
                                <span className="text-green-500">
                                  {JSON.stringify(change.newValue)}
                                </span>
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {selectedLog.reason && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                        >
                          <p className="text-muted-foreground text-xs uppercase mb-1">Reason</p>
                          <p className="bg-muted rounded p-2">{selectedLog.reason}</p>
                        </motion.div>
                      )}

                      {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                        >
                          <p className="text-muted-foreground text-xs uppercase mb-1">Metadata</p>
                          <pre className="bg-muted rounded p-2 font-mono text-xs overflow-x-auto">
                            {JSON.stringify(selectedLog.metadata, null, 2)}
                          </pre>
                        </motion.div>
                      )}

                      {selectedLog.sessionId && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.25 }}
                        >
                          <p className="text-muted-foreground text-xs uppercase">Session ID</p>
                          <p className="font-mono text-xs truncate">{selectedLog.sessionId}</p>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </motion.div>
  );
}
