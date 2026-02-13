'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Users, ChevronUp, Check, RotateCcw, FastForward, Info } from 'lucide-react';
import {
  DEMO_STATES,
  DemoState,
  getDemoStateName,
  getDemoStateDescription,
} from '@/lib/demo/demo-states';
import {
  resetDemo,
  getCurrentDemoState,
  fastForwardDemo,
  registerResetShortcut,
} from '@/lib/demo/demo-reset';
import { toast } from 'sonner';

// Demo users by tenant
const DEMO_USERS: Record<
  string,
  Array<{
    email: string;
    name: string;
    role: string;
    roleEs: string;
    description: string;
    descriptionEs: string;
  }>
> = {
  retailco: [
    {
      email: 'maria.rodriguez@retailco.com',
      name: 'Maria Rodriguez',
      role: 'Sales Associate',
      roleEs: 'Asociada de Ventas',
      description: 'View the attribution dispute scenario',
      descriptionEs: 'Ver el escenario de disputa de atribución',
    },
    {
      email: 'james.wilson@retailco.com',
      name: 'James Wilson',
      role: 'Sales Associate',
      roleEs: 'Asociado de Ventas',
      description: 'Other party in the split credit dispute',
      descriptionEs: 'Otra parte en la disputa de crédito dividido',
    },
    {
      email: 'carlos.mendez@retailco.com',
      name: 'Carlos Mendez',
      role: 'Store Manager',
      roleEs: 'Gerente de Tienda',
      description: 'Review team performance & disputes',
      descriptionEs: 'Revisar rendimiento del equipo y disputas',
    },
    {
      email: 'sofia.chen@retailco.com',
      name: 'Sofia Chen',
      role: 'Finance Director',
      roleEs: 'Directora de Finanzas',
      description: 'Full admin access & audit logs',
      descriptionEs: 'Acceso administrativo completo y logs de auditoría',
    },
  ],
  restaurantmx: [
    {
      email: 'maria.lopez@restaurantmx.com',
      name: 'María López',
      role: 'Server',
      roleEs: 'Mesero',
      description: 'View tips and performance',
      descriptionEs: 'Ver propinas y rendimiento',
    },
    {
      email: 'carlos.garcia@restaurantmx.com',
      name: 'Carlos García',
      role: 'Manager',
      roleEs: 'Gerente',
      description: 'Review team and franchises',
      descriptionEs: 'Revisar equipo y franquicias',
    },
    {
      email: 'admin@restaurantmx.com',
      name: 'RestaurantMX Admin',
      role: 'Administrator',
      roleEs: 'Administrador',
      description: 'Full admin access',
      descriptionEs: 'Acceso administrativo completo',
    },
  ],
  // OB-29: RetailCGMX demo users - real identities from 719-employee roster
  retail_conglomerate: [
    {
      email: '96568046@retailcgmx.com',
      name: 'Carlos García Rodríguez',
      role: 'Certified Optometrist',
      roleEs: 'Optometrista Certificado',
      description: 'Top performer, Store 1, all 6 components',
      descriptionEs: 'Alto rendimiento, Tienda 1, 6 componentes',
    },
    {
      email: '90125625@retailcgmx.com',
      name: 'Ana Martínez López',
      role: 'Optometrist',
      roleEs: 'Optometrista',
      description: 'Average performer, typical compensation',
      descriptionEs: 'Rendimiento promedio, compensación típica',
    },
    {
      email: 'manager@retailcgmx.com',
      name: 'Roberto Hernández',
      role: 'Store Manager',
      roleEs: 'Gerente de Tienda',
      description: 'Review team performance & exceptions',
      descriptionEs: 'Revisar rendimiento del equipo y excepciones',
    },
    {
      email: 'admin@retailcgmx.com',
      name: 'Sofía Chen',
      role: 'Platform Admin',
      roleEs: 'Administrador de Plataforma',
      description: 'Full access: calculate, approve, reconcile',
      descriptionEs: 'Acceso completo: calcular, aprobar, conciliar',
    },
  ],
  // Alias for alternate tenant ID
  retailcgmx: [
    {
      email: '96568046@retailcgmx.com',
      name: 'Carlos García Rodríguez',
      role: 'Certified Optometrist',
      roleEs: 'Optometrista Certificado',
      description: 'Top performer, Store 1, all 6 components',
      descriptionEs: 'Alto rendimiento, Tienda 1, 6 componentes',
    },
    {
      email: '90125625@retailcgmx.com',
      name: 'Ana Martínez López',
      role: 'Optometrist',
      roleEs: 'Optometrista',
      description: 'Average performer, typical compensation',
      descriptionEs: 'Rendimiento promedio, compensación típica',
    },
    {
      email: 'manager@retailcgmx.com',
      name: 'Roberto Hernández',
      role: 'Store Manager',
      roleEs: 'Gerente de Tienda',
      description: 'Review team performance & exceptions',
      descriptionEs: 'Revisar rendimiento del equipo y excepciones',
    },
    {
      email: 'admin@retailcgmx.com',
      name: 'Sofía Chen',
      role: 'Platform Admin',
      roleEs: 'Administrador de Plataforma',
      description: 'Full access: calculate, approve, reconcile',
      descriptionEs: 'Acceso completo: calcular, aprobar, conciliar',
    },
  ],
};

