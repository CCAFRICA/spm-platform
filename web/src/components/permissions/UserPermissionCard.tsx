'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  User,
  Shield,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Users,
  Store,
  Globe,
} from 'lucide-react';
import type {
  UserPermissionAssignment,
  Role,
  ScopeType,
} from '@/types/permission';
import { ALL_PERMISSIONS, PERMISSION_CATEGORIES } from '@/types/permission';
import { useLocale } from '@/contexts/locale-context';

interface UserPermissionCardProps {
  assignment: UserPermissionAssignment;
  roles: Role[];
  onEdit: (assignment: UserPermissionAssignment) => void;
  onRemove: (userId: string) => void;
  readOnly?: boolean;
}

export function UserPermissionCard({
  assignment,
  roles,
  onEdit,
  onRemove,
  readOnly = false,
}: UserPermissionCardProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [showPermissions, setShowPermissions] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  const role = roles.find((r) => r.id === assignment.roleId);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getScopeIcon = (scopeType: ScopeType) => {
    switch (scopeType) {
      case 'global':
        return <Globe className="h-4 w-4" />;
      case 'region':
        return <MapPin className="h-4 w-4" />;
      case 'team':
        return <Users className="h-4 w-4" />;
      case 'store':
        return <Store className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getScopeLabel = (scopeType: ScopeType) => {
    switch (scopeType) {
      case 'global':
        return isSpanish ? 'Global' : 'Global';
      case 'region':
        return isSpanish ? 'Región' : 'Region';
      case 'team':
        return isSpanish ? 'Equipo' : 'Team';
      case 'store':
        return isSpanish ? 'Tienda' : 'Store';
      default:
        return isSpanish ? 'Propio' : 'Own';
    }
  };

  // Calculate effective permissions
  const effectivePermissions = role ? [...role.permissions] : [];
  if (assignment.customPermissions) {
    assignment.customPermissions.forEach((p) => {
      if (!effectivePermissions.includes(p)) {
        effectivePermissions.push(p);
      }
    });
  }
  if (assignment.deniedPermissions) {
    assignment.deniedPermissions.forEach((p) => {
      const index = effectivePermissions.indexOf(p);
      if (index >= 0) {
        effectivePermissions.splice(index, 1);
      }
    });
  }

  // Group permissions by category for display
  const groupedPermissions = effectivePermissions.reduce(
    (acc, permId) => {
      const perm = ALL_PERMISSIONS.find((p) => p.id === permId);
      if (perm) {
        if (!acc[perm.category]) {
          acc[perm.category] = [];
        }
        acc[perm.category].push(perm);
      }
      return acc;
    },
    {} as Record<string, typeof ALL_PERMISSIONS>
  );

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(assignment.userName)}
              </AvatarFallback>
            </Avatar>

            {/* User Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium truncate">{assignment.userName}</h3>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {isSpanish ? role?.nameEs : role?.name}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {assignment.userEmail}
              </p>

              {/* Scope */}
              <div className="flex items-center gap-2 mt-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="flex items-center gap-1">
                        {getScopeIcon(assignment.scope.type)}
                        {getScopeLabel(assignment.scope.type)}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {isSpanish ? 'Alcance de acceso a datos' : 'Data access scope'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Custom permissions indicator */}
                {assignment.customPermissions && assignment.customPermissions.length > 0 && (
                  <Badge variant="default" className="text-xs">
                    +{assignment.customPermissions.length}{' '}
                    {isSpanish ? 'personalizados' : 'custom'}
                  </Badge>
                )}

                {/* Denied permissions indicator */}
                {assignment.deniedPermissions && assignment.deniedPermissions.length > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    -{assignment.deniedPermissions.length}{' '}
                    {isSpanish ? 'denegados' : 'denied'}
                  </Badge>
                )}
              </div>

              {/* Effective period */}
              <p className="text-xs text-muted-foreground mt-2">
                {isSpanish ? 'Desde' : 'From'}{' '}
                {new Date(assignment.effectiveFrom).toLocaleDateString()}
                {assignment.effectiveUntil && (
                  <>
                    {' '}
                    {isSpanish ? 'hasta' : 'until'}{' '}
                    {new Date(assignment.effectiveUntil).toLocaleDateString()}
                  </>
                )}
              </p>
            </div>

            {/* Actions */}
            {!readOnly && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => onEdit(assignment)}>
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setShowRemoveDialog(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Expand/Collapse permissions */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-4 text-muted-foreground"
            onClick={() => setShowPermissions(!showPermissions)}
          >
            {showPermissions ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                {isSpanish ? 'Ocultar permisos' : 'Hide permissions'}
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                {effectivePermissions.length}{' '}
                {isSpanish ? 'permisos' : 'permissions'}
              </>
            )}
          </Button>

          {/* Permissions list */}
          {showPermissions && (
            <div className="mt-4 pt-4 border-t space-y-3">
              {Object.entries(groupedPermissions).map(([category, perms]) => {
                const catInfo =
                  PERMISSION_CATEGORIES[category as keyof typeof PERMISSION_CATEGORIES];
                return (
                  <div key={category}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {isSpanish ? catInfo?.nameEs : catInfo?.name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {perms.map((perm) => {
                        const isCustom = assignment.customPermissions?.includes(perm.id);
                        return (
                          <Badge
                            key={perm.id}
                            variant={isCustom ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {isSpanish ? perm.nameEs : perm.name}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove Confirmation Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSpanish ? 'Eliminar Asignación' : 'Remove Assignment'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? `¿Estás seguro de que quieres eliminar los permisos de ${assignment.userName}?`
                : `Are you sure you want to remove permissions for ${assignment.userName}?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveDialog(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onRemove(assignment.userId);
                setShowRemoveDialog(false);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isSpanish ? 'Eliminar' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Compact list variant
interface UserPermissionListItemProps {
  assignment: UserPermissionAssignment;
  role?: Role;
  onClick: () => void;
}

export function UserPermissionListItem({
  assignment,
  role,
  onClick,
}: UserPermissionListItemProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {getInitials(assignment.userName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{assignment.userName}</p>
        <p className="text-sm text-muted-foreground truncate">{assignment.userEmail}</p>
      </div>

      <Badge variant="secondary">
        {isSpanish ? role?.nameEs : role?.name}
      </Badge>
    </div>
  );
}
