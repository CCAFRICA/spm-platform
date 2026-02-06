'use client';

/**
 * Bulk Selection Bar Component
 *
 * Floating action bar for bulk operations on selected items.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  X,
  CheckCircle,
  XCircle,
  Download,
  Trash2,
  Archive,
  UserPlus,
  RefreshCw,
  Bell,
  MoreHorizontal,
  CheckSquare,
} from 'lucide-react';
import type { BulkOperationType, BulkActionConfig } from '@/types/bulk-operations';
import { BULK_ACTIONS } from '@/types/bulk-operations';
import { useLocale } from '@/contexts/locale-context';

interface BulkSelectionBarProps {
  selectedCount: number;
  targetType: 'transaction' | 'dispute' | 'user' | 'plan' | 'payout';
  onAction: (action: BulkOperationType) => void;
  onClearSelection: () => void;
  onSelectAll?: () => void;
  totalItems?: number;
}

const ICON_MAP: Record<string, React.ElementType> = {
  CheckCircle,
  XCircle,
  Download,
  Trash2,
  Archive,
  UserPlus,
  RefreshCw,
  Bell,
};

export function BulkSelectionBar({
  selectedCount,
  targetType,
  onAction,
  onClearSelection,
  onSelectAll,
  totalItems,
}: BulkSelectionBarProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [confirmAction, setConfirmAction] = useState<BulkActionConfig | null>(null);

  // Get available actions for this target type
  const availableActions = Object.values(BULK_ACTIONS).filter((action) =>
    action.allowedTargets.includes(targetType)
  );

  const primaryActions = availableActions.slice(0, 3);
  const moreActions = availableActions.slice(3);

  const handleActionClick = (action: BulkActionConfig) => {
    if (action.requiresConfirmation) {
      setConfirmAction(action);
    } else {
      onAction(action.type);
    }
  };

  const handleConfirm = () => {
    if (confirmAction) {
      onAction(confirmAction.type);
      setConfirmAction(null);
    }
  };

  if (selectedCount === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40">
        <div className="flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground rounded-lg shadow-lg">
          {/* Selection count */}
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            <span className="font-medium">
              {selectedCount} {isSpanish ? 'seleccionados' : 'selected'}
            </span>
            {totalItems && selectedCount < totalItems && onSelectAll && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onSelectAll}
                className="ml-2"
              >
                {isSpanish ? 'Seleccionar todos' : 'Select all'} ({totalItems})
              </Button>
            )}
          </div>

          <div className="w-px h-6 bg-primary-foreground/30" />

          {/* Primary actions */}
          <div className="flex items-center gap-2">
            {primaryActions.map((action) => {
              const Icon = ICON_MAP[action.icon] || CheckCircle;
              return (
                <Button
                  key={action.type}
                  variant="secondary"
                  size="sm"
                  onClick={() => handleActionClick(action)}
                  disabled={selectedCount < action.minSelection}
                >
                  <Icon className="h-4 w-4 mr-1" />
                  {isSpanish ? action.nameEs : action.name}
                </Button>
              );
            })}

            {/* More actions dropdown */}
            {moreActions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {moreActions.map((action) => {
                    const Icon = ICON_MAP[action.icon] || CheckCircle;
                    return (
                      <DropdownMenuItem
                        key={action.type}
                        onClick={() => handleActionClick(action)}
                        disabled={selectedCount < action.minSelection}
                      >
                        <Icon className="h-4 w-4 mr-2" />
                        {isSpanish ? action.nameEs : action.name}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="w-px h-6 bg-primary-foreground/30" />

          {/* Clear selection */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="text-primary-foreground hover:text-primary-foreground/80"
          >
            <X className="h-4 w-4 mr-1" />
            {isSpanish ? 'Limpiar' : 'Clear'}
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction && (isSpanish ? confirmAction.nameEs : confirmAction.name)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction && (isSpanish
                ? confirmAction.confirmationMessageEs
                : confirmAction.confirmationMessage)}
              <div className="mt-2">
                <Badge variant="secondary">
                  {selectedCount} {isSpanish ? 'elementos' : 'items'}
                </Badge>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {isSpanish ? 'Confirmar' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
