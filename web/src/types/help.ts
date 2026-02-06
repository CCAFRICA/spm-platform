/**
 * Help & Documentation Types
 *
 * Types for in-app help, contextual tooltips, and keyboard shortcuts.
 */

export interface HelpArticle {
  id: string;
  title: string;
  titleEs: string;
  content: string;
  contentEs: string;
  category: HelpCategory;
  tags: string[];
  relatedRoutes: string[];
  lastUpdated: string;
}

export type HelpCategory =
  | 'getting-started'
  | 'transactions'
  | 'compensation'
  | 'performance'
  | 'administration'
  | 'troubleshooting';

export interface ContextualTip {
  id: string;
  target: string; // CSS selector or element ID
  title: string;
  titleEs: string;
  content: string;
  contentEs: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  showOnce: boolean;
  priority: number;
}

export interface KeyboardShortcut {
  id: string;
  keys: string[]; // e.g., ['cmd', 'k'] or ['ctrl', 'shift', 'p']
  action: string;
  actionEs: string;
  description: string;
  descriptionEs: string;
  category: ShortcutCategory;
  global: boolean; // Works anywhere vs specific context
  route?: string; // Required route for non-global shortcuts
}

export type ShortcutCategory =
  | 'navigation'
  | 'actions'
  | 'search'
  | 'editing'
  | 'views';

export interface WhatsNew {
  id: string;
  version: string;
  date: string;
  title: string;
  titleEs: string;
  description: string;
  descriptionEs: string;
  features: {
    title: string;
    titleEs: string;
    description: string;
    descriptionEs: string;
    icon: string;
  }[];
}

// Help category metadata
export const HELP_CATEGORIES: Record<HelpCategory, {
  name: string;
  nameEs: string;
  icon: string;
  description: string;
  descriptionEs: string;
}> = {
  'getting-started': {
    name: 'Getting Started',
    nameEs: 'Primeros Pasos',
    icon: 'Rocket',
    description: 'Learn the basics of the platform',
    descriptionEs: 'Aprenda lo básico de la plataforma',
  },
  transactions: {
    name: 'Transactions',
    nameEs: 'Transacciones',
    icon: 'Receipt',
    description: 'Managing sales and orders',
    descriptionEs: 'Gestión de ventas y pedidos',
  },
  compensation: {
    name: 'Compensation',
    nameEs: 'Compensación',
    icon: 'DollarSign',
    description: 'Commission plans and payouts',
    descriptionEs: 'Planes de comisión y pagos',
  },
  performance: {
    name: 'Performance',
    nameEs: 'Rendimiento',
    icon: 'TrendingUp',
    description: 'Goals and achievements',
    descriptionEs: 'Metas y logros',
  },
  administration: {
    name: 'Administration',
    nameEs: 'Administración',
    icon: 'Settings',
    description: 'System configuration and settings',
    descriptionEs: 'Configuración del sistema',
  },
  troubleshooting: {
    name: 'Troubleshooting',
    nameEs: 'Solución de Problemas',
    icon: 'HelpCircle',
    description: 'Common issues and solutions',
    descriptionEs: 'Problemas comunes y soluciones',
  },
};

export const SHORTCUT_CATEGORIES: Record<ShortcutCategory, {
  name: string;
  nameEs: string;
}> = {
  navigation: { name: 'Navigation', nameEs: 'Navegación' },
  actions: { name: 'Actions', nameEs: 'Acciones' },
  search: { name: 'Search', nameEs: 'Búsqueda' },
  editing: { name: 'Editing', nameEs: 'Edición' },
  views: { name: 'Views', nameEs: 'Vistas' },
};
