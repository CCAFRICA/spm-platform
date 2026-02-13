'use client';

import { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  MapPin,
  Save,
  CheckCircle,
  XCircle,
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
import { useTerm } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';

interface Location {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  region: string;
  type: string;
  manager: string;
  status: 'active' | 'inactive';
}

const mockLocations: Location[] = [
  { id: '1', code: 'MX-001', name: 'Centro Histórico', city: 'Ciudad de México', state: 'CDMX', region: 'Central', type: 'Premium', manager: 'María García', status: 'active' },
  { id: '2', code: 'MX-002', name: 'Polanco', city: 'Ciudad de México', state: 'CDMX', region: 'Central', type: 'Premium', manager: 'Carlos López', status: 'active' },
  { id: '3', code: 'MX-003', name: 'Santa Fe', city: 'Ciudad de México', state: 'CDMX', region: 'West', type: 'Standard', manager: 'Ana Martínez', status: 'active' },
  { id: '4', code: 'MX-004', name: 'Condesa', city: 'Ciudad de México', state: 'CDMX', region: 'Central', type: 'Premium', manager: 'Roberto Hernández', status: 'active' },
  { id: '5', code: 'GDL-001', name: 'Guadalajara Centro', city: 'Guadalajara', state: 'Jalisco', region: 'West', type: 'Standard', manager: 'Laura Sánchez', status: 'active' },
  { id: '6', code: 'GDL-002', name: 'Zapopan', city: 'Zapopan', state: 'Jalisco', region: 'West', type: 'Standard', manager: 'Miguel Torres', status: 'inactive' },
  { id: '7', code: 'MTY-001', name: 'Monterrey Centro', city: 'Monterrey', state: 'Nuevo León', region: 'North', type: 'Premium', manager: 'Patricia Ruiz', status: 'active' },
  { id: '8', code: 'MTY-002', name: 'San Pedro', city: 'San Pedro Garza García', state: 'Nuevo León', region: 'North', type: 'Premium', manager: 'Fernando Díaz', status: 'active' },
];

const regions = ['Central', 'West', 'North', 'South', 'East'];
const types = ['Premium', 'Standard'];
const states = ['CDMX', 'Jalisco', 'Nuevo León', 'Puebla', 'Querétaro'];

export default function ConfigurationLocationsPage() {
  const { locale } = useLocale();
  const locationTerm = useTerm('location');
  const locationPluralTerm = useTerm('location', true);
  const isSpanish = locale === 'es-MX';

  const [locations, setLocations] = useState<Location[]>(mockLocations);
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    city: '',
    state: '',
    region: '',
    type: '',
    manager: '',
  });

  const filteredLocations = useMemo(() => {
    return locations.filter(location => {
      const matchesSearch = !searchTerm ||
        location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        location.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        location.city.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRegion = regionFilter === 'all' || location.region === regionFilter;
      const matchesType = typeFilter === 'all' || location.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || location.status === statusFilter;

      return matchesSearch && matchesRegion && matchesType && matchesStatus;
    });
  }, [locations, searchTerm, regionFilter, typeFilter, statusFilter]);

  const openCreateModal = () => {
    setEditingLocation(null);
    setFormData({ code: '', name: '', city: '', state: '', region: '', type: '', manager: '' });
    setModalOpen(true);
  };

  const openEditModal = (location: Location) => {
    setEditingLocation(location);
    setFormData({
      code: location.code,
      name: location.name,
      city: location.city,
      state: location.state,
      region: location.region,
      type: location.type,
      manager: location.manager,
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (editingLocation) {
      setLocations(locations.map(l =>
        l.id === editingLocation.id ? { ...l, ...formData } : l
      ));
    } else {
      const newLocation: Location = {
        id: `new-${Date.now()}`,
        ...formData,
        status: 'active',
      };
      setLocations([...locations, newLocation]);
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setLocations(locations.filter(l => l.id !== id));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            {isSpanish ? `Configuración de ${locationPluralTerm}` : `${locationPluralTerm} Configuration`}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? `Administra las ${locationPluralTerm.toLowerCase()} de tu organización` : `Manage your organization's ${locationPluralTerm.toLowerCase()}`}
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" />
          {isSpanish ? `Nueva ${locationTerm}` : `New ${locationTerm}`}
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isSpanish ? 'Buscar...' : 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Región' : 'Region'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todas las regiones' : 'All regions'}</SelectItem>
                {regions.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Tipo' : 'Type'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos los tipos' : 'All types'}</SelectItem>
                {types.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
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
          ? `Mostrando ${filteredLocations.length} de ${locations.length} ${locationPluralTerm.toLowerCase()}`
          : `Showing ${filteredLocations.length} of ${locations.length} ${locationPluralTerm.toLowerCase()}`}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isSpanish ? 'Código' : 'Code'}</TableHead>
                <TableHead>{isSpanish ? 'Nombre' : 'Name'}</TableHead>
                <TableHead>{isSpanish ? 'Ciudad' : 'City'}</TableHead>
                <TableHead>{isSpanish ? 'Región' : 'Region'}</TableHead>
                <TableHead>{isSpanish ? 'Tipo' : 'Type'}</TableHead>
                <TableHead>{isSpanish ? 'Gerente' : 'Manager'}</TableHead>
                <TableHead>{isSpanish ? 'Estado' : 'Status'}</TableHead>
                <TableHead className="text-right">{isSpanish ? 'Acciones' : 'Actions'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLocations.map(location => (
                <TableRow key={location.id}>
                  <TableCell className="font-mono text-sm">{location.code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{location.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{location.city}, {location.state}</TableCell>
                  <TableCell>{location.region}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{location.type}</Badge>
                  </TableCell>
                  <TableCell>{location.manager}</TableCell>
                  <TableCell>
                    {location.status === 'active' ? (
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
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(location)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(location.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLocation
                ? (isSpanish ? `Editar ${locationTerm}` : `Edit ${locationTerm}`)
                : (isSpanish ? `Nueva ${locationTerm}` : `New ${locationTerm}`)}
            </DialogTitle>
            <DialogDescription>
              {isSpanish ? `Ingresa los datos de la ${locationTerm.toLowerCase()}` : `Enter ${locationTerm.toLowerCase()} details`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isSpanish ? 'Código' : 'Code'}</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="MX-001"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>{isSpanish ? 'Tipo' : 'Type'}</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={isSpanish ? 'Seleccionar' : 'Select'} />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Nombre' : 'Name'}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isSpanish ? 'Nombre de la ubicación' : 'Location name'}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isSpanish ? 'Ciudad' : 'City'}</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder={isSpanish ? 'Ciudad' : 'City'}
                />
              </div>
              <div className="space-y-2">
                <Label>{isSpanish ? 'Estado' : 'State'}</Label>
                <Select value={formData.state} onValueChange={(v) => setFormData({ ...formData, state: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={isSpanish ? 'Seleccionar' : 'Select'} />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isSpanish ? 'Región' : 'Region'}</Label>
                <Select value={formData.region} onValueChange={(v) => setFormData({ ...formData, region: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={isSpanish ? 'Seleccionar' : 'Select'} />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isSpanish ? 'Gerente' : 'Manager'}</Label>
                <Input
                  value={formData.manager}
                  onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                  placeholder={isSpanish ? 'Nombre del gerente' : 'Manager name'}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              {isSpanish ? 'Guardar' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
