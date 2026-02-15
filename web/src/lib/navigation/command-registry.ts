/**
 * Command Registry
 *
 * Provides the searchable command catalog for the Command Palette (⌘K).
 * Includes all pages, actions, and searchable entities.
 */

import type { CommandItem } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import { WORKSPACES, getAllRoutes } from './workspace-config';

// =============================================================================
// COMMAND GENERATION
// =============================================================================

/**
 * Get all searchable commands for a user
 */
export function getCommands(role: UserRole, isSpanish: boolean): CommandItem[] {
  const commands: CommandItem[] = [];

  // Add page commands from workspace routes
  commands.push(...getPageCommands(role, isSpanish));

  // Add action commands
  commands.push(...getActionCommands(role, isSpanish));

  return commands;
}

/**
 * Generate page commands from workspace configuration
 */
function getPageCommands(role: UserRole, isSpanish: boolean): CommandItem[] {
  const allRoutes = getAllRoutes();
  const commands: CommandItem[] = [];

  for (const { workspace, section, route } of allRoutes) {
    // Check if user role has access to this workspace
    const ws = WORKSPACES[workspace];
    if (!ws.roles.includes(role)) continue;

    // Check if route is accessible to this role
    const fullRoute = ws.sections
      .flatMap(s => s.routes)
      .find(r => r.path === route.path);

    if (fullRoute && !fullRoute.roles.includes(role)) continue;

    commands.push({
      id: `page-${route.path.replace(/\//g, '-')}`,
      label: isSpanish ? route.labelEs : route.label,
      labelEs: route.labelEs,
      description: `${ws.label} > ${section}`,
      descriptionEs: `${ws.labelEs} > ${section}`,
      workspace,
      route: route.path,
      icon: route.icon,
      keywords: generateKeywords(route.label, route.labelEs, section, ws.label),
      category: 'page',
    });
  }

  return commands;
}

/**
 * Generate action commands
 */
function getActionCommands(role: UserRole, isSpanish: boolean): CommandItem[] {
  const actions: CommandItem[] = [];

  // Admin/VL Admin actions
  if (role === 'vl_admin' || role === 'admin') {
    actions.push({
      id: 'action-run-calculations',
      label: isSpanish ? 'Ejecutar Cálculos' : 'Run Calculations',
      labelEs: 'Ejecutar Cálculos',
      description: isSpanish ? 'Iniciar cálculos de compensación' : 'Start compensation calculations',
      descriptionEs: 'Iniciar cálculos de compensación',
      workspace: 'operate',
      route: '/operate/calculate',
      icon: 'Calculator',
      keywords: ['calculate', 'run', 'compensation', 'calcular', 'ejecutar', 'compensación'],
      category: 'action',
    });

    actions.push({
      id: 'action-import-data',
      label: isSpanish ? 'Importar Datos' : 'Import Data',
      labelEs: 'Importar Datos',
      description: isSpanish ? 'Cargar nuevos datos de transacciones' : 'Upload new transaction data',
      descriptionEs: 'Cargar nuevos datos de transacciones',
      workspace: 'operate',
      route: '/operate/import/enhanced',
      icon: 'Upload',
      keywords: ['import', 'upload', 'data', 'transactions', 'importar', 'cargar', 'datos'],
      category: 'action',
    });

    actions.push({
      id: 'action-approve-pending',
      label: isSpanish ? 'Revisar Aprobaciones' : 'Review Approvals',
      labelEs: 'Revisar Aprobaciones',
      description: isSpanish ? 'Ver aprobaciones pendientes' : 'View pending approvals',
      descriptionEs: 'Ver aprobaciones pendientes',
      workspace: 'operate',
      route: '/operate/approve',
      icon: 'CheckSquare',
      keywords: ['approve', 'approval', 'review', 'pending', 'aprobar', 'aprobación', 'revisar'],
      category: 'action',
    });

    actions.push({
      id: 'action-create-plan',
      label: isSpanish ? 'Crear Plan' : 'Create Plan',
      labelEs: 'Crear Plan',
      description: isSpanish ? 'Diseñar un nuevo plan de compensación' : 'Design a new compensation plan',
      descriptionEs: 'Diseñar un nuevo plan de compensación',
      workspace: 'design',
      route: '/design/plans/new',
      icon: 'PlusCircle',
      keywords: ['create', 'plan', 'new', 'design', 'crear', 'nuevo', 'diseñar'],
      category: 'action',
    });

    actions.push({
      id: 'action-view-quality',
      label: isSpanish ? 'Ver Calidad de Datos' : 'View Data Quality',
      labelEs: 'Ver Calidad de Datos',
      description: isSpanish ? 'Revisar problemas de calidad de datos' : 'Review data quality issues',
      descriptionEs: 'Revisar problemas de calidad de datos',
      workspace: 'operate',
      route: '/operate/monitor/quality',
      icon: 'ShieldCheck',
      keywords: ['quality', 'data', 'issues', 'errors', 'calidad', 'datos', 'errores'],
      category: 'action',
    });
  }

  // Manager actions
  if (role === 'manager' || role === 'admin' || role === 'vl_admin') {
    actions.push({
      id: 'action-view-team',
      label: isSpanish ? 'Ver Rendimiento del Equipo' : 'View Team Performance',
      labelEs: 'Ver Rendimiento del Equipo',
      description: isSpanish ? 'Panel de rendimiento del equipo' : 'Team performance dashboard',
      descriptionEs: 'Panel de rendimiento del equipo',
      workspace: 'perform',
      route: '/perform/team',
      icon: 'Users',
      keywords: ['team', 'performance', 'view', 'equipo', 'rendimiento', 'ver'],
      category: 'action',
    });
  }

  // All user actions
  actions.push({
    id: 'action-view-compensation',
    label: isSpanish ? 'Ver Mi Compensación' : 'View My Compensation',
    labelEs: 'Ver Mi Compensación',
    description: isSpanish ? 'Ver detalles de compensación' : 'View compensation details',
    descriptionEs: 'Ver detalles de compensación',
    workspace: 'perform',
    route: '/perform/compensation',
    icon: 'Wallet',
    keywords: ['compensation', 'my', 'earnings', 'pay', 'compensación', 'ganancias', 'pago'],
    category: 'action',
  });

  actions.push({
    id: 'action-submit-inquiry',
    label: isSpanish ? 'Enviar Consulta' : 'Submit Inquiry',
    labelEs: 'Enviar Consulta',
    description: isSpanish ? 'Crear una nueva consulta o disputa' : 'Create a new inquiry or dispute',
    descriptionEs: 'Crear una nueva consulta o disputa',
    workspace: 'perform',
    route: '/perform/inquiries/new',
    icon: 'HelpCircle',
    keywords: ['inquiry', 'dispute', 'question', 'submit', 'consulta', 'disputa', 'pregunta'],
    category: 'action',
  });

  return actions;
}

