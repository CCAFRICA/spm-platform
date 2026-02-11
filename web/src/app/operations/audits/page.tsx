'use client';

import { useState, useMemo } from 'react';
import {
  History,
  Download,
  Filter,
  ChevronDown,
  ChevronRight,
  Search,
  Calendar,
  User,
  Edit,
  Plus,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';
import { AccessControl, MANAGER_ROLES } from '@/components/access-control';
import { audit } from '@/lib/audit-service';
import { AuditLogEntry, AuditChange } from '@/types/audit';

interface FieldChange {
  field: string;
  oldValue: string;
  newValue: string;
}

interface ChangeAudit {
  id: string;
  date: string;
  user: string;
  action: 'create' | 'update' | 'delete';
  entity: string;
  entityId: string;
  entityName: string;
  changes: FieldChange[];
  region: string;
  salesChannel: string;
}

// Mock change audit data for RestaurantMX
const mockChangeAudits: ChangeAudit[] = [
  {
    id: '1',
    date: '2024-12-15 14:30:22',
    user: 'María García',
    action: 'update',
    entity: 'Mesero',
    entityId: 'M001',
    entityName: 'Carlos López',
    changes: [
      { field: 'comision_bebidas', oldValue: '3%', newValue: '4%' },
      { field: 'meta_mensual', oldValue: '$45,000', newValue: '$50,000' },
    ],
    region: 'CDMX',
    salesChannel: 'Dine-in',
  },
  {
    id: '2',
    date: '2024-12-15 13:15:45',
    user: 'Roberto Hernández',
    action: 'create',
    entity: 'Franquicia',
    entityId: 'F025',
    entityName: 'Polanco Norte',
    changes: [
      { field: 'nombre', oldValue: '-', newValue: 'Polanco Norte' },
      { field: 'region', oldValue: '-', newValue: 'CDMX' },
      { field: 'gerente', oldValue: '-', newValue: 'Ana Martínez' },
    ],
    region: 'CDMX',
    salesChannel: 'Dine-in',
  },
  {
    id: '3',
    date: '2024-12-15 11:45:00',
    user: 'Admin Sistema',
    action: 'update',
    entity: 'Plan Comisiones',
    entityId: 'PC001',
    entityName: 'Plan Estándar Q4',
    changes: [
      { field: 'comision_alimentos', oldValue: '2%', newValue: '2.5%' },
      { field: 'bono_meta', oldValue: '$1,000', newValue: '$1,500' },
      { field: 'vigencia_fin', oldValue: '2024-12-31', newValue: '2025-03-31' },
    ],
    region: 'Nacional',
    salesChannel: 'All',
  },
  {
    id: '4',
    date: '2024-12-15 10:20:33',
    user: 'Laura Sánchez',
    action: 'delete',
    entity: 'Mesero',
    entityId: 'M089',
    entityName: 'Pedro Ramírez',
    changes: [
      { field: 'status', oldValue: 'Activo', newValue: 'Eliminado' },
      { field: 'motivo', oldValue: '-', newValue: 'Renuncia voluntaria' },
    ],
    region: 'Guadalajara',
    salesChannel: 'Dine-in',
  },
  {
    id: '5',
    date: '2024-12-15 09:00:12',
    user: 'Miguel Torres',
    action: 'update',
    entity: 'Turno',
    entityId: 'T003',
    entityName: 'Turno Vespertino',
    changes: [
      { field: 'hora_inicio', oldValue: '14:00', newValue: '15:00' },
      { field: 'hora_fin', oldValue: '22:00', newValue: '23:00' },
    ],
    region: 'Monterrey',
    salesChannel: 'Dine-in',
  },
  {
    id: '6',
    date: '2024-12-14 16:45:00',
    user: 'Patricia Ruiz',
    action: 'create',
    entity: 'Mesero',
    entityId: 'M102',
    entityName: 'Fernando Díaz',
    changes: [
      { field: 'nombre', oldValue: '-', newValue: 'Fernando Díaz' },
      { field: 'franquicia', oldValue: '-', newValue: 'Centro Histórico' },
      { field: 'rol', oldValue: '-', newValue: 'Mesero' },
    ],
    region: 'CDMX',
    salesChannel: 'Dine-in',
  },
];

// TechCorp mock data
const techCorpChangeAudits: ChangeAudit[] = [
  {
    id: '1',
    date: '2024-12-15 14:30:22',
    user: 'Sarah Chen',
    action: 'update',
    entity: 'Sales Rep',
    entityId: 'SR001',
    entityName: 'Mike Johnson',
    changes: [
      { field: 'quota', oldValue: '$500,000', newValue: '$600,000' },
      { field: 'territory', oldValue: 'West Region', newValue: 'West + Central' },
    ],
    region: 'West',
    salesChannel: 'Enterprise',
  },
  {
    id: '2',
    date: '2024-12-15 11:15:00',
    user: 'Admin',
    action: 'create',
    entity: 'Commission Plan',
    entityId: 'CP005',
    entityName: 'Q1 2025 Accelerator',
    changes: [
      { field: 'name', oldValue: '-', newValue: 'Q1 2025 Accelerator' },
      { field: 'base_rate', oldValue: '-', newValue: '5%' },
      { field: 'accelerator', oldValue: '-', newValue: '8% above quota' },
    ],
    region: 'National',
    salesChannel: 'All',
  },
  {
    id: '3',
    date: '2024-12-14 16:20:45',
    user: 'Emily Davis',
    action: 'delete',
    entity: 'Deal',
    entityId: 'D892',
    entityName: 'Acme Corp Renewal',
    changes: [
      { field: 'status', oldValue: 'Pipeline', newValue: 'Deleted' },
      { field: 'reason', oldValue: '-', newValue: 'Duplicate entry' },
    ],
    region: 'East',
    salesChannel: 'Enterprise',
  },
];

export default function AuditsPage() {
  return (
    <AccessControl allowedRoles={MANAGER_ROLES}>
      <AuditsPageContent />
    </AccessControl>
  );
}

// Transform AuditLogEntry to ChangeAudit display format
function transformAuditEntry(entry: AuditLogEntry): ChangeAudit {
  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return {
    id: entry.id,
    date: entry.timestamp.replace('T', ' ').slice(0, 19),
    user: entry.userName || entry.userId || 'System',
    action: (['create', 'update', 'delete'].includes(entry.action) ? entry.action : 'update') as 'create' | 'update' | 'delete',
    entity: entry.entityType.charAt(0).toUpperCase() + entry.entityType.slice(1),
    entityId: entry.entityId || '-',
    entityName: entry.entityName || entry.entityId || '-',
    changes: entry.changes?.map((c: AuditChange) => ({
      field: c.field,
      oldValue: formatValue(c.oldValue),
      newValue: formatValue(c.newValue),
    })) || [],
    region: (entry.metadata?.region as string) || 'System',
    salesChannel: (entry.metadata?.channel as string) || 'All',
  };
}

function AuditsPageContent() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : (currentTenant?.locale === 'es-MX');
  const isHospitality = currentTenant?.industry === 'Hospitality';

  // Get real audit logs first, fallback to mock data if empty
  const realAuditLogs = useMemo(() => {
    try {
      const logs = audit.getAuditLogs({ limit: 100 });
      return logs.map(transformAuditEntry);
    } catch {
      return [];
    }
  }, []);

  const mockAudits = isHospitality ? mockChangeAudits : techCorpChangeAudits;
  const audits = realAuditLogs.length > 0 ? realAuditLogs : mockAudits;

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  const entities = Array.from(new Set(audits.map(a => a.entity)));
  const regions = Array.from(new Set(audits.map(a => a.region)));
  const channels = Array.from(new Set(audits.map(a => a.salesChannel)));

  const filteredAudits = useMemo(() => {
    return audits.filter(audit => {
      const matchesSearch = !searchTerm ||
        audit.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
        audit.entityName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesAction = actionFilter === 'all' || audit.action === actionFilter;
      const matchesEntity = entityFilter === 'all' || audit.entity === entityFilter;
      const matchesRegion = regionFilter === 'all' || audit.region === regionFilter;
      const matchesChannel = channelFilter === 'all' || audit.salesChannel === channelFilter;

      let matchesDate = true;
      if (dateFrom) {
        matchesDate = matchesDate && audit.date >= dateFrom;
      }
      if (dateTo) {
        matchesDate = matchesDate && audit.date <= dateTo + ' 23:59:59';
      }

      return matchesSearch && matchesAction && matchesEntity && matchesRegion && matchesChannel && matchesDate;
    });
  }, [audits, searchTerm, dateFrom, dateTo, actionFilter, entityFilter, regionFilter, channelFilter]);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create': return <Plus className="h-3 w-3" />;
      case 'update': return <Edit className="h-3 w-3" />;
      case 'delete': return <Trash2 className="h-3 w-3" />;
      default: return null;
    }
  };

  const getActionBadge = (action: string) => {
    const colors = {
      create: 'bg-green-100 text-green-800 hover:bg-green-100',
      update: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
      delete: 'bg-red-100 text-red-800 hover:bg-red-100',
    };
    const labels = isSpanish
      ? { create: 'Crear', update: 'Actualizar', delete: 'Eliminar' }
      : { create: 'Create', update: 'Update', delete: 'Delete' };

    return (
      <Badge className={colors[action as keyof typeof colors]}>
        {getActionIcon(action)}
        <span className="ml-1">{labels[action as keyof typeof labels]}</span>
      </Badge>
    );
  };

  const exportToCSV = () => {
    const headers = ['Date', 'User', 'Action', 'Entity', 'Entity Name', 'Region', 'Channel', 'Changes'];
    const rows = filteredAudits.map(a => [
      a.date,
      a.user,
      a.action,
      a.entity,
      a.entityName,
      a.region,
      a.salesChannel,
      a.changes.map(c => `${c.field}: ${c.oldValue} → ${c.newValue}`).join('; '),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `change-audits-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            {isSpanish ? 'Historial de Cambios' : 'Change History'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? 'Auditoría de modificaciones en el sistema' : 'System modification audit trail'}
          </p>
        </div>
        <Button onClick={exportToCSV}>
          <Download className="h-4 w-4 mr-2" />
          {isSpanish ? 'Exportar CSV' : 'Export CSV'}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {isSpanish ? 'Filtros' : 'Filters'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isSpanish ? 'Buscar usuario o entidad...' : 'Search user or entity...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Date From */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Date To */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Action Filter */}
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Acción' : 'Action'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todas las acciones' : 'All actions'}</SelectItem>
                <SelectItem value="create">{isSpanish ? 'Crear' : 'Create'}</SelectItem>
                <SelectItem value="update">{isSpanish ? 'Actualizar' : 'Update'}</SelectItem>
                <SelectItem value="delete">{isSpanish ? 'Eliminar' : 'Delete'}</SelectItem>
              </SelectContent>
            </Select>

            {/* Entity Filter */}
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Entidad' : 'Entity'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todas las entidades' : 'All entities'}</SelectItem>
                {entities.map(entity => (
                  <SelectItem key={entity} value={entity}>{entity}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Region Filter */}
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Región' : 'Region'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todas las regiones' : 'All regions'}</SelectItem>
                {regions.map(region => (
                  <SelectItem key={region} value={region}>{region}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Channel Filter */}
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Canal' : 'Channel'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos los canales' : 'All channels'}</SelectItem>
                {channels.map(channel => (
                  <SelectItem key={channel} value={channel}>{channel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="text-sm text-muted-foreground">
        {isSpanish
          ? `Mostrando ${filteredAudits.length} de ${audits.length} registros`
          : `Showing ${filteredAudits.length} of ${audits.length} records`}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>{isSpanish ? 'Fecha' : 'Date'}</TableHead>
                <TableHead>{isSpanish ? 'Usuario' : 'User'}</TableHead>
                <TableHead>{isSpanish ? 'Acción' : 'Action'}</TableHead>
                <TableHead>{isSpanish ? 'Entidad' : 'Entity'}</TableHead>
                <TableHead>{isSpanish ? 'Nombre' : 'Name'}</TableHead>
                <TableHead>{isSpanish ? 'Región' : 'Region'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAudits.map(audit => (
                <Collapsible key={audit.id} asChild open={expandedRows.has(audit.id)}>
                  <>
                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(audit.id)}>
                      <TableCell>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="p-0 h-6 w-6">
                            {expandedRows.has(audit.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{audit.date}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {audit.user}
                        </div>
                      </TableCell>
                      <TableCell>{getActionBadge(audit.action)}</TableCell>
                      <TableCell>{audit.entity}</TableCell>
                      <TableCell className="font-medium">{audit.entityName}</TableCell>
                      <TableCell>{audit.region}</TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={7} className="p-0">
                          <div className="p-4 space-y-2">
                            <p className="text-sm font-medium text-muted-foreground mb-3">
                              {isSpanish ? 'Cambios realizados:' : 'Changes made:'}
                            </p>
                            <div className="space-y-2">
                              {audit.changes.map((change, idx) => (
                                <div key={idx} className="flex items-center gap-3 text-sm bg-background rounded p-2">
                                  <span className="font-medium text-muted-foreground min-w-32">
                                    {change.field}
                                  </span>
                                  <span className="text-red-600 line-through">{change.oldValue}</span>
                                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-green-600 font-medium">{change.newValue}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
