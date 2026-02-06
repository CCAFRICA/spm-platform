'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Receipt, Plus, Upload, Search, Download, RefreshCw, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useTenant, useTerm, useCurrency } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { useLocale } from '@/contexts/locale-context';
import { accessControl } from '@/lib/access-control';
import { isTenantUser } from '@/types/auth';
import { pageVariants } from '@/lib/animations';
import { TableSkeleton } from '@/components/ui/skeleton-loaders';
import { toast } from 'sonner';

// Import restaurant service
import {
  getCheques,
  getMeseros,
  getTurnos,
  getFranquicias,
  getChequesMetadata,
} from '@/lib/restaurant-service';
import type { Cheque, Mesero, Turno, Franquicia } from '@/types/cheques';

// Mock transaction data for TechCorp (Deals)
const mockTechCorpTransactions = [
  { id: 'TXN-001', date: '2024-12-15', customer: 'Acme Corp', product: 'Enterprise Suite', amount: 125000, commission: 8750, status: 'completed', rep: 'Sarah Chen' },
  { id: 'TXN-002', date: '2024-12-14', customer: 'TechGiant Inc', product: 'Analytics Pro', amount: 45000, commission: 3150, status: 'completed', rep: 'Marcus Johnson' },
  { id: 'TXN-003', date: '2024-12-13', customer: 'Global Solutions', product: 'Cloud Platform', amount: 89000, commission: 6230, status: 'pending', rep: 'Emily Rodriguez' },
  { id: 'TXN-004', date: '2024-12-12', customer: 'Innovative Systems', product: 'Security Bundle', amount: 67500, commission: 4725, status: 'completed', rep: 'David Kim' },
  { id: 'TXN-005', date: '2024-12-11', customer: 'Premier Enterprises', product: 'Enterprise Suite', amount: 150000, commission: 10500, status: 'completed', rep: 'Sarah Chen' },
  { id: 'TXN-006', date: '2024-12-10', customer: 'NextGen Corp', product: 'Starter Bundle', amount: 15000, commission: 1050, status: 'cancelled', rep: 'Marcus Johnson' },
  { id: 'TXN-007', date: '2024-12-09', customer: 'DataDriven LLC', product: 'Analytics Pro', amount: 52000, commission: 3640, status: 'completed', rep: 'Emily Rodriguez' },
  { id: 'TXN-008', date: '2024-12-08', customer: 'CloudFirst Inc', product: 'Cloud Platform', amount: 78000, commission: 5460, status: 'pending', rep: 'David Kim' },
];

// RetailCo demo transactions (Maria's transactions from my-compensation)
// User IDs match auth-context.tsx: rc-rep-001 (Maria), rc-rep-002 (James), rc-manager-001 (Carlos), rc-admin-001 (Sofia)
const mockRetailCoTransactions = [
  { id: 'TXN-2025-0162', date: '2025-01-20', customer: 'Williams Family', product: 'Progressive Lenses + Designer Frame', type: 'Optical', amount: 1450, incentive: 72.50, status: 'credited', rep: 'Maria Rodriguez', repId: 'rc-rep-001' },
  { id: 'TXN-2025-0158', date: '2025-01-18', customer: 'Chen Family', product: 'Vision Protection Plan', type: 'Insurance', amount: 680, incentive: 34.00, status: 'credited', rep: 'Maria Rodriguez', repId: 'rc-rep-001' },
  { id: 'TXN-2025-0147', date: '2025-01-15', customer: 'Johnson Family', product: 'Premium Protection Plan', type: 'Insurance', amount: 850, incentive: 0, status: 'disputed', rep: 'James Wilson', repId: 'rc-rep-002', notes: 'Split credit issue - Maria assisted but not credited', involvedReps: ['rc-rep-001', 'rc-rep-002'] },
  { id: 'TXN-2025-0142', date: '2025-01-12', customer: 'Mitchell Family', product: 'Bifocal Lenses + Frame', type: 'Optical', amount: 980, incentive: 49.00, status: 'credited', rep: 'Maria Rodriguez', repId: 'rc-rep-001' },
  { id: 'TXN-2025-0135', date: '2025-01-10', customer: 'Garcia Family', product: 'Eye Exam + Fitting', type: 'Services', amount: 320, incentive: 16.00, status: 'credited', rep: 'Maria Rodriguez', repId: 'rc-rep-001' },
  { id: 'TXN-2025-0128', date: '2025-01-08', customer: 'Thompson Corp', product: 'Corporate Vision Plan', type: 'Insurance', amount: 2400, incentive: 168.00, status: 'credited', rep: 'James Wilson', repId: 'rc-rep-002' },
  { id: 'TXN-2025-0121', date: '2025-01-05', customer: 'Davis Family', product: 'Designer Sunglasses', type: 'Optical', amount: 890, incentive: 44.50, status: 'credited', rep: 'Carlos Mendez', repId: 'rc-manager-001' },
  { id: 'TXN-2025-0115', date: '2025-01-03', customer: 'Brown Family', product: 'Contact Lens Fitting', type: 'Services', amount: 275, incentive: 13.75, status: 'credited', rep: 'Maria Rodriguez', repId: 'rc-rep-001' },
];

