/**
 * Search Service
 *
 * Handles global search, saved filters, and recent searches.
 */

import type {
  SearchResult,
  SearchQuery,
  SearchCategory,
  SavedFilter,
  RecentSearch,
  SearchSuggestion,
} from '@/types/search';

const FILTERS_STORAGE_KEY = 'saved_filters';
const RECENT_STORAGE_KEY = 'recent_searches';

// ============================================
// GLOBAL SEARCH
// ============================================

/**
 * Perform a global search
 */
export function globalSearch(query: SearchQuery): SearchResult[] {
  const { text, category, limit = 20 } = query;

  if (!text.trim()) return [];

  const searchText = text.toLowerCase();
  const results: SearchResult[] = [];

  // Search across different categories
  if (category === 'all' || category === 'transactions') {
    results.push(...searchTransactions(searchText));
  }

  if (category === 'all' || category === 'users') {
    results.push(...searchUsers(searchText));
  }

  if (category === 'all' || category === 'plans') {
    results.push(...searchPlans(searchText));
  }

  if (category === 'all' || category === 'disputes') {
    results.push(...searchDisputes(searchText));
  }

  if (category === 'all' || category === 'reports') {
    results.push(...searchReports(searchText));
  }

  if (category === 'all' || category === 'settings') {
    results.push(...searchSettings(searchText));
  }

  // Sort by score and limit
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function searchTransactions(text: string): SearchResult[] {
  const transactions = [
    { id: 'txn-001', title: 'Order #12345 - Premium Package', amount: 1250, rep: 'Maria Rodriguez', date: '2024-01-15' },
    { id: 'txn-002', title: 'Order #12346 - Enterprise License', amount: 5000, rep: 'James Wilson', date: '2024-01-14' },
    { id: 'txn-003', title: 'Order #12347 - Professional Service', amount: 2500, rep: 'Sarah Chen', date: '2024-01-13' },
    { id: 'txn-004', title: 'Order #12348 - Starter Kit', amount: 500, rep: 'Maria Rodriguez', date: '2024-01-12' },
    { id: 'txn-005', title: 'Order #12349 - Annual Subscription', amount: 3600, rep: 'James Wilson', date: '2024-01-11' },
  ];

  return transactions
    .filter((t) =>
      t.title.toLowerCase().includes(text) ||
      t.rep.toLowerCase().includes(text) ||
      t.id.toLowerCase().includes(text)
    )
    .map((t) => ({
      id: t.id,
      type: 'transactions' as SearchCategory,
      title: t.title,
      titleEs: t.title,
      subtitle: `${t.rep} - $${t.amount.toLocaleString()}`,
      subtitleEs: `${t.rep} - $${t.amount.toLocaleString()}`,
      icon: 'Receipt',
      route: `/transactions/${t.id}`,
      score: calculateScore(text, [t.title, t.rep, t.id]),
    }));
}

function searchUsers(text: string): SearchResult[] {
  const users = [
    { id: 'maria-rodriguez', name: 'Maria Rodriguez', email: 'maria@company.com', role: 'Sales Rep' },
    { id: 'james-wilson', name: 'James Wilson', email: 'james@company.com', role: 'Sales Rep' },
    { id: 'sarah-chen', name: 'Sarah Chen', email: 'sarah@company.com', role: 'Manager' },
    { id: 'admin', name: 'System Admin', email: 'admin@company.com', role: 'Administrator' },
  ];

  return users
    .filter((u) =>
      u.name.toLowerCase().includes(text) ||
      u.email.toLowerCase().includes(text) ||
      u.role.toLowerCase().includes(text)
    )
    .map((u) => ({
      id: u.id,
      type: 'users' as SearchCategory,
      title: u.name,
      titleEs: u.name,
      subtitle: `${u.email} - ${u.role}`,
      subtitleEs: `${u.email} - ${u.role}`,
      icon: 'User',
      route: `/workforce/personnel?user=${u.id}`,
      score: calculateScore(text, [u.name, u.email, u.role]),
    }));
}

function searchPlans(text: string): SearchResult[] {
  const plans = [
    { id: 'plan-optivision', name: 'OptiVision Sales Plan', status: 'Active', type: 'Commission' },
    { id: 'plan-enterprise', name: 'Enterprise Bonus Plan', status: 'Active', type: 'Bonus' },
    { id: 'plan-q1-spiff', name: 'Q1 SPIFF Program', status: 'Draft', type: 'SPIFF' },
  ];

  return plans
    .filter((p) =>
      p.name.toLowerCase().includes(text) ||
      p.type.toLowerCase().includes(text) ||
      p.id.toLowerCase().includes(text)
    )
    .map((p) => ({
      id: p.id,
      type: 'plans' as SearchCategory,
      title: p.name,
      titleEs: p.name,
      subtitle: `${p.type} - ${p.status}`,
      subtitleEs: `${p.type} - ${p.status}`,
      icon: 'FileText',
      route: `/performance/plans/${p.id}`,
      score: calculateScore(text, [p.name, p.type, p.id]),
    }));
}

function searchDisputes(text: string): SearchResult[] {
  const disputes = [
    { id: 'dispute-001', title: 'Missing Commission - January', status: 'Open', rep: 'Maria Rodriguez' },
    { id: 'dispute-002', title: 'Incorrect Rate Applied', status: 'Resolved', rep: 'James Wilson' },
    { id: 'dispute-003', title: 'Transaction Not Credited', status: 'Under Review', rep: 'Sarah Chen' },
  ];

  return disputes
    .filter((d) =>
      d.title.toLowerCase().includes(text) ||
      d.status.toLowerCase().includes(text) ||
      d.rep.toLowerCase().includes(text)
    )
    .map((d) => ({
      id: d.id,
      type: 'disputes' as SearchCategory,
      title: d.title,
      titleEs: d.title,
      subtitle: `${d.rep} - ${d.status}`,
      subtitleEs: `${d.rep} - ${d.status}`,
      icon: 'AlertTriangle',
      route: `/transactions/disputes/${d.id}`,
      score: calculateScore(text, [d.title, d.status, d.rep]),
    }));
}

function searchReports(text: string): SearchResult[] {
  const reports = [
    { id: 'report-sales', name: 'Sales Performance Report', type: 'Performance' },
    { id: 'report-commission', name: 'Commission Summary', type: 'Compensation' },
    { id: 'report-trends', name: 'Trend Analysis', type: 'Analytics' },
    { id: 'report-team', name: 'Team Performance', type: 'Management' },
  ];

  return reports
    .filter((r) =>
      r.name.toLowerCase().includes(text) ||
      r.type.toLowerCase().includes(text)
    )
    .map((r) => ({
      id: r.id,
      type: 'reports' as SearchCategory,
      title: r.name,
      titleEs: r.name,
      subtitle: r.type,
      subtitleEs: r.type,
      icon: 'BarChart2',
      route: `/insights/analytics?report=${r.id}`,
      score: calculateScore(text, [r.name, r.type]),
    }));
}

function searchSettings(text: string): SearchResult[] {
  const settings = [
    { id: 'settings-profile', name: 'User Profile', category: 'Account' },
    { id: 'settings-notifications', name: 'Notification Preferences', category: 'Account' },
    { id: 'settings-rbac', name: 'Access Control', category: 'Administration' },
    { id: 'settings-locations', name: 'Locations', category: 'Configuration' },
    { id: 'settings-teams', name: 'Team Configuration', category: 'Configuration' },
  ];

  return settings
    .filter((s) =>
      s.name.toLowerCase().includes(text) ||
      s.category.toLowerCase().includes(text)
    )
    .map((s) => ({
      id: s.id,
      type: 'settings' as SearchCategory,
      title: s.name,
      titleEs: s.name,
      subtitle: s.category,
      subtitleEs: s.category,
      icon: 'Settings',
      route: getSettingsRoute(s.id),
      score: calculateScore(text, [s.name, s.category]),
    }));
}

function getSettingsRoute(settingId: string): string {
  const routes: Record<string, string> = {
    'settings-profile': '/workforce/personnel',
    'settings-notifications': '/notifications',
    'settings-rbac': '/admin/access-control',
    'settings-locations': '/configuration/locations',
    'settings-teams': '/configuration/teams',
  };
  return routes[settingId] || '/configuration';
}

function calculateScore(searchText: string, fields: string[]): number {
  let score = 0;
  const lowerSearch = searchText.toLowerCase();

  for (const field of fields) {
    const lowerField = field.toLowerCase();

    // Exact match
    if (lowerField === lowerSearch) {
      score += 100;
    }
    // Starts with
    else if (lowerField.startsWith(lowerSearch)) {
      score += 75;
    }
    // Contains
    else if (lowerField.includes(lowerSearch)) {
      score += 50;
    }
    // Word match
    else if (lowerField.split(' ').some((word) => word.startsWith(lowerSearch))) {
      score += 25;
    }
  }

  return score;
}

// ============================================
// SAVED FILTERS
// ============================================

/**
 * Get all saved filters for a user
 */
export function getSavedFilters(userId: string, tenantId: string): SavedFilter[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
  if (!stored) return getDefaultFilters(userId, tenantId);

  try {
    const all: SavedFilter[] = JSON.parse(stored);
    return all.filter(
      (f) => (f.userId === userId || f.isShared) && f.tenantId === tenantId
    );
  } catch {
    return [];
  }
}

/**
 * Save a filter
 */
export function saveFilter(
  userId: string,
  tenantId: string,
  name: string,
  category: SearchCategory,
  filters: SavedFilter['filters'],
  isShared: boolean = false
): SavedFilter {
  const filter: SavedFilter = {
    id: `filter-${Date.now()}`,
    tenantId,
    userId,
    name,
    nameEs: name,
    category,
    filters,
    isDefault: false,
    isShared,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  };

  const all = getAllFilters();
  all.push(filter);
  localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(all));

  return filter;
}

