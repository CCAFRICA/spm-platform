/**
 * Permission Types - ViaLuce SPM Platform
 *
 * Granular permission system with role-based access control
 * and scope-based data filtering.
 */

// Granular permissions
export type Permission =
  // Dashboard
  | 'dashboard:view'
  // Compensation
  | 'compensation:view_own'
  | 'compensation:view_team'
  | 'compensation:view_all'
  // Transactions
  | 'transactions:view_own'
  | 'transactions:view_team'
  | 'transactions:view_all'
  | 'transactions:create'
  | 'transactions:edit'
  | 'transactions:delete'
  // Disputes
  | 'disputes:create'
  | 'disputes:view_own'
  | 'disputes:view_team'
  | 'disputes:view_all'
  | 'disputes:resolve'
  // Plans
  | 'plans:view'
  | 'plans:create'
  | 'plans:edit'
  | 'plans:delete'
  | 'plans:approve'
  // Scenarios
  | 'scenarios:view'
  | 'scenarios:create'
  | 'scenarios:convert'
  // Approvals
  | 'approvals:view'
  | 'approvals:payout_approve'
  | 'approvals:plan_approve'
  // Personnel
  | 'personnel:view_own'
  | 'personnel:view_team'
  | 'personnel:view_all'
  | 'personnel:create'
  | 'personnel:edit'
  | 'personnel:delete'
  | 'personnel:transfer'
  // Teams
  | 'teams:view'
  | 'teams:create'
  | 'teams:edit'
  | 'teams:delete'
  // Configuration
  | 'config:terminology'
  | 'config:locations'
  | 'config:integrations'
  // Data
  | 'data:import'
  | 'data:export'
  | 'data:quality_view'
  | 'data:quality_resolve'
  // Audit
  | 'audit:view'
  | 'audit:export'
  // Admin
  | 'admin:permissions'
  | 'admin:roles';

// Permission categories for UI grouping
export type PermissionCategory =
  | 'dashboard'
  | 'compensation'
  | 'transactions'
  | 'disputes'
  | 'plans'
  | 'scenarios'
  | 'approvals'
  | 'personnel'
  | 'teams'
  | 'configuration'
  | 'data'
  | 'audit'
  | 'admin';

export interface PermissionInfo {
  id: Permission;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  category: PermissionCategory;
}

// Permission scope
export type ScopeType = 'global' | 'region' | 'team' | 'store' | 'own';

export interface PermissionScope {
  type: ScopeType;
  regionIds?: string[];
  teamIds?: string[];
  storeIds?: string[];
}

