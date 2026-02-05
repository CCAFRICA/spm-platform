'use client';

import { useState } from 'react';
import {
  Shield,
  Save,
  CheckCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenant } from '@/contexts/tenant-context';

type PermissionType = 'view' | 'create' | 'edit' | 'delete' | 'admin';

interface ModulePermissions {
  module: string;
  moduleKey: string;
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  admin: boolean;
}

const modules = [
  { key: 'dashboard', name: 'Dashboard', nameEs: 'Panel Principal' },
  { key: 'transactions', name: 'Transactions', nameEs: 'Transacciones' },
  { key: 'compensation', name: 'Compensation', nameEs: 'Compensaciones' },
  { key: 'performance', name: 'Performance', nameEs: 'Rendimiento' },
  { key: 'team', name: 'My Team', nameEs: 'Mi Equipo' },
  { key: 'personnel', name: 'Personnel', nameEs: 'Personal' },
  { key: 'teams', name: 'Teams', nameEs: 'Equipos' },
  { key: 'audits', name: 'Audits', nameEs: 'Auditorías' },
  { key: 'messaging', name: 'Messaging', nameEs: 'Mensajería' },
  { key: 'data_readiness', name: 'Data Readiness', nameEs: 'Preparación de Datos' },
  { key: 'alerts', name: 'Alerts', nameEs: 'Alertas' },
  { key: 'catalog', name: 'Product Catalog', nameEs: 'Catálogo de Productos' },
  { key: 'settings', name: 'Settings', nameEs: 'Configuración' },
];

const roles = [
  { id: 'mesero', name: 'Mesero', nameEn: 'Server' },
  { id: 'supervisor', name: 'Supervisor', nameEn: 'Supervisor' },
  { id: 'gerente_franquicia', name: 'Gerente de Franquicia', nameEn: 'Franchise Manager' },
  { id: 'gerente_regional', name: 'Gerente Regional', nameEn: 'Regional Manager' },
  { id: 'director', name: 'Director', nameEn: 'Director' },
  { id: 'admin', name: 'Administrador', nameEn: 'Administrator' },
];

// Default permissions by role
const defaultPermissions: Record<string, Record<string, PermissionType[]>> = {
  mesero: {
    dashboard: ['view'],
    transactions: ['view'],
    compensation: ['view'],
    performance: ['view'],
  },
  supervisor: {
    dashboard: ['view'],
    transactions: ['view', 'create'],
    compensation: ['view'],
    performance: ['view'],
    team: ['view'],
  },
  gerente_franquicia: {
    dashboard: ['view'],
    transactions: ['view', 'create', 'edit'],
    compensation: ['view', 'edit'],
    performance: ['view'],
    team: ['view', 'edit'],
    personnel: ['view'],
    messaging: ['view', 'create'],
  },
  gerente_regional: {
    dashboard: ['view'],
    transactions: ['view', 'create', 'edit'],
    compensation: ['view', 'edit'],
    performance: ['view'],
    team: ['view', 'edit'],
    personnel: ['view', 'create', 'edit'],
    teams: ['view', 'edit'],
    messaging: ['view', 'create'],
    audits: ['view'],
  },
  director: {
    dashboard: ['view'],
    transactions: ['view', 'create', 'edit', 'delete'],
    compensation: ['view', 'create', 'edit'],
    performance: ['view', 'edit'],
    team: ['view', 'edit'],
    personnel: ['view', 'create', 'edit', 'delete'],
    teams: ['view', 'create', 'edit', 'delete'],
    messaging: ['view', 'create', 'edit'],
    audits: ['view'],
    alerts: ['view', 'create', 'edit'],
    catalog: ['view', 'edit'],
  },
  admin: {
    dashboard: ['view', 'admin'],
    transactions: ['view', 'create', 'edit', 'delete', 'admin'],
    compensation: ['view', 'create', 'edit', 'delete', 'admin'],
    performance: ['view', 'create', 'edit', 'delete', 'admin'],
    team: ['view', 'create', 'edit', 'delete', 'admin'],
    personnel: ['view', 'create', 'edit', 'delete', 'admin'],
    teams: ['view', 'create', 'edit', 'delete', 'admin'],
    audits: ['view', 'admin'],
    messaging: ['view', 'create', 'edit', 'delete', 'admin'],
    data_readiness: ['view', 'create', 'edit', 'delete', 'admin'],
    alerts: ['view', 'create', 'edit', 'delete', 'admin'],
    catalog: ['view', 'create', 'edit', 'delete', 'admin'],
    settings: ['view', 'create', 'edit', 'delete', 'admin'],
  },
};

function initializePermissions(roleId: string): ModulePermissions[] {
  const rolePerms = defaultPermissions[roleId] || {};
  return modules.map(mod => ({
    module: mod.name,
    moduleKey: mod.key,
    view: rolePerms[mod.key]?.includes('view') || false,
    create: rolePerms[mod.key]?.includes('create') || false,
    edit: rolePerms[mod.key]?.includes('edit') || false,
    delete: rolePerms[mod.key]?.includes('delete') || false,
    admin: rolePerms[mod.key]?.includes('admin') || false,
  }));
}

