'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';

type UserRole = 'sales_rep' | 'supervisor' | 'manager' | 'admin' | 'vl_admin';

interface AccessControlProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  fallbackMessage?: string;
}

export function AccessControl({
  children,
  allowedRoles,
  fallbackMessage,
}: AccessControlProps) {
  const router = useRouter();
  const { locale } = useLocale();
  const { user } = useAuth();
  const isSpanish = locale === 'es-MX';

  // Get role from auth context
  const currentRole = (user?.role as UserRole) || 'sales_rep';
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
  const { user } = useAuth();
  const currentRole = (user?.role as UserRole) || 'sales_rep';

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