export default function TransactionsPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { locale } = useLocale();
  const transactionTerm = useTerm('transaction', true);
  const transactionSingular = useTerm('transaction');
  const repTerm = useTerm('salesRep');
  const { format } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [franquiciaFilter, setFranquiciaFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  // Access control
  const dataAccessLevel = accessControl.getDataAccessLevel(user);
  const isSpanish = locale === 'es-MX';

  // Get user's meseroId for hospitality filtering
  const userMeseroId = useMemo(() => {
    if (user && isTenantUser(user) && 'meseroId' in user) {
      return (user as { meseroId?: number }).meseroId;
    }
    return undefined;
  }, [user]);

  // Restaurant data
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [meseros, setMeseros] = useState<Mesero[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [franquicias, setFranquicias] = useState<Franquicia[]>([]);
  const [metadata, setMetadata] = useState<{ lastImport: string | null; totalImported: number } | null>(null);

  const isHospitality = currentTenant?.industry === 'Hospitality';
  const isRetail = currentTenant?.industry === 'Retail';

  // Load data based on tenant type
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        if (isHospitality) {
          const [chequesData, meserosData, turnosData, franquiciasData, metadataData] = await Promise.all([
            getCheques(),
            getMeseros(),
            getTurnos(),
            getFranquicias(),
            getChequesMetadata(),
          ]);
          setCheques(chequesData);
          setMeseros(meserosData);
          setTurnos(turnosData);
          setFranquicias(franquiciasData);
          setMetadata(metadataData);
        }
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Failed to load data');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [isHospitality]);

  // Helper functions for hospitality
  const getMeseroName = useCallback((meseroId: number) => {
    const mesero = meseros.find(m => m.mesero_id === meseroId);
    return mesero?.nombre || `Server #${meseroId}`;
  }, [meseros]);

  const getTurnoName = useCallback((turnoId: number) => {
    const turno = turnos.find(t => t.turno_id === turnoId);
    return turno?.nombre || `Turno ${turnoId}`;
  }, [turnos]);

  const getFranquiciaName = useCallback((numeroFranquicia: string) => {
    const franquicia = franquicias.find(f => f.numero_franquicia === numeroFranquicia);
    return franquicia?.nombre || numeroFranquicia;
  }, [franquicias]);

  // Filter transactions based on access level first
  const accessFilteredRetailTransactions = useMemo(() => {
    if (!user) return [];

    // Filter by access level for RetailCo
    return accessControl.filterByAccess(
      user,
      mockRetailCoTransactions,
      (t) => t.repId,
      undefined // No team filtering for transactions
    );
  }, [user]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    if (isRetail) {
      return accessFilteredRetailTransactions.filter((t) => {
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (searchQuery) {
          const search = searchQuery.toLowerCase();
          return [t.id, t.customer, t.product, t.rep, t.type].some(field => field?.toLowerCase().includes(search));
        }
        return true;
      });
    }

    if (!isHospitality) {
      return mockTechCorpTransactions.filter((t) => {
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (searchQuery) {
          const search = searchQuery.toLowerCase();
          return [t.id, t.customer, t.product, t.rep].some(field => field?.toLowerCase().includes(search));
        }
        return true;
      });
    }

    // First apply access control for hospitality
    let accessFilteredCheques = cheques;
    if (dataAccessLevel === 'own' && userMeseroId) {
      accessFilteredCheques = cheques.filter(c => c.mesero_id === userMeseroId);
    }

    return accessFilteredCheques.filter((c) => {
      // Status filter
      if (statusFilter === 'paid' && c.pagado !== 1) return false;
      if (statusFilter === 'pending' && c.pagado !== 0) return false;
      if (statusFilter === 'cancelled' && c.cancelado !== 1) return false;

      // Franchise filter
      if (franquiciaFilter !== 'all' && c.numero_franquicia !== franquiciaFilter) return false;

      // Search
      if (searchQuery) {
        const search = searchQuery.toLowerCase();
        const meseroName = getMeseroName(c.mesero_id).toLowerCase();
        const franquiciaName = getFranquiciaName(c.numero_franquicia).toLowerCase();
        return (
          c.numero_cheque.toString().includes(search) ||
          meseroName.includes(search) ||
          franquiciaName.includes(search)
        );
      }
      return true;
    });
  }, [isHospitality, isRetail, cheques, statusFilter, franquiciaFilter, searchQuery, getMeseroName, getFranquiciaName, accessFilteredRetailTransactions, dataAccessLevel, userMeseroId]);

  const getStatusBadge = (status: string | number, cancelado?: number) => {
    if (cancelado === 1) {
      return <Badge variant="destructive">Cancelado</Badge>;
    }
    if (typeof status === 'number') {
      return status === 1
        ? <Badge variant="default">Pagado</Badge>
        : <Badge variant="secondary">Pendiente</Badge>;
    }
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      paid: 'default',
      pending: 'secondary',
      cancelled: 'destructive',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const getTurnoBadge = (turnoId: number) => {
    const colors: Record<number, string> = {
      1: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      3: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[turnoId] || 'bg-gray-100'}`}>
        {getTurnoName(turnoId)}
      </span>
    );
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      if (isHospitality) {
        const [chequesData, metadataData] = await Promise.all([
          getCheques(),
          getChequesMetadata(),
        ]);
        setCheques(chequesData);
        setMetadata(metadataData);
        toast.success('Data refreshed');
      }
    } catch {
      toast.error('Failed to refresh data');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="p-6 space-y-6"
    >
      {/* Access Level Banner */}
      {dataAccessLevel === 'own' && (isRetail || isHospitality) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2 dark:bg-blue-900/20 dark:border-blue-800">
          <Lock className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-700 dark:text-blue-400">
            {isSpanish
              ? 'Mostrando solo tus registros. Contacta a tu gerente para acceso a datos del equipo.'
              : 'Showing only your records. Contact your manager for access to team data.'}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            {transactionTerm}
          </h1>
          <p className="text-muted-foreground">
            {filteredTransactions.length} {transactionTerm.toLowerCase()} {isSpanish ? 'encontrados' : 'found'}
            {dataAccessLevel !== 'all' && (
              <span className="ml-2 text-blue-600">({isSpanish ? 'vista limitada' : 'limited view'})</span>
            )}
            {isHospitality && metadata?.lastImport && (
              <span className="ml-2 text-xs">
                ({isSpanish ? 'Última importación' : 'Last import'}: {new Date(metadata.lastImport).toLocaleDateString(locale)})
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {isHospitality && (
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isSpanish ? 'Actualizar' : 'Refresh'}
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/data/import">
              <Upload className="mr-2 h-4 w-4" />
              {isSpanish ? 'Importar' : 'Import'}
            </Link>
          </Button>
          <Button size="sm" onClick={() => {
            toast.info(
              isSpanish
                ? `La creación manual de ${transactionSingular.toLowerCase()} estará disponible próximamente. Usa la importación por ahora.`
                : `Manual ${transactionSingular.toLowerCase()} creation coming soon. Use import for now.`
            );
          }}>
            <Plus className="mr-2 h-4 w-4" />
            {isSpanish ? `Nuevo ${transactionSingular}` : `New ${transactionSingular}`}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isSpanish ? `Buscar ${transactionTerm.toLowerCase()}...` : `Search ${transactionTerm.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {isHospitality && (
              <Select value={franquiciaFilter} onValueChange={setFranquiciaFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Franquicia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las Franquicias</SelectItem>
                  {franquicias.map((f) => (
                    <SelectItem key={f.numero_franquicia} value={f.numero_franquicia}>
                      {f.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={isSpanish ? 'Estado' : 'Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos' : 'All Status'}</SelectItem>
                <SelectItem value={isHospitality ? 'paid' : 'completed'}>
                  {isSpanish ? 'Pagado' : 'Completed'}
                </SelectItem>
                <SelectItem value="pending">{isSpanish ? 'Pendiente' : 'Pending'}</SelectItem>
                <SelectItem value="cancelled">{isSpanish ? 'Cancelado' : 'Cancelled'}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Empty State for Hospitality */}
      {isHospitality && !isLoading && cheques.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No hay cheques importados</h3>
            <p className="text-muted-foreground mb-4">
              Importa tu archivo de cheques para comenzar a ver los datos.
            </p>
            <Button asChild>
              <Link href="/data/import">
                <Upload className="mr-2 h-4 w-4" />
                Importar Cheques
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {((!isHospitality) || (isHospitality && cheques.length > 0)) && (
        <Card>
          <CardContent className="pt-4">
            {isLoading ? (
              <TableSkeleton rows={8} cols={isHospitality ? 8 : 8} />
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {isSpanish ? `No se encontraron ${transactionTerm.toLowerCase()}` : `No ${transactionTerm.toLowerCase()} found`}
              </div>
            ) : isHospitality ? (
              // Restaurant/Hospitality table (Cheques)
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cheque #</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Franquicia</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>{repTerm}</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Propina</TableHead>
                    <TableHead>{isSpanish ? 'Estado' : 'Status'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(filteredTransactions as Cheque[]).slice(0, 50).map((cheque) => (
                    <TableRow key={`${cheque.numero_franquicia}-${cheque.numero_cheque}`}>
                      <TableCell className="font-mono font-medium">{cheque.numero_cheque}</TableCell>
                      <TableCell>{cheque.fecha.split(' ')[0]}</TableCell>
                      <TableCell className="max-w-[150px] truncate" title={getFranquiciaName(cheque.numero_franquicia)}>
                        {getFranquiciaName(cheque.numero_franquicia)}
                      </TableCell>
                      <TableCell>{getTurnoBadge(cheque.turno_id)}</TableCell>
                      <TableCell>{getMeseroName(cheque.mesero_id)}</TableCell>
                      <TableCell className="text-right">{format(cheque.total)}</TableCell>
                      <TableCell className="text-right text-green-600">{format(cheque.propina)}</TableCell>
                      <TableCell>{getStatusBadge(cheque.pagado, cheque.cancelado)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : isRetail ? (
              // RetailCo table (Optical Sales)
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>{repTerm}</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Incentive</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(filteredTransactions as typeof mockRetailCoTransactions).map((t) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono font-medium">
                        <Link href={`/transactions/${t.id}`} className="text-primary hover:underline">
                          {t.id}
                        </Link>
                      </TableCell>
                      <TableCell>{t.date}</TableCell>
                      <TableCell>{t.customer}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{t.product}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{t.type}</Badge>
                      </TableCell>
                      <TableCell>{t.rep}</TableCell>
                      <TableCell className="text-right">{format(t.amount)}</TableCell>
                      <TableCell className="text-right text-green-600">
                        {t.incentive > 0 ? format(t.incentive) : '-'}
                      </TableCell>
                      <TableCell>
                        {t.status === 'credited' && <Badge variant="default">Credited</Badge>}
                        {t.status === 'disputed' && <Badge variant="destructive">Disputed</Badge>}
                        {t.status === 'pending' && <Badge variant="secondary">Pending</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              // Tech company table (Deals/Orders)
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>{repTerm}</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(filteredTransactions as typeof mockTechCorpTransactions).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono font-medium">{t.id}</TableCell>
                      <TableCell>{t.date}</TableCell>
                      <TableCell>{t.customer}</TableCell>
                      <TableCell>{t.product}</TableCell>
                      <TableCell>{t.rep}</TableCell>
                      <TableCell className="text-right">{format(t.amount)}</TableCell>
                      <TableCell className="text-right text-green-600">{format(t.commission)}</TableCell>
                      <TableCell>{getStatusBadge(t.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
