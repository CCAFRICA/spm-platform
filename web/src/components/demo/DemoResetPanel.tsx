'use client';

/**
 * Demo Reset Panel Component
 *
 * Provides one-click reset and snapshot management.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  RotateCcw,
  Camera,
  Clock,
  Trash2,
  Upload,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import type { DemoSnapshot, DemoState } from '@/types/demo';
import {
  resetDemoData,
  getDemoState,
  getSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
} from '@/lib/demo/demo-service';
import { useLocale } from '@/contexts/locale-context';

interface DemoResetPanelProps {
  onReset?: () => void;
  onSnapshotRestore?: () => void;
}

export function DemoResetPanel({ onReset, onSnapshotRestore }: DemoResetPanelProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [state, setState] = useState<DemoState>(() => getDemoState());
  const [snapshots, setSnapshots] = useState<DemoSnapshot[]>(() => getSnapshots());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCreateSnapshot, setShowCreateSnapshot] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotDescription, setSnapshotDescription] = useState('');
  const [resetResult, setResetResult] = useState<{ success: boolean; keysReset: string[] } | null>(null);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return isSpanish ? 'Nunca' : 'Never';
    return new Date(dateStr).toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleReset = () => {
    const result = resetDemoData();
    setResetResult(result);
    setState(getDemoState());
    setShowResetConfirm(false);
    onReset?.();

    // Clear result after 5 seconds
    setTimeout(() => setResetResult(null), 5000);
  };

  const handleCreateSnapshot = () => {
    if (snapshotName.trim()) {
      createSnapshot(snapshotName, snapshotDescription, 'demo-user');
      setSnapshots(getSnapshots());
      setSnapshotName('');
      setSnapshotDescription('');
      setShowCreateSnapshot(false);
    }
  };

  const handleRestoreSnapshot = (snapshotId: string) => {
    if (restoreSnapshot(snapshotId)) {
      setState(getDemoState());
      onSnapshotRestore?.();
    }
  };

  const handleDeleteSnapshot = (snapshotId: string) => {
    if (deleteSnapshot(snapshotId)) {
      setSnapshots(getSnapshots());
    }
  };

  return (
    <div className="space-y-6">
      {/* Reset Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            {isSpanish ? 'Reinicio de Demo' : 'Demo Reset'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="font-medium">
                {isSpanish ? 'Último Reinicio' : 'Last Reset'}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatDate(state.lastReset)}
              </p>
            </div>
            <Badge variant={state.isInitialized ? 'default' : 'secondary'}>
              {state.isInitialized
                ? isSpanish ? 'Inicializado' : 'Initialized'
                : isSpanish ? 'No Inicializado' : 'Not Initialized'}
            </Badge>
          </div>

          {resetResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${resetResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {resetResult.success ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
              <span>
                {resetResult.success
                  ? isSpanish
                    ? `Reinicio exitoso. ${resetResult.keysReset.length} claves reiniciadas.`
                    : `Reset successful. ${resetResult.keysReset.length} keys reset.`
                  : isSpanish
                    ? 'Error al reiniciar'
                    : 'Reset failed'}
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => setShowResetConfirm(true)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {isSpanish ? 'Reiniciar Todo' : 'Reset All'}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowCreateSnapshot(true)}
            >
              <Camera className="h-4 w-4 mr-2" />
              {isSpanish ? 'Crear Snapshot' : 'Create Snapshot'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Snapshots Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              {isSpanish ? 'Snapshots' : 'Snapshots'}
            </span>
            <Badge variant="secondary">{snapshots.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                {isSpanish
                  ? 'No hay snapshots guardados'
                  : 'No snapshots saved'}
              </p>
              <p className="text-sm">
                {isSpanish
                  ? 'Cree un snapshot para guardar el estado actual'
                  : 'Create a snapshot to save the current state'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className={`p-4 rounded-lg border ${state.activeSnapshot === snapshot.id ? 'border-primary bg-primary/5' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium flex items-center gap-2">
                        {snapshot.name}
                        {state.activeSnapshot === snapshot.id && (
                          <Badge variant="default" className="text-xs">
                            {isSpanish ? 'Activo' : 'Active'}
                          </Badge>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {snapshot.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(snapshot.createdAt)}
                        </span>
                        <span>{formatSize(snapshot.size)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestoreSnapshot(snapshot.id)}
                        disabled={state.activeSnapshot === snapshot.id}
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSnapshot(snapshot.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reset Confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isSpanish ? '¿Reiniciar todos los datos demo?' : 'Reset all demo data?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isSpanish
                ? 'Esto eliminará todos los datos personalizados y restaurará los valores predeterminados. Esta acción no se puede deshacer.'
                : 'This will delete all custom data and restore defaults. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground">
              {isSpanish ? 'Reiniciar' : 'Reset'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Snapshot Dialog */}
      <Dialog open={showCreateSnapshot} onOpenChange={setShowCreateSnapshot}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSpanish ? 'Crear Snapshot' : 'Create Snapshot'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? 'Guarde el estado actual del demo para restaurarlo después.'
                : 'Save the current demo state to restore later.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="snapshotName">
                {isSpanish ? 'Nombre' : 'Name'}
              </Label>
              <Input
                id="snapshotName"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder={isSpanish ? 'Nombre del snapshot' : 'Snapshot name'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="snapshotDesc">
                {isSpanish ? 'Descripción' : 'Description'}
              </Label>
              <Textarea
                id="snapshotDesc"
                value={snapshotDescription}
                onChange={(e) => setSnapshotDescription(e.target.value)}
                placeholder={isSpanish ? 'Descripción opcional' : 'Optional description'}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateSnapshot(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleCreateSnapshot} disabled={!snapshotName.trim()}>
              <Camera className="h-4 w-4 mr-2" />
              {isSpanish ? 'Crear' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