/**
 * Generate search keywords for a command
 */
function generateKeywords(
  label: string,
  labelEs: string,
  section: string,
  workspace: string
): string[] {
  const keywords = new Set<string>();

  // Add words from all labels
  [label, labelEs, section, workspace].forEach(text => {
    text.toLowerCase().split(/\s+/).forEach(word => {
      if (word.length > 2) {
        keywords.add(word);
      }
    });
  });

  return Array.from(keywords);
}

// =============================================================================
// SEARCH FUNCTIONALITY
// =============================================================================

/**
 * Search commands by query
 */
export function searchCommands(
  commands: CommandItem[],
  query: string,
  limit: number = 10
): CommandItem[] {
  if (!query.trim()) {
    return commands.slice(0, limit);
  }

  const normalizedQuery = query.toLowerCase().trim();
  const queryWords = normalizedQuery.split(/\s+/);

  // Score each command based on match quality
  const scored = commands.map(cmd => {
    let score = 0;

    // Exact label match (highest)
    if (cmd.label.toLowerCase() === normalizedQuery) {
      score += 100;
    } else if (cmd.labelEs.toLowerCase() === normalizedQuery) {
      score += 100;
    }

    // Label starts with query
    if (cmd.label.toLowerCase().startsWith(normalizedQuery)) {
      score += 50;
    } else if (cmd.labelEs.toLowerCase().startsWith(normalizedQuery)) {
      score += 50;
    }

    // Label contains query
    if (cmd.label.toLowerCase().includes(normalizedQuery)) {
      score += 25;
    } else if (cmd.labelEs.toLowerCase().includes(normalizedQuery)) {
      score += 25;
    }

    // Keyword matches
    for (const word of queryWords) {
      for (const keyword of cmd.keywords) {
        if (keyword.startsWith(word)) {
          score += 10;
        } else if (keyword.includes(word)) {
          score += 5;
        }
      }
    }

    // Description matches
    if (cmd.description?.toLowerCase().includes(normalizedQuery)) {
      score += 5;
    }

    return { cmd, score };
  });

  // Filter out zero scores and sort by score
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.cmd);
}

// =============================================================================
// RECENT COMMANDS
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RECENT_COMMANDS_KEY = 'vialuce_recent_commands';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MAX_RECENT_COMMANDS = 5;

/**
 * Get recent commands for a user (returns empty, localStorage removed)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getRecentCommands(_userId: string): string[] {
  return [];
}

/**
 * Add a command to recent history (no-op, localStorage removed)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function addRecentCommand(_userId: string, _commandId: string): void {
  // No-op: localStorage removed
}

/**
 * Get command items for recent command IDs
 */
export function getRecentCommandItems(
  recentIds: string[],
  allCommands: CommandItem[]
): CommandItem[] {
  return recentIds
    .map(id => allCommands.find(cmd => cmd.id === id))
    .filter((cmd): cmd is CommandItem => cmd !== undefined);
}
