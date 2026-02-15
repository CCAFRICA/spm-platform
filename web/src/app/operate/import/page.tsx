'use client';

/**
 * Operate > Import Page
 *
 * Redirects to the enhanced import page or shows import options.
 */

import { useRouter } from 'next/navigation';
import { useLocale } from '@/contexts/locale-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Upload,
  Sparkles,
  History,
  FileSpreadsheet,
  ArrowRight,
} from 'lucide-react';

export default function ImportPage() {
  const router = useRouter();
  const { locale } = useLocale();

  const isSpanish = locale === 'es-MX';

  const importOptions = [
    {
      icon: Sparkles,
      label: isSpanish ? 'Importación Inteligente' : 'Smart Import',
      description: isSpanish
        ? 'Importación asistida por IA con mapeo automático'
        : 'AI-assisted import with automatic mapping',
      route: '/operate/import/enhanced',
      primary: true,
    },
    {
      icon: Upload,
      label: isSpanish ? 'Importación Estándar' : 'Standard Import',
      description: isSpanish
        ? 'Cargar archivos con plantilla predefinida'
        : 'Upload files using predefined template',
      route: '/data/import',
    },
    {
      icon: FileSpreadsheet,
      label: isSpanish ? 'Plantillas de Datos' : 'Data Templates',
      description: isSpanish
        ? 'Descargar plantillas de importación'
        : 'Download import templates',
      route: '/configure/data-specs/templates',
    },
    {
      icon: History,
      label: isSpanish ? 'Historial de Importación' : 'Import History',
      description: isSpanish
        ? 'Ver importaciones anteriores'
        : 'View previous imports',
      route: '/data/imports',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isSpanish ? 'Importar Datos' : 'Import Data'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isSpanish
            ? 'Cargar datos de transacciones y empleados'
            : 'Upload transaction and entity data'}
        </p>
      </div>

      {/* Import Options */}
      <div className="grid grid-cols-2 gap-4">
        {importOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Card
              key={option.route}
              className={`hover:border-slate-300 transition-colors cursor-pointer ${
                option.primary ? 'border-purple-300 bg-purple-50/50' : ''
              }`}
              onClick={() => router.push(option.route)}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${
                    option.primary ? 'bg-purple-100' : 'bg-slate-100'
                  }`}>
                    <Icon className={`h-6 w-6 ${
                      option.primary ? 'text-purple-600' : 'text-slate-600'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{option.label}</p>
                    <p className="text-sm text-slate-500 mt-1">{option.description}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-slate-400" />
                </div>
                {option.primary && (
                  <Button className="w-full mt-4" onClick={(e) => {
                    e.stopPropagation();
                    router.push(option.route);
                  }}>
                    {isSpanish ? 'Iniciar Importación' : 'Start Import'}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
