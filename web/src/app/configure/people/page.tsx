'use client';

/**
 * Personnel Configuration — /configure/people
 *
 * Supabase-backed entity roster with search and server-side pagination.
 * SCHEMA: entities (id, tenant_id, external_id, display_name, entity_type, status, created_at)
 */

import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { useLocale , isSpanishLocale} from '@/contexts/locale-context';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { RequireCapability } from '@/components/auth/RequireCapability';
import { createClient } from '@/lib/supabase/client';
import type { EntityType, EntityStatus } from '@/lib/supabase/database.types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Users, Search, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { DrillThroughPanel } from '@/components/drill-through';
import { getPeriodsWithResults } from '@/lib/drill-through';
import { type AuthScope } from '@/lib/auth/scope';

// /configure/people is view.all_entities-gated (admin/platform) — 'all' is the correct scope here.
const ALL_SCOPE: AuthScope = { type: 'all' };

const PAGE_SIZE = 25;

interface EntityRow {
  id: string;
  external_id: string | null;
  display_name: string;
  entity_type: string;
  status: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  proposed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  suspended: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  terminated: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const TYPE_COLORS: Record<string, string> = {
  individual: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  location: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  team: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
};

function PeopleConfigurePageInner() {
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const isVialuce = useIsVialuce();
  const isSpanish = isSpanishLocale(locale);
  const tenantId = currentTenant?.id ?? '';

  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Drill-through: selected entity + latest period with results
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [latestPeriodId, setLatestPeriodId] = useState<string | undefined>(undefined);

  const fetchEntities = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const supabase = createClient();

      let query = supabase
        .from('entities')
        .select('id, external_id, display_name, entity_type, status, created_at', { count: 'exact' })
        .eq('tenant_id', tenantId);

      if (search) {
        query = query.or(`display_name.ilike.%${search}%,external_id.ilike.%${search}%`);
      }
      if (typeFilter !== 'all') {
        query = query.eq('entity_type', typeFilter as EntityType);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as EntityStatus);
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, count } = await query
        .order('display_name')
        .range(from, to);