export default function PermissionsPage() {
  const { currentTenant } = useTenant();
  const isSpanish = currentTenant?.locale === 'es-MX';

  const [selectedRole, setSelectedRole] = useState<string>('mesero');
  const [permissions, setPermissions] = useState<ModulePermissions[]>(initializePermissions('mesero'));
  const [showSaved, setShowSaved] = useState(false);

  const handleRoleChange = (roleId: string) => {
    setSelectedRole(roleId);
    setPermissions(initializePermissions(roleId));
  };

  const togglePermission = (moduleKey: string, permType: PermissionType) => {
    setPermissions(permissions.map(p =>
      p.moduleKey === moduleKey
        ? { ...p, [permType]: !p[permType] }
        : p
    ));
  };

  const handleSave = () => {
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 3000);
  };

  const getModuleName = (mod: ModulePermissions) => {
    const moduleConfig = modules.find(m => m.key === mod.moduleKey);
    return isSpanish ? moduleConfig?.nameEs : moduleConfig?.name;
  };

  const selectedRoleData = roles.find(r => r.id === selectedRole);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            {isSpanish ? 'Configuración de Permisos' : 'Permissions Configuration'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? 'Define los permisos de acceso por rol' : 'Define access permissions by role'}
          </p>
        </div>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          {isSpanish ? 'Guardar Cambios' : 'Save Changes'}
        </Button>
      </div>

      {/* Success message */}
      {showSaved && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">
                {isSpanish ? 'Permisos guardados exitosamente' : 'Permissions saved successfully'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role Selector */}
      <Card>
        <CardHeader>
          <CardTitle>{isSpanish ? 'Seleccionar Rol' : 'Select Role'}</CardTitle>
          <CardDescription>
            {isSpanish
              ? 'Selecciona un rol para configurar sus permisos'
              : 'Select a role to configure its permissions'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedRole} onValueChange={handleRoleChange}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map(role => (
                <SelectItem key={role.id} value={role.id}>
                  {isSpanish ? role.name : role.nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedRoleData && (
            <p className="mt-2 text-sm text-muted-foreground">
              {isSpanish
                ? `Configurando permisos para: ${selectedRoleData.name}`
                : `Configuring permissions for: ${selectedRoleData.nameEn}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Permissions Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>{isSpanish ? 'Matriz de Permisos' : 'Permission Matrix'}</CardTitle>
          <CardDescription>
            {isSpanish
              ? 'Marca los permisos que debe tener este rol para cada módulo'
              : 'Check the permissions this role should have for each module'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">{isSpanish ? 'Módulo' : 'Module'}</TableHead>
                <TableHead className="text-center w-24">{isSpanish ? 'Ver' : 'View'}</TableHead>
                <TableHead className="text-center w-24">{isSpanish ? 'Crear' : 'Create'}</TableHead>
                <TableHead className="text-center w-24">{isSpanish ? 'Editar' : 'Edit'}</TableHead>
                <TableHead className="text-center w-24">{isSpanish ? 'Eliminar' : 'Delete'}</TableHead>
                <TableHead className="text-center w-24">Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {permissions.map(perm => (
                <TableRow key={perm.moduleKey}>
                  <TableCell className="font-medium">{getModuleName(perm)}</TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={perm.view}
                      onCheckedChange={() => togglePermission(perm.moduleKey, 'view')}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={perm.create}
                      onCheckedChange={() => togglePermission(perm.moduleKey, 'create')}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={perm.edit}
                      onCheckedChange={() => togglePermission(perm.moduleKey, 'edit')}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={perm.delete}
                      onCheckedChange={() => togglePermission(perm.moduleKey, 'delete')}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={perm.admin}
                      onCheckedChange={() => togglePermission(perm.moduleKey, 'admin')}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-medium mb-3">{isSpanish ? 'Leyenda de permisos:' : 'Permission legend:'}</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">{isSpanish ? 'Ver' : 'View'}:</span>{' '}
              {isSpanish ? 'Acceso de lectura' : 'Read access'}
            </div>
            <div>
              <span className="font-medium text-foreground">{isSpanish ? 'Crear' : 'Create'}:</span>{' '}
              {isSpanish ? 'Crear nuevos registros' : 'Create new records'}
            </div>
            <div>
              <span className="font-medium text-foreground">{isSpanish ? 'Editar' : 'Edit'}:</span>{' '}
              {isSpanish ? 'Modificar registros' : 'Modify records'}
            </div>
            <div>
              <span className="font-medium text-foreground">{isSpanish ? 'Eliminar' : 'Delete'}:</span>{' '}
              {isSpanish ? 'Eliminar registros' : 'Delete records'}
            </div>
            <div>
              <span className="font-medium text-foreground">Admin:</span>{' '}
              {isSpanish ? 'Configuración del módulo' : 'Module configuration'}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
