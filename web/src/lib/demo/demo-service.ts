/**
 * Demo Service
 *
 * Manages demo reset, snapshots, validation, and guided tours.
 */

import type {
  DemoSnapshot,
  DemoState,
  DemoValidationResult,
  ValidationCheck,
  GuidedTour,
  TourStep,
  DemoScript,
  RehearsalSession,
} from '@/types/demo';
import { DEMO_STORAGE_KEYS } from '@/types/demo';

const STATE_KEY = 'demo_state';
const SNAPSHOTS_KEY = 'demo_snapshots';
const REHEARSAL_KEY = 'demo_rehearsal';

// ============================================
// DEMO STATE
// ============================================

/**
 * Get current demo state
 */
export function getDemoState(): DemoState {
  if (typeof window === 'undefined') return getDefaultState();

  const stored = localStorage.getItem(STATE_KEY);
  if (!stored) {
    const state = getDefaultState();
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    return state;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return getDefaultState();
  }
}

/**
 * Update demo state
 */
export function updateDemoState(updates: Partial<DemoState>): DemoState {
  const current = getDemoState();
  const updated = { ...current, ...updates };
  localStorage.setItem(STATE_KEY, JSON.stringify(updated));
  return updated;
}

function getDefaultState(): DemoState {
  return {
    isInitialized: false,
    lastReset: null,
    activeSnapshot: null,
    tourCompleted: false,
    tourStep: 0,
  };
}

// ============================================
// DEMO RESET
// ============================================

/**
 * Reset all demo data to defaults
 */
export function resetDemoData(): { success: boolean; keysReset: string[] } {
  if (typeof window === 'undefined') {
    return { success: false, keysReset: [] };
  }

  const keysReset: string[] = [];

  // Clear all demo-related localStorage keys
  DEMO_STORAGE_KEYS.forEach((key) => {
    if (key !== 'demo_snapshots') {
      localStorage.removeItem(key);
      keysReset.push(key);
    }
  });

  // Update state
  updateDemoState({
    isInitialized: true,
    lastReset: new Date().toISOString(),
    activeSnapshot: null,
  });

  return { success: true, keysReset };
}

/**
 * Initialize demo with fresh data
 */
export function initializeDemo(): void {
  if (typeof window === 'undefined') return;

  const state = getDemoState();
  if (state.isInitialized) return;

  // Reset to get fresh data
  resetDemoData();
}

// ============================================
// SNAPSHOTS
// ============================================

/**
 * Get all snapshots
 */
export function getSnapshots(): DemoSnapshot[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(SNAPSHOTS_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Create a snapshot of current demo state
 */
export function createSnapshot(
  name: string,
  description: string,
  createdBy: string,
  tags: string[] = []
): DemoSnapshot {
  const data: Record<string, string> = {};
  let size = 0;

  // Capture all demo-related localStorage data
  DEMO_STORAGE_KEYS.forEach((key) => {
    if (key !== 'demo_snapshots') {
      const value = localStorage.getItem(key);
      if (value) {
        data[key] = value;
        size += value.length;
      }
    }
  });

  const snapshot: DemoSnapshot = {
    id: `snapshot-${Date.now()}`,
    name,
    nameEs: name,
    description,
    descriptionEs: description,
    createdAt: new Date().toISOString(),
    createdBy,
    size,
    data,
    tags,
  };

  const snapshots = getSnapshots();
  snapshots.push(snapshot);
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));

  return snapshot;
}

/**
 * Restore a snapshot
 */
export function restoreSnapshot(snapshotId: string): boolean {
  const snapshots = getSnapshots();
  const snapshot = snapshots.find((s) => s.id === snapshotId);

  if (!snapshot) return false;

  // Clear existing data first
  DEMO_STORAGE_KEYS.forEach((key) => {
    if (key !== 'demo_snapshots') {
      localStorage.removeItem(key);
    }
  });

  // Restore snapshot data
  Object.entries(snapshot.data).forEach(([key, value]) => {
    localStorage.setItem(key, value);
  });

  // Update state
  updateDemoState({
    activeSnapshot: snapshotId,
    lastReset: new Date().toISOString(),
  });

  return true;
}

/**
 * Delete a snapshot
 */
export function deleteSnapshot(snapshotId: string): boolean {
  const snapshots = getSnapshots();
  const filtered = snapshots.filter((s) => s.id !== snapshotId);

  if (filtered.length === snapshots.length) return false;

  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(filtered));
  return true;
}

/**
 * Get snapshot by ID
 */