/**
 * Delete a saved filter
 */
export function deleteFilter(filterId: string): boolean {
  const all = getAllFilters();
  const filtered = all.filter((f) => f.id !== filterId);

  if (filtered.length === all.length) return false;

  localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

/**
 * Increment filter usage count
 */
export function incrementFilterUsage(filterId: string): void {
  const all = getAllFilters();
  const index = all.findIndex((f) => f.id === filterId);

  if (index >= 0) {
    all[index].usageCount++;
    all[index].updatedAt = new Date().toISOString();
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(all));
  }
}

function getAllFilters(): SavedFilter[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function getDefaultFilters(userId: string, tenantId: string): SavedFilter[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'filter-high-value',
      tenantId,
      userId,
      name: 'High Value Transactions',
      nameEs: 'Transacciones de Alto Valor',
      description: 'Transactions over $5,000',
      descriptionEs: 'Transacciones mayores a $5,000',
      category: 'transactions',
      filters: [{ field: 'amount', operator: 'gte', value: 5000 }],
      isDefault: true,
      isShared: true,
      createdAt: now,
      updatedAt: now,
      usageCount: 15,
    },
    {
      id: 'filter-pending',
      tenantId,
      userId,
      name: 'Pending Items',
      nameEs: 'Elementos Pendientes',
      description: 'All items with pending status',
      descriptionEs: 'Todos los elementos con estado pendiente',
      category: 'all',
      filters: [{ field: 'status', operator: 'equals', value: 'pending' }],
      isDefault: true,
      isShared: true,
      createdAt: now,
      updatedAt: now,
      usageCount: 28,
    },
  ];
}