export function DemoUserSwitcher() {
  const { user, login } = useAuth();
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [currentDemoState, setCurrentDemoState] = useState<DemoState>('initial');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [selectedResetState, setSelectedResetState] = useState<DemoState>('initial');

  const isSpanish = locale === 'es-MX';
  const tenantId = currentTenant?.id || '';
  const demoUsers = DEMO_USERS[tenantId];

  // Track current demo state
  useEffect(() => {
    setCurrentDemoState(getCurrentDemoState());
  }, []);

  // Register keyboard shortcut
  useEffect(() => {
    const cleanup = registerResetShortcut(() => {
      setSelectedResetState('initial');
      setShowResetDialog(true);
    });
    return cleanup;
  }, []);

  // Only show for tenants with demo users configured
  if (!demoUsers) {
    return null;
  }

  const handleUserSwitch = async (email: string) => {
    if (user?.email === email) {
      setIsOpen(false);
      return;
    }

    setIsSwitching(true);
    try {
      await login(email);
      toast.success(isSpanish ? 'Usuario cambiado' : 'User switched');
    } finally {
      setIsSwitching(false);
      setIsOpen(false);
    }
  };

  const handleResetConfirm = () => {
    resetDemo(selectedResetState);
    setShowResetDialog(false);
    toast.success(
      isSpanish
        ? `Demo reiniciado a: ${getDemoStateName(selectedResetState, true)}`
        : `Demo reset to: ${getDemoStateName(selectedResetState, false)}`
    );
  };

  const handleFastForward = () => {
    const nextState = fastForwardDemo();
    setCurrentDemoState(nextState);
    toast.success(
      isSpanish
        ? `Avanzado a: ${getDemoStateName(nextState, true)}`
        : `Advanced to: ${getDemoStateName(nextState, false)}`
    );
  };

  const handleResetClick = (stateId: DemoState) => {
    setSelectedResetState(stateId);
    setShowResetDialog(true);
    setIsOpen(false);
  };

  const currentUserEmail = user?.email?.toLowerCase();

  // State indicator colors
  const stateColors: Record<DemoState, string> = {
    initial: 'bg-blue-500',
    disputed: 'bg-amber-500',
    resolved: 'bg-green-500',
    data_dirty: 'bg-red-500',
    data_clean: 'bg-emerald-500',
  };

  return (
    <>
      <div className="fixed bottom-4 left-4 z-50">
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="default"
              size="lg"
              className="shadow-lg bg-violet-600 hover:bg-violet-700 text-white rounded-full px-4 gap-2"
              disabled={isSwitching}
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">
                {isSpanish ? 'Demo' : 'Demo User'}
              </span>
              <span
                className={`h-2 w-2 rounded-full ${stateColors[currentDemoState]}`}
                title={getDemoStateName(currentDemoState, isSpanish)}
              />
              <ChevronUp className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 mb-2">
            {/* Current State Indicator */}
            <div className="px-2 py-2 bg-slate-50 dark:bg-slate-900 rounded-t-md">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {isSpanish ? 'Estado actual:' : 'Current state:'}
                </span>
                <Badge
                  variant="secondary"
                  className={`${stateColors[currentDemoState]} text-white text-xs`}
                >
                  {getDemoStateName(currentDemoState, isSpanish)}
                </Badge>
              </div>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {isSpanish ? 'Cambiar Persona de Demo' : 'Switch Demo Persona'}
            </DropdownMenuLabel>

            {demoUsers.map((demoUser) => {
              const isCurrentUser = currentUserEmail === demoUser.email.toLowerCase();
              return (
                <DropdownMenuItem
                  key={demoUser.email}
                  onClick={() => handleUserSwitch(demoUser.email)}
                  className="flex flex-col items-start gap-1 py-3 cursor-pointer"
                  disabled={isSwitching}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-medium">{demoUser.name}</span>
                    {isCurrentUser && <Check className="h-4 w-4 text-violet-600" />}
                  </div>
                  <span className="text-xs text-violet-600 font-medium">
                    {isSpanish ? demoUser.roleEs : demoUser.role}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isSpanish ? demoUser.descriptionEs : demoUser.description}
                  </span>
                </DropdownMenuItem>
              );
            })}

            <DropdownMenuSeparator />

            {/* Demo Controls */}
            <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-2">
              <RotateCcw className="h-3 w-3" />
              {isSpanish ? 'Controles de Demo' : 'Demo Controls'}
            </DropdownMenuLabel>

            {/* Reset submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer">
                <RotateCcw className="mr-2 h-4 w-4" />
                {isSpanish ? 'Reiniciar Demo' : 'Reset Demo'}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">
                {DEMO_STATES.map((state) => (
                  <DropdownMenuItem
                    key={state.id}
                    onClick={() => handleResetClick(state.id)}
                    className="flex flex-col items-start gap-1 py-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span
                        className={`h-2 w-2 rounded-full ${stateColors[state.id]}`}
                      />
                      <span className="font-medium">
                        {isSpanish ? state.nameEs : state.name}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground pl-4">
                      {isSpanish ? state.descriptionEs : state.description}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Fast Forward */}
            <DropdownMenuItem onClick={handleFastForward} className="cursor-pointer">
              <FastForward className="mr-2 h-4 w-4" />
              {isSpanish ? 'Avanzar Demo' : 'Fast Forward'}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <div className="px-2 py-2 text-xs text-muted-foreground text-center">
              <div className="flex items-center justify-center gap-1">
                <Info className="h-3 w-3" />
                {isSpanish
                  ? 'Ctrl+Shift+R para reinicio rápido'
                  : 'Ctrl+Shift+R for quick reset'}
              </div>
              <div className="mt-1 opacity-70">
                {currentTenant?.displayName || 'Demo'}{' '}
                {isSpanish ? 'Entorno' : 'Environment'}
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              {isSpanish ? 'Reiniciar Demo' : 'Reset Demo'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? 'Esto borrará todos los cambios actuales y restaurará los datos de demostración.'
                : 'This will clear all current changes and restore demonstration data.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <span
                className={`h-3 w-3 rounded-full mt-1 ${stateColors[selectedResetState]}`}
              />
              <div>
                <p className="font-medium">
                  {getDemoStateName(selectedResetState, isSpanish)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {getDemoStateDescription(selectedResetState, isSpanish)}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
            >
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button
              onClick={handleResetConfirm}
              className="bg-violet-600 hover:bg-violet-700"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {isSpanish ? 'Reiniciar' : 'Reset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
