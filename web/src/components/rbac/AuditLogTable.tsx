'use client';

/**
 * Audit Log Table Component
 *
 * Displays audit log entries with filtering capabilities.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Eye,
  Download,
  Calendar,
  User,
  Activity,
} from 'lucide-react';
import type { AuditLogEntry, AuditAction, PermissionCategory } from '@/types/rbac';
import { AUDIT_ACTIONS, PERMISSION_CATEGORIES } from '@/types/rbac';
import { useLocale } from '@/contexts/locale-context';

interface AuditLogTableProps {
  entries: AuditLogEntry[];
  onExport?: () => void;
}

export function AuditLogTable({ entries, onExport }: AuditLogTableProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      searchTerm === '' ||
      entry.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.resourceName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.resource.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = actionFilter === 'all' || entry.action === actionFilter;
    const matchesCategory = categoryFilter === 'all' || entry.category === categoryFilter;

    return matchesSearch && matchesAction && matchesCategory;
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {isSpanish ? 'Registro de Auditoría' : 'Audit Log'}
            </CardTitle>
            {onExport && (
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="h-4 w-4 mr-2" />
                {isSpanish ? 'Exportar' : 'Export'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isSpanish ? 'Buscar por usuario o recurso...' : 'Search by user or resource...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={isSpanish ? 'Acción' : 'Action'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todas' : 'All Actions'}</SelectItem>
                {(Object.keys(AUDIT_ACTIONS) as AuditAction[]).map((action) => (
                  <SelectItem key={action} value={action}>
                    {isSpanish ? AUDIT_ACTIONS[action].nameEs : AUDIT_ACTIONS[action].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={isSpanish ? 'Categoría' : 'Category'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todas' : 'All Categories'}</SelectItem>
                {(Object.keys(PERMISSION_CATEGORIES) as PermissionCategory[]).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {isSpanish ? PERMISSION_CATEGORIES[cat].nameEs : PERMISSION_CATEGORIES[cat].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isSpanish ? 'Fecha/Hora' : 'Date/Time'}</TableHead>
                  <TableHead>{isSpanish ? 'Usuario' : 'User'}</TableHead>
                  <TableHead>{isSpanish ? 'Acción' : 'Action'}</TableHead>
                  <TableHead>{isSpanish ? 'Recurso' : 'Resource'}</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {isSpanish
                        ? 'No se encontraron registros'
                        : 'No audit entries found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => {
                    const actionConfig = AUDIT_ACTIONS[entry.action];
                    const categoryConfig = PERMISSION_CATEGORIES[entry.category];

                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {formatDate(entry.timestamp)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{entry.userName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getSeverityColor(actionConfig.severity)}
                          >
                            {isSpanish ? actionConfig.nameEs : actionConfig.name}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {entry.resourceName || entry.resource}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {isSpanish ? categoryConfig?.nameEs : categoryConfig?.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedEntry(entry)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Summary */}
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {isSpanish
                ? `Mostrando ${filteredEntries.length} de ${entries.length} registros`
                : `Showing ${filteredEntries.length} of ${entries.length} entries`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSpanish ? 'Detalles del Registro' : 'Audit Entry Details'}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Fecha/Hora' : 'Date/Time'}
                  </p>
                  <p className="font-medium">
                    {new Date(selectedEntry.timestamp).toLocaleString(locale)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Usuario' : 'User'}
                  </p>
                  <p className="font-medium">{selectedEntry.userName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Acción' : 'Action'}
                  </p>
                  <Badge
                    variant="outline"
                    className={getSeverityColor(AUDIT_ACTIONS[selectedEntry.action].severity)}
                  >
                    {isSpanish
                      ? AUDIT_ACTIONS[selectedEntry.action].nameEs
                      : AUDIT_ACTIONS[selectedEntry.action].name}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Categoría' : 'Category'}
                  </p>
                  <p className="font-medium">
                    {isSpanish
                      ? PERMISSION_CATEGORIES[selectedEntry.category]?.nameEs
                      : PERMISSION_CATEGORIES[selectedEntry.category]?.name}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Recurso' : 'Resource'}
                </p>
                <p className="font-medium">
                  {selectedEntry.resourceName || selectedEntry.resource}
                  {selectedEntry.resourceId && (
                    <span className="text-muted-foreground ml-2">
                      ({selectedEntry.resourceId})
                    </span>
                  )}
                </p>
              </div>

              {Object.keys(selectedEntry.details).length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {isSpanish ? 'Detalles Adicionales' : 'Additional Details'}
                  </p>
                  <pre className="p-3 bg-muted rounded-lg text-sm overflow-auto">
                    {JSON.stringify(selectedEntry.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
