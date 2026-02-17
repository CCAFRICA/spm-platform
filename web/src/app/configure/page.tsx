'use client';

/**
 * Configure Workspace Landing Page
 *
 * System configuration and setup center.
 * Manage personnel, organization structure, periods, and system settings.
 */

import { useRouter } from 'next/navigation';
import { useLocale } from '@/contexts/locale-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Shield,
  Network,
  MapPin,
  Calendar,
  Settings,
  Languages,
  Plug,
  FileSpreadsheet,
  ArrowRight,
} from 'lucide-react';

export default function ConfigurePage() {
  const router = useRouter();
  const { locale } = useLocale();

  const isSpanish = locale === 'es-MX';

  const configSections = [
    {
      title: isSpanish ? 'Personas' : 'People',
      items: [
        {
          icon: Users,
          label: isSpanish ? 'Personal' : 'Personnel',
          description: isSpanish ? 'Gestionar empleados y asignaciones' : 'Manage entities and assignments',
          route: '/configure/people',
          badge: '156 Active',
        },
        {
          icon: Shield,
          label: isSpanish ? 'Roles y Permisos' : 'Roles & Permissions',
          description: isSpanish ? 'Controlar acceso al sistema' : 'Control system access',
          route: '/configure/people/roles',
        },
      ],
    },
    {
      title: isSpanish ? 'Organización' : 'Organization',
      items: [
        {
          icon: Users,
          label: isSpanish ? 'Equipos' : 'Teams',
          description: isSpanish ? 'Estructuras de equipo de ventas' : 'Team structures',
          route: '/configure/organization/teams',
        },
        {
          icon: MapPin,
          label: isSpanish ? 'Ubicaciones' : 'Locations',
          description: isSpanish ? 'Territorios y regiones' : 'Territories and regions',
          route: '/configure/organization/locations',
        },
        {
          icon: Network,
          label: isSpanish ? 'Jerarquía' : 'Hierarchy',
          description: isSpanish ? 'Estructura de reportes' : 'Reporting structure',
          route: '/configure/organization/hierarchy',
        },
      ],
    },
    {
      title: isSpanish ? 'Períodos y Datos' : 'Periods & Data',
      items: [
        {
          icon: Calendar,
          label: isSpanish ? 'Períodos de Nómina' : 'Payroll Periods',
          description: isSpanish ? 'Configurar ciclos de pago' : 'Configure payment cycles',
          route: '/configure/periods',
        },
        {
          icon: FileSpreadsheet,
          label: isSpanish ? 'Especificaciones de Datos' : 'Data Specifications',
          description: isSpanish ? 'Requisitos de importación' : 'Import requirements',
          route: '/configure/data-specs',
        },
      ],
    },
    {
      title: isSpanish ? 'Sistema' : 'System',
      items: [
        {
          icon: Settings,
          label: isSpanish ? 'Configuración del Tenant' : 'Tenant Settings',
          description: isSpanish ? 'Ajustes generales del sistema' : 'General system settings',
          route: '/configure/system',
        },
        {
          icon: Languages,
          label: isSpanish ? 'Terminología' : 'Terminology',
          description: isSpanish ? 'Personalizar etiquetas' : 'Customize labels',
          route: '/configure/system/terminology',
        },
        {
          icon: Plug,
          label: isSpanish ? 'Integraciones' : 'Integrations',
          description: isSpanish ? 'Conectar sistemas externos' : 'Connect external systems',
          route: '/configure/system/integrations',
        },
      ],
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">
          {isSpanish ? 'Centro de Configuración' : 'Configuration Center'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isSpanish
            ? 'Configurar y mantener el sistema de compensación'
            : 'Set up and maintain the outcome system'}
        </p>
      </div>

      {/* Config Sections */}
      {configSections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.route}
                    onClick={() => router.push(item.route)}
                    className="flex items-start gap-4 p-4 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className="p-2 bg-orange-900/30 rounded-lg">
                      <Icon className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-zinc-100">{item.label}</p>
                        {item.badge && (
                          <Badge variant="secondary" className="text-xs">{item.badge}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{item.description}</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
