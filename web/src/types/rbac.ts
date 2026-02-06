/**
 * Role-Based Access Control Types
 *
 * Types for managing permissions, roles, and audit logging.
 */

export type PermissionCategory =
  | 'transactions'
  | 'compensation'
  | 'performance'
  | 'workforce'
  | 'data'
  | 'insights'
  | 'configuration'
  | 'admin';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';

export interface Permission {
  id: string;
  category: PermissionCategory;
  action: PermissionAction;
  resource: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
}

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  permissions: string[]; // Permission IDs
  isSystem: boolean; // System roles cannot be deleted
  userCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRoleAssignment {
  userId: string;
  userName: string;
  userEmail: string;
  roleId: string;
  roleName: string;
  assignedBy: string;
  assignedAt: string;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: AuditAction;
  category: PermissionCategory;
  resource: string;
  resourceId?: string;
  resourceName?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'approve'
  | 'reject'
  | 'export'
  | 'import'
  | 'role_assign'
  | 'role_revoke'
  | 'permission_change';

export interface AuditFilter {
  startDate?: string;
  endDate?: string;
  userId?: string;
  action?: AuditAction;
  category?: PermissionCategory;
  resourceId?: string;
}

// Permission category metadata
export const PERMISSION_CATEGORIES: Record<PermissionCategory, {
  name: string;
  nameEs: string;
  icon: string;
  description: string;
  descriptionEs: string;
}> = {
  transactions: {
    name: 'Transactions',
    nameEs: 'Transacciones',
    icon: 'Receipt',
    description: 'Sales transactions and orders',
    descriptionEs: 'Transacciones de ventas y pedidos',
  },
  compensation: {
    name: 'Compensation',
    nameEs: 'Compensación',
    icon: 'DollarSign',
    description: 'Commission and payout management',
    descriptionEs: 'Gestión de comisiones y pagos',
  },
  performance: {
    name: 'Performance',
    nameEs: 'Rendimiento',
    icon: 'TrendingUp',
    description: 'Goals, plans, and achievements',
    descriptionEs: 'Metas, planes y logros',
  },
  workforce: {
    name: 'Workforce',
    nameEs: 'Personal',
    icon: 'Users',
    description: 'Team and personnel management',
    descriptionEs: 'Gestión de equipos y personal',
  },
  data: {
    name: 'Data',
    nameEs: 'Datos',
    icon: 'Database',
    description: 'Data imports and quality',
    descriptionEs: 'Importación de datos y calidad',
  },
  insights: {
    name: 'Insights',
    nameEs: 'Análisis',
    icon: 'BarChart2',
    description: 'Reports and analytics',
    descriptionEs: 'Reportes y análisis',
  },
  configuration: {
    name: 'Configuration',
    nameEs: 'Configuración',
    icon: 'Settings',
    description: 'System settings and setup',
    descriptionEs: 'Configuración del sistema',
  },
  admin: {
    name: 'Administration',
    nameEs: 'Administración',
    icon: 'Shield',
    description: 'Administrative functions',
    descriptionEs: 'Funciones administrativas',
  },
};

export const PERMISSION_ACTIONS: Record<PermissionAction, {
  name: string;
  nameEs: string;
  icon: string;
}> = {
  view: { name: 'View', nameEs: 'Ver', icon: 'Eye' },
  create: { name: 'Create', nameEs: 'Crear', icon: 'Plus' },
  edit: { name: 'Edit', nameEs: 'Editar', icon: 'Edit' },
  delete: { name: 'Delete', nameEs: 'Eliminar', icon: 'Trash' },
  approve: { name: 'Approve', nameEs: 'Aprobar', icon: 'Check' },
  export: { name: 'Export', nameEs: 'Exportar', icon: 'Download' },
};

export const AUDIT_ACTIONS: Record<AuditAction, {
  name: string;
  nameEs: string;
  severity: 'low' | 'medium' | 'high';
}> = {
  create: { name: 'Created', nameEs: 'Creado', severity: 'low' },
  read: { name: 'Viewed', nameEs: 'Visto', severity: 'low' },
  update: { name: 'Updated', nameEs: 'Actualizado', severity: 'medium' },
  delete: { name: 'Deleted', nameEs: 'Eliminado', severity: 'high' },
  login: { name: 'Login', nameEs: 'Inicio de sesión', severity: 'low' },
  logout: { name: 'Logout', nameEs: 'Cierre de sesión', severity: 'low' },
  approve: { name: 'Approved', nameEs: 'Aprobado', severity: 'medium' },
  reject: { name: 'Rejected', nameEs: 'Rechazado', severity: 'medium' },
  export: { name: 'Exported', nameEs: 'Exportado', severity: 'medium' },
  import: { name: 'Imported', nameEs: 'Importado', severity: 'medium' },
  role_assign: { name: 'Role Assigned', nameEs: 'Rol Asignado', severity: 'high' },
  role_revoke: { name: 'Role Revoked', nameEs: 'Rol Revocado', severity: 'high' },
  permission_change: { name: 'Permission Changed', nameEs: 'Permiso Cambiado', severity: 'high' },
};
