'use client';

import { useState, useMemo } from 'react';
import {
  LogIn,
  Download,
  Filter,
  CheckCircle,
  XCircle,
  Search,
  Calendar,
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
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';
import { AccessControl, MANAGER_ROLES } from '@/components/access-control';

interface LoginAudit {
  id: string;
  user: string;
  email: string;
  dateTime: string;
  page: string;
  ipAddress: string;
  status: 'success' | 'failed';
  region: string;
  salesChannel: string;
}

// Mock login audit data
const mockLoginAudits: LoginAudit[] = [
  { id: '1', user: 'María García', email: 'maria.garcia@restaurantmx.com', dateTime: '2024-12-15 09:15:23', page: 'Dashboard', ipAddress: '192.168.1.101', status: 'success', region: 'CDMX', salesChannel: 'Dine-in' },
  { id: '2', user: 'Carlos López', email: 'carlos.lopez@restaurantmx.com', dateTime: '2024-12-15 09:22:45', page: 'Transactions', ipAddress: '192.168.1.102', status: 'success', region: 'Guadalajara', salesChannel: 'Dine-in' },
  { id: '3', user: 'Ana Martínez', email: 'ana.martinez@restaurantmx.com', dateTime: '2024-12-15 09:30:12', page: 'Insights', ipAddress: '192.168.1.103', status: 'failed', region: 'Monterrey', salesChannel: 'Delivery' },
  { id: '4', user: 'Roberto Hernández', email: 'roberto.h@restaurantmx.com', dateTime: '2024-12-15 09:45:00', page: 'Personnel', ipAddress: '192.168.1.104', status: 'success', region: 'CDMX', salesChannel: 'Dine-in' },
  { id: '5', user: 'Laura Sánchez', email: 'laura.s@restaurantmx.com', dateTime: '2024-12-15 10:00:33', page: 'Dashboard', ipAddress: '192.168.1.105', status: 'success', region: 'Puebla', salesChannel: 'Takeout' },
  { id: '6', user: 'Miguel Torres', email: 'miguel.t@restaurantmx.com', dateTime: '2024-12-15 10:15:21', page: 'Compensation', ipAddress: '192.168.1.106', status: 'failed', region: 'CDMX', salesChannel: 'Dine-in' },
  { id: '7', user: 'Patricia Ruiz', email: 'patricia.r@restaurantmx.com', dateTime: '2024-12-15 10:30:45', page: 'Transactions', ipAddress: '192.168.1.107', status: 'success', region: 'Guadalajara', salesChannel: 'Delivery' },
  { id: '8', user: 'Fernando Díaz', email: 'fernando.d@restaurantmx.com', dateTime: '2024-12-15 10:45:12', page: 'Dashboard', ipAddress: '192.168.1.108', status: 'success', region: 'Monterrey', salesChannel: 'Dine-in' },
  { id: '9', user: 'Carmen Flores', email: 'carmen.f@restaurantmx.com', dateTime: '2024-12-15 11:00:00', page: 'Insights', ipAddress: '192.168.1.109', status: 'success', region: 'CDMX', salesChannel: 'Takeout' },
  { id: '10', user: 'José Morales', email: 'jose.m@restaurantmx.com', dateTime: '2024-12-15 11:15:33', page: 'Personnel', ipAddress: '192.168.1.110', status: 'failed', region: 'Puebla', salesChannel: 'Dine-in' },
];

// TechCorp mock data
const techCorpLoginAudits: LoginAudit[] = [
  { id: '1', user: 'Sarah Chen', email: 'sarah.chen@techcorp.com', dateTime: '2024-12-15 09:15:23', page: 'Dashboard', ipAddress: '10.0.1.101', status: 'success', region: 'West', salesChannel: 'Enterprise' },
  { id: '2', user: 'Mike Johnson', email: 'mike.j@techcorp.com', dateTime: '2024-12-15 09:22:45', page: 'Deals', ipAddress: '10.0.1.102', status: 'success', region: 'East', salesChannel: 'SMB' },
  { id: '3', user: 'Emily Davis', email: 'emily.d@techcorp.com', dateTime: '2024-12-15 09:30:12', page: 'Insights', ipAddress: '10.0.1.103', status: 'failed', region: 'Central', salesChannel: 'Enterprise' },
  { id: '4', user: 'James Wilson', email: 'james.w@techcorp.com', dateTime: '2024-12-15 09:45:00', page: 'Personnel', ipAddress: '10.0.1.104', status: 'success', region: 'West', salesChannel: 'Partner' },
  { id: '5', user: 'Lisa Brown', email: 'lisa.b@techcorp.com', dateTime: '2024-12-15 10:00:33', page: 'Dashboard', ipAddress: '10.0.1.105', status: 'success', region: 'East', salesChannel: 'SMB' },
];

export default function LoginAuditsPage() {
  return (
    <AccessControl allowedRoles={MANAGER_ROLES}>
      <LoginAuditsPageContent />
    </AccessControl>
  );
}

function LoginAuditsPageContent() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : (currentTenant?.locale === 'es-MX');
  const isHospitality = currentTenant?.industry === 'Hospitality';

  const audits = isHospitality ? mockLoginAudits : techCorpLoginAudits;

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pageFilter, setPageFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const pages = Array.from(new Set(audits.map(a => a.page)));
  const channels = Array.from(new Set(audits.map(a => a.salesChannel)));
  const regions = Array.from(new Set(audits.map(a => a.region)));

  const filteredAudits = useMemo(() => {
    return audits.filter(audit => {
      const matchesSearch = !searchTerm ||
        audit.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
        audit.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPage = pageFilter === 'all' || audit.page === pageFilter;
      const matchesChannel = channelFilter === 'all' || audit.salesChannel === channelFilter;
      const matchesRegion = regionFilter === 'all' || audit.region === regionFilter;
      const matchesStatus = statusFilter === 'all' || audit.status === statusFilter;

      // Date filtering
      let matchesDate = true;
      if (dateFrom) {
        matchesDate = matchesDate && audit.dateTime >= dateFrom;
      }
      if (dateTo) {
        matchesDate = matchesDate && audit.dateTime <= dateTo + ' 23:59:59';
      }

      return matchesSearch && matchesPage && matchesChannel && matchesRegion && matchesStatus && matchesDate;
    });
  }, [audits, searchTerm, dateFrom, dateTo, pageFilter, channelFilter, regionFilter, statusFilter]);

  const exportToCSV = () => {
    const headers = ['User', 'Email', 'Date/Time', 'Page', 'IP Address', 'Status', 'Region', 'Sales Channel'];
    const rows = filteredAudits.map(a => [
      a.user,
      a.email,
      a.dateTime,
      a.page,
      a.ipAddress,
      a.status,
      a.region,
      a.salesChannel,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `login-audits-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LogIn className="h-6 w-6 text-primary" />
            {isSpanish ? 'Auditoría de Inicios de Sesión' : 'Login Audits'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? 'Historial de accesos al sistema' : 'System access history'}
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
                placeholder={isSpanish ? 'Buscar usuario...' : 'Search user...'}
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

            {/* Page Filter */}
            <Select value={pageFilter} onValueChange={setPageFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Página' : 'Page'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todas las páginas' : 'All pages'}</SelectItem>
                {pages.map(page => (
                  <SelectItem key={page} value={page}>{page}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Channel Filter */}
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Canal de ventas' : 'Sales Channel'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos los canales' : 'All channels'}</SelectItem>
                {channels.map(channel => (
                  <SelectItem key={channel} value={channel}>{channel}</SelectItem>
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

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Estado' : 'Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos' : 'All'}</SelectItem>
                <SelectItem value="success">{isSpanish ? 'Exitoso' : 'Success'}</SelectItem>
                <SelectItem value="failed">{isSpanish ? 'Fallido' : 'Failed'}</SelectItem>
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
                <TableHead>{isSpanish ? 'Usuario' : 'User'}</TableHead>
                <TableHead>{isSpanish ? 'Fecha/Hora' : 'Date/Time'}</TableHead>
                <TableHead>{isSpanish ? 'Página' : 'Page'}</TableHead>
                <TableHead>{isSpanish ? 'Dirección IP' : 'IP Address'}</TableHead>
                <TableHead>{isSpanish ? 'Canal' : 'Channel'}</TableHead>
                <TableHead>{isSpanish ? 'Región' : 'Region'}</TableHead>
                <TableHead>{isSpanish ? 'Estado' : 'Status'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAudits.map(audit => (
                <TableRow key={audit.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{audit.user}</p>
                      <p className="text-sm text-muted-foreground">{audit.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{audit.dateTime}</TableCell>
                  <TableCell>{audit.page}</TableCell>
                  <TableCell className="font-mono text-sm">{audit.ipAddress}</TableCell>
                  <TableCell>{audit.salesChannel}</TableCell>
                  <TableCell>{audit.region}</TableCell>
                  <TableCell>
                    {audit.status === 'success' ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {isSpanish ? 'Exitoso' : 'Success'}
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                        <XCircle className="h-3 w-3 mr-1" />
                        {isSpanish ? 'Fallido' : 'Failed'}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
