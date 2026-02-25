/**
 * Help Service
 *
 * Provides help articles, contextual tips, and keyboard shortcuts.
 */

import type {
  HelpArticle,
  HelpCategory,
  ContextualTip,
  KeyboardShortcut,
  WhatsNew,
} from '@/types/help';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DISMISSED_TIPS_KEY = 'dismissed_tips';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WHATS_NEW_SEEN_KEY = 'whats_new_seen';

// ============================================
// HELP ARTICLES
// ============================================

/**
 * Get all help articles
 */
export function getHelpArticles(): HelpArticle[] {
  return [
    {
      id: 'article-dashboard',
      title: 'Understanding Your Dashboard',
      titleEs: 'Entendiendo Su Panel de Control',
      content: `The dashboard provides a quick overview of your performance metrics. Key sections include:

- **Performance Summary**: Your quota attainment and earnings for the current period
- **Recent Transactions**: Latest sales activities
- **Notifications**: Important alerts and updates
- **Quick Actions**: Common tasks you can perform

Use the date selector to view different time periods.`,
      contentEs: `El panel proporciona una vista rápida de sus métricas de rendimiento. Las secciones clave incluyen:

- **Resumen de Rendimiento**: Su cumplimiento de cuota y ganancias del período actual
- **Transacciones Recientes**: Últimas actividades de ventas
- **Notificaciones**: Alertas y actualizaciones importantes
- **Acciones Rápidas**: Tareas comunes que puede realizar

Use el selector de fecha para ver diferentes períodos.`,
      category: 'getting-started',
      tags: ['dashboard', 'overview', 'metrics'],
      relatedRoutes: ['/'],
      lastUpdated: '2024-01-15',
    },
    {
      id: 'article-transactions',
      title: 'Managing Transactions',
      titleEs: 'Gestión de Transacciones',
      content: `Transactions represent your sales activities. You can:

- **View Details**: Click any transaction to see full details
- **Filter**: Use filters to find specific transactions
- **Export**: Download transaction data as CSV
- **Dispute**: Raise issues with specific transactions

Commission calculations are shown for each transaction based on your compensation plan.`,
      contentEs: `Las transacciones representan sus actividades de ventas. Puede:

- **Ver Detalles**: Haga clic en cualquier transacción para ver detalles completos
- **Filtrar**: Use filtros para encontrar transacciones específicas
- **Exportar**: Descargue datos de transacciones como CSV
- **Disputar**: Levante problemas con transacciones específicas

Los cálculos de comisión se muestran para cada transacción según su plan de compensación.`,
      category: 'transactions',
      tags: ['transactions', 'sales', 'orders', 'commission'],
      relatedRoutes: ['/transactions', '/transactions/orders'],
      lastUpdated: '2024-01-14',
    },
    {
      id: 'article-disputes',
      title: 'Filing a Dispute',
      titleEs: 'Presentar una Disputa',
      content: `If you believe there's an error in your commission calculation:

1. Navigate to the transaction in question
2. Click "Dispute" button
3. Select the reason for your dispute
4. Provide detailed explanation
5. Submit for review

You'll be notified when your dispute is reviewed. Most disputes are resolved within 3-5 business days.`,
      contentEs: `Si cree que hay un error en el cálculo de su comisión:

1. Navegue a la transacción en cuestión
2. Haga clic en el botón "Disputar"
3. Seleccione la razón de su disputa
4. Proporcione una explicación detallada
5. Envíe para revisión

Se le notificará cuando su disputa sea revisada. La mayoría de las disputas se resuelven en 3-5 días hábiles.`,
      category: 'transactions',
      tags: ['disputes', 'commission', 'errors'],
      relatedRoutes: ['/transactions/disputes'],
      lastUpdated: '2024-01-13',
    },
    {
      id: 'article-plans',
      title: 'Understanding Compensation Plans',
      titleEs: 'Entendiendo los Planes de Compensación',
      content: `Your compensation plan defines how you earn:

- **Base Components**: Core commission structures
- **Accelerators**: Bonus rates for exceeding targets
- **SPIFFs**: Special incentives for specific products
- **Thresholds**: Minimum requirements to qualify

View your plan details in Performance > Plans. Contact your manager if you have questions about your plan assignment.`,
      contentEs: `Su plan de compensación define cómo gana:

- **Componentes Base**: Estructuras de comisión principales
- **Aceleradores**: Tasas de bonificación por superar objetivos
- **SPIFFs**: Incentivos especiales para productos específicos
- **Umbrales**: Requisitos mínimos para calificar

Vea los detalles de su plan en Rendimiento > Planes. Contacte a su gerente si tiene preguntas sobre la asignación de su plan.`,
      category: 'compensation',
      tags: ['plans', 'commission', 'compensation', 'earnings'],
      relatedRoutes: ['/performance/plans', '/my-compensation'],
      lastUpdated: '2024-01-12',
    },
    {
      id: 'article-scenarios',
      title: 'Using What-If Scenarios',
      titleEs: 'Usando Escenarios Hipotéticos',
      content: `Scenario modeling helps you understand the impact of plan changes:

1. Go to Performance > Scenarios
2. Select a base plan
3. Adjust parameters (rates, thresholds, etc.)
4. View the projected impact
5. Save scenarios for comparison

This is useful for planning and forecasting, but does not change actual compensation.`,
      contentEs: `El modelado de escenarios le ayuda a entender el impacto de cambios en planes:

1. Vaya a Rendimiento > Escenarios
2. Seleccione un plan base
3. Ajuste parámetros (tasas, umbrales, etc.)
4. Vea el impacto proyectado
5. Guarde escenarios para comparación

Esto es útil para planificación y pronóstico, pero no cambia la compensación real.`,
      category: 'performance',
      tags: ['scenarios', 'modeling', 'planning', 'forecasting'],
      relatedRoutes: ['/performance/scenarios'],
      lastUpdated: '2024-01-11',
    },
    {
      id: 'article-rbac',
      title: 'Managing Access Control',
      titleEs: 'Gestión de Control de Acceso',
      content: `Administrators can manage who has access to what:

- **Roles**: Define sets of permissions
- **Permissions**: Specific actions users can take
- **Assignments**: Link users to roles

Changes to access control are logged in the audit trail. Be careful when modifying roles with many users.`,
      contentEs: `Los administradores pueden gestionar quién tiene acceso a qué:

- **Roles**: Definen conjuntos de permisos
- **Permisos**: Acciones específicas que los usuarios pueden tomar
- **Asignaciones**: Vinculan usuarios a roles

Los cambios en el control de acceso se registran en el registro de auditoría. Tenga cuidado al modificar roles con muchos usuarios.`,
      category: 'administration',
      tags: ['rbac', 'roles', 'permissions', 'security'],
      relatedRoutes: ['/admin/access-control'],
      lastUpdated: '2024-01-10',
    },
    {
      id: 'article-common-issues',
      title: 'Common Issues and Solutions',
      titleEs: 'Problemas Comunes y Soluciones',
      content: `**Issue: Missing transactions**
Check the date range filter. Transactions may be outside your selected period.

**Issue: Incorrect commission**
Review the compensation plan rules. If you believe there's an error, file a dispute.

**Issue: Can't access a page**
Contact your administrator to verify your role permissions.

**Issue: Data not loading**
Try refreshing the page. If the issue persists, clear your browser cache.`,
      contentEs: `**Problema: Transacciones faltantes**
Verifique el filtro de rango de fechas. Las transacciones pueden estar fuera del período seleccionado.

**Problema: Comisión incorrecta**
Revise las reglas del plan de compensación. Si cree que hay un error, presente una disputa.

**Problema: No puedo acceder a una página**
Contacte a su administrador para verificar los permisos de su rol.

**Problema: Los datos no cargan**
Intente actualizar la página. Si el problema persiste, limpie la caché de su navegador.`,
      category: 'troubleshooting',
      tags: ['troubleshooting', 'issues', 'problems', 'help'],
      relatedRoutes: [],
      lastUpdated: '2024-01-09',
    },
  ];
}