// ============================================
// RECENT SEARCHES
// ============================================

/**
 * Get recent searches for a user
 */
export function getRecentSearches(userId: string, limit: number = 10): RecentSearch[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(RECENT_STORAGE_KEY);
  if (!stored) return [];

  try {
    const all: RecentSearch[] = JSON.parse(stored);
    return all
      .filter((s) => s.userId === userId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Add a recent search
 */
export function addRecentSearch(
  userId: string,
  query: string,
  category: SearchCategory,
  resultCount: number
): void {
  if (typeof window === 'undefined' || !query.trim()) return;

  const search: RecentSearch = {
    id: `search-${Date.now()}`,
    userId,
    query: query.trim(),
    category,
    timestamp: new Date().toISOString(),
    resultCount,
  };

  const all = getAllRecentSearches();

  // Remove duplicate queries
  const filtered = all.filter(
    (s) => !(s.userId === userId && s.query.toLowerCase() === query.toLowerCase())
  );

  filtered.push(search);

  // Keep only last 50 searches per user
  const trimmed = filtered.slice(-100);
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(trimmed));
}

/**
 * Clear recent searches for a user
 */
export function clearRecentSearches(userId: string): void {
  const all = getAllRecentSearches();
  const filtered = all.filter((s) => s.userId !== userId);
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(filtered));
}

function getAllRecentSearches(): RecentSearch[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(RECENT_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

// ============================================
// SUGGESTIONS
// ============================================

/**
 * Get search suggestions
 */
export function getSearchSuggestions(
  userId: string,
  partialQuery: string,
  category: SearchCategory
): SearchSuggestion[] {
  const suggestions: SearchSuggestion[] = [];

  // Recent searches
  const recent = getRecentSearches(userId, 5);
  recent
    .filter((r) =>
      r.query.toLowerCase().includes(partialQuery.toLowerCase()) &&
      (category === 'all' || r.category === category)
    )
    .forEach((r) => {
      suggestions.push({
        text: r.query,
        textEs: r.query,
        category: r.category,
        type: 'recent',
      });
    });

  // Popular suggestions
  const popular = [
    { text: 'high commission', textEs: 'comisión alta', category: 'transactions' as SearchCategory },
    { text: 'pending approval', textEs: 'aprobación pendiente', category: 'all' as SearchCategory },
    { text: 'this month', textEs: 'este mes', category: 'transactions' as SearchCategory },
    { text: 'team performance', textEs: 'rendimiento del equipo', category: 'reports' as SearchCategory },
  ];

  popular
    .filter((p) =>
      p.text.toLowerCase().includes(partialQuery.toLowerCase()) &&
      (category === 'all' || p.category === category)
    )
    .forEach((p) => {
      if (!suggestions.some((s) => s.text === p.text)) {
        suggestions.push({ ...p, type: 'popular' });
      }
    });

  return suggestions.slice(0, 8);
}
