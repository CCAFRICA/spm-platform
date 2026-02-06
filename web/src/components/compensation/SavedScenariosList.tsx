'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { useLocale } from '@/contexts/locale-context';
import { toast } from 'sonner';
import {
  Bookmark,
  MoreHorizontal,
  Trash2,
  Copy,
  Play,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  CheckCircle,
  FileCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SavedScenario } from '@/types/scenario';
import { deleteScenario, duplicateScenario } from '@/lib/scenarios/scenario-service';

interface SavedScenariosListProps {
  scenarios: SavedScenario[];
  onSelect: (scenario: SavedScenario) => void;
  onRefresh: () => void;
  currentUserId: string;
  currentUserName: string;
}

const STATUS_CONFIG: Record<SavedScenario['status'], {
  label: string;
  labelEs: string;
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
  icon: React.ElementType;
}> = {
  draft: {
    label: 'Draft',
    labelEs: 'Borrador',
    variant: 'secondary',
    icon: Clock,
  },
  saved: {
    label: 'Saved',
    labelEs: 'Guardado',
    variant: 'outline',
    icon: Bookmark,
  },
  approved: {
    label: 'Approved',
    labelEs: 'Aprobado',
    variant: 'default',
    icon: CheckCircle,
  },
  applied: {
    label: 'Applied',
    labelEs: 'Aplicado',
    variant: 'default',
    icon: FileCheck,
  },
};

export function SavedScenariosList({
  scenarios,
  onSelect,
  onRefresh,
  currentUserId,
  currentUserName,
}: SavedScenariosListProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scenarioToDelete, setScenarioToDelete] = useState<SavedScenario | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [scenarioToDuplicate, setScenarioToDuplicate] = useState<SavedScenario | null>(null);

  const handleDelete = () => {
    if (!scenarioToDelete) return;

    const success = deleteScenario(scenarioToDelete.id);
    if (success) {
      toast.success(isSpanish ? 'Escenario eliminado' : 'Scenario deleted');
      onRefresh();
    } else {
      toast.error(isSpanish ? 'Error al eliminar' : 'Error deleting');
    }
    setDeleteDialogOpen(false);
    setScenarioToDelete(null);
  };

  const handleDuplicate = () => {
    if (!scenarioToDuplicate || !duplicateName.trim()) return;

    const result = duplicateScenario(
      scenarioToDuplicate.id,
      duplicateName,
      currentUserId,
      currentUserName
    );

    if (result) {
      toast.success(isSpanish ? 'Escenario duplicado' : 'Scenario duplicated');
      onRefresh();
    } else {
      toast.error(isSpanish ? 'Error al duplicar' : 'Error duplicating');
    }
    setDuplicateDialogOpen(false);
    setScenarioToDuplicate(null);
    setDuplicateName('');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getTrendIcon = (percentChange: number) => {
    if (percentChange > 0) return TrendingUp;
    if (percentChange < 0) return TrendingDown;
    return Minus;
  };

  if (scenarios.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Bookmark className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-2">
            {isSpanish ? 'No hay escenarios guardados' : 'No Saved Scenarios'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isSpanish
              ? 'Guarda tus configuraciones de escenario para comparar m\u00e1s tarde'
              : 'Save your scenario configurations to compare later'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bookmark className="h-5 w-5" />
            {isSpanish ? 'Escenarios Guardados' : 'Saved Scenarios'}
          </CardTitle>
          <CardDescription>
            {isSpanish
              ? 'Haz clic en un escenario para cargarlo'
              : 'Click a scenario to load it'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {scenarios.map((scenario) => {
            const statusConfig = STATUS_CONFIG[scenario.status];
            const StatusIcon = statusConfig.icon;
            const TrendIcon = getTrendIcon(scenario.impacts.percentChange);

            return (
              <div
                key={scenario.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={() => onSelect(scenario)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {isSpanish ? scenario.nameEs : scenario.name}
                    </span>
                    <Badge variant={statusConfig.variant} className="text-xs">
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {isSpanish ? statusConfig.labelEs : statusConfig.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {scenario.createdByName} &bull; {formatDate(scenario.updatedAt)}
                    </span>
                    <div
                      className={cn(
                        'flex items-center gap-1 text-xs font-medium',
                        scenario.impacts.percentChange > 0 && 'text-green-600',
                        scenario.impacts.percentChange < 0 && 'text-red-600',
                        scenario.impacts.percentChange === 0 && 'text-muted-foreground'
                      )}
                    >
                      <TrendIcon className="h-3 w-3" />
                      {scenario.impacts.percentChange > 0 ? '+' : ''}
                      {scenario.impacts.percentChange.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onSelect(scenario)}>
                      <Play className="h-4 w-4 mr-2" />
                      {isSpanish ? 'Cargar' : 'Load'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setScenarioToDuplicate(scenario);
                        setDuplicateName(`${scenario.name} (Copy)`);
                        setDuplicateDialogOpen(true);
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {isSpanish ? 'Duplicar' : 'Duplicate'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setScenarioToDelete(scenario);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {isSpanish ? 'Eliminar' : 'Delete'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSpanish ? 'Eliminar Escenario' : 'Delete Scenario'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? '\u00bfEst\u00e1s seguro de que deseas eliminar este escenario? Esta acci\u00f3n no se puede deshacer.'
                : 'Are you sure you want to delete this scenario? This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {isSpanish ? 'Eliminar' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSpanish ? 'Duplicar Escenario' : 'Duplicate Scenario'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? 'Ingresa un nombre para la copia del escenario.'
                : 'Enter a name for the scenario copy.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder={isSpanish ? 'Nombre del escenario' : 'Scenario name'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleDuplicate} disabled={!duplicateName.trim()}>
              {isSpanish ? 'Duplicar' : 'Duplicate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
