'use client';

import { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Upload,
  ArrowRightLeft,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Save,
  Lock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { accessControl, canAccessModule } from '@/lib/access-control';

interface Personnel {
  id: string;
  name: string;
  email: string;
  role: string;
  channel: string;
  location: string;
  territory: string;
  status: 'active' | 'inactive';
  hireDate: string;
  userId?: string; // Links to auth user
}

const mockPersonnel: Personnel[] = [
  { id: '1', userId: 'U001', name: 'María García', email: 'maria.garcia@restaurantmx.com', role: 'Gerente Regional', channel: 'Dine-in', location: 'CDMX Norte', territory: 'CDMX', status: 'active', hireDate: '2022-03-15' },
  { id: '2', userId: 'U002', name: 'Carlos López', email: 'carlos.lopez@restaurantmx.com', role: 'Mesero', channel: 'Dine-in', location: 'Centro Histórico', territory: 'CDMX', status: 'active', hireDate: '2023-01-10' },
  { id: '3', userId: 'U003', name: 'Ana Martínez', email: 'ana.martinez@restaurantmx.com', role: 'Gerente de Franquicia', channel: 'Dine-in', location: 'Polanco', territory: 'CDMX', status: 'active', hireDate: '2021-06-20' },
  { id: '4', userId: 'U004', name: 'Roberto Hernández', email: 'roberto.h@restaurantmx.com', role: 'Supervisor', channel: 'Delivery', location: 'Guadalajara Centro', territory: 'Jalisco', status: 'active', hireDate: '2022-09-01' },
  { id: '5', userId: 'U005', name: 'Laura Sánchez', email: 'laura.s@restaurantmx.com', role: 'Mesero', channel: 'Takeout', location: 'Santa Fe', territory: 'CDMX', status: 'inactive', hireDate: '2023-04-15' },
  { id: '6', userId: 'U006', name: 'Miguel Torres', email: 'miguel.t@restaurantmx.com', role: 'Mesero', channel: 'Dine-in', location: 'Monterrey Centro', territory: 'Nuevo León', status: 'active', hireDate: '2023-07-01' },
  { id: '7', userId: 'U007', name: 'Patricia Ruiz', email: 'patricia.r@restaurantmx.com', role: 'Gerente de Franquicia', channel: 'Dine-in', location: 'Condesa', territory: 'CDMX', status: 'active', hireDate: '2020-11-15' },
  { id: '8', userId: 'U008', name: 'Fernando Díaz', email: 'fernando.d@restaurantmx.com', role: 'Mesero', channel: 'Delivery', location: 'Puebla Centro', territory: 'Puebla', status: 'active', hireDate: '2024-01-08' },
];

// RetailCo personnel - IDs match auth-context.tsx
const retailCoPersonnel: Personnel[] = [
  { id: 'R1', userId: 'rc-rep-001', name: 'Maria Rodriguez', email: 'maria.rodriguez@retailco.com', role: 'Sales Associate', channel: 'Optical', location: 'Store #142', territory: 'West Region', status: 'active', hireDate: '2023-03-15' },
  { id: 'R2', userId: 'rc-rep-002', name: 'James Wilson', email: 'james.wilson@retailco.com', role: 'Sales Associate', channel: 'Optical', location: 'Store #142', territory: 'West Region', status: 'active', hireDate: '2022-06-10' },
  { id: 'R3', userId: 'rc-manager-001', name: 'Carlos Mendez', email: 'carlos.mendez@retailco.com', role: 'Store Manager', channel: 'Optical', location: 'Store #142', territory: 'West Region', status: 'active', hireDate: '2019-08-01' },
  { id: 'R4', userId: 'rc-rep-003', name: 'Emily Johnson', email: 'emily.johnson@retailco.com', role: 'Sales Associate', channel: 'Optical', location: 'Store #143', territory: 'West Region', status: 'active', hireDate: '2023-09-01' },
  { id: 'R5', userId: 'rc-rep-004', name: 'Michael Brown', email: 'michael.brown@retailco.com', role: 'Sales Associate', channel: 'Optical', location: 'Store #143', territory: 'West Region', status: 'active', hireDate: '2022-11-15' },
  { id: 'R6', userId: 'rc-admin-001', name: 'Sofia Chen', email: 'sofia.chen@retailco.com', role: 'Regional Manager', channel: 'Optical', location: 'Regional HQ', territory: 'West Region', status: 'active', hireDate: '2018-01-15' },
];

const roles = ['Mesero', 'Supervisor', 'Gerente de Franquicia', 'Gerente Regional', 'Director'];
const retailRoles = ['Sales Associate', 'Store Manager', 'Regional Manager', 'Director'];
const channels = ['Dine-in', 'Delivery', 'Takeout'];
const retailChannels = ['Optical', 'Insurance', 'Services'];
const locations = ['Centro Histórico', 'Polanco', 'Santa Fe', 'Condesa', 'CDMX Norte', 'Guadalajara Centro', 'Monterrey Centro', 'Puebla Centro'];
const retailLocations = ['Store #142', 'Store #143', 'Store #144', 'Regional HQ'];
const territories = ['CDMX', 'Jalisco', 'Nuevo León', 'Puebla'];
const retailTerritories = ['West Region', 'East Region', 'Central Region'];

export default function PersonnelPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const isSpanish = currentTenant?.locale === 'es-MX';
  const isRetail = currentTenant?.industry === 'Retail';

  // Check if user can access personnel module
  const canAccess = canAccessModule(user, 'personnel');
  const dataAccessLevel = accessControl.getDataAccessLevel(user);
  const isManagerOrAbove = accessControl.isManagerOrAbove(user);

  // Get base personnel data based on tenant
  const basePersonnel = isRetail ? retailCoPersonnel : mockPersonnel;

  // Filter personnel based on user's access level
  const accessFilteredPersonnel = useMemo(() => {
    if (!user) return [];

    return accessControl.filterByAccess(
      user,
      basePersonnel,
      (person) => person.userId || person.id,
      (person) => person.territory // Team grouping by territory
    );
  }, [user, basePersonnel]);

  // Local state for personnel modifications (add/edit/delete) - starts with access-filtered data
  const [localPersonnelChanges, setLocalPersonnelChanges] = useState<{added: Personnel[], deleted: string[]}>({added: [], deleted: []});

  // Combine access-filtered with local changes
  const personnel = useMemo(() => {
    const base = accessFilteredPersonnel.filter(p => !localPersonnelChanges.deleted.includes(p.id));
    return [...base, ...localPersonnelChanges.added];
  }, [accessFilteredPersonnel, localPersonnelChanges]);
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Personnel | null>(null);

  const [newPerson, setNewPerson] = useState({
    name: '',
    email: '',
    role: '',
    channel: '',
    location: '',
  });

  const [transferData, setTransferData] = useState({
    territory: '',
    location: '',
    role: '',
    hierarchy: '',
  });

  // Use personnel (access-filtered + local changes) as the base
  const availablePersonnel = useMemo(() => {
    return personnel;
  }, [personnel]);

  // Get the correct lists based on tenant
  const availableRoles = isRetail ? retailRoles : roles;
  const availableChannels = isRetail ? retailChannels : channels;
  const availableLocations = isRetail ? retailLocations : locations;
  const availableTerritories = isRetail ? retailTerritories : territories;

  const filteredPersonnel = useMemo(() => {
    return availablePersonnel.filter(person => {
      const matchesSearch = !searchTerm ||
        person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        person.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesChannel = channelFilter === 'all' || person.channel === channelFilter;
      const matchesRole = roleFilter === 'all' || person.role === roleFilter;
      const matchesLocation = locationFilter === 'all' || person.location === locationFilter;
      const matchesStatus = statusFilter === 'all' || person.status === statusFilter;

      return matchesSearch && matchesChannel && matchesRole && matchesLocation && matchesStatus;
    });
  }, [availablePersonnel, searchTerm, channelFilter, roleFilter, locationFilter, statusFilter]);

  const handleCreateUser = () => {
    const person: Personnel = {
      id: `new-${Date.now()}`,
      name: newPerson.name,
      email: newPerson.email,
      role: newPerson.role,
      channel: newPerson.channel,
      location: newPerson.location,
      territory: availableTerritories[0],
      status: 'active',
      hireDate: new Date().toISOString().split('T')[0],
    };
    setLocalPersonnelChanges(prev => ({
      ...prev,
      added: [...prev.added, person]
    }));
    setNewPerson({ name: '', email: '', role: '', channel: '', location: '' });
    setCreateModalOpen(false);
  };

  const handleTransfer = () => {
    // In a real app, this would update the backend
    // For demo, we just close the modal
    setTransferModalOpen(false);
    setTransferData({ territory: '', location: '', role: '', hierarchy: '' });
  };

  const handleDelete = (id: string) => {
    setLocalPersonnelChanges(prev => ({
      ...prev,
      deleted: [...prev.deleted, id]
    }));
  };

  const openTransferModal = (person: Personnel) => {
    setSelectedPerson(person);
    setTransferData({
      territory: person.territory,
      location: person.location,
      role: person.role,
      hierarchy: '',
    });
    setTransferModalOpen(true);
  };

  // Access denied view
  if (!canAccess) {
    return (
      <div className="p-6">
        <Card className="max-w-md mx-auto mt-12">
          <CardContent className="pt-6 text-center">
            <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-lg font-semibold mb-2">
              {isSpanish ? 'Acceso Restringido' : 'Access Restricted'}
            </h2>
            <p className="text-muted-foreground">
              {isSpanish
                ? 'No tienes permiso para ver esta página.'
                : 'You do not have permission to view this page.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Access Level Banner */}
      {dataAccessLevel === 'own' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2 dark:bg-blue-900/20 dark:border-blue-800">
          <Lock className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-700 dark:text-blue-400">
            {isSpanish
              ? 'Solo puedes ver tu propio perfil de personal.'
              : 'You can only view your own personnel profile.'}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            {isSpanish ? 'Gestión de Personal' : 'Personnel Management'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? 'Administra usuarios y asignaciones' : 'Manage users and assignments'}
          </p>
        </div>
        {isManagerOrAbove && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportModalOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              {isSpanish ? 'Importar CSV' : 'Import CSV'}
            </Button>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {isSpanish ? 'Nuevo Usuario' : 'New User'}
            </Button>
          </div>
        )}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isSpanish ? 'Buscar...' : 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Canal' : 'Channel'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos los canales' : 'All channels'}</SelectItem>
                {availableChannels.map(ch => (
                  <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Rol' : 'Role'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos los roles' : 'All roles'}</SelectItem>
                {availableRoles.map(role => (
                  <SelectItem key={role} value={role}>{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Ubicación' : 'Location'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todas las ubicaciones' : 'All locations'}</SelectItem>
                {availableLocations.map(loc => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Estado' : 'Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos' : 'All'}</SelectItem>
                <SelectItem value="active">{isSpanish ? 'Activo' : 'Active'}</SelectItem>
                <SelectItem value="inactive">{isSpanish ? 'Inactivo' : 'Inactive'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="text-sm text-muted-foreground">
        {isSpanish
          ? `Mostrando ${filteredPersonnel.length} de ${availablePersonnel.length} usuarios`
          : `Showing ${filteredPersonnel.length} of ${availablePersonnel.length} users`}
        {dataAccessLevel !== 'all' && (
          <span className="ml-2 text-blue-600">
            ({isSpanish ? 'vista limitada' : 'limited view'})
          </span>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isSpanish ? 'Nombre' : 'Name'}</TableHead>
                <TableHead>{isSpanish ? 'Rol' : 'Role'}</TableHead>
                <TableHead>{isSpanish ? 'Canal' : 'Channel'}</TableHead>
                <TableHead>{isSpanish ? 'Ubicación' : 'Location'}</TableHead>
                <TableHead>{isSpanish ? 'Territorio' : 'Territory'}</TableHead>
                <TableHead>{isSpanish ? 'Estado' : 'Status'}</TableHead>
                <TableHead className="text-right">{isSpanish ? 'Acciones' : 'Actions'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPersonnel.map(person => (
                <TableRow key={person.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{person.name}</p>
                      <p className="text-sm text-muted-foreground">{person.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{person.role}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{person.channel}</Badge>
                  </TableCell>
                  <TableCell>{person.location}</TableCell>
                  <TableCell>{person.territory}</TableCell>
                  <TableCell>
                    {person.status === 'active' ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {isSpanish ? 'Activo' : 'Active'}
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">
                        <XCircle className="h-3 w-3 mr-1" />
                        {isSpanish ? 'Inactivo' : 'Inactive'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openTransferModal(person)}>
                          <ArrowRightLeft className="h-4 w-4 mr-2" />
                          {isSpanish ? 'Transferir' : 'Transfer'}
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Edit className="h-4 w-4 mr-2" />
                          {isSpanish ? 'Editar' : 'Edit'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => handleDelete(person.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {isSpanish ? 'Eliminar' : 'Delete'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create User Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSpanish ? 'Crear Usuario' : 'Create User'}</DialogTitle>
            <DialogDescription>
              {isSpanish ? 'Ingresa los datos del nuevo usuario' : 'Enter new user details'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isSpanish ? 'Nombre' : 'Name'}</Label>
              <Input
                value={newPerson.name}
                onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
                placeholder={isSpanish ? 'Nombre completo' : 'Full name'}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newPerson.email}
                onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Rol' : 'Role'}</Label>
              <Select value={newPerson.role} onValueChange={(v) => setNewPerson({ ...newPerson, role: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isSpanish ? 'Seleccionar rol' : 'Select role'} />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map(role => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Canal' : 'Channel'}</Label>
              <Select value={newPerson.channel} onValueChange={(v) => setNewPerson({ ...newPerson, channel: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isSpanish ? 'Seleccionar canal' : 'Select channel'} />
                </SelectTrigger>
                <SelectContent>
                  {availableChannels.map(ch => (
                    <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Ubicación' : 'Location'}</Label>
              <Select value={newPerson.location} onValueChange={(v) => setNewPerson({ ...newPerson, location: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isSpanish ? 'Seleccionar ubicación' : 'Select location'} />
                </SelectTrigger>
                <SelectContent>
                  {availableLocations.map(loc => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleCreateUser}>
              <Save className="h-4 w-4 mr-2" />
              {isSpanish ? 'Crear Usuario' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Modal */}
      <Dialog open={transferModalOpen} onOpenChange={setTransferModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              {isSpanish ? 'Transferir Usuario' : 'Transfer User'}
            </DialogTitle>
            <DialogDescription>
              {selectedPerson?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isSpanish ? 'Territorio' : 'Territory'}</Label>
              <Select value={transferData.territory} onValueChange={(v) => setTransferData({ ...transferData, territory: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTerritories.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Ubicación (Tienda)' : 'Location (Store)'}</Label>
              <Select value={transferData.location} onValueChange={(v) => setTransferData({ ...transferData, location: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLocations.map(loc => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Puesto' : 'Job Title'}</Label>
              <Select value={transferData.role} onValueChange={(v) => setTransferData({ ...transferData, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map(role => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Jerarquía (Reporta a)' : 'Hierarchy (Reports to)'}</Label>
              <Select value={transferData.hierarchy} onValueChange={(v) => setTransferData({ ...transferData, hierarchy: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isSpanish ? 'Seleccionar supervisor' : 'Select supervisor'} />
                </SelectTrigger>
                <SelectContent>
                  {personnel.filter(p => p.id !== selectedPerson?.id && ['Supervisor', 'Gerente de Franquicia', 'Gerente Regional', 'Director'].includes(p.role)).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} - {p.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferModalOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleTransfer}>
              <Save className="h-4 w-4 mr-2" />
              {isSpanish ? 'Guardar Transferencia' : 'Save Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {isSpanish ? 'Importar Personal' : 'Import Personnel'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish ? 'Sube un archivo CSV con los datos del personal' : 'Upload a CSV file with personnel data'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-2">
                {isSpanish ? 'Arrastra un archivo aquí o' : 'Drag a file here or'}
              </p>
              <Button variant="outline" size="sm">
                {isSpanish ? 'Seleccionar archivo' : 'Select file'}
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">{isSpanish ? 'Formato esperado:' : 'Expected format:'}</p>
              <code className="text-xs bg-muted p-2 rounded block">
                name,email,role,channel,location
              </code>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportModalOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button disabled>
              <Upload className="h-4 w-4 mr-2" />
              {isSpanish ? 'Importar' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
