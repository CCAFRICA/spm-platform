'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/tenant-context';

type UserRole = 'sales_rep' | 'supervisor' | 'manager' | 'admin' | 'vl_admin';

interface AccessControlProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  fallbackMessage?: string;
}

// Mock function to get current user role
// In production, this would come from auth context
function getCurrentUserRole(): UserRole {
  if (typeof window === 'undefined') return 'sales_rep';
  const storedRole = localStorage.getItem('entityb_user_role');
  return (storedRole as UserRole) || 'manager'; // Default to manager for demo
}

export function AccessControl({
  children,
  allowedRoles,
  fallbackMessage,
}: AccessControlProps) {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const isSpanish = currentTenant?.locale === 'es-MX';

  const currentRole = getCurrentUserRole();
  const hasAccess = allowedRoles.includes(currentRole) || currentRole === 'vl_admin';

  if (!hasAccess) {
    return (
      <div className="p-6">
        <Card className="max-w-md mx-auto mt-12 border-red-200">
          <CardContent className="pt-6 text-center">
            <div className="p-4 bg-red-100 rounded-full w-fit mx-auto mb-4">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold mb-2 text-red-800">
              {isSpanish ? 'Acceso Restringido' : 'Access Restricted'}
            </h1>
            <p className="text-muted-foreground mb-4">
              {fallbackMessage || (isSpanish
                ? 'No tienes permisos para ver esta página. Contacta a tu administrador si crees que esto es un error.'
                : 'You do not have permission to view this page. Contact your administrator if you believe this is an error.')}
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
              <AlertTriangle className="h-4 w-4" />
              <span>
                {isSpanish ? 'Rol actual:' : 'Current role:'} {currentRole.replace('_', ' ')}
              </span>
            </div>
            <Button onClick={() => router.push('/')}>
              {isSpanish ? 'Volver al Inicio' : 'Back to Home'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

// Hook to check access programmatically
export function useAccessControl() {
  const currentRole = getCurrentUserRole();

  return {
    currentRole,
    hasRole: (roles: UserRole[]) => roles.includes(currentRole) || currentRole === 'vl_admin',
    isAdmin: currentRole === 'admin' || currentRole === 'vl_admin',
    isManager: ['manager', 'admin', 'vl_admin'].includes(currentRole),
    isSupervisor: ['supervisor', 'manager', 'admin', 'vl_admin'].includes(currentRole),
  };
}

// Export role constants for convenience
export const ADMIN_ROLES: UserRole[] = ['admin', 'vl_admin'];
export const MANAGER_ROLES: UserRole[] = ['manager', 'admin', 'vl_admin'];
export const SUPERVISOR_ROLES: UserRole[] = ['supervisor', 'manager', 'admin', 'vl_admin'];
export const ALL_ROLES: UserRole[] = ['sales_rep', 'supervisor', 'manager', 'admin', 'vl_admin'];
