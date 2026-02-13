'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Plus, Clock, CheckCircle, AlertCircle, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTerm } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { pageVariants } from '@/lib/animations';
import { TableSkeleton } from '@/components/ui/skeleton-loaders';

// Mock inquiries data
const mockInquiries = [
  { id: 'INQ-001', transactionId: 'TXN-001', subject: 'Commission calculation question', status: 'open', priority: 'medium', createdAt: '2024-12-14', updatedAt: '2024-12-15' },
  { id: 'INQ-002', transactionId: 'TXN-003', subject: 'Missing bonus payment', status: 'in_progress', priority: 'high', createdAt: '2024-12-13', updatedAt: '2024-12-14' },
  { id: 'INQ-003', transactionId: 'TXN-005', subject: 'Deal attribution dispute', status: 'resolved', priority: 'medium', createdAt: '2024-12-10', updatedAt: '2024-12-12' },
  { id: 'INQ-004', transactionId: 'TXN-002', subject: 'Request for payment breakdown', status: 'open', priority: 'low', createdAt: '2024-12-12', updatedAt: '2024-12-12' },
  { id: 'INQ-005', transactionId: 'TXN-007', subject: 'Accelerator tier question', status: 'resolved', priority: 'medium', createdAt: '2024-12-08', updatedAt: '2024-12-11' },
];

export default function InquiriesPage() {
  const transactionTerm = useTerm('transaction');
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const [inquiries, setInquiries] = useState(mockInquiries);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newInquiry, setNewInquiry] = useState({ transactionId: '', subject: '', description: '' });

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const filteredInquiries = statusFilter === 'all'
    ? inquiries
    : inquiries.filter(inq => inq.status === statusFilter);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      open: { variant: 'secondary', icon: <AlertCircle className="h-3 w-3 mr-1" /> },
      in_progress: { variant: 'default', icon: <Clock className="h-3 w-3 mr-1" /> },
      resolved: { variant: 'outline', icon: <CheckCircle className="h-3 w-3 mr-1" /> },
    };
    const statusLabels: Record<string, { en: string; es: string }> = {
      open: { en: 'Open', es: 'Abierto' },
      in_progress: { en: 'In Progress', es: 'En Progreso' },
      resolved: { en: 'Resolved', es: 'Resuelto' },
    };
    const { variant, icon } = config[status] || { variant: 'outline', icon: null };
    const label = statusLabels[status] || { en: status, es: status };
    return (
      <Badge variant={variant} className="flex items-center w-fit">
        {icon}
        {isSpanish ? label.es : label.en}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    };
    const priorityLabels: Record<string, { en: string; es: string }> = {
      high: { en: 'High', es: 'Alta' },
      medium: { en: 'Medium', es: 'Media' },
      low: { en: 'Low', es: 'Baja' },
    };
    const label = priorityLabels[priority] || { en: priority, es: priority };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[priority]}`}>
        {isSpanish ? label.es : label.en}
      </span>
    );
  };

  const handleSubmitInquiry = () => {
    const newId = `INQ-${String(inquiries.length + 1).padStart(3, '0')}`;
    const inquiry = {
      id: newId,
      ...newInquiry,
      status: 'open',
      priority: 'medium',
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    };
    setInquiries([inquiry, ...inquiries]);
    setNewInquiry({ transactionId: '', subject: '', description: '' });
    setIsDialogOpen(false);
  };

  const openCount = inquiries.filter(i => i.status === 'open').length;
  const inProgressCount = inquiries.filter(i => i.status === 'in_progress').length;

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            {isSpanish ? 'Consultas' : 'Inquiries'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? `Disputas y preguntas sobre ${transactionTerm.toLowerCase()}` : `${transactionTerm} disputes and questions`}
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {isSpanish ? 'Nueva Consulta' : 'New Inquiry'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Abiertas' : 'Open'}</p>
                <p className="text-2xl font-bold">{openCount}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'En Progreso' : 'In Progress'}</p>
                <p className="text-2xl font-bold">{inProgressCount}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Total' : 'Total'}</p>
                <p className="text-2xl font-bold">{inquiries.length}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={isSpanish ? 'Filtrar por estado' : 'Filter by status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos' : 'All Status'}</SelectItem>
                <SelectItem value="open">{isSpanish ? 'Abierto' : 'Open'}</SelectItem>
                <SelectItem value="in_progress">{isSpanish ? 'En Progreso' : 'In Progress'}</SelectItem>
                <SelectItem value="resolved">{isSpanish ? 'Resuelto' : 'Resolved'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : filteredInquiries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {isSpanish ? 'No se encontraron consultas' : 'No inquiries found'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{transactionTerm} #</TableHead>
                  <TableHead>{isSpanish ? 'Asunto' : 'Subject'}</TableHead>
                  <TableHead>{isSpanish ? 'Prioridad' : 'Priority'}</TableHead>
                  <TableHead>{isSpanish ? 'Estado' : 'Status'}</TableHead>
                  <TableHead>{isSpanish ? 'Actualizado' : 'Updated'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInquiries.map((inq) => (
                  <TableRow key={inq.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-mono font-medium">{inq.id}</TableCell>
                    <TableCell className="font-mono">{inq.transactionId}</TableCell>
                    <TableCell>{inq.subject}</TableCell>
                    <TableCell>{getPriorityBadge(inq.priority)}</TableCell>
                    <TableCell>{getStatusBadge(inq.status)}</TableCell>
                    <TableCell className="text-muted-foreground">{inq.updatedAt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Inquiry Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSpanish ? 'Enviar Nueva Consulta' : 'Submit New Inquiry'}</DialogTitle>
            <DialogDescription>
              {isSpanish
                ? `¿Tienes una pregunta sobre un ${transactionTerm.toLowerCase()}? Envía una consulta y nuestro equipo responderá.`
                : `Have a question about a ${transactionTerm.toLowerCase()}? Submit an inquiry and our team will respond.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="transactionId">{transactionTerm} ID</Label>
              <Input
                id="transactionId"
                placeholder={isSpanish ? 'ej., CHQ-10001' : 'e.g., TXN-001'}
                value={newInquiry.transactionId}
                onChange={(e) => setNewInquiry({ ...newInquiry, transactionId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">{isSpanish ? 'Asunto' : 'Subject'}</Label>
              <Input
                id="subject"
                placeholder={isSpanish ? 'Breve descripción de tu consulta' : 'Brief description of your inquiry'}
                value={newInquiry.subject}
                onChange={(e) => setNewInquiry({ ...newInquiry, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{isSpanish ? 'Descripción' : 'Description'}</Label>
              <Textarea
                id="description"
                placeholder={isSpanish ? 'Proporciona más detalles sobre tu consulta...' : 'Provide more details about your inquiry...'}
                rows={4}
                value={newInquiry.description}
                onChange={(e) => setNewInquiry({ ...newInquiry, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleSubmitInquiry} disabled={!newInquiry.transactionId || !newInquiry.subject}>
              {isSpanish ? 'Enviar Consulta' : 'Submit Inquiry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
