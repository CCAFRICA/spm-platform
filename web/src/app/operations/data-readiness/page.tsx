'use client';

import { useState } from 'react';
import {
  Database,
  FileSpreadsheet,
  Settings,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Plus,
  Save,
  X,
  Bell,
  Mail,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useTenant } from '@/contexts/tenant-context';

interface FileColumn {
  id: string;
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  required: boolean;
  validation?: string;
}

interface ExpectedFile {
  id: string;
  name: string;
  type: 'CSV' | 'Excel' | 'JSON';
  frequency: 'Daily' | 'Weekly' | 'Monthly';
  status: 'ready' | 'pending' | 'error' | 'overdue';
  lastReceived: string | null;
  columns: FileColumn[];
}

interface AlertConfig {
  id: string;
  fileId: string;
  recipients: string[];
  timing: 'immediate' | '1hour' | '4hours' | '24hours';
  includeDetails: boolean;
  includeSummary: boolean;
  includeErrorLog: boolean;
  frequency: 'every' | 'daily' | 'weekly';
}

const mockFiles: ExpectedFile[] = [
  {
    id: '1',
    name: 'cheques_diarios.csv',
    type: 'CSV',
    frequency: 'Daily',
    status: 'ready',
    lastReceived: '2024-12-15 06:00',
    columns: [
      { id: '1', name: 'numero_cheque', type: 'number', required: true },
      { id: '2', name: 'fecha', type: 'date', required: true },
      { id: '3', name: 'mesero_id', type: 'string', required: true },
      { id: '4', name: 'total_alimentos', type: 'number', required: true },
      { id: '5', name: 'total_bebidas', type: 'number', required: true },
      { id: '6', name: 'propina', type: 'number', required: false },
    ],
  },
  {
    id: '2',
    name: 'meseros_actualizacion.csv',
    type: 'CSV',
    frequency: 'Weekly',
    status: 'pending',
    lastReceived: '2024-12-08 08:00',
    columns: [
      { id: '1', name: 'mesero_id', type: 'string', required: true },
      { id: '2', name: 'nombre', type: 'string', required: true },
      { id: '3', name: 'franquicia_id', type: 'string', required: true },
      { id: '4', name: 'activo', type: 'boolean', required: true },
    ],
  },
  {
    id: '3',
    name: 'ventas_consolidado.xlsx',
    type: 'Excel',
    frequency: 'Monthly',
    status: 'ready',
    lastReceived: '2024-12-01 09:00',
    columns: [
      { id: '1', name: 'periodo', type: 'string', required: true },
      { id: '2', name: 'franquicia_id', type: 'string', required: true },
      { id: '3', name: 'ventas_totales', type: 'number', required: true },
      { id: '4', name: 'comisiones', type: 'number', required: true },
    ],
  },
  {
    id: '4',
    name: 'inventario.json',
    type: 'JSON',
    frequency: 'Daily',
    status: 'error',
    lastReceived: '2024-12-14 06:00',
    columns: [
      { id: '1', name: 'sku', type: 'string', required: true },
      { id: '2', name: 'producto', type: 'string', required: true },
      { id: '3', name: 'cantidad', type: 'number', required: true },
      { id: '4', name: 'ubicacion', type: 'string', required: true },
    ],
  },
  {
    id: '5',
    name: 'metas_equipo.csv',
    type: 'CSV',
    frequency: 'Monthly',
    status: 'overdue',
    lastReceived: '2024-11-01 08:00',
    columns: [
      { id: '1', name: 'equipo_id', type: 'string', required: true },
      { id: '2', name: 'meta_ventas', type: 'number', required: true },
      { id: '3', name: 'periodo', type: 'date', required: true },
    ],
  },
];

const mockAlertConfigs: AlertConfig[] = [
  {
    id: '1',
    fileId: '1',
    recipients: ['admin@restaurantmx.com', 'ops@restaurantmx.com'],
    timing: 'immediate',
    includeDetails: true,
    includeSummary: true,
    includeErrorLog: false,
    frequency: 'every',
  },
];