// Role definition
export interface Role {
  id: string;
  tenantId: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  isSystem: boolean; // Built-in vs custom
  permissions: Permission[];
  defaultScope: PermissionScope;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

// User permission assignment
export interface UserPermissionAssignment {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  roleId: string;
  roleName: string;
  scope: PermissionScope;
  customPermissions?: Permission[]; // Additional permissions beyond role
  deniedPermissions?: Permission[]; // Explicitly denied
  effectiveFrom: string;
  effectiveUntil?: string;
  assignedBy: string;
  assignedAt: string;
}

// Effective permissions (calculated)
export interface EffectivePermissions {
  userId: string;
  permissions: Permission[];
  scope: PermissionScope;
  roleId: string;
  roleName: string;
  customPermissions: Permission[];
  deniedPermissions: Permission[];
}

// Permission check result
export interface PermissionCheckResult {
  allowed: boolean;
  permission: Permission;
  scope: PermissionScope;
  reason?: string;
}

// All permissions with metadata
export const ALL_PERMISSIONS: PermissionInfo[] = [
  // Dashboard
  {
    id: 'dashboard:view',
    name: 'View Dashboard',
    nameEs: 'Ver Panel',
    description: 'Access the main dashboard',
    descriptionEs: 'Acceder al panel principal',
    category: 'dashboard',
  },
  // Compensation
  {
    id: 'compensation:view_own',
    name: 'View Own Compensation',
    nameEs: 'Ver Compensación Propia',
    description: 'View own compensation data',
    descriptionEs: 'Ver datos de compensación propios',
    category: 'compensation',
  },
  {
    id: 'compensation:view_team',
    name: 'View Team Compensation',
    nameEs: 'Ver Compensación de Equipo',
    description: 'View compensation for team members',
    descriptionEs: 'Ver compensación de miembros del equipo',
    category: 'compensation',
  },
  {
    id: 'compensation:view_all',
    name: 'View All Compensation',
    nameEs: 'Ver Toda la Compensación',
    description: 'View compensation for all employees',
    descriptionEs: 'Ver compensación de todos los empleados',
    category: 'compensation',
  },
  // Transactions
  {
    id: 'transactions:view_own',
    name: 'View Own Transactions',
    nameEs: 'Ver Transacciones Propias',
    description: 'View own transaction history',
    descriptionEs: 'Ver historial de transacciones propias',
    category: 'transactions',
  },
  {
    id: 'transactions:view_team',
    name: 'View Team Transactions',
    nameEs: 'Ver Transacciones de Equipo',
    description: 'View transactions for team members',
    descriptionEs: 'Ver transacciones de miembros del equipo',
    category: 'transactions',
  },
  {
    id: 'transactions:view_all',
    name: 'View All Transactions',
    nameEs: 'Ver Todas las Transacciones',
    description: 'View all transactions',
    descriptionEs: 'Ver todas las transacciones',
    category: 'transactions',
  },
  {
    id: 'transactions:create',
    name: 'Create Transactions',
    nameEs: 'Crear Transacciones',
    description: 'Create new transactions',
    descriptionEs: 'Crear nuevas transacciones',
    category: 'transactions',
  },
  {
    id: 'transactions:edit',
    name: 'Edit Transactions',
    nameEs: 'Editar Transacciones',
    description: 'Modify existing transactions',
    descriptionEs: 'Modificar transacciones existentes',
    category: 'transactions',
  },
  {
    id: 'transactions:delete',
    name: 'Delete Transactions',
    nameEs: 'Eliminar Transacciones',
    description: 'Delete transactions',
    descriptionEs: 'Eliminar transacciones',
    category: 'transactions',
  },
  // Disputes
  {
    id: 'disputes:create',
    name: 'Create Disputes',
    nameEs: 'Crear Disputas',
    description: 'Submit new disputes',
    descriptionEs: 'Enviar nuevas disputas',
    category: 'disputes',
  },
  {
    id: 'disputes:view_own',
    name: 'View Own Disputes',
    nameEs: 'Ver Disputas Propias',
    description: 'View own submitted disputes',
    descriptionEs: 'Ver disputas propias enviadas',
    category: 'disputes',
  },
  {
    id: 'disputes:view_team',
    name: 'View Team Disputes',
    nameEs: 'Ver Disputas de Equipo',
    description: 'View disputes from team members',
    descriptionEs: 'Ver disputas de miembros del equipo',
    category: 'disputes',
  },
  {
    id: 'disputes:view_all',
    name: 'View All Disputes',
    nameEs: 'Ver Todas las Disputas',
    description: 'View all disputes',
    descriptionEs: 'Ver todas las disputas',
    category: 'disputes',
  },
  {
    id: 'disputes:resolve',
    name: 'Resolve Disputes',
    nameEs: 'Resolver Disputas',
    description: 'Approve or reject disputes',
    descriptionEs: 'Aprobar o rechazar disputas',
    category: 'disputes',
  },
  // Plans
  {
    id: 'plans:view',
    name: 'View Plans',
    nameEs: 'Ver Planes',
    description: 'View compensation plans',
    descriptionEs: 'Ver planes de compensación',
    category: 'plans',
  },
  {
    id: 'plans:create',
    name: 'Create Plans',
    nameEs: 'Crear Planes',
    description: 'Create new compensation plans',
    descriptionEs: 'Crear nuevos planes de compensación',
    category: 'plans',
  },
  {
    id: 'plans:edit',
    name: 'Edit Plans',
    nameEs: 'Editar Planes',
    description: 'Modify compensation plans',
    descriptionEs: 'Modificar planes de compensación',
    category: 'plans',
  },
  {
    id: 'plans:delete',
    name: 'Delete Plans',
    nameEs: 'Eliminar Planes',
    description: 'Delete compensation plans',
    descriptionEs: 'Eliminar planes de compensación',
    category: 'plans',
  },
  {
    id: 'plans:approve',
    name: 'Approve Plans',
    nameEs: 'Aprobar Planes',
    description: 'Approve or reject plan changes',
    descriptionEs: 'Aprobar o rechazar cambios de planes',
    category: 'plans',
  },
  // Scenarios
  {
    id: 'scenarios:view',
    name: 'View Scenarios',
    nameEs: 'Ver Escenarios',
    description: 'View what-if scenarios',
    descriptionEs: 'Ver escenarios hipotéticos',
    category: 'scenarios',
  },
  {
    id: 'scenarios:create',
    name: 'Create Scenarios',
    nameEs: 'Crear Escenarios',
    description: 'Create new scenarios',
    descriptionEs: 'Crear nuevos escenarios',
    category: 'scenarios',
  },
  {
    id: 'scenarios:convert',
    name: 'Convert Scenarios',
    nameEs: 'Convertir Escenarios',
    description: 'Convert scenarios to plans',
    descriptionEs: 'Convertir escenarios a planes',
    category: 'scenarios',
  },
  // Approvals
  {
    id: 'approvals:view',
    name: 'View Approvals',
    nameEs: 'Ver Aprobaciones',
    description: 'View pending approvals',
    descriptionEs: 'Ver aprobaciones pendientes',
    category: 'approvals',
  },
  {
    id: 'approvals:payout_approve',
    name: 'Approve Payouts',
    nameEs: 'Aprobar Pagos',
    description: 'Approve payout batches',
    descriptionEs: 'Aprobar lotes de pago',
    category: 'approvals',
  },
  {
    id: 'approvals:plan_approve',
    name: 'Approve Plans',
    nameEs: 'Aprobar Planes',
    description: 'Approve plan changes',
    descriptionEs: 'Aprobar cambios de planes',
    category: 'approvals',
  },
  // Personnel
  {
    id: 'personnel:view_own',
    name: 'View Own Profile',
    nameEs: 'Ver Perfil Propio',
    description: 'View own employee profile',
    descriptionEs: 'Ver perfil de empleado propio',
    category: 'personnel',
  },
  {
    id: 'personnel:view_team',
    name: 'View Team Personnel',
    nameEs: 'Ver Personal de Equipo',
    description: 'View team member profiles',
    descriptionEs: 'Ver perfiles de miembros del equipo',
    category: 'personnel',
  },
  {
    id: 'personnel:view_all',
    name: 'View All Personnel',
    nameEs: 'Ver Todo el Personal',
    description: 'View all employee profiles',
    descriptionEs: 'Ver todos los perfiles de empleados',
    category: 'personnel',
  },
  {
    id: 'personnel:create',
    name: 'Create Personnel',
    nameEs: 'Crear Personal',
    description: 'Add new employees',
    descriptionEs: 'Agregar nuevos empleados',
    category: 'personnel',
  },
  {
    id: 'personnel:edit',
    name: 'Edit Personnel',
    nameEs: 'Editar Personal',
    description: 'Modify employee profiles',
    descriptionEs: 'Modificar perfiles de empleados',
    category: 'personnel',
  },
  {
    id: 'personnel:delete',
    name: 'Delete Personnel',
    nameEs: 'Eliminar Personal',
    description: 'Remove employees',
    descriptionEs: 'Eliminar empleados',
    category: 'personnel',
  },
  {
    id: 'personnel:transfer',
    name: 'Transfer Personnel',
    nameEs: 'Transferir Personal',
    description: 'Transfer employees between teams',
    descriptionEs: 'Transferir empleados entre equipos',
    category: 'personnel',
  },
  // Teams
  {
    id: 'teams:view',
    name: 'View Teams',
    nameEs: 'Ver Equipos',
    description: 'View team structure',
    descriptionEs: 'Ver estructura de equipos',
    category: 'teams',
  },
  {
    id: 'teams:create',
    name: 'Create Teams',
    nameEs: 'Crear Equipos',
    description: 'Create new teams',
    descriptionEs: 'Crear nuevos equipos',
    category: 'teams',
  },
  {
    id: 'teams:edit',
    name: 'Edit Teams',
    nameEs: 'Editar Equipos',
    description: 'Modify team configuration',
    descriptionEs: 'Modificar configuración de equipos',
    category: 'teams',
  },
  {
    id: 'teams:delete',
    name: 'Delete Teams',
    nameEs: 'Eliminar Equipos',
    description: 'Remove teams',
    descriptionEs: 'Eliminar equipos',
    category: 'teams',
  },
  // Configuration
  {
    id: 'config:terminology',
    name: 'Configure Terminology',
    nameEs: 'Configurar Terminología',
    description: 'Customize system terminology',
    descriptionEs: 'Personalizar terminología del sistema',
    category: 'configuration',
  },
  {
    id: 'config:locations',
    name: 'Configure Locations',
    nameEs: 'Configurar Ubicaciones',
    description: 'Manage stores and regions',
    descriptionEs: 'Gestionar tiendas y regiones',
    category: 'configuration',
  },
  {
    id: 'config:integrations',
    name: 'Configure Integrations',
    nameEs: 'Configurar Integraciones',
    description: 'Manage system integrations',
    descriptionEs: 'Gestionar integraciones del sistema',
    category: 'configuration',
  },
  // Data
  {
    id: 'data:import',
    name: 'Import Data',
    nameEs: 'Importar Datos',
    description: 'Import transaction data',
    descriptionEs: 'Importar datos de transacciones',
    category: 'data',
  },
  {
    id: 'data:export',
    name: 'Export Data',
    nameEs: 'Exportar Datos',
    description: 'Export reports and data',
    descriptionEs: 'Exportar reportes y datos',
    category: 'data',
  },
  {
    id: 'data:quality_view',
    name: 'View Data Quality',
    nameEs: 'Ver Calidad de Datos',
    description: 'View data quality dashboard',
    descriptionEs: 'Ver panel de calidad de datos',
    category: 'data',
  },
  {
    id: 'data:quality_resolve',
    name: 'Resolve Data Issues',
    nameEs: 'Resolver Problemas de Datos',
    description: 'Resolve quarantined data issues',
    descriptionEs: 'Resolver problemas de datos en cuarentena',
    category: 'data',
  },
  // Audit
  {
    id: 'audit:view',
    name: 'View Audit Log',
    nameEs: 'Ver Log de Auditoría',
    description: 'View system audit log',
    descriptionEs: 'Ver log de auditoría del sistema',
    category: 'audit',
  },
  {
    id: 'audit:export',
    name: 'Export Audit Log',
    nameEs: 'Exportar Log de Auditoría',
    description: 'Export audit log reports',
    descriptionEs: 'Exportar reportes de log de auditoría',
    category: 'audit',
  },
  // Admin
  {
    id: 'admin:permissions',
    name: 'Manage Permissions',
    nameEs: 'Gestionar Permisos',
    description: 'Assign user permissions',
    descriptionEs: 'Asignar permisos de usuario',
    category: 'admin',
  },
  {
    id: 'admin:roles',
    name: 'Manage Roles',
    nameEs: 'Gestionar Roles',
    description: 'Create and edit roles',
    descriptionEs: 'Crear y editar roles',
    category: 'admin',
  },
];

// Category display info
export const PERMISSION_CATEGORIES: Record<
  PermissionCategory,
  { name: string; nameEs: string; icon: string }
> = {
  dashboard: { name: 'Dashboard', nameEs: 'Panel', icon: 'LayoutDashboard' },
  compensation: { name: 'Compensation', nameEs: 'Compensación', icon: 'DollarSign' },
  transactions: { name: 'Transactions', nameEs: 'Transacciones', icon: 'Receipt' },
  disputes: { name: 'Disputes', nameEs: 'Disputas', icon: 'AlertTriangle' },
  plans: { name: 'Plans', nameEs: 'Planes', icon: 'FileText' },
  scenarios: { name: 'Scenarios', nameEs: 'Escenarios', icon: 'GitBranch' },
  approvals: { name: 'Approvals', nameEs: 'Aprobaciones', icon: 'CheckCircle' },
  personnel: { name: 'Personnel', nameEs: 'Personal', icon: 'Users' },
  teams: { name: 'Teams', nameEs: 'Equipos', icon: 'Users2' },
  configuration: { name: 'Configuration', nameEs: 'Configuración', icon: 'Settings' },
  data: { name: 'Data', nameEs: 'Datos', icon: 'Database' },
  audit: { name: 'Audit', nameEs: 'Auditoría', icon: 'Shield' },
  admin: { name: 'Admin', nameEs: 'Administración', icon: 'Lock' },
};

// Helper to get permissions by category
export function getPermissionsByCategory(category: PermissionCategory): PermissionInfo[] {
  return ALL_PERMISSIONS.filter((p) => p.category === category);
}

// Helper to get permission info
export function getPermissionInfo(permission: Permission): PermissionInfo | undefined {
  return ALL_PERMISSIONS.find((p) => p.id === permission);
}