export function getSnapshot(snapshotId: string): DemoSnapshot | null {
  const snapshots = getSnapshots();
  return snapshots.find((s) => s.id === snapshotId) || null;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Run demo data validation
 */
export function validateDemoData(): DemoValidationResult {
  const checks: ValidationCheck[] = [];

  // Data existence checks
  checks.push(...runDataExistenceChecks());

  // Relationship checks
  checks.push(...runRelationshipChecks());

  // Integrity checks
  checks.push(...runIntegrityChecks());

  // Consistency checks
  checks.push(...runConsistencyChecks());

  const passed = checks.filter((c) => c.status === 'passed').length;
  const failed = checks.filter((c) => c.status === 'failed').length;
  const warnings = checks.filter((c) => c.status === 'warning').length;

  return {
    isValid: failed === 0,
    timestamp: new Date().toISOString(),
    checks,
    summary: { passed, failed, warnings },
  };
}

function runDataExistenceChecks(): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const requiredKeys = ['alert_rules', 'rbac_roles', 'saved_scenarios'];

  requiredKeys.forEach((key) => {
    const value = localStorage.getItem(key);
    const hasData = value && value !== '[]' && value !== '{}';

    checks.push({
      id: `data-${key}`,
      name: `${key} data exists`,
      nameEs: `Datos de ${key} existen`,
      category: 'data',
      status: hasData ? 'passed' : 'warning',
      message: hasData
        ? `${key} contains valid data`
        : `${key} is empty or missing`,
      messageEs: hasData
        ? `${key} contiene datos válidos`
        : `${key} está vacío o falta`,
    });
  });

  return checks;
}

function runRelationshipChecks(): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // Check RBAC role-assignment relationships
  try {
    const roles = JSON.parse(localStorage.getItem('rbac_roles') || '[]');
    const assignments = JSON.parse(localStorage.getItem('rbac_assignments') || '[]');

    const roleIds = new Set(roles.map((r: { id: string }) => r.id));
    const orphanedAssignments = assignments.filter(
      (a: { roleId: string }) => !roleIds.has(a.roleId)
    );

    checks.push({
      id: 'rel-role-assignments',
      name: 'Role-Assignment relationship',
      nameEs: 'Relación Rol-Asignación',
      category: 'relationship',
      status: orphanedAssignments.length === 0 ? 'passed' : 'failed',
      message:
        orphanedAssignments.length === 0
          ? 'All assignments reference valid roles'
          : `${orphanedAssignments.length} assignments reference non-existent roles`,
      messageEs:
        orphanedAssignments.length === 0
          ? 'Todas las asignaciones referencian roles válidos'
          : `${orphanedAssignments.length} asignaciones referencian roles inexistentes`,
      details: { orphanedCount: orphanedAssignments.length },
    });
  } catch {
    checks.push({
      id: 'rel-role-assignments',
      name: 'Role-Assignment relationship',
      nameEs: 'Relación Rol-Asignación',
      category: 'relationship',
      status: 'warning',
      message: 'Could not parse RBAC data',
      messageEs: 'No se pudo analizar datos de RBAC',
    });
  }

  return checks;
}

function runIntegrityChecks(): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // Check JSON validity of stored data
  DEMO_STORAGE_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value) {
      try {
        JSON.parse(value);
        checks.push({
          id: `integrity-${key}`,
          name: `${key} JSON integrity`,
          nameEs: `Integridad JSON de ${key}`,
          category: 'integrity',
          status: 'passed',
          message: 'Valid JSON structure',
          messageEs: 'Estructura JSON válida',
        });
      } catch {
        checks.push({
          id: `integrity-${key}`,
          name: `${key} JSON integrity`,
          nameEs: `Integridad JSON de ${key}`,
          category: 'integrity',
          status: 'failed',
          message: 'Invalid JSON structure',
          messageEs: 'Estructura JSON inválida',
        });
      }
    }
  });

  return checks;
}

