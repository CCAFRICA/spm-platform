'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Role, Permission, PermissionCategory } from '@/types/permission';
import {
  PERMISSION_CATEGORIES,
  getPermissionsByCategory,
} from '@/types/permission';
import { useLocale } from '@/contexts/locale-context';
import { cn } from '@/lib/utils';

interface PermissionMatrixProps {
  roles: Role[];
  selectedPermissions?: Permission[];
  onPermissionToggle?: (permission: Permission, checked: boolean) => void;
  readOnly?: boolean;
  highlightRole?: string;
  compactMode?: boolean;
}

export function PermissionMatrix({
  roles,
  selectedPermissions = [],
  onPermissionToggle,
  readOnly = false,
  highlightRole,
  compactMode = false,
}: PermissionMatrixProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const categories = useMemo(() => {
    return Object.keys(PERMISSION_CATEGORIES) as PermissionCategory[];
  }, []);

  const getCategoryPermissions = (category: PermissionCategory) => {
    return getPermissionsByCategory(category);
  };

  const roleHasPermission = (role: Role, permission: Permission) => {
    return role.permissions.includes(permission);
  };

  if (compactMode) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {isSpanish ? 'Permisos por Rol' : 'Permissions by Role'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {categories.map((category) => {
              const catInfo = PERMISSION_CATEGORIES[category];
              const permissions = getCategoryPermissions(category);

              return (
                <div key={category}>
                  <h4 className="font-medium text-sm mb-2">
                    {isSpanish ? catInfo.nameEs : catInfo.name}
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {permissions.map((perm) => {
                      const isSelected = selectedPermissions.includes(perm.id);
                      return (
                        <TooltipProvider key={perm.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant={isSelected ? 'default' : 'outline'}
                                className={cn(
                                  'cursor-pointer text-xs',
                                  !readOnly && 'hover:bg-primary/80'
                                )}
                                onClick={() => {
                                  if (!readOnly && onPermissionToggle) {
                                    onPermissionToggle(perm.id, !isSelected);
                                  }
                                }}
                              >
                                {isSpanish ? perm.nameEs : perm.name}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{isSpanish ? perm.descriptionEs : perm.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          {isSpanish ? 'Matriz de Permisos' : 'Permission Matrix'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="min-w-[800px]">
            {/* Header row with role names */}
            <div className="flex border-b pb-2 mb-2">
              <div className="w-48 flex-shrink-0 font-medium text-sm">
                {isSpanish ? 'Permiso' : 'Permission'}
              </div>
              {roles.map((role) => (
                <div
                  key={role.id}
                  className={cn(
                    'w-24 flex-shrink-0 text-center font-medium text-sm',
                    highlightRole === role.id && 'text-primary'
                  )}
                >
                  {isSpanish ? role.nameEs : role.name}
                  {role.isSystem && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {isSpanish ? 'Sistema' : 'System'}
                    </Badge>
                  )}
                </div>
              ))}
            </div>

            {/* Permission rows grouped by category */}
            {categories.map((category) => {
              const catInfo = PERMISSION_CATEGORIES[category];
              const permissions = getCategoryPermissions(category);

              return (
                <div key={category} className="mb-4">
                  <div className="bg-muted/50 px-2 py-1 rounded text-sm font-medium mb-2">
                    {isSpanish ? catInfo.nameEs : catInfo.name}
                  </div>

                  {permissions.map((perm) => (
                    <div
                      key={perm.id}
                      className="flex items-center py-1 border-b border-muted/30 hover:bg-muted/20"
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="w-48 flex-shrink-0 text-sm cursor-help">
                              {isSpanish ? perm.nameEs : perm.name}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>{isSpanish ? perm.descriptionEs : perm.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {roles.map((role) => {
                        const hasPermission = roleHasPermission(role, perm.id);

                        return (
                          <div
                            key={role.id}
                            className="w-24 flex-shrink-0 flex justify-center"
                          >
                            <Checkbox
                              checked={hasPermission}
                              disabled={readOnly || role.isSystem}
                              onCheckedChange={(checked) => {
                                if (onPermissionToggle && !role.isSystem) {
                                  onPermissionToggle(perm.id, checked as boolean);
                                }
                              }}
                              className={cn(
                                hasPermission && 'bg-primary border-primary'
                              )}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
