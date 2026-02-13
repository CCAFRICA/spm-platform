'use client';

import { useState, useMemo } from 'react';
import {
  Users2,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  UserPlus,
  UserMinus,
  Save,
  ChevronDown,
  ChevronRight,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { useLocale } from '@/contexts/locale-context';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
}

interface Team {
  id: string;
  name: string;
  description: string;
  channel: string;
  region: string;
  leaderId: string;
  leaderName: string;
  members: TeamMember[];
  status: 'active' | 'inactive';
}

const mockTeams: Team[] = [
  {
    id: '1',
    name: 'Equipo CDMX Norte',
    description: 'Franquicias zona norte de Ciudad de México',
    channel: 'Dine-in',
    region: 'CDMX',
    leaderId: '1',
    leaderName: 'María García',
    members: [
      { id: '2', name: 'Carlos López', role: 'Mesero', email: 'carlos@restaurantmx.com' },
      { id: '3', name: 'Ana Martínez', role: 'Gerente de Franquicia', email: 'ana@restaurantmx.com' },
      { id: '4', name: 'Pedro Ramírez', role: 'Mesero', email: 'pedro@restaurantmx.com' },
    ],
    status: 'active',
  },
  {
    id: '2',
    name: 'Equipo Guadalajara',
    description: 'Todas las franquicias de Guadalajara',
    channel: 'Dine-in',
    region: 'Jalisco',
    leaderId: '5',
    leaderName: 'Roberto Hernández',
    members: [
      { id: '6', name: 'Laura Sánchez', role: 'Mesero', email: 'laura@restaurantmx.com' },
      { id: '7', name: 'Miguel Torres', role: 'Mesero', email: 'miguel@restaurantmx.com' },
    ],
    status: 'active',
  },
  {
    id: '3',
    name: 'Equipo Delivery Nacional',
    description: 'Operaciones de delivery en todo el país',
    channel: 'Delivery',
    region: 'Nacional',
    leaderId: '8',
    leaderName: 'Patricia Ruiz',
    members: [
      { id: '9', name: 'Fernando Díaz', role: 'Coordinador', email: 'fernando@restaurantmx.com' },
      { id: '10', name: 'Carmen Flores', role: 'Operador', email: 'carmen@restaurantmx.com' },
      { id: '11', name: 'José Morales', role: 'Operador', email: 'jose@restaurantmx.com' },
      { id: '12', name: 'Elena Vega', role: 'Operador', email: 'elena@restaurantmx.com' },
    ],
    status: 'active',
  },
  {
    id: '4',
    name: 'Equipo Monterrey',
    description: 'Franquicias de Monterrey y área metropolitana',
    channel: 'Dine-in',
    region: 'Nuevo León',
    leaderId: '13',
    leaderName: 'Diego Salazar',
    members: [
      { id: '14', name: 'Sofía Reyes', role: 'Mesero', email: 'sofia@restaurantmx.com' },
    ],
    status: 'inactive',
  },
];

const availableMembers: TeamMember[] = [
  { id: '15', name: 'Ricardo Luna', role: 'Mesero', email: 'ricardo@restaurantmx.com' },
  { id: '16', name: 'Gabriela Mendez', role: 'Mesero', email: 'gabriela@restaurantmx.com' },
  { id: '17', name: 'Arturo Castro', role: 'Supervisor', email: 'arturo@restaurantmx.com' },
  { id: '18', name: 'Daniela Ortiz', role: 'Mesero', email: 'daniela@restaurantmx.com' },
];

const channels = ['Dine-in', 'Delivery', 'Takeout'];
const regions = ['CDMX', 'Jalisco', 'Nuevo León', 'Puebla', 'Nacional'];