function runConsistencyChecks(): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // Check demo state consistency
  try {
    const state = getDemoState();

    checks.push({
      id: 'consistency-state',
      name: 'Demo state consistency',
      nameEs: 'Consistencia del estado demo',
      category: 'consistency',
      status: state.isInitialized ? 'passed' : 'warning',
      message: state.isInitialized
        ? 'Demo is properly initialized'
        : 'Demo has not been initialized',
      messageEs: state.isInitialized
        ? 'Demo está inicializado correctamente'
        : 'Demo no ha sido inicializado',
    });

    // Check if active snapshot exists
    if (state.activeSnapshot) {
      const snapshot = getSnapshot(state.activeSnapshot);
      checks.push({
        id: 'consistency-snapshot',
        name: 'Active snapshot exists',
        nameEs: 'Snapshot activo existe',
        category: 'consistency',
        status: snapshot ? 'passed' : 'failed',
        message: snapshot
          ? `Active snapshot "${snapshot.name}" is valid`
          : 'Active snapshot reference is invalid',
        messageEs: snapshot
          ? `Snapshot activo "${snapshot.name}" es válido`
          : 'Referencia de snapshot activo es inválida',
      });
    }
  } catch {
    checks.push({
      id: 'consistency-state',
      name: 'Demo state consistency',
      nameEs: 'Consistencia del estado demo',
      category: 'consistency',
      status: 'failed',
      message: 'Could not read demo state',
      messageEs: 'No se pudo leer el estado demo',
    });
  }

  return checks;
}

// ============================================
// GUIDED TOURS
// ============================================

/**
 * Get all available tours
 */
export function getAvailableTours(): GuidedTour[] {
  return [
    {
      id: 'tour-onboarding',
      name: 'Platform Overview',
      nameEs: 'Vista General de la Plataforma',
      description: 'Learn the basics of the ClearComp platform',
      descriptionEs: 'Aprenda los conceptos básicos de la plataforma ClearComp',
      category: 'onboarding',
      estimatedDuration: 5,
      steps: [
        {
          id: 'step-welcome',
          title: 'Welcome to ClearComp',
          titleEs: 'Bienvenido a ClearComp',
          description: 'This tour will guide you through the main features of the platform.',
          descriptionEs: 'Este tour le guiará por las principales funciones de la plataforma.',
          target: 'body',
          position: 'center',
        },
        {
          id: 'step-sidebar',
          title: 'Navigation',
          titleEs: 'Navegación',
          description: 'Use the sidebar to navigate between different sections of the platform.',
          descriptionEs: 'Use la barra lateral para navegar entre las diferentes secciones.',
          target: '[data-tour="sidebar"]',
          position: 'right',
        },
        {
          id: 'step-dashboard',
          title: 'Dashboard',
          titleEs: 'Panel Principal',
          description: 'The dashboard shows your key performance metrics at a glance.',
          descriptionEs: 'El panel muestra sus métricas clave de rendimiento.',
          target: '[data-tour="dashboard"]',
          route: '/',
          position: 'bottom',
        },
        {
          id: 'step-transactions',
          title: 'Transactions',
          titleEs: 'Transacciones',
          description: 'View and manage all your sales transactions here.',
          descriptionEs: 'Vea y gestione todas sus transacciones de ventas aquí.',
          target: '[data-tour="transactions"]',
          route: '/transactions',
          position: 'right',
        },
        {
          id: 'step-complete',
          title: 'Tour Complete!',
          titleEs: '¡Tour Completado!',
          description: 'You now know the basics. Explore more features on your own!',
          descriptionEs: '¡Ya conoce lo básico. Explore más funciones por su cuenta!',
          target: 'body',
          position: 'center',
        },
      ],
    },
    {
      id: 'tour-compensation',
      name: 'Compensation Management',
      nameEs: 'Gestión de Compensación',
      description: 'Learn how to manage compensation plans and payouts',
      descriptionEs: 'Aprenda a gestionar planes de compensación y pagos',
      category: 'feature',
      estimatedDuration: 8,
      steps: [
        {
          id: 'step-plans',
          title: 'Compensation Plans',
          titleEs: 'Planes de Compensación',
          description: 'View all compensation plans assigned to your team.',
          descriptionEs: 'Vea todos los planes de compensación asignados a su equipo.',
          target: '[data-tour="plans"]',
          route: '/performance/plans',
          position: 'bottom',
        },
        {
          id: 'step-scenarios',
          title: 'What-If Scenarios',
          titleEs: 'Escenarios Hipotéticos',
          description: 'Model different compensation scenarios to see their impact.',
          descriptionEs: 'Modele diferentes escenarios para ver su impacto.',
          target: '[data-tour="scenarios"]',
          route: '/performance/scenarios',
          position: 'bottom',
        },
        {
          id: 'step-approvals',
          title: 'Approvals',
          titleEs: 'Aprobaciones',
          description: 'Manage plan approvals and payout authorizations.',
          descriptionEs: 'Gestione aprobaciones de planes y autorizaciones de pagos.',
          target: '[data-tour="approvals"]',
          route: '/performance/approvals',
          position: 'bottom',
        },
      ],
    },
    {
      id: 'tour-admin',
      name: 'Administration',
      nameEs: 'Administración',
      description: 'Learn about administrative features and settings',
      descriptionEs: 'Conozca las funciones administrativas y configuraciones',
      category: 'admin',
      estimatedDuration: 6,
      steps: [
        {
          id: 'step-access-control',
          title: 'Access Control',
          titleEs: 'Control de Acceso',
          description: 'Manage roles and permissions for your organization.',
          descriptionEs: 'Gestione roles y permisos para su organización.',
          target: '[data-tour="access-control"]',
          route: '/admin/access-control',
          position: 'bottom',
        },
        {
          id: 'step-data-quality',
          title: 'Data Quality',
          titleEs: 'Calidad de Datos',
          description: 'Monitor and manage data quality across the platform.',
          descriptionEs: 'Monitoree y gestione la calidad de datos.',
          target: '[data-tour="data-quality"]',
          route: '/data/quality',
          position: 'bottom',
        },
      ],
    },
  ];
}

