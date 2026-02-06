'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Shield,
  Plus,
  Search,
  ArrowLeft,
  Users,
  Lock,
  Edit2,
  Trash2,
  Copy,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTenant } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
} from '@/lib/permissions/permission-service';
import type { Role, Permission, PermissionScope, ScopeType } from '@/types/permission';
import { RoleEditor } from '@/components/permissions/RoleEditor';

export default function RolesPage() {
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const { user } = useAuth();
  const isSpanish = locale === 'es-MX';
  const tenantId = currentTenant?.id || 'retailco';

  const [roles, setRoles] = useState<Role[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(() => {
    setIsLoading(true);
    try {
      const loadedRoles = getRoles(tenantId);
      setRoles(loadedRoles);
    } catch (error) {
      console.error('Error loading roles:', error);
      toast.error(isSpanish ? 'Error al cargar roles' : 'Error loading roles');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, isSpanish]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateRole = (data: {
    name: string;
    nameEs: string;
    description: string;
    descriptionEs: string;
    permissions: Permission[];
    defaultScopeType: ScopeType;
  }) => {
    setIsSaving(true);
    try {
      createRole(
        tenantId,
        {
          ...data,
          defaultScope: { type: data.defaultScopeType },
        },
        user?.id || 'admin'
      );

      toast.success(isSpanish ? 'Rol creado exitosamente' : 'Role created successfully');
      setShowEditor(false);
      setSelectedRole(null);
      loadData();
    } catch (error) {
      console.error('Error creating role:', error);
      toast.error(isSpanish ? 'Error al crear rol' : 'Error creating role');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateRole = (data: {
    name: string;
    nameEs: string;
    description: string;
    descriptionEs: string;
    permissions: Permission[];
    defaultScopeType: ScopeType;
  }) => {
    if (!selectedRole) return;

    setIsSaving(true);
    try {
      updateRole(selectedRole.id, {
        name: data.name,
        nameEs: data.nameEs,
        description: data.description,
        descriptionEs: data.descriptionEs,
        permissions: data.permissions,
        defaultScope: { type: data.defaultScopeType },
      });

      toast.success(isSpanish ? 'Rol actualizado' : 'Role updated');
      setShowEditor(false);
      setSelectedRole(null);
      loadData();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error(isSpanish ? 'Error al actualizar rol' : 'Error updating role');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = () => {
    if (!roleToDelete) return;

    try {
      const success = deleteRole(roleToDelete.id);
      if (success) {
        toast.success(isSpanish ? 'Rol eliminado' : 'Role deleted');
        loadData();
      } else {
        toast.error(
          isSpanish
            ? 'No se puede eliminar un rol del sistema'
            : 'Cannot delete a system role'
        );
      }
    } catch (error) {
      console.error('Error deleting role:', error);
      toast.error(isSpanish ? 'Error al eliminar rol' : 'Error deleting role');
    } finally {
      setShowDeleteDialog(false);
      setRoleToDelete(null);
    }
  };

  const handleDuplicateRole = (role: Role) => {
    setSelectedRole(null);
    // Pre-fill with duplicated data
    const duplicateData: Role = {
      ...role,
      id: '',
      name: `${role.name} (Copy)`,
      nameEs: `${role.nameEs} (Copia)`,
      isSystem: false,
    };
    setSelectedRole(duplicateData);
    setShowEditor(true);
  };

  const getScopeLabel = (scope: PermissionScope) => {
    switch (scope.type) {
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

  const filteredRoles = roles.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.nameEs.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const systemRoles = filteredRoles.filter((r) => r.isSystem);
  const customRoles = filteredRoles.filter((r) => !r.isSystem);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isSpanish ? 'Cargando roles...' : 'Loading roles...'}
          </p>
        </div>
      </div>
    );
  }

  if (showEditor) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowEditor(false);
              setSelectedRole(null);
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">
            {selectedRole?.id
              ? isSpanish
                ? 'Editar Rol'
                : 'Edit Role'
              : isSpanish
                ? 'Nuevo Rol'
                : 'New Role'}
          </h1>
        </div>

        <RoleEditor
          role={selectedRole || undefined}
          onSave={selectedRole?.id ? handleUpdateRole : handleCreateRole}
          onCancel={() => {
            setShowEditor(false);
            setSelectedRole(null);
          }}
          isLoading={isSaving}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/workforce/permissions">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              {isSpanish ? 'Gestión de Roles' : 'Role Management'}
            </h1>
            <p className="text-muted-foreground">
              {isSpanish
                ? 'Crea y administra roles personalizados'
                : 'Create and manage custom roles'}
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            setSelectedRole(null);
            setShowEditor(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          {isSpanish ? 'Nuevo Rol' : 'New Role'}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={isSpanish ? 'Buscar roles...' : 'Search roles...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* System Roles */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          {isSpanish ? 'Roles del Sistema' : 'System Roles'}
          <Badge variant="secondary">{systemRoles.length}</Badge>
        </h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {systemRoles.map((role) => (
            <Card key={role.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {isSpanish ? role.nameEs : role.name}
                      <Badge variant="secondary" className="text-xs">
                        <Lock className="h-3 w-3 mr-1" />
                        {isSpanish ? 'Sistema' : 'System'}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {isSpanish ? role.descriptionEs : role.description}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedRole(role);
                          setShowEditor(true);
                        }}
                      >
                        <Shield className="h-4 w-4 mr-2" />
                        {isSpanish ? 'Ver Permisos' : 'View Permissions'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicateRole(role)}>
                        <Copy className="h-4 w-4 mr-2" />
                        {isSpanish ? 'Duplicar' : 'Duplicate'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    <span>
                      {role.permissions.length}{' '}
                      {isSpanish ? 'permisos' : 'permissions'}
                    </span>
                  </div>
                  <Badge variant="outline">{getScopeLabel(role.defaultScope)}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Custom Roles */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          {isSpanish ? 'Roles Personalizados' : 'Custom Roles'}
          <Badge variant="secondary">{customRoles.length}</Badge>
        </h2>

        {customRoles.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customRoles.map((role) => (
              <Card key={role.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {isSpanish ? role.nameEs : role.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {isSpanish ? role.descriptionEs : role.description}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedRole(role);
                            setShowEditor(true);
                          }}
                        >
                          <Edit2 className="h-4 w-4 mr-2" />
                          {isSpanish ? 'Editar' : 'Edit'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicateRole(role)}>
                          <Copy className="h-4 w-4 mr-2" />
                          {isSpanish ? 'Duplicar' : 'Duplicate'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setRoleToDelete(role);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {isSpanish ? 'Eliminar' : 'Delete'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Shield className="h-4 w-4" />
                      <span>
                        {role.permissions.length}{' '}
                        {isSpanish ? 'permisos' : 'permissions'}
                      </span>
                    </div>
                    <Badge variant="outline">{getScopeLabel(role.defaultScope)}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">
                {isSpanish
                  ? 'No hay roles personalizados'
                  : 'No custom roles yet'}
              </p>
              <Button
                className="mt-4"
                onClick={() => {
                  setSelectedRole(null);
                  setShowEditor(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                {isSpanish ? 'Crear Primer Rol' : 'Create First Role'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSpanish ? 'Eliminar Rol' : 'Delete Role'}</DialogTitle>
            <DialogDescription>
              {isSpanish
                ? `¿Estás seguro de que quieres eliminar el rol "${roleToDelete?.name}"? Esta acción no se puede deshacer.`
                : `Are you sure you want to delete the role "${roleToDelete?.name}"? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button variant="destructive" onClick={handleDeleteRole}>
              <Trash2 className="h-4 w-4 mr-2" />
              {isSpanish ? 'Eliminar' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
