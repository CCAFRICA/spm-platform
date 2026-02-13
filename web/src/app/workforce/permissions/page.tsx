'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Shield,
  Users,
  Plus,
  Search,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import {
  getRoles,
  getAssignments,
  assignRole,
  removeAssignment,
  updateAssignment,
} from '@/lib/permissions/permission-service';
import type { Role, UserPermissionAssignment, PermissionScope } from '@/types/permission';
import { UserPermissionCard } from '@/components/permissions/UserPermissionCard';
import { PermissionMatrix } from '@/components/permissions/PermissionMatrix';

// Demo users for assignment
const DEMO_USERS = [
  { id: 'maria-rodriguez', name: 'Maria Rodriguez', email: 'maria.rodriguez@retailco.com' },
  { id: 'james-wilson', name: 'James Wilson', email: 'james.wilson@retailco.com' },
  { id: 'carlos-mendez', name: 'Carlos Mendez', email: 'carlos.mendez@retailco.com' },
  { id: 'sofia-chen', name: 'Sofia Chen', email: 'sofia.chen@retailco.com' },
];

export default function PermissionsPage() {
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const { user } = useAuth();
  const isSpanish = locale === 'es-MX' || currentTenant?.locale === 'es-MX';
  const tenantId = currentTenant?.id || 'retailco';

  const [roles, setRoles] = useState<Role[]>([]);
  const [assignments, setAssignments] = useState<UserPermissionAssignment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<UserPermissionAssignment | null>(null);

  // Assignment form state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedScopeType, setSelectedScopeType] = useState<PermissionScope['type']>('own');

  const loadData = useCallback(() => {
    setIsLoading(true);
    try {
      const loadedRoles = getRoles(tenantId);
      const loadedAssignments = getAssignments(tenantId);
      setRoles(loadedRoles);
      setAssignments(loadedAssignments);
    } catch (error) {
      console.error('Error loading permissions:', error);
      toast.error(isSpanish ? 'Error al cargar permisos' : 'Error loading permissions');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, isSpanish]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAssignRole = () => {
    if (!selectedUserId || !selectedRoleId) return;

    const selectedUser = DEMO_USERS.find((u) => u.id === selectedUserId);
    if (!selectedUser) return;

    try {
      assignRole(
        selectedUser.id,
        selectedUser.name,
        selectedUser.email,
        selectedRoleId,
        { type: selectedScopeType },
        user?.id || 'admin'
      );

      toast.success(
        isSpanish
          ? `Rol asignado a ${selectedUser.name}`
          : `Role assigned to ${selectedUser.name}`
      );

      setShowAssignDialog(false);
      setSelectedUserId('');
      setSelectedRoleId('');
      setSelectedScopeType('own');
      loadData();
    } catch (error) {
      console.error('Error assigning role:', error);
      toast.error(isSpanish ? 'Error al asignar rol' : 'Error assigning role');
    }
  };

  const handleRemoveAssignment = (userId: string) => {
    try {
      removeAssignment(userId);
      toast.success(isSpanish ? 'Asignación eliminada' : 'Assignment removed');
      loadData();
    } catch (error) {
      console.error('Error removing assignment:', error);
      toast.error(isSpanish ? 'Error al eliminar asignación' : 'Error removing assignment');
    }
  };

  const handleEditAssignment = (assignment: UserPermissionAssignment) => {
    setSelectedAssignment(assignment);
    setSelectedUserId(assignment.userId);
    setSelectedRoleId(assignment.roleId);
    setSelectedScopeType(assignment.scope.type);
    setShowAssignDialog(true);
  };

  const handleUpdateAssignment = () => {
    if (!selectedAssignment || !selectedRoleId) return;

    try {
      updateAssignment(selectedAssignment.userId, {
        roleId: selectedRoleId,
        scope: { type: selectedScopeType },
      });

      toast.success(isSpanish ? 'Asignación actualizada' : 'Assignment updated');
      setShowAssignDialog(false);
      setSelectedAssignment(null);
      setSelectedUserId('');
      setSelectedRoleId('');
      setSelectedScopeType('own');
      loadData();
    } catch (error) {
      console.error('Error updating assignment:', error);
      toast.error(isSpanish ? 'Error al actualizar' : 'Error updating');
    }
  };

  const filteredAssignments = assignments.filter(
    (a) =>
      a.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.roleName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const unassignedUsers = DEMO_USERS.filter(
    (u) => !assignments.some((a) => a.userId === u.id)
  );

  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isSpanish ? 'Cargando permisos...' : 'Loading permissions...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            {isSpanish ? 'Gestión de Permisos' : 'Permission Management'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish
              ? 'Administra roles y permisos de usuarios'
              : 'Manage user roles and permissions'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/workforce/roles">
              <Settings className="h-4 w-4 mr-2" />
              {isSpanish ? 'Gestionar Roles' : 'Manage Roles'}
            </Link>
          </Button>
          <Button onClick={() => {
            setSelectedAssignment(null);
            setShowAssignDialog(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            {isSpanish ? 'Asignar Rol' : 'Assign Role'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{assignments.length}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'Usuarios Asignados' : 'Assigned Users'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900/30">
                <Shield className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{systemRoles.length}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'Roles del Sistema' : 'System Roles'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg dark:bg-purple-900/30">
                <Shield className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{customRoles.length}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'Roles Personalizados' : 'Custom Roles'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-900/30">
                <Users className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{unassignedUsers.length}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'Sin Asignar' : 'Unassigned'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            {isSpanish ? 'Usuarios' : 'Users'}
          </TabsTrigger>
          <TabsTrigger value="matrix">
            <Shield className="h-4 w-4 mr-2" />
            {isSpanish ? 'Matriz de Permisos' : 'Permission Matrix'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={isSpanish ? 'Buscar usuarios...' : 'Search users...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* User Assignments */}
          {filteredAssignments.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAssignments.map((assignment) => (
                <UserPermissionCard
                  key={assignment.id}
                  assignment={assignment}
                  roles={roles}
                  onEdit={handleEditAssignment}
                  onRemove={handleRemoveAssignment}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">
                  {searchQuery
                    ? isSpanish
                      ? 'No se encontraron usuarios'
                      : 'No users found'
                    : isSpanish
                      ? 'No hay asignaciones de permisos'
                      : 'No permission assignments'}
                </p>
                {!searchQuery && (
                  <Button className="mt-4" onClick={() => setShowAssignDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {isSpanish ? 'Asignar Primer Rol' : 'Assign First Role'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Unassigned Users */}
          {unassignedUsers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {isSpanish ? 'Usuarios sin Rol Asignado' : 'Users Without Assigned Role'}
                </CardTitle>
                <CardDescription>
                  {isSpanish
                    ? 'Estos usuarios no tienen un rol asignado'
                    : 'These users do not have an assigned role'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {unassignedUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedUserId(u.id);
                          setShowAssignDialog(true);
                        }}
                      >
                        {isSpanish ? 'Asignar Rol' : 'Assign Role'}
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="matrix">
          <PermissionMatrix roles={roles} readOnly />
        </TabsContent>
      </Tabs>

      {/* Assign Role Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={(open) => {
        if (!open) {
          setSelectedAssignment(null);
          setSelectedUserId('');
          setSelectedRoleId('');
          setSelectedScopeType('own');
        }
        setShowAssignDialog(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedAssignment
                ? isSpanish
                  ? 'Editar Asignación'
                  : 'Edit Assignment'
                : isSpanish
                  ? 'Asignar Rol'
                  : 'Assign Role'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? 'Selecciona un usuario y asígnale un rol'
                : 'Select a user and assign them a role'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* User Selection */}
            <div className="space-y-2">
              <Label>{isSpanish ? 'Usuario' : 'User'}</Label>
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
                disabled={!!selectedAssignment}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={isSpanish ? 'Seleccionar usuario...' : 'Select user...'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(selectedAssignment ? DEMO_USERS : unassignedUsers).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <Label>{isSpanish ? 'Rol' : 'Role'}</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={isSpanish ? 'Seleccionar rol...' : 'Select role...'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <div className="flex items-center gap-2">
                        {isSpanish ? r.nameEs : r.name}
                        {r.isSystem && (
                          <Badge variant="secondary" className="text-xs">
                            {isSpanish ? 'Sistema' : 'System'}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scope Selection */}
            <div className="space-y-2">
              <Label>{isSpanish ? 'Alcance de Datos' : 'Data Scope'}</Label>
              <Select
                value={selectedScopeType}
                onValueChange={(v) => setSelectedScopeType(v as PermissionScope['type'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">{isSpanish ? 'Propio' : 'Own'}</SelectItem>
                  <SelectItem value="team">{isSpanish ? 'Equipo' : 'Team'}</SelectItem>
                  <SelectItem value="store">{isSpanish ? 'Tienda' : 'Store'}</SelectItem>
                  <SelectItem value="region">{isSpanish ? 'Región' : 'Region'}</SelectItem>
                  <SelectItem value="global">{isSpanish ? 'Global' : 'Global'}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isSpanish
                  ? 'Define qué datos puede ver este usuario'
                  : 'Defines what data this user can see'}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button
              onClick={selectedAssignment ? handleUpdateAssignment : handleAssignRole}
              disabled={!selectedUserId || !selectedRoleId}
            >
              {selectedAssignment
                ? isSpanish
                  ? 'Actualizar'
                  : 'Update'
                : isSpanish
                  ? 'Asignar'
                  : 'Assign'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