/**
 * Get tour by ID
 */
export function getTour(tourId: string): GuidedTour | null {
  return getAvailableTours().find((t) => t.id === tourId) || null;
}

/**
 * Start a tour
 */
export function startTour(tourId: string): boolean {
  const tour = getTour(tourId);
  if (!tour) return false;

  updateDemoState({
    tourCompleted: false,
    tourStep: 0,
  });

  return true;
}

/**
 * Advance tour to next step
 */
export function advanceTour(): TourStep | null {
  const state = getDemoState();
  if (state.tourCompleted) return null;

  const tours = getAvailableTours();
  const activeTour = tours[0]; // Get first available tour

  if (!activeTour) return null;

  const nextStep = state.tourStep + 1;
  if (nextStep >= activeTour.steps.length) {
    updateDemoState({ tourCompleted: true });
    return null;
  }

  updateDemoState({ tourStep: nextStep });
  return activeTour.steps[nextStep];
}

/**
 * End tour
 */
export function endTour(): void {
  updateDemoState({
    tourCompleted: true,
    tourStep: 0,
  });
}

// ============================================
// DEMO SCRIPTS
// ============================================

/**
 * Get available demo scripts
 */
export function getDemoScripts(): DemoScript[] {
  return [
    {
      id: 'script-sales-overview',
      name: 'Sales Performance Demo',
      nameEs: 'Demo de Rendimiento de Ventas',
      description: 'A comprehensive walkthrough of sales performance features',
      descriptionEs: 'Un recorrido completo por las funciones de rendimiento de ventas',
      difficulty: 'beginner',
      totalDuration: 15,
      tags: ['sales', 'performance', 'reports'],
      sections: [
        {
          id: 'section-intro',
          title: 'Introduction',
          titleEs: 'Introducción',
          duration: 2,
          route: '/',
          talkingPoints: [
            {
              text: 'Welcome to the ClearComp Sales Performance Management platform.',
              textEs: 'Bienvenidos a la plataforma de Gestión de Rendimiento de Ventas ClearComp.',
              emphasis: true,
            },
            {
              text: 'Today we will explore how this platform helps sales teams track and optimize their performance.',
              textEs: 'Hoy exploraremos cómo esta plataforma ayuda a los equipos de ventas a seguir y optimizar su rendimiento.',
            },
          ],
          actions: [
            { type: 'highlight', target: '[data-tour="dashboard"]' },
          ],
        },
        {
          id: 'section-transactions',
          title: 'Transaction Management',
          titleEs: 'Gestión de Transacciones',
          duration: 4,
          route: '/transactions',
          talkingPoints: [
            {
              text: 'The transactions view shows all sales activities in real-time.',
              textEs: 'La vista de transacciones muestra todas las actividades de ventas en tiempo real.',
            },
            {
              text: 'You can filter by date, rep, product, and status.',
              textEs: 'Puede filtrar por fecha, representante, producto y estado.',
            },
            {
              text: 'Click on any transaction to see full details and commission calculations.',
              textEs: 'Haga clic en cualquier transacción para ver detalles completos y cálculos de comisión.',
            },
          ],
          actions: [
            { type: 'navigate', target: '/transactions' },
            { type: 'wait', delay: 1000 },
            { type: 'highlight', target: '[data-tour="transaction-list"]' },
          ],
        },
        {
          id: 'section-analytics',
          title: 'Analytics Dashboard',
          titleEs: 'Panel de Análisis',
          duration: 5,
          route: '/insights/analytics',
          talkingPoints: [
            {
              text: 'The analytics dashboard provides executive-level insights.',
              textEs: 'El panel de análisis proporciona información a nivel ejecutivo.',
              emphasis: true,
            },
            {
              text: 'Key metrics include revenue, quota attainment, and commission paid.',
              textEs: 'Las métricas clave incluyen ingresos, cumplimiento de cuota y comisiones pagadas.',
            },
            {
              text: 'You can drill down by region, team, or individual rep.',
              textEs: 'Puede profundizar por región, equipo o representante individual.',
            },
          ],
          actions: [
            { type: 'navigate', target: '/insights/analytics' },
            { type: 'wait', delay: 1000 },
          ],
        },
        {
          id: 'section-closing',
          title: 'Closing',
          titleEs: 'Cierre',
          duration: 2,
          route: '/insights/analytics',
          talkingPoints: [
            {
              text: 'Thank you for your time today.',
              textEs: 'Gracias por su tiempo hoy.',
              emphasis: true,
            },
            {
              text: 'Questions?',
              textEs: '¿Preguntas?',
            },
          ],
          actions: [],
        },
      ],
    },
    {
      id: 'script-admin-demo',
      name: 'Administrator Demo',
      nameEs: 'Demo de Administrador',
      description: 'Walkthrough of administrative and configuration features',
      descriptionEs: 'Recorrido por las funciones administrativas y de configuración',
      difficulty: 'advanced',
      totalDuration: 20,
      tags: ['admin', 'configuration', 'security'],
      sections: [
        {
          id: 'section-rbac',
          title: 'Access Control',
          titleEs: 'Control de Acceso',
          duration: 6,
          route: '/admin/access-control',
          talkingPoints: [
            {
              text: 'The access control system provides granular permission management.',
              textEs: 'El sistema de control de acceso proporciona gestión granular de permisos.',
              emphasis: true,
            },
            {
              text: 'Roles can be customized with specific permissions by category.',
              textEs: 'Los roles pueden personalizarse con permisos específicos por categoría.',
            },
            {
              text: 'All changes are logged in the audit trail.',
              textEs: 'Todos los cambios se registran en el registro de auditoría.',
            },
          ],
          actions: [
            { type: 'navigate', target: '/admin/access-control' },
          ],
        },
        {
          id: 'section-data-quality',
          title: 'Data Quality',
          titleEs: 'Calidad de Datos',
          duration: 5,
          route: '/data/quality',
          talkingPoints: [
            {
              text: 'Data quality is monitored across five dimensions.',
              textEs: 'La calidad de datos se monitorea en cinco dimensiones.',
            },
            {
              text: 'Issues are automatically detected and quarantined.',
              textEs: 'Los problemas se detectan y ponen en cuarentena automáticamente.',
            },
          ],
          actions: [
            { type: 'navigate', target: '/data/quality' },
          ],
        },
      ],
    },
  ];
}

