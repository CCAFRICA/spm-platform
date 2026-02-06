'use client';

/**
 * Bulk Progress Dialog Component
 *
 * Shows progress of ongoing bulk operations.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { BulkOperation, BulkOperationResult } from '@/types/bulk-operations';
import { BULK_ACTIONS } from '@/types/bulk-operations';
import { useLocale } from '@/contexts/locale-context';

interface BulkProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation: BulkOperation | null;
  result: BulkOperationResult | null;
  onCancel?: () => void;
}

export function BulkProgressDialog({
  open,
  onOpenChange,
  operation,
  result,
  onCancel,
}: BulkProgressDialogProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [showErrors, setShowErrors] = useState(false);

  const isProcessing = operation?.status === 'processing';
  const isComplete = result !== null || operation?.status === 'completed' || operation?.status === 'failed';

  const progress = operation
    ? (operation.processedItems / operation.totalItems) * 100
    : 0;

  const actionConfig = operation ? BULK_ACTIONS[operation.type] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isProcessing && <Loader2 className="h-5 w-5 animate-spin" />}
            {isComplete && result?.success && (
              <CheckCircle className="h-5 w-5 text-green-600" />
            )}
            {isComplete && !result?.success && (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            {actionConfig && (isSpanish ? actionConfig.nameEs : actionConfig.name)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>
                {isSpanish ? 'Progreso' : 'Progress'}
              </span>
              <span className="text-muted-foreground">
                {operation?.processedItems || 0} / {operation?.totalItems || 0}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Stats */}
          {operation && (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{operation.totalItems}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'Total' : 'Total'}
                </p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {operation.successCount}
                </p>
                <p className="text-xs text-green-700">
                  {isSpanish ? 'Exitosos' : 'Succeeded'}
                </p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">
                  {operation.failureCount}
                </p>
                <p className="text-xs text-red-700">
                  {isSpanish ? 'Fallidos' : 'Failed'}
                </p>
              </div>
            </div>
          )}

          {/* Status message */}
          {result && (
            <div className={`p-3 rounded-lg ${result.success ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
              <p className="text-sm font-medium">
                {isSpanish ? result.messageEs : result.message}
              </p>
            </div>
          )}

          {/* Errors */}
          {operation && operation.errors.length > 0 && (
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowErrors(!showErrors)}
                className="w-full"
              >
                <XCircle className="h-4 w-4 mr-2 text-red-600" />
                {operation.errors.length} {isSpanish ? 'errores' : 'errors'}
                <Badge variant="destructive" className="ml-2">
                  {isSpanish ? 'Ver' : 'View'}
                </Badge>
              </Button>

              {showErrors && (
                <ScrollArea className="h-32 rounded-lg border p-2">
                  <div className="space-y-2">
                    {operation.errors.map((error, index) => (
                      <div
                        key={index}
                        className="p-2 bg-red-50 rounded text-sm"
                      >
                        <p className="font-medium text-red-800">
                          {error.itemId}
                        </p>
                        <p className="text-red-600">
                          {isSpanish ? error.errorEs : error.error}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {isProcessing && onCancel && (
            <Button variant="destructive" onClick={onCancel}>
              <X className="h-4 w-4 mr-2" />
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
          )}
          {isComplete && (
            <Button onClick={() => onOpenChange(false)}>
              {isSpanish ? 'Cerrar' : 'Close'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