      setEntities((data ?? []) as EntityRow[]);
      setTotalCount(count ?? 0);
    } catch (err) {
      console.error('[Personnel] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, search, typeFilter, statusFilter]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  // Resolve the most-recent period with results for drill-through
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    getPeriodsWithResults(tenantId)
      .then(periods => {
        if (!cancelled) setLatestPeriodId(periods[0]?.id);
      })
      .catch(err => console.error('[Personnel] Period fetch error:', err));
    return () => { cancelled = true; };
  }, [tenantId]);

  // Debounced search — apply on Enter or after typing stops
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput);
        setPage(0);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const showingFrom = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, totalCount);

  return (
    <div className={isVialuce ? 'page space-y-6' : 'space-y-6 p-6'}>
      {/* Header */}
      {isVialuce ? (
        <div className="phead">
          <div>
            <h1>{isSpanish ? 'Personal' : 'Personnel'}</h1>
            <div className="sub">
              {isSpanish
                ? `${totalCount.toLocaleString()} entidades registradas`
                : `${totalCount.toLocaleString()} entities registered`}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
            <Users className="h-6 w-6" />
            {isSpanish ? 'Personal' : 'Personnel'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isSpanish
              ? `${totalCount.toLocaleString()} entidades registradas`
              : `${totalCount.toLocaleString()} entities registered`}
          </p>
        </div>
      )}

      {/* Table Card */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">
            {isSpanish ? 'Directorio de Entidades' : 'Entity Directory'}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {isSpanish
              ? `Mostrando ${showingFrom}–${showingTo} de ${totalCount.toLocaleString()}`
              : `Showing ${showingFrom}–${showingTo} of ${totalCount.toLocaleString()}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder={isSpanish ? 'Buscar por nombre o ID externo...' : 'Search by name or external ID...'}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setSearch(searchInput);
                    setPage(0);
                  }
                }}
                className="pl-9 bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px] bg-slate-800 border-slate-700 text-slate-200">
                <SelectValue placeholder={isSpanish ? 'Tipo' : 'Type'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos los tipos' : 'All Types'}</SelectItem>
                <SelectItem value="individual">{isSpanish ? 'Individual' : 'Individual'}</SelectItem>
                <SelectItem value="location">{isSpanish ? 'Ubicación' : 'Location'}</SelectItem>
                <SelectItem value="team">{isSpanish ? 'Equipo' : 'Team'}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px] bg-slate-800 border-slate-700 text-slate-200">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos los estados' : 'All Statuses'}</SelectItem>
                <SelectItem value="active">{isSpanish ? 'Activo' : 'Active'}</SelectItem>
                <SelectItem value="proposed">{isSpanish ? 'Propuesto' : 'Proposed'}</SelectItem>
                <SelectItem value="suspended">{isSpanish ? 'Suspendido' : 'Suspended'}</SelectItem>
                <SelectItem value="terminated">{isSpanish ? 'Terminado' : 'Terminated'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-8 text-slate-400">
              {isSpanish ? 'Cargando entidades...' : 'Loading entities...'}
            </div>
          ) : entities.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              {search || typeFilter !== 'all' || statusFilter !== 'all'
                ? (isSpanish ? 'Ninguna entidad coincide con los filtros.' : 'No entities match your filters.')
                : (isSpanish ? 'No se encontraron entidades.' : 'No entities found.')}
            </div>
          ) : (
            <div className="rounded-md border border-slate-800 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-slate-800/50">
                    <TableHead className="text-slate-400">
                      {isSpanish ? 'ID Externo' : 'External ID'}
                    </TableHead>
                    <TableHead className="text-slate-400">
                      {isSpanish ? 'Nombre' : 'Name'}
                    </TableHead>
                    <TableHead className="text-slate-400">
                      {isSpanish ? 'Tipo' : 'Type'}
                    </TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">
                      {isSpanish ? 'Creado' : 'Created'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entities.map(e => {
                    const isSelected = selectedEntityId === e.id;
                    return (
                    <TableRow
                      key={e.id}
                      onClick={() => setSelectedEntityId(prev => (prev === e.id ? null : e.id))}
                      className={`border-slate-800 cursor-pointer ${isSelected ? 'bg-slate-800/50' : 'hover:bg-slate-800/30'}`}
                    >
                      <TableCell className="text-slate-300 font-mono text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${isSelected ? '' : '-rotate-90'}`} />
                          {e.external_id || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-200 font-medium">
                        {e.display_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={TYPE_COLORS[e.entity_type] || ''}>
                          {e.entity_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_COLORS[e.status] || ''}>
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {new Date(e.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-slate-400">
                {isSpanish
                  ? `Página ${page + 1} de ${totalPages}`
                  : `Page ${page + 1} of ${totalPages}`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="border-slate-700 text-slate-300"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {isSpanish ? 'Anterior' : 'Previous'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  className="border-slate-700 text-slate-300"
                >
                  {isSpanish ? 'Siguiente' : 'Next'}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drill-through: entity → components → traces → source */}
      {selectedEntityId && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base text-slate-200">
                {isSpanish ? 'Detalle de Cálculo' : 'Calculation Detail'}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {isSpanish
                  ? 'Componentes, trazas por transacción y datos de origen'
                  : 'Components, per-transaction traces, and source data'}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedEntityId(null)}
              className="border-slate-700 text-slate-300"
            >
              {isSpanish ? 'Cerrar' : 'Close'}
            </Button>
          </CardHeader>
          <CardContent>
            <DrillThroughPanel
              tenantId={tenantId}
              scope={ALL_SCOPE}
              periodId={latestPeriodId}
              initialEntityId={selectedEntityId}
              emptyMessage={isSpanish
                ? 'No hay resultados de cálculo para esta entidad en el período más reciente.'
                : 'No calculation results for this entity in the most recent period.'}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PeopleConfigurePage() {
  return (
    <RequireCapability capability="view.all_entities">
      <PeopleConfigurePageInner />
    </RequireCapability>
  );
}
