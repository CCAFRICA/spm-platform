'use client';

/**
 * Access Control Management Page
 *
 * Role-based access control UI with permission management, role editor, and audit log.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent as UserDialogContent,
  DialogHeader as UserDialogHeader,
  DialogTitle as UserDialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Shield,
  Plus,
  Users,
  Activity,
  Key,
  RefreshCw,
} from 'lucide-react';
import { RoleCard } from '@/components/rbac/RoleCard';
import { RoleEditorDialog } from '@/components/rbac/RoleEditorDialog';
import { AuditLogTable } from '@/components/rbac/AuditLogTable';
import { UserRoleAssignments } from '@/components/rbac/UserRoleAssignments';
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getAuditLog,
  getAssignmentsForRole,
  assignRole,
  revokeRole,
  getAllPermissions,
} from '@/lib/rbac/rbac-service';
import type { Role, AuditLogEntry, UserRoleAssignment } from '@/types/rbac';
import { PERMISSION_CATEGORIES } from '@/types/rbac';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';

export default function AccessControlPage() {
  const { locale } = useLocale();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const isSpanish = locale === 'es-MX';
  const tenantId = currentTenant?.id;
  const userId = user?.id || 'admin';

  const [roles, setRoles] = useState<Role[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState('roles');
  const [showRoleEditor, setShowRoleEditor] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleAssignments, setRoleAssignments] = useState<UserRoleAssignment[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    setIsLoading(true);
    const timer = setTimeout(() => {
      setRoles(getRoles(tenantId));
      setAuditLog(getAuditLog(tenantId));
      setIsLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [tenantId]);

  const loadData = () => {
    if (!tenantId) return;
    setIsLoading(true);
    setTimeout(() => {
      setRoles(getRoles(tenantId));
      setAuditLog(getAuditLog(tenantId));
      setIsLoading(false);
    }, 200);
  };

  const handleCreateRole = () => {
    setEditingRole(null);
    setShowRoleEditor(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setShowRoleEditor(true);
  };

  const handleSaveRole = (data: { name: string; description: string; permissions: string[] }) => {
    if (!tenantId) return;
    if (editingRole) {
      updateRole(editingRole.id, data, userId);
    } else {
      createRole(tenantId, data.name, data.description, data.permissions, userId);
    }
    loadData();
    setShowRoleEditor(false);
  };

  const handleDeleteRole = (roleId: string) => {
    setDeleteConfirm(roleId);
  };

  const confirmDeleteRole = () => {
    if (deleteConfirm) {
      deleteRole(deleteConfirm, userId);
      loadData();
      setDeleteConfirm(null);
    }
  };

  const handleDuplicateRole = (role: Role) => {
    if (!tenantId) return;
    createRole(
      tenantId,
      `${role.name} (Copy)`,
      role.description,
      role.permissions,
      userId
    );
    loadData();
  };

  const handleViewUsers = (role: Role) => {
    setSelectedRole(role);
    setRoleAssignments(getAssignmentsForRole(role.id));
  };

  const handleAssignUser = (userId: string, userName: string, userEmail: string) => {
    if (!tenantId) return;
    if (selectedRole) {
      assignRole(userId, userName, userEmail, selectedRole.id, user?.id || 'admin', tenantId);
      setRoleAssignments(getAssignmentsForRole(selectedRole.id));
      loadData();
    }
  };

  const handleRevokeUser = (revokeUserId: string) => {
    if (!tenantId) return;
    if (selectedRole) {
      revokeRole(revokeUserId, selectedRole.id, user?.id || 'admin', tenantId);
      setRoleAssignments(getAssignmentsForRole(selectedRole.id));
      loadData();
    }
  };

  const allPermissions = getAllPermissions();
  const permissionCount = allPermissions.length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            {isSpanish ? 'Control de Acceso' : 'Access Control'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish
              ? 'Gestione roles, permisos y registros de auditoría'
              : 'Manage roles, permissions, and audit logs'}
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {isSpanish ? 'Actualizar' : 'Refresh'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{roles.length}</p>
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Roles' : 'Roles'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Key className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{permissionCount}</p>
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Permisos' : 'Permissions'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {roles.reduce((sum, r) => sum + r.userCount, 0)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Usuarios Asignados' : 'Assigned Users'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Activity className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{auditLog.length}</p>
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Eventos de Auditoría' : 'Audit Events'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="roles">
            <Shield className="h-4 w-4 mr-2" />
            {isSpanish ? 'Roles' : 'Roles'}
          </TabsTrigger>
          <TabsTrigger value="permissions">
            <Key className="h-4 w-4 mr-2" />
            {isSpanish ? 'Permisos' : 'Permissions'}
          </TabsTrigger>
          <TabsTrigger value="audit">
            <Activity className="h-4 w-4 mr-2" />
            {isSpanish ? 'Auditoría' : 'Audit Log'}
          </TabsTrigger>
        </TabsList>

        {/* Roles Tab */}
        <TabsContent value="roles" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={handleCreateRole}>
              <Plus className="h-4 w-4 mr-2" />
              {isSpanish ? 'Crear Rol' : 'Create Role'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                onEdit={handleEditRole}
                onDelete={handleDeleteRole}
                onDuplicate={handleDuplicateRole}
                onViewUsers={handleViewUsers}
              />
            ))}
          </div>
        </TabsContent>

        {/* Permissions Tab */}
        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isSpanish ? 'Matriz de Permisos' : 'Permission Matrix'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(PERMISSION_CATEGORIES).map(([key, config]) => {
                  const categoryPerms = allPermissions.filter((p) => p.category === key);
                  return (
                    <Card key={key} className="border">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Badge variant="outline">{categoryPerms.length}</Badge>
                          <span className="font-medium">
                            {isSpanish ? config.nameEs : config.name}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {isSpanish ? config.descriptionEs : config.description}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {['view', 'create', 'edit', 'delete', 'approve', 'export'].map((action) => {
                            const hasAction = categoryPerms.some((p) => p.action === action);
                            return hasAction ? (
                              <Badge key={action} variant="secondary" className="text-xs">
                                {action}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit">
          <AuditLogTable entries={auditLog} />
        </TabsContent>
      </Tabs>

      {/* Role Editor Dialog */}
      <RoleEditorDialog
        open={showRoleEditor}
        onOpenChange={setShowRoleEditor}
        role={editingRole}
        onSave={handleSaveRole}
      />

      {/* User Assignments Dialog */}
      <Dialog open={!!selectedRole} onOpenChange={() => setSelectedRole(null)}>
        <UserDialogContent className="sm:max-w-[550px]">
          <UserDialogHeader>
            <UserDialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {selectedRole && (isSpanish ? selectedRole.nameEs : selectedRole.name)}
            </UserDialogTitle>
          </UserDialogHeader>
          {selectedRole && (
            <div className="mt-4">
              <UserRoleAssignments
                role={selectedRole}
                assignments={roleAssignments}
                onAssign={handleAssignUser}
                onRevoke={handleRevokeUser}
              />
            </div>
          )}
        </UserDialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isSpanish ? '¿Eliminar este rol?' : 'Delete this role?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isSpanish
                ? 'Esta acción no se puede deshacer. Los usuarios con este rol perderán sus permisos asociados.'
                : 'This action cannot be undone. Users with this role will lose their associated permissions.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isSpanish ? 'Cancelar' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRole} className="bg-destructive text-destructive-foreground">
              {isSpanish ? 'Eliminar' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