/**
 * Get script by ID
 */
export function getScript(scriptId: string): DemoScript | null {
  return getDemoScripts().find((s) => s.id === scriptId) || null;
}

// ============================================
// REHEARSAL
// ============================================

/**
 * Start a rehearsal session
 */
export function startRehearsal(scriptId: string): RehearsalSession | null {
  const script = getScript(scriptId);
  if (!script) return null;

  const session: RehearsalSession = {
    id: `rehearsal-${Date.now()}`,
    scriptId,
    startedAt: new Date().toISOString(),
    currentSection: 0,
    currentPoint: 0,
    elapsedTime: 0,
    notes: [],
    status: 'active',
  };

  localStorage.setItem(REHEARSAL_KEY, JSON.stringify(session));
  return session;
}

/**
 * Get active rehearsal session
 */
export function getActiveRehearsal(): RehearsalSession | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(REHEARSAL_KEY);
  if (!stored) return null;

  try {
    const session = JSON.parse(stored);
    return session.status === 'active' ? session : null;
  } catch {
    return null;
  }
}

/**
 * Update rehearsal session
 */
export function updateRehearsal(updates: Partial<RehearsalSession>): RehearsalSession | null {
  const current = getActiveRehearsal();
  if (!current) return null;

  const updated = { ...current, ...updates };
  localStorage.setItem(REHEARSAL_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * End rehearsal session
 */
export function endRehearsal(): void {
  const current = getActiveRehearsal();
  if (current) {
    updateRehearsal({ status: 'completed' });
  }
}

/**
 * Add note to rehearsal
 */
export function addRehearsalNote(note: string): void {
  const current = getActiveRehearsal();
  if (current) {
    updateRehearsal({ notes: [...current.notes, note] });
  }
}
