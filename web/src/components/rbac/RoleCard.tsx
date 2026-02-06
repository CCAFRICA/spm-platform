'use client';

/**
 * Role Card Component
 *
 * Displays a role with its permissions and user count.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Shield, Users, MoreVertical, Edit, Trash2, Copy, Lock } from 'lucide-react';
import type { Role } from '@/types/rbac';
import { PERMISSION_CATEGORIES } from '@/types/rbac';
import type { PermissionCategory } from '@/types/rbac';
import { useLocale } from '@/contexts/locale-context';

interface RoleCardProps {
  role: Role;
  onEdit?: (role: Role) => void;
  onDelete?: (roleId: string) => void;
  onDuplicate?: (role: Role) => void;
  onViewUsers?: (role: Role) => void;
}

export function RoleCard({
  role,
  onEdit,
  onDelete,
  onDuplicate,
  onViewUsers,
}: RoleCardProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  // Group permissions by category
  const permissionsByCategory = role.permissions.reduce<Record<string, number>>(
    (acc, permId) => {
      const category = permId.split('-')[1] as PermissionCategory;
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    },
    {}
  );

  const topCategories = Object.entries(permissionsByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {isSpanish ? role.nameEs : role.name}
                {role.isSystem && (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {isSpanish ? role.descriptionEs : role.description}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit?.(role)}>
                <Edit className="h-4 w-4 mr-2" />
                {isSpanish ? 'Editar' : 'Edit'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate?.(role)}>
                <Copy className="h-4 w-4 mr-2" />
                {isSpanish ? 'Duplicar' : 'Duplicate'}
              </DropdownMenuItem>
              {!role.isSystem && (
                <DropdownMenuItem
                  onClick={() => onDelete?.(role.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isSpanish ? 'Eliminar' : 'Delete'}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* User count */}
        <button
          onClick={() => onViewUsers?.(role)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Users className="h-4 w-4" />
          <span>
            {role.userCount} {isSpanish ? 'usuarios' : 'users'}
          </span>
        </button>

        {/* Permission categories */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            {isSpanish ? 'Permisos principales' : 'Main permissions'}
          </p>
          <div className="flex flex-wrap gap-2">
            {topCategories.map(([category, count]) => {
              const catConfig = PERMISSION_CATEGORIES[category as PermissionCategory];
              return (
                <Badge key={category} variant="secondary" className="text-xs">
                  {isSpanish ? catConfig?.nameEs : catConfig?.name} ({count})
                </Badge>
              );
            })}
            {Object.keys(permissionsByCategory).length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{Object.keys(permissionsByCategory).length - 3}{' '}
                {isSpanish ? 'más' : 'more'}
              </Badge>
            )}
          </div>
        </div>

        {/* Total permissions */}
        <div className="text-xs text-muted-foreground">
          {role.permissions.length} {isSpanish ? 'permisos totales' : 'total permissions'}
        </div>
      </CardContent>
    </Card>
  );
}
