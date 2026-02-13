'use client';

/**
 * Investigate Workspace Landing Page
 *
 * The search and investigation center for drilling into data.
 * Provides access to transaction search, employee lookup, and audit trails.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Receipt,
  User,
  Calculator,
  FileSearch,
  MessageCircle,
  Edit,
  ArrowRight,
  GitCompare,
  ShieldCheck,
} from 'lucide-react';

export default function InvestigatePage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const userIsVLAdmin = user && isVLAdmin(user);
  const isSpanish = userIsVLAdmin ? false : currentTenant?.locale === 'es-MX';

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/investigate/transactions?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const searchCategories = [
    {
      icon: Receipt,
      label: isSpanish ? 'Transacciones' : 'Transactions',
      description: isSpanish ? 'Buscar por ID, monto, o fecha' : 'Search by ID, amount, or date',
      route: '/investigate/transactions',
      color: 'blue',
    },
    {
      icon: User,
      label: isSpanish ? 'Empleados' : 'Employees',
      description: isSpanish ? 'Buscar por nombre o ID' : 'Search by name or ID',
      route: '/investigate/employees',
      color: 'green',
    },
    {
      icon: Calculator,
      label: isSpanish ? 'Cálculos' : 'Calculations',
      description: isSpanish ? 'Rastrear lógica de cálculo' : 'Trace calculation logic',
      route: '/investigate/calculations',
      color: 'purple',
    },
    {
      icon: FileSearch,
      label: isSpanish ? 'Auditoría' : 'Audit Trail',
      description: isSpanish ? 'Ver historial de cambios' : 'View change history',
      route: '/investigate/audit',
      color: 'orange',
    },
    {
      icon: MessageCircle,
      label: isSpanish ? 'Disputas' : 'Disputes',
      description: isSpanish ? 'Revisar disputas abiertas' : 'Review open disputes',
      route: '/investigate/disputes',
      color: 'red',
    },
    {
      icon: Edit,
      label: isSpanish ? 'Ajustes' : 'Adjustments',
      description: isSpanish ? 'Ver ajustes manuales' : 'View manual adjustments',
      route: '/investigate/adjustments',
      color: 'slate',
    },
    {
      icon: GitCompare,
      label: isSpanish ? 'Conciliación' : 'Reconciliation',
      description: isSpanish ? 'Comparar resultados con datos externos' : 'Compare results against ground truth',
      route: '/investigate/reconciliation',
      color: 'blue',
    },
    {
      icon: ShieldCheck,
      label: isSpanish ? 'Validación del Plan' : 'Plan Validation',
      description: isSpanish ? 'Verificar estructura del plan' : 'Verify plan structure and consistency',
      route: '/investigate/plan-validation',
      color: 'green',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isSpanish ? 'Centro de Investigación' : 'Investigation Center'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isSpanish
            ? 'Buscar y rastrear datos de compensación'
            : 'Search and trace compensation data'}
        </p>
      </div>

      {/* Global Search */}
      <Card>
        <CardContent className="p-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <Input
                placeholder={isSpanish
                  ? 'Buscar transacciones, empleados, o IDs...'
                  : 'Search transactions, employees, or IDs...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10 h-12 text-lg"
              />
            </div>
            <Button size="lg" onClick={handleSearch}>
              <Search className="h-5 w-5 mr-2" />
              {isSpanish ? 'Buscar' : 'Search'}
            </Button>
          </div>
          <p className="text-sm text-slate-500 mt-3">
            {isSpanish
              ? 'Consejo: Usa Cmd+K para búsqueda rápida desde cualquier página'
              : 'Tip: Use Cmd+K for quick search from any page'}
          </p>
        </CardContent>
      </Card>

      {/* Search Categories */}
      <div className="grid grid-cols-3 gap-4">
        {searchCategories.map((category) => {
          const Icon = category.icon;
          const colorClasses = {
            blue: 'bg-blue-100 text-blue-600',
            green: 'bg-green-100 text-green-600',
            purple: 'bg-purple-100 text-purple-600',
            orange: 'bg-orange-100 text-orange-600',
            red: 'bg-red-100 text-red-600',
            slate: 'bg-slate-100 text-slate-600',
          };

          return (
            <Card
              key={category.route}
              className="hover:border-slate-300 transition-colors cursor-pointer"
              onClick={() => router.push(category.route)}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${colorClasses[category.color as keyof typeof colorClasses]}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{category.label}</p>
                    <p className="text-sm text-slate-500 mt-1">{category.description}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-slate-400" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Searches - Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>{isSpanish ? 'Búsquedas Recientes' : 'Recent Searches'}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 text-center py-8">
            {isSpanish
              ? 'Tus búsquedas recientes aparecerán aquí'
              : 'Your recent searches will appear here'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
