'use client';

/**
 * Role Editor Dialog Component
 *
 * Dialog for creating and editing roles with permission management.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Save, Shield } from 'lucide-react';
import type { Role, Permission, PermissionCategory } from '@/types/rbac';
import { PERMISSION_CATEGORIES, PERMISSION_ACTIONS } from '@/types/rbac';
import { getAllPermissions } from '@/lib/rbac/rbac-service';
import { useLocale } from '@/contexts/locale-context';

interface RoleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role | null;
  onSave: (data: { name: string; description: string; permissions: string[] }) => void;
}

export function RoleEditorDialog({
  open,
  onOpenChange,
  role,
  onSave,
}: RoleEditorDialogProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<PermissionCategory>('transactions');

  const allPermissions = getAllPermissions();
  const categories = Object.keys(PERMISSION_CATEGORIES) as PermissionCategory[];

  useEffect(() => {
    if (role) {
      setName(isSpanish ? role.nameEs : role.name);
      setDescription(isSpanish ? role.descriptionEs : role.description);
      setSelectedPermissions(new Set(role.permissions));
    } else {
      setName('');
      setDescription('');
      setSelectedPermissions(new Set());
    }
  }, [role, isSpanish]);

  const getPermissionsForCategory = (category: PermissionCategory): Permission[] => {
    return allPermissions.filter((p) => p.category === category);
  };

  const togglePermission = (permissionId: string) => {
    const newSet = new Set(selectedPermissions);
    if (newSet.has(permissionId)) {
      newSet.delete(permissionId);
    } else {
      newSet.add(permissionId);
    }
    setSelectedPermissions(newSet);
  };

  const selectAllInCategory = (category: PermissionCategory) => {
    const categoryPerms = getPermissionsForCategory(category);
    const newSet = new Set(selectedPermissions);
    categoryPerms.forEach((p) => newSet.add(p.id));
    setSelectedPermissions(newSet);
  };

  const deselectAllInCategory = (category: PermissionCategory) => {
    const categoryPerms = getPermissionsForCategory(category);
    const newSet = new Set(selectedPermissions);
    categoryPerms.forEach((p) => newSet.delete(p.id));
    setSelectedPermissions(newSet);
  };

  const getCategorySelectedCount = (category: PermissionCategory): number => {
    return getPermissionsForCategory(category).filter((p) =>
      selectedPermissions.has(p.id)
    ).length;
  };

  const handleSave = () => {
    onSave({
      name,
      description,
      permissions: Array.from(selectedPermissions),
    });
    onOpenChange(false);
  };

  const isEditing = !!role;
  const canEditDetails = !role?.isSystem;

  // Group permissions by resource
  const groupPermissionsByResource = (
    permissions: Permission[]
  ): Record<string, Permission[]> => {
    return permissions.reduce<Record<string, Permission[]>>((acc, perm) => {
      if (!acc[perm.resource]) {
        acc[perm.resource] = [];
      }
      acc[perm.resource].push(perm);
      return acc;
    }, {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {isEditing
              ? isSpanish
                ? 'Editar Rol'
                : 'Edit Role'
              : isSpanish
                ? 'Crear Nuevo Rol'
                : 'Create New Role'}
          </DialogTitle>
          <DialogDescription>
            {isSpanish
              ? 'Configure el nombre, descripción y permisos para este rol.'
              : 'Configure the name, description, and permissions for this role.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Role Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{isSpanish ? 'Nombre' : 'Name'}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isSpanish ? 'Nombre del rol' : 'Role name'}
                disabled={!canEditDetails}
              />
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Permisos Seleccionados' : 'Selected Permissions'}</Label>
              <div className="h-10 flex items-center">
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {selectedPermissions.size}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{isSpanish ? 'Descripción' : 'Description'}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isSpanish ? 'Descripción del rol' : 'Role description'}
              rows={2}
              disabled={!canEditDetails}
            />
          </div>

          {/* Permission Matrix */}
          <div className="space-y-2">
            <Label>{isSpanish ? 'Permisos' : 'Permissions'}</Label>
            <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as PermissionCategory)}>
              <TabsList className="w-full flex-wrap h-auto gap-1 bg-transparent p-0">
                {categories.map((category) => {
                  const catConfig = PERMISSION_CATEGORIES[category];
                  const selectedCount = getCategorySelectedCount(category);
                  const totalCount = getPermissionsForCategory(category).length;

                  return (
                    <TabsTrigger
                      key={category}
                      value={category}
                      className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      {isSpanish ? catConfig.nameEs : catConfig.name}
                      {selectedCount > 0 && (
                        <span className="ml-1 text-[10px] opacity-70">
                          ({selectedCount}/{totalCount})
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {categories.map((category) => {
                const permissions = getPermissionsForCategory(category);
                const grouped = groupPermissionsByResource(permissions);
                const catConfig = PERMISSION_CATEGORIES[category];

                return (
                  <TabsContent key={category} value={category} className="mt-4">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? catConfig.descriptionEs : catConfig.description}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => selectAllInCategory(category)}
                        >
                          {isSpanish ? 'Todos' : 'All'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => deselectAllInCategory(category)}
                        >
                          {isSpanish ? 'Ninguno' : 'None'}
                        </Button>
                      </div>
                    </div>

                    <ScrollArea className="h-[250px] pr-4">
                      <div className="space-y-4">
                        {Object.entries(grouped).map(([resource, perms]) => (
                          <div key={resource} className="space-y-2">
                            <h4 className="font-medium text-sm capitalize">{resource}</h4>
                            <div className="grid grid-cols-3 gap-2">
                              {perms.map((perm) => {
                                const actionConfig = PERMISSION_ACTIONS[perm.action];
                                return (
                                  <label
                                    key={perm.id}
                                    className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50"
                                  >
                                    <Checkbox
                                      checked={selectedPermissions.has(perm.id)}
                                      onCheckedChange={() => togglePermission(perm.id)}
                                    />
                                    <span className="text-sm">
                                      {isSpanish ? actionConfig.nameEs : actionConfig.name}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isSpanish ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            <Save className="h-4 w-4 mr-2" />
            {isEditing
              ? isSpanish
                ? 'Guardar Cambios'
                : 'Save Changes'
              : isSpanish
                ? 'Crear Rol'
                : 'Create Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