/**
 * Get articles by category
 */
export function getArticlesByCategory(category: HelpCategory): HelpArticle[] {
  return getHelpArticles().filter((a) => a.category === category);
}

/**
 * Get article by ID
 */
export function getArticle(articleId: string): HelpArticle | null {
  return getHelpArticles().find((a) => a.id === articleId) || null;
}

/**
 * Search articles
 */
export function searchArticles(query: string): HelpArticle[] {
  const searchText = query.toLowerCase();
  return getHelpArticles().filter(
    (a) =>
      a.title.toLowerCase().includes(searchText) ||
      a.titleEs.toLowerCase().includes(searchText) ||
      a.content.toLowerCase().includes(searchText) ||
      a.tags.some((t) => t.includes(searchText))
  );
}

/**
 * Get articles for a specific route
 */
export function getArticlesForRoute(route: string): HelpArticle[] {
  return getHelpArticles().filter((a) =>
    a.relatedRoutes.some((r) => route.startsWith(r))
  );
}

// ============================================
// CONTEXTUAL TIPS
// ============================================

/**
 * Get contextual tips for current page
 */
export function getContextualTips(route: string): ContextualTip[] {
  const allTips = getAllContextualTips();
  const dismissed = getDismissedTips();

  return allTips
    .filter((tip) => !dismissed.includes(tip.id))
    .filter((tip) => tip.target.startsWith('[data-') || route.includes(tip.target))
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Dismiss a tip
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function dismissTip(_tipId: string): void {
  // no-op: localStorage removed
}

/**
 * Reset dismissed tips
 */
export function resetDismissedTips(): void {
  // no-op: localStorage removed
}

function getDismissedTips(): string[] {
  return [];
}

function getAllContextualTips(): ContextualTip[] {
  return [
    {
      id: 'tip-search',
      target: '[data-tour="search"]',
      title: 'Quick Search',
      titleEs: 'Búsqueda Rápida',
      content: 'Press Cmd+K (or Ctrl+K) to quickly search across the platform.',
      contentEs: 'Presione Cmd+K (o Ctrl+K) para buscar rápidamente en toda la plataforma.',
      position: 'bottom',
      showOnce: true,
      priority: 100,
    },
    {
      id: 'tip-language',
      target: '[data-tour="language"]',
      title: 'Language Selection',
      titleEs: 'Selección de Idioma',
      content: 'Switch between English and Spanish at any time.',
      contentEs: 'Cambie entre Inglés y Español en cualquier momento.',
      position: 'bottom',
      showOnce: true,
      priority: 90,
    },
    {
      id: 'tip-filters',
      target: '[data-tour="filters"]',
      title: 'Save Your Filters',
      titleEs: 'Guarde Sus Filtros',
      content: 'Frequently used filters can be saved for quick access.',
      contentEs: 'Los filtros usados frecuentemente pueden guardarse para acceso rápido.',
      position: 'right',
      showOnce: true,
      priority: 80,
    },
  ];
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

/**
 * Get all keyboard shortcuts
 */
export function getKeyboardShortcuts(): KeyboardShortcut[] {
  return [
    {
      id: 'shortcut-search',
      keys: ['cmd', 'k'],
      action: 'Open search',
      actionEs: 'Abrir búsqueda',
      description: 'Open the global search dialog',
      descriptionEs: 'Abrir el diálogo de búsqueda global',
      category: 'search',
      global: true,
    },
    {
      id: 'shortcut-home',
      keys: ['g', 'h'],
      action: 'Go to Dashboard',
      actionEs: 'Ir al Panel',
      description: 'Navigate to the dashboard',
      descriptionEs: 'Navegar al panel de control',
      category: 'navigation',
      global: true,
    },
    {
      id: 'shortcut-transactions',
      keys: ['g', 't'],
      action: 'Go to Transactions',
      actionEs: 'Ir a Transacciones',
      description: 'Navigate to transactions',
      descriptionEs: 'Navegar a transacciones',
      category: 'navigation',
      global: true,
    },
    {
      id: 'shortcut-notifications',
      keys: ['g', 'n'],
      action: 'Go to Notifications',
      actionEs: 'Ir a Notificaciones',
      description: 'Navigate to notifications',
      descriptionEs: 'Navegar a notificaciones',
      category: 'navigation',
      global: true,
    },
    {
      id: 'shortcut-help',
      keys: ['?'],
      action: 'Show keyboard shortcuts',
      actionEs: 'Mostrar atajos de teclado',
      description: 'Display this keyboard shortcuts panel',
      descriptionEs: 'Mostrar este panel de atajos de teclado',
      category: 'actions',
      global: true,
    },
    {
      id: 'shortcut-escape',
      keys: ['esc'],
      action: 'Close dialog',
      actionEs: 'Cerrar diálogo',
      description: 'Close the current dialog or panel',
      descriptionEs: 'Cerrar el diálogo o panel actual',
      category: 'actions',
      global: true,
    },
    {
      id: 'shortcut-refresh',
      keys: ['r'],
      action: 'Refresh data',
      actionEs: 'Actualizar datos',
      description: 'Refresh the current view data',
      descriptionEs: 'Actualizar los datos de la vista actual',
      category: 'actions',
      global: true,
    },
    {
      id: 'shortcut-new',
      keys: ['n'],
      action: 'New item',
      actionEs: 'Nuevo elemento',
      description: 'Create a new item in current context',
      descriptionEs: 'Crear un nuevo elemento en el contexto actual',
      category: 'editing',
      global: false,
    },
    {
      id: 'shortcut-save',
      keys: ['cmd', 's'],
      action: 'Save',
      actionEs: 'Guardar',
      description: 'Save current changes',
      descriptionEs: 'Guardar cambios actuales',
      category: 'editing',
      global: false,
    },
  ];
}

/**
 * Get shortcuts by category
 */
export function getShortcutsByCategory(): Record<string, KeyboardShortcut[]> {
  const shortcuts = getKeyboardShortcuts();
  return shortcuts.reduce<Record<string, KeyboardShortcut[]>>((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {});
}

// ============================================
// WHAT'S NEW
// ============================================

/**
 * Get what's new content
 */
export function getWhatsNew(): WhatsNew[] {
  return [
    {
      id: 'release-2024-01',
      version: '2.5.0',
      date: '2024-01-15',
      title: 'January 2024 Update',
      titleEs: 'Actualización de Enero 2024',
      description: 'New features to help you work more efficiently.',
      descriptionEs: 'Nuevas funciones para ayudarle a trabajar más eficientemente.',
      features: [
        {
          title: 'Advanced Analytics',
          titleEs: 'Análisis Avanzado',
          description: 'New executive dashboard with drill-down capabilities.',
          descriptionEs: 'Nuevo panel ejecutivo con capacidades de profundización.',
          icon: 'BarChart2',
        },
        {
          title: 'Bulk Operations',
          titleEs: 'Operaciones Masivas',
          description: 'Select multiple items and perform bulk actions.',
          descriptionEs: 'Seleccione múltiples elementos y realice acciones masivas.',
          icon: 'CheckSquare',
        },
        {
          title: 'Global Search',
          titleEs: 'Búsqueda Global',
          description: 'Search across the entire platform with Cmd+K.',
          descriptionEs: 'Busque en toda la plataforma con Cmd+K.',
          icon: 'Search',
        },
      ],
    },
  ];
}

/**
 * Check if user has seen what's new
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function hasSeenWhatsNew(_version: string): boolean {
  return false;
}

/**
 * Mark what's new as seen
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function markWhatsNewSeen(_version: string): void {
  // no-op: localStorage removed
}
