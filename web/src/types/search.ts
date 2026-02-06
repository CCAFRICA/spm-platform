/**
 * Search Types
 *
 * Types for global search, saved filters, and recent searches.
 */

export type SearchCategory =
  | 'all'
  | 'transactions'
  | 'users'
  | 'plans'
  | 'disputes'
  | 'reports'
  | 'settings';

export interface SearchResult {
  id: string;
  type: SearchCategory;
  title: string;
  titleEs: string;
  subtitle?: string;
  subtitleEs?: string;
  icon: string;
  route: string;
  score: number; // Relevance score
  highlights?: string[]; // Matched text snippets
  metadata?: Record<string, unknown>;
}

export interface SearchQuery {
  text: string;
  category: SearchCategory;
  filters?: SearchFilter[];
  limit?: number;
}

export interface SearchFilter {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'between' | 'in';
  value: unknown;
  valueEnd?: unknown; // For 'between' operator
}

export interface SavedFilter {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  nameEs: string;
  description?: string;
  descriptionEs?: string;
  category: SearchCategory;
  filters: SearchFilter[];
  isDefault: boolean;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

export interface RecentSearch {
  id: string;
  userId: string;
  query: string;
  category: SearchCategory;
  timestamp: string;
  resultCount: number;
}

export interface SearchSuggestion {
  text: string;
  textEs: string;
  category: SearchCategory;
  type: 'recent' | 'popular' | 'suggestion';
}

// Search category metadata
export const SEARCH_CATEGORIES: Record<SearchCategory, {
  name: string;
  nameEs: string;
  icon: string;
  searchable: boolean;
}> = {
  all: {
    name: 'All',
    nameEs: 'Todo',
    icon: 'Search',
    searchable: true,
  },
  transactions: {
    name: 'Transactions',
    nameEs: 'Transacciones',
    icon: 'Receipt',
    searchable: true,
  },
  users: {
    name: 'Users',
    nameEs: 'Usuarios',
    icon: 'Users',
    searchable: true,
  },
  plans: {
    name: 'Plans',
    nameEs: 'Planes',
    icon: 'FileText',
    searchable: true,
  },
  disputes: {
    name: 'Disputes',
    nameEs: 'Disputas',
    icon: 'AlertTriangle',
    searchable: true,
  },
  reports: {
    name: 'Reports',
    nameEs: 'Reportes',
    icon: 'BarChart2',
    searchable: true,
  },
  settings: {
    name: 'Settings',
    nameEs: 'Configuración',
    icon: 'Settings',
    searchable: true,
  },
};

// Common filter field definitions
export const FILTER_FIELDS: Record<string, {
  name: string;
  nameEs: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  operators: SearchFilter['operator'][];
  options?: { value: string; label: string; labelEs: string }[];
}> = {
  status: {
    name: 'Status',
    nameEs: 'Estado',
    type: 'select',
    operators: ['equals', 'in'],
    options: [
      { value: 'active', label: 'Active', labelEs: 'Activo' },
      { value: 'pending', label: 'Pending', labelEs: 'Pendiente' },
      { value: 'completed', label: 'Completed', labelEs: 'Completado' },
      { value: 'cancelled', label: 'Cancelled', labelEs: 'Cancelado' },
    ],
  },
  amount: {
    name: 'Amount',
    nameEs: 'Monto',
    type: 'number',
    operators: ['equals', 'gt', 'lt', 'gte', 'lte', 'between'],
  },
  date: {
    name: 'Date',
    nameEs: 'Fecha',
    type: 'date',
    operators: ['equals', 'gt', 'lt', 'between'],
  },
  assignee: {
    name: 'Assignee',
    nameEs: 'Asignado a',
    type: 'text',
    operators: ['equals', 'contains'],
  },
  region: {
    name: 'Region',
    nameEs: 'Región',
    type: 'select',
    operators: ['equals', 'in'],
    options: [
      { value: 'west', label: 'West', labelEs: 'Oeste' },
      { value: 'east', label: 'East', labelEs: 'Este' },
      { value: 'central', label: 'Central', labelEs: 'Centro' },
      { value: 'south', label: 'South', labelEs: 'Sur' },
    ],
  },
};