export default function TeamsPage() {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [teams, setTeams] = useState<Team[]>(mockTeams);
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

  const [newTeam, setNewTeam] = useState({
    name: '',
    description: '',
    channel: '',
    region: '',
    leaderName: '',
  });

  const filteredTeams = useMemo(() => {
    return teams.filter(team => {
      const matchesSearch = !searchTerm ||
        team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.leaderName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesChannel = channelFilter === 'all' || team.channel === channelFilter;
      const matchesRegion = regionFilter === 'all' || team.region === regionFilter;
      const matchesStatus = statusFilter === 'all' || team.status === statusFilter;

      return matchesSearch && matchesChannel && matchesRegion && matchesStatus;
    });
  }, [teams, searchTerm, channelFilter, regionFilter, statusFilter]);

  const toggleTeam = (id: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedTeams(newExpanded);
  };

  const handleCreateTeam = () => {
    const team: Team = {
      id: `new-${Date.now()}`,
      name: newTeam.name,
      description: newTeam.description,
      channel: newTeam.channel,
      region: newTeam.region,
      leaderId: '',
      leaderName: newTeam.leaderName,
      members: [],
      status: 'active',
    };
    setTeams([...teams, team]);
    setNewTeam({ name: '', description: '', channel: '', region: '', leaderName: '' });
    setCreateModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setTeams(teams.filter(t => t.id !== id));
  };

  const openMembersModal = (team: Team) => {
    setSelectedTeam(team);
    setSelectedMembers(new Set(team.members.map(m => m.id)));
    setMembersModalOpen(true);
  };

  const toggleMemberSelection = (memberId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMembers(newSelected);
  };

  const saveMembers = () => {
    if (selectedTeam) {
      const allMembers = [...selectedTeam.members, ...availableMembers];
      const newMembers = allMembers.filter(m => selectedMembers.has(m.id));
      setTeams(teams.map(t =>
        t.id === selectedTeam.id ? { ...t, members: newMembers } : t
      ));
    }
    setMembersModalOpen(false);
  };

  const removeMember = (teamId: string, memberId: string) => {
    setTeams(teams.map(t =>
      t.id === teamId ? { ...t, members: t.members.filter(m => m.id !== memberId) } : t
    ));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users2 className="h-6 w-6 text-primary" />
            {isSpanish ? 'Gestión de Equipos' : 'Team Management'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? 'Organiza y administra equipos de trabajo' : 'Organize and manage work teams'}
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {isSpanish ? 'Nuevo Equipo' : 'New Team'}
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
                placeholder={isSpanish ? 'Buscar equipo...' : 'Search team...'}
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
                {channels.map(ch => (
                  <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          ? `Mostrando ${filteredTeams.length} de ${teams.length} equipos`
          : `Showing ${filteredTeams.length} of ${teams.length} teams`}
      </div>

      {/* Teams Table */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>{isSpanish ? 'Equipo' : 'Team'}</TableHead>
                <TableHead>{isSpanish ? 'Líder' : 'Leader'}</TableHead>
                <TableHead>{isSpanish ? 'Canal' : 'Channel'}</TableHead>
                <TableHead>{isSpanish ? 'Región' : 'Region'}</TableHead>
                <TableHead>{isSpanish ? 'Miembros' : 'Members'}</TableHead>
                <TableHead>{isSpanish ? 'Estado' : 'Status'}</TableHead>
                <TableHead className="text-right">{isSpanish ? 'Acciones' : 'Actions'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeams.map(team => (
                <Collapsible key={team.id} asChild open={expandedTeams.has(team.id)}>
                  <>
                    <TableRow className="cursor-pointer hover:bg-muted/50">
                      <TableCell onClick={() => toggleTeam(team.id)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="p-0 h-6 w-6">
                            {expandedTeams.has(team.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </TableCell>
                      <TableCell onClick={() => toggleTeam(team.id)}>
                        <div>
                          <p className="font-medium">{team.name}</p>
                          <p className="text-sm text-muted-foreground">{team.description}</p>
                        </div>
                      </TableCell>
                      <TableCell>{team.leaderName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{team.channel}</Badge>
                      </TableCell>
                      <TableCell>{team.region}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{team.members.length}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={team.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                          {team.status === 'active' ? (isSpanish ? 'Activo' : 'Active') : (isSpanish ? 'Inactivo' : 'Inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openMembersModal(team)}>
                              <UserPlus className="h-4 w-4 mr-2" />
                              {isSpanish ? 'Gestionar Miembros' : 'Manage Members'}
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="h-4 w-4 mr-2" />
                              {isSpanish ? 'Editar' : 'Edit'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDelete(team.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {isSpanish ? 'Eliminar' : 'Delete'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={8} className="p-0">
                          <div className="p-4">
                            <p className="text-sm font-medium mb-3">
                              {isSpanish ? 'Miembros del equipo:' : 'Team members:'}
                            </p>
                            {team.members.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                {isSpanish ? 'No hay miembros asignados' : 'No members assigned'}
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {team.members.map(member => (
                                  <div key={member.id} className="flex items-center justify-between bg-background rounded p-2">
                                    <div>
                                      <p className="text-sm font-medium">{member.name}</p>
                                      <p className="text-xs text-muted-foreground">{member.role}</p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeMember(team.id, member.id)}
                                      className="text-red-600 hover:text-red-700"
                                    >
                                      <UserMinus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
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

      {/* Create Team Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSpanish ? 'Crear Equipo' : 'Create Team'}</DialogTitle>
            <DialogDescription>
              {isSpanish ? 'Ingresa los datos del nuevo equipo' : 'Enter new team details'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isSpanish ? 'Nombre del Equipo' : 'Team Name'}</Label>
              <Input
                value={newTeam.name}
                onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                placeholder={isSpanish ? 'Nombre del equipo' : 'Team name'}
              />
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Descripción' : 'Description'}</Label>
              <Input
                value={newTeam.description}
                onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                placeholder={isSpanish ? 'Descripción breve' : 'Brief description'}
              />
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Líder del Equipo' : 'Team Leader'}</Label>
              <Input
                value={newTeam.leaderName}
                onChange={(e) => setNewTeam({ ...newTeam, leaderName: e.target.value })}
                placeholder={isSpanish ? 'Nombre del líder' : 'Leader name'}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isSpanish ? 'Canal' : 'Channel'}</Label>
                <Select value={newTeam.channel} onValueChange={(v) => setNewTeam({ ...newTeam, channel: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={isSpanish ? 'Seleccionar' : 'Select'} />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map(ch => (
                      <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isSpanish ? 'Región' : 'Region'}</Label>
                <Select value={newTeam.region} onValueChange={(v) => setNewTeam({ ...newTeam, region: v })}>
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleCreateTeam}>
              <Save className="h-4 w-4 mr-2" />
              {isSpanish ? 'Crear Equipo' : 'Create Team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Members Modal */}
      <Dialog open={membersModalOpen} onOpenChange={setMembersModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {isSpanish ? 'Gestionar Miembros' : 'Manage Members'}
            </DialogTitle>
            <DialogDescription>
              {selectedTeam?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <p className="text-sm font-medium">{isSpanish ? 'Miembros actuales:' : 'Current members:'}</p>
            {selectedTeam?.members.map(member => (
              <div key={member.id} className="flex items-center space-x-3 p-2 rounded hover:bg-muted">
                <Checkbox
                  checked={selectedMembers.has(member.id)}
                  onCheckedChange={() => toggleMemberSelection(member.id)}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.role} - {member.email}</p>
                </div>
              </div>
            ))}

            <p className="text-sm font-medium pt-4 border-t">{isSpanish ? 'Disponibles para agregar:' : 'Available to add:'}</p>
            {availableMembers.map(member => (
              <div key={member.id} className="flex items-center space-x-3 p-2 rounded hover:bg-muted">
                <Checkbox
                  checked={selectedMembers.has(member.id)}
                  onCheckedChange={() => toggleMemberSelection(member.id)}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.role} - {member.email}</p>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersModalOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={saveMembers}>
              <Save className="h-4 w-4 mr-2" />
              {isSpanish ? 'Guardar Cambios' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
