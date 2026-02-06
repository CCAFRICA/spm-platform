'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Search,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Wrench,
  Wand2,
  AlertTriangle,
  AlertCircle,
  Info,
  Filter,
} from 'lucide-react';
import type {
  QuarantineItem,
  Severity,
  QuarantineResolution,
} from '@/types/data-quality';
import { SEVERITY_COLORS, ERROR_TYPE_LABELS, SOURCE_LABELS } from '@/types/data-quality';
import { useLocale } from '@/contexts/locale-context';
import { cn } from '@/lib/utils';

interface QuarantineTableProps {
  items: QuarantineItem[];
  onResolve: (itemId: string, resolution: QuarantineResolution) => void;
  onApplySuggestedFix: (itemId: string) => void;
  onBulkResolve?: (itemIds: string[], resolution: QuarantineResolution) => void;
  isLoading?: boolean;
}

export function QuarantineTable({
  items,
  onResolve,
  onApplySuggestedFix,
  onBulkResolve,
  isLoading = false,
}: QuarantineTableProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [resolveItem, setResolveItem] = useState<QuarantineItem | null>(null);
  const [resolveAction, setResolveAction] = useState<'approve' | 'correct' | 'reject'>('approve');
  const [resolveNotes, setResolveNotes] = useState('');

  const getSeverityIcon = (severity: Severity) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.recordId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.errorMessage.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.errorMessageEs.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSeverity = severityFilter === 'all' || item.severity === severityFilter;

    return matchesSearch && matchesSeverity;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(filteredItems.map((i) => i.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, itemId]);
    } else {
      setSelectedItems(selectedItems.filter((id) => id !== itemId));
    }
  };

  const handleResolveClick = (item: QuarantineItem, action: 'approve' | 'correct' | 'reject') => {
    setResolveItem(item);
    setResolveAction(action);
    setResolveNotes('');
    setShowResolveDialog(true);
  };

  const handleResolveConfirm = () => {
    if (!resolveItem) return;

    onResolve(resolveItem.id, {
      action: resolveAction,
      notes: resolveNotes || undefined,
    });

    setShowResolveDialog(false);
    setResolveItem(null);
    setResolveNotes('');
  };

  const handleBulkAction = (action: 'approve' | 'reject') => {
    if (selectedItems.length === 0 || !onBulkResolve) return;

    onBulkResolve(selectedItems, { action });
    setSelectedItems([]);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(isSpanish ? 'es-MX' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>
                {isSpanish ? 'Cola de Cuarentena' : 'Quarantine Queue'}
              </CardTitle>
              <CardDescription>
                {filteredItems.length}{' '}
                {isSpanish ? 'elementos pendientes' : 'items pending review'}
              </CardDescription>
            </div>

            {/* Bulk Actions */}
            {selectedItems.length > 0 && onBulkResolve && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedItems.length} {isSpanish ? 'seleccionados' : 'selected'}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('approve')}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {isSpanish ? 'Aprobar' : 'Approve'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('reject')}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {isSpanish ? 'Rechazar' : 'Reject'}
                </Button>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3 mt-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isSpanish ? 'Buscar...' : 'Search...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  {severityFilter === 'all'
                    ? isSpanish
                      ? 'Todas las severidades'
                      : 'All severities'
                    : severityFilter}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setSeverityFilter('all')}>
                  {isSpanish ? 'Todas' : 'All'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSeverityFilter('critical')}>
                  <AlertCircle className="h-4 w-4 mr-2 text-red-600" />
                  {isSpanish ? 'Crítico' : 'Critical'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSeverityFilter('warning')}>
                  <AlertTriangle className="h-4 w-4 mr-2 text-amber-600" />
                  {isSpanish ? 'Advertencia' : 'Warning'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSeverityFilter('info')}>
                  <Info className="h-4 w-4 mr-2 text-blue-600" />
                  {isSpanish ? 'Información' : 'Info'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent>
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
              <p className="text-muted-foreground">
                {isSpanish
                  ? 'No hay elementos en cuarentena'
                  : 'No quarantine items'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          selectedItems.length === filteredItems.length &&
                          filteredItems.length > 0
                        }
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>{isSpanish ? 'Severidad' : 'Severity'}</TableHead>
                    <TableHead>{isSpanish ? 'Registro' : 'Record'}</TableHead>
                    <TableHead>{isSpanish ? 'Error' : 'Error'}</TableHead>
                    <TableHead>{isSpanish ? 'Fuente' : 'Source'}</TableHead>
                    <TableHead>{isSpanish ? 'Detectado' : 'Detected'}</TableHead>
                    <TableHead className="text-right">
                      {isSpanish ? 'Acciones' : 'Actions'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedItems.includes(item.id)}
                          onCheckedChange={(checked) =>
                            handleSelectItem(item.id, checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'flex items-center gap-1 w-fit',
                            SEVERITY_COLORS[item.severity].bg,
                            SEVERITY_COLORS[item.severity].text,
                            SEVERITY_COLORS[item.severity].border
                          )}
                        >
                          {getSeverityIcon(item.severity)}
                          {item.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.recordId}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.recordType}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs">
                          <p className="font-medium text-sm">
                            {isSpanish
                              ? ERROR_TYPE_LABELS[item.errorType].nameEs
                              : ERROR_TYPE_LABELS[item.errorType].name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {isSpanish ? item.errorMessageEs : item.errorMessage}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {isSpanish
                            ? SOURCE_LABELS[item.source].nameEs
                            : SOURCE_LABELS[item.source].name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(item.detectedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {item.suggestedFix && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => onApplySuggestedFix(item.id)}
                                >
                                  <Wand2 className="h-4 w-4 mr-2" />
                                  {isSpanish ? 'Aplicar Sugerencia' : 'Apply Suggestion'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleResolveClick(item, 'approve')}
                            >
                              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                              {isSpanish ? 'Aprobar' : 'Approve'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleResolveClick(item, 'correct')}
                            >
                              <Wrench className="h-4 w-4 mr-2 text-blue-600" />
                              {isSpanish ? 'Corregir' : 'Correct'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleResolveClick(item, 'reject')}
                            >
                              <XCircle className="h-4 w-4 mr-2 text-red-600" />
                              {isSpanish ? 'Rechazar' : 'Reject'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {resolveAction === 'approve' && (
                <CheckCircle className="h-5 w-5 text-green-600" />
              )}
              {resolveAction === 'correct' && (
                <Wrench className="h-5 w-5 text-blue-600" />
              )}
              {resolveAction === 'reject' && (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              {resolveAction === 'approve'
                ? isSpanish
                  ? 'Aprobar Registro'
                  : 'Approve Record'
                : resolveAction === 'correct'
                  ? isSpanish
                    ? 'Corregir Registro'
                    : 'Correct Record'
                  : isSpanish
                    ? 'Rechazar Registro'
                    : 'Reject Record'}
            </DialogTitle>
            <DialogDescription>
              {resolveItem && (
                <>
                  <strong>{resolveItem.recordId}</strong>:{' '}
                  {isSpanish
                    ? resolveItem.errorMessageEs
                    : resolveItem.errorMessage}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {resolveItem?.suggestedFix && resolveAction === 'correct' && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm font-medium mb-1">
                  {isSpanish ? 'Corrección Sugerida:' : 'Suggested Fix:'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isSpanish
                    ? resolveItem.suggestedFix.descriptionEs
                    : resolveItem.suggestedFix.description}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">
                {isSpanish ? 'Notas (opcional)' : 'Notes (optional)'}
              </Label>
              <Textarea
                id="notes"
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder={
                  isSpanish
                    ? 'Agregar notas de resolución...'
                    : 'Add resolution notes...'
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button
              onClick={handleResolveConfirm}
              variant={
                resolveAction === 'approve'
                  ? 'default'
                  : resolveAction === 'reject'
                    ? 'destructive'
                    : 'default'
              }
            >
              {resolveAction === 'approve'
                ? isSpanish
                  ? 'Aprobar'
                  : 'Approve'
                : resolveAction === 'correct'
                  ? isSpanish
                    ? 'Corregir'
                    : 'Correct'
                  : isSpanish
                    ? 'Rechazar'
                    : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
