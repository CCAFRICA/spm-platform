'use client';

import { useState } from 'react';
import {
  MessageSquare,
  Send,
  User,
  Users,
  Building2,
  MapPin,
  Calendar,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';

type RecipientType = 'individual' | 'team' | 'channel' | 'location';
type LocationType = 'store' | 'city' | 'state';
type ScheduleType = 'immediate' | 'scheduled';

interface RecentMessage {
  id: string;
  subject: string;
  recipientType: RecipientType;
  recipientName: string;
  sentAt: string;
  status: 'sent' | 'scheduled' | 'failed';
}

// Mock data for selections
const mockIndividuals = [
  { id: '1', name: 'María García', role: 'Gerente Regional' },
  { id: '2', name: 'Carlos López', role: 'Mesero' },
  { id: '3', name: 'Ana Martínez', role: 'Gerente de Franquicia' },
  { id: '4', name: 'Roberto Hernández', role: 'Supervisor' },
];

const mockTeams = [
  { id: '1', name: 'Equipo CDMX Norte', members: 12 },
  { id: '2', name: 'Equipo Guadalajara', members: 8 },
  { id: '3', name: 'Equipo Monterrey', members: 10 },
  { id: '4', name: 'Supervisores Nacionales', members: 5 },
];

const mockChannels = [
  { id: '1', name: 'Dine-in', count: 45 },
  { id: '2', name: 'Delivery', count: 22 },
  { id: '3', name: 'Takeout', count: 18 },
];

const mockStores = [
  { id: '1', name: 'Centro Histórico' },
  { id: '2', name: 'Polanco' },
  { id: '3', name: 'Santa Fe' },
  { id: '4', name: 'Condesa' },
];

const mockCities = [
  { id: '1', name: 'Ciudad de México', stores: 15 },
  { id: '2', name: 'Guadalajara', stores: 8 },
  { id: '3', name: 'Monterrey', stores: 6 },
  { id: '4', name: 'Puebla', stores: 4 },
];

const mockStates = [
  { id: '1', name: 'CDMX', stores: 15 },
  { id: '2', name: 'Jalisco', stores: 10 },
  { id: '3', name: 'Nuevo León', stores: 8 },
  { id: '4', name: 'Puebla', stores: 4 },
];

const recentMessages: RecentMessage[] = [
  { id: '1', subject: 'Actualización de políticas Q1', recipientType: 'channel', recipientName: 'Dine-in', sentAt: '2024-12-15 10:30', status: 'sent' },
  { id: '2', subject: 'Recordatorio de cierre', recipientType: 'location', recipientName: 'CDMX', sentAt: '2024-12-15 09:00', status: 'sent' },
  { id: '3', subject: 'Nueva promoción de temporada', recipientType: 'team', recipientName: 'Equipo CDMX Norte', sentAt: '2024-12-16 08:00', status: 'scheduled' },
];

export default function MessagingPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const userIsVLAdmin = user && isVLAdmin(user);
  const isSpanish = userIsVLAdmin ? false : (currentTenant?.locale === 'es-MX');

  const [recipientType, setRecipientType] = useState<RecipientType>('individual');
  const [locationType, setLocationType] = useState<LocationType>('store');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('immediate');
  const [selectedRecipient, setSelectedRecipient] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSend = () => {
    // Simulate sending message
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      // Reset form
      setSubject('');
      setBody('');
      setSelectedRecipient('');
      setScheduleDate('');
      setScheduleTime('');
    }, 3000);
  };

  const getRecipientOptions = () => {
    if (recipientType === 'individual') {
      return mockIndividuals.map(i => ({ id: i.id, label: `${i.name} (${i.role})` }));
    }
    if (recipientType === 'team') {
      return mockTeams.map(t => ({ id: t.id, label: `${t.name} (${t.members} ${isSpanish ? 'miembros' : 'members'})` }));
    }
    if (recipientType === 'channel') {
      return mockChannels.map(c => ({ id: c.id, label: `${c.name} (${c.count} ${isSpanish ? 'usuarios' : 'users'})` }));
    }
    if (recipientType === 'location') {
      if (locationType === 'store') {
        return mockStores.map(s => ({ id: s.id, label: s.name }));
      }
      if (locationType === 'city') {
        return mockCities.map(c => ({ id: c.id, label: `${c.name} (${c.stores} ${isSpanish ? 'tiendas' : 'stores'})` }));
      }
      if (locationType === 'state') {
        return mockStates.map(s => ({ id: s.id, label: `${s.name} (${s.stores} ${isSpanish ? 'tiendas' : 'stores'})` }));
      }
    }
    return [];
  };

  const getRecipientTypeIcon = (type: RecipientType) => {
    switch (type) {
      case 'individual': return <User className="h-4 w-4" />;
      case 'team': return <Users className="h-4 w-4" />;
      case 'channel': return <Building2 className="h-4 w-4" />;
      case 'location': return <MapPin className="h-4 w-4" />;
    }
  };

  const isFormValid = selectedRecipient && subject && body && (scheduleType === 'immediate' || (scheduleDate && scheduleTime));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          {isSpanish ? 'Centro de Mensajería' : 'Messaging Center'}
        </h1>
        <p className="text-muted-foreground">
          {isSpanish ? 'Envía mensajes a individuos, equipos o ubicaciones' : 'Send messages to individuals, teams, or locations'}
        </p>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">
                {scheduleType === 'immediate'
                  ? (isSpanish ? 'Mensaje enviado exitosamente' : 'Message sent successfully')
                  : (isSpanish ? 'Mensaje programado exitosamente' : 'Message scheduled successfully')}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compose Message */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{isSpanish ? 'Componer Mensaje' : 'Compose Message'}</CardTitle>
              <CardDescription>
                {isSpanish ? 'Selecciona los destinatarios y escribe tu mensaje' : 'Select recipients and write your message'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Recipient Type */}
              <div className="space-y-3">
                <Label>{isSpanish ? 'Tipo de Destinatario' : 'Recipient Type'}</Label>
                <RadioGroup
                  value={recipientType}
                  onValueChange={(v) => {
                    setRecipientType(v as RecipientType);
                    setSelectedRecipient('');
                  }}
                  className="grid grid-cols-2 md:grid-cols-4 gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="individual" id="individual" />
                    <Label htmlFor="individual" className="flex items-center gap-2 cursor-pointer">
                      <User className="h-4 w-4" />
                      {isSpanish ? 'Individual' : 'Individual'}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="team" id="team" />
                    <Label htmlFor="team" className="flex items-center gap-2 cursor-pointer">
                      <Users className="h-4 w-4" />
                      {isSpanish ? 'Equipo' : 'Team'}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="channel" id="channel" />
                    <Label htmlFor="channel" className="flex items-center gap-2 cursor-pointer">
                      <Building2 className="h-4 w-4" />
                      {isSpanish ? 'Canal de Ventas' : 'Sales Channel'}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="location" id="location" />
                    <Label htmlFor="location" className="flex items-center gap-2 cursor-pointer">
                      <MapPin className="h-4 w-4" />
                      {isSpanish ? 'Ubicación' : 'Location'}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Location Sub-selector */}
              {recipientType === 'location' && (
                <div className="space-y-3">
                  <Label>{isSpanish ? 'Tipo de Ubicación' : 'Location Type'}</Label>
                  <Select value={locationType} onValueChange={(v) => {
                    setLocationType(v as LocationType);
                    setSelectedRecipient('');
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="store">{isSpanish ? 'Tienda' : 'Store'}</SelectItem>
                      <SelectItem value="city">{isSpanish ? 'Ciudad' : 'City'}</SelectItem>
                      <SelectItem value="state">{isSpanish ? 'Estado' : 'State'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Recipient Selector */}
              <div className="space-y-3">
                <Label>{isSpanish ? 'Seleccionar Destinatario' : 'Select Recipient'}</Label>
                <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
                  <SelectTrigger>
                    <SelectValue placeholder={isSpanish ? 'Seleccionar...' : 'Select...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {getRecipientOptions().map(option => (
                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subject */}
              <div className="space-y-3">
                <Label>{isSpanish ? 'Asunto' : 'Subject'}</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={isSpanish ? 'Escribe el asunto del mensaje...' : 'Enter message subject...'}
                />
              </div>

              {/* Body */}
              <div className="space-y-3">
                <Label>{isSpanish ? 'Mensaje' : 'Message'}</Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={isSpanish ? 'Escribe tu mensaje aquí...' : 'Write your message here...'}
                  rows={6}
                />
              </div>

              {/* Schedule */}
              <div className="space-y-3">
                <Label>{isSpanish ? 'Programación' : 'Schedule'}</Label>
                <RadioGroup
                  value={scheduleType}
                  onValueChange={(v) => setScheduleType(v as ScheduleType)}
                  className="flex gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="immediate" id="immediate" />
                    <Label htmlFor="immediate" className="flex items-center gap-2 cursor-pointer">
                      <Send className="h-4 w-4" />
                      {isSpanish ? 'Enviar ahora' : 'Send now'}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="scheduled" id="scheduled" />
                    <Label htmlFor="scheduled" className="flex items-center gap-2 cursor-pointer">
                      <Calendar className="h-4 w-4" />
                      {isSpanish ? 'Programar' : 'Schedule'}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Date/Time Picker */}
              {scheduleType === 'scheduled' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{isSpanish ? 'Fecha' : 'Date'}</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{isSpanish ? 'Hora' : 'Time'}</Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Send Button */}
              <div className="flex justify-end">
                <Button onClick={handleSend} disabled={!isFormValid} size="lg">
                  <Send className="h-4 w-4 mr-2" />
                  {scheduleType === 'immediate'
                    ? (isSpanish ? 'Enviar Mensaje' : 'Send Message')
                    : (isSpanish ? 'Programar Mensaje' : 'Schedule Message')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Messages */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>{isSpanish ? 'Mensajes Recientes' : 'Recent Messages'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentMessages.map(msg => (
                  <div key={msg.id} className="border-b pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{msg.subject}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          {getRecipientTypeIcon(msg.recipientType)}
                          <span>{msg.recipientName}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{msg.sentAt}</p>
                      </div>
                      <Badge
                        className={
                          msg.status === 'sent'
                            ? 'bg-green-100 text-green-800'
                            : msg.status === 'scheduled'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                        }
                      >
                        {msg.status === 'sent'
                          ? (isSpanish ? 'Enviado' : 'Sent')
                          : msg.status === 'scheduled'
                          ? (isSpanish ? 'Programado' : 'Scheduled')
                          : (isSpanish ? 'Fallido' : 'Failed')}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