export default function DataReadinessPage() {
  const { currentTenant } = useTenant();
  const isSpanish = currentTenant?.locale === 'es-MX';

  const [files, setFiles] = useState<ExpectedFile[]>(mockFiles);
  const [alertConfigs, setAlertConfigs] = useState<AlertConfig[]>(mockAlertConfigs);
  const [schemaModalOpen, setSchemaModalOpen] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ExpectedFile | null>(null);
  const [editingColumns, setEditingColumns] = useState<FileColumn[]>([]);
  const [editingAlert, setEditingAlert] = useState<AlertConfig | null>(null);

  const getStatusBadge = (status: string) => {
    const configs = {
      ready: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: isSpanish ? 'Listo' : 'Ready' },
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: isSpanish ? 'Pendiente' : 'Pending' },
      error: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Error' },
      overdue: { color: 'bg-orange-100 text-orange-800', icon: AlertTriangle, label: isSpanish ? 'Vencido' : 'Overdue' },
    };
    const config = configs[status as keyof typeof configs];
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} hover:${config.color}`}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const openSchemaEditor = (file: ExpectedFile) => {
    setSelectedFile(file);
    setEditingColumns([...file.columns]);
    setSchemaModalOpen(true);
  };

  const openAlertConfig = (file: ExpectedFile) => {
    setSelectedFile(file);
    const existingAlert = alertConfigs.find(a => a.fileId === file.id);
    setEditingAlert(existingAlert || {
      id: '',
      fileId: file.id,
      recipients: [],
      timing: 'immediate',
      includeDetails: true,
      includeSummary: true,
      includeErrorLog: false,
      frequency: 'every',
    });
    setAlertModalOpen(true);
  };

  const addColumn = () => {
    const newColumn: FileColumn = {
      id: `new-${Date.now()}`,
      name: '',
      type: 'string',
      required: false,
    };
    setEditingColumns([...editingColumns, newColumn]);
  };

  const removeColumn = (id: string) => {
    setEditingColumns(editingColumns.filter(c => c.id !== id));
  };

  const updateColumn = (id: string, field: keyof FileColumn, value: string | boolean) => {
    setEditingColumns(editingColumns.map(c =>
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const saveSchema = () => {
    if (selectedFile) {
      setFiles(files.map(f =>
        f.id === selectedFile.id ? { ...f, columns: editingColumns } : f
      ));
    }
    setSchemaModalOpen(false);
  };

  const saveAlertConfig = () => {
    if (editingAlert && selectedFile) {
      if (editingAlert.id) {
        setAlertConfigs(alertConfigs.map(a =>
          a.id === editingAlert.id ? editingAlert : a
        ));
      } else {
        setAlertConfigs([...alertConfigs, { ...editingAlert, id: `alert-${Date.now()}` }]);
      }
    }
    setAlertModalOpen(false);
  };

  const readyCount = files.filter(f => f.status === 'ready').length;
  const pendingCount = files.filter(f => f.status === 'pending').length;
  const errorCount = files.filter(f => f.status === 'error' || f.status === 'overdue').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          {isSpanish ? 'Preparación de Datos' : 'Data Readiness'}
        </h1>
        <p className="text-muted-foreground">
          {isSpanish ? 'Configura y monitorea archivos de datos esperados' : 'Configure and monitor expected data files'}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{readyCount}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Archivos listos' : 'Files ready'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 rounded-full">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Pendientes' : 'Pending'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{errorCount}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Requieren atención' : 'Need attention'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Files Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {isSpanish ? 'Archivos Esperados' : 'Expected Files'}
          </CardTitle>
          <CardDescription>
            {isSpanish ? 'Lista de archivos de datos configurados para importación' : 'Configured data files for import'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isSpanish ? 'Nombre' : 'Name'}</TableHead>
                <TableHead>{isSpanish ? 'Tipo' : 'Type'}</TableHead>
                <TableHead>{isSpanish ? 'Frecuencia' : 'Frequency'}</TableHead>
                <TableHead>{isSpanish ? 'Estado' : 'Status'}</TableHead>
                <TableHead>{isSpanish ? 'Última Recepción' : 'Last Received'}</TableHead>
                <TableHead className="text-right">{isSpanish ? 'Acciones' : 'Actions'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map(file => (
                <TableRow key={file.id}>
                  <TableCell className="font-medium font-mono">{file.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{file.type}</Badge>
                  </TableCell>
                  <TableCell>
                    {isSpanish
                      ? file.frequency === 'Daily' ? 'Diario' : file.frequency === 'Weekly' ? 'Semanal' : 'Mensual'
                      : file.frequency}
                  </TableCell>
                  <TableCell>{getStatusBadge(file.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {file.lastReceived || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openSchemaEditor(file)}>
                        <Settings className="h-4 w-4 mr-1" />
                        {isSpanish ? 'Esquema' : 'Schema'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openAlertConfig(file)}>
                        <Bell className="h-4 w-4 mr-1" />
                        {isSpanish ? 'Alertas' : 'Alerts'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Schema Editor Modal */}
      <Dialog open={schemaModalOpen} onOpenChange={setSchemaModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {isSpanish ? 'Editor de Esquema' : 'Schema Editor'}: {selectedFile?.name}
            </DialogTitle>
            <DialogDescription>
              {isSpanish ? 'Define las columnas y validaciones del archivo' : 'Define file columns and validations'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isSpanish ? 'Columna' : 'Column'}</TableHead>
                  <TableHead>{isSpanish ? 'Tipo' : 'Type'}</TableHead>
                  <TableHead>{isSpanish ? 'Requerido' : 'Required'}</TableHead>
                  <TableHead>{isSpanish ? 'Validación' : 'Validation'}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editingColumns.map(col => (
                  <TableRow key={col.id}>
                    <TableCell>
                      <Input
                        value={col.name}
                        onChange={(e) => updateColumn(col.id, 'name', e.target.value)}
                        placeholder={isSpanish ? 'nombre_columna' : 'column_name'}
                        className="font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={col.type}
                        onValueChange={(v) => updateColumn(col.id, 'type', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="string">String</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={col.required}
                        onCheckedChange={(v) => updateColumn(col.id, 'required', !!v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={col.validation || ''}
                        onChange={(e) => updateColumn(col.id, 'validation', e.target.value)}
                        placeholder={isSpanish ? 'regex o regla' : 'regex or rule'}
                        className="text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeColumn(col.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Button variant="outline" onClick={addColumn}>
              <Plus className="h-4 w-4 mr-2" />
              {isSpanish ? 'Agregar Columna' : 'Add Column'}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSchemaModalOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={saveSchema}>
              <Save className="h-4 w-4 mr-2" />
              {isSpanish ? 'Guardar Esquema' : 'Save Schema'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Config Modal */}
      <Dialog open={alertModalOpen} onOpenChange={setAlertModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              {isSpanish ? 'Configuración de Alertas' : 'Alert Configuration'}: {selectedFile?.name}
            </DialogTitle>
            <DialogDescription>
              {isSpanish ? 'Configura notificaciones para este archivo' : 'Configure notifications for this file'}
            </DialogDescription>
          </DialogHeader>

          {editingAlert && (
            <div className="space-y-6">
              {/* Recipients */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {isSpanish ? 'Destinatarios' : 'Recipients'}
                </Label>
                <Input
                  value={editingAlert.recipients.join(', ')}
                  onChange={(e) => setEditingAlert({
                    ...editingAlert,
                    recipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  })}
                  placeholder="email1@example.com, email2@example.com"
                />
              </div>

              {/* Timing */}
              <div className="space-y-2">
                <Label>{isSpanish ? 'Tiempo de Notificación' : 'Notification Timing'}</Label>
                <Select
                  value={editingAlert.timing}
                  onValueChange={(v) => setEditingAlert({ ...editingAlert, timing: v as AlertConfig['timing'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">{isSpanish ? 'Inmediato' : 'Immediate'}</SelectItem>
                    <SelectItem value="1hour">{isSpanish ? '1 hora después' : '1 hour after'}</SelectItem>
                    <SelectItem value="4hours">{isSpanish ? '4 horas después' : '4 hours after'}</SelectItem>
                    <SelectItem value="24hours">{isSpanish ? '24 horas después' : '24 hours after'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Content */}
              <div className="space-y-3">
                <Label>{isSpanish ? 'Contenido de Alerta' : 'Alert Content'}</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="details"
                      checked={editingAlert.includeDetails}
                      onCheckedChange={(v) => setEditingAlert({ ...editingAlert, includeDetails: !!v })}
                    />
                    <Label htmlFor="details" className="cursor-pointer">
                      {isSpanish ? 'Incluir detalles del error' : 'Include error details'}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="summary"
                      checked={editingAlert.includeSummary}
                      onCheckedChange={(v) => setEditingAlert({ ...editingAlert, includeSummary: !!v })}
                    />
                    <Label htmlFor="summary" className="cursor-pointer">
                      {isSpanish ? 'Incluir resumen de datos' : 'Include data summary'}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="errorlog"
                      checked={editingAlert.includeErrorLog}
                      onCheckedChange={(v) => setEditingAlert({ ...editingAlert, includeErrorLog: !!v })}
                    />
                    <Label htmlFor="errorlog" className="cursor-pointer">
                      {isSpanish ? 'Incluir log de errores' : 'Include error log'}
                    </Label>
                  </div>
                </div>
              </div>

              {/* Frequency */}
              <div className="space-y-2">
                <Label>{isSpanish ? 'Frecuencia de Alerta' : 'Alert Frequency'}</Label>
                <Select
                  value={editingAlert.frequency}
                  onValueChange={(v) => setEditingAlert({ ...editingAlert, frequency: v as AlertConfig['frequency'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="every">{isSpanish ? 'Cada ocurrencia' : 'Every occurrence'}</SelectItem>
                    <SelectItem value="daily">{isSpanish ? 'Resumen diario' : 'Daily digest'}</SelectItem>
                    <SelectItem value="weekly">{isSpanish ? 'Resumen semanal' : 'Weekly digest'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertModalOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={saveAlertConfig}>
              <Save className="h-4 w-4 mr-2" />
              {isSpanish ? 'Guardar Configuración' : 'Save Configuration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
