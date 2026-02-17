'use client';

/**
 * Validation Panel Component
 *
 * Displays demo data validation results and integrity checks.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Shield,
  Database,
  Link,
  Activity,
} from 'lucide-react';
import type { DemoValidationResult, ValidationCheck } from '@/types/demo';
import { validateDemoData } from '@/lib/demo/demo-service';
import { useLocale } from '@/contexts/locale-context';

interface ValidationPanelProps {
  onValidationComplete?: (result: DemoValidationResult) => void;
}

export function ValidationPanel({ onValidationComplete }: ValidationPanelProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [result, setResult] = useState<DemoValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const handleValidate = () => {
    setIsValidating(true);

    // Simulate validation delay for UX
    setTimeout(() => {
      const validationResult = validateDemoData();
      setResult(validationResult);
      setIsValidating(false);
      onValidationComplete?.(validationResult);
    }, 500);
  };

  const getCategoryIcon = (category: ValidationCheck['category']) => {
    switch (category) {
      case 'data':
        return Database;
      case 'relationship':
        return Link;
      case 'integrity':
        return Shield;
      case 'consistency':
        return Activity;
      default:
        return CheckCircle;
    }
  };

  const getCategoryLabel = (category: ValidationCheck['category']) => {
    const labels: Record<string, { en: string; es: string }> = {
      data: { en: 'Data Existence', es: 'Existencia de Datos' },
      relationship: { en: 'Relationships', es: 'Relaciones' },
      integrity: { en: 'Data Integrity', es: 'Integridad de Datos' },
      consistency: { en: 'Consistency', es: 'Consistencia' },
    };
    return isSpanish ? labels[category]?.es : labels[category]?.en;
  };

  const getStatusIcon = (status: ValidationCheck['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    }
  };

  const getStatusColor = (status: ValidationCheck['status']) => {
    switch (status) {
      case 'passed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'warning':
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }
  };

  const groupedChecks = result?.checks.reduce<Record<string, ValidationCheck[]>>(
    (acc, check) => {
      if (!acc[check.category]) {
        acc[check.category] = [];
      }
      acc[check.category].push(check);
      return acc;
    },
    {}
  );

  const overallScore = result
    ? Math.round((result.summary.passed / result.checks.length) * 100)
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {isSpanish ? 'Validación de Datos' : 'Data Validation'}
          </CardTitle>
          <Button onClick={handleValidate} disabled={isValidating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isValidating ? 'animate-spin' : ''}`} />
            {isValidating
              ? isSpanish ? 'Validando...' : 'Validating...'
              : isSpanish ? 'Ejecutar Validación' : 'Run Validation'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!result ? (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">
              {isSpanish ? 'Sin resultados de validación' : 'No validation results'}
            </p>
            <p className="text-sm">
              {isSpanish
                ? 'Ejecute una validación para verificar la integridad de los datos demo'
                : 'Run a validation to check demo data integrity'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-muted text-center">
                <p className="text-3xl font-bold">{overallScore}%</p>
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Puntuación' : 'Score'}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-green-50 text-center">
                <p className="text-3xl font-bold text-green-600">
                  {result.summary.passed}
                </p>
                <p className="text-sm text-green-700">
                  {isSpanish ? 'Pasaron' : 'Passed'}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-red-50 text-center">
                <p className="text-3xl font-bold text-red-600">
                  {result.summary.failed}
                </p>
                <p className="text-sm text-red-700">
                  {isSpanish ? 'Fallaron' : 'Failed'}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-amber-50 text-center">
                <p className="text-3xl font-bold text-amber-600">
                  {result.summary.warnings}
                </p>
                <p className="text-sm text-amber-700">
                  {isSpanish ? 'Advertencias' : 'Warnings'}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{isSpanish ? 'Estado General' : 'Overall Status'}</span>
                <Badge
                  variant={result.isValid ? 'default' : 'destructive'}
                >
                  {result.isValid
                    ? isSpanish ? 'Válido' : 'Valid'
                    : isSpanish ? 'Inválido' : 'Invalid'}
                </Badge>
              </div>
              <Progress value={overallScore} className="h-2" />
            </div>

            {/* Checks by category */}
            <Accordion type="multiple" className="w-full">
              {groupedChecks && Object.entries(groupedChecks).map(([category, checks]) => {
                const CategoryIcon = getCategoryIcon(category as ValidationCheck['category']);
                const passed = checks.filter((c) => c.status === 'passed').length;
                const total = checks.length;

                return (
                  <AccordionItem key={category} value={category}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <CategoryIcon className="h-4 w-4" />
                        <span>{getCategoryLabel(category as ValidationCheck['category'])}</span>
                        <Badge variant="secondary" className="ml-2">
                          {passed}/{total}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pt-2">
                        {checks.map((check) => (
                          <div
                            key={check.id}
                            className={`p-3 rounded-lg border ${getStatusColor(check.status)}`}
                          >
                            <div className="flex items-start gap-3">
                              {getStatusIcon(check.status)}
                              <div className="flex-1">
                                <p className="font-medium text-sm">
                                  {isSpanish ? check.nameEs : check.name}
                                </p>
                                <p className="text-sm opacity-80">
                                  {isSpanish ? check.messageEs : check.message}
                                </p>
                                {check.details && Object.keys(check.details).length > 0 && (
                                  <pre className="mt-2 text-xs bg-slate-800/50 p-2 rounded overflow-auto">
                                    {JSON.stringify(check.details, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {/* Timestamp */}
            <p className="text-xs text-muted-foreground text-center">
              {isSpanish ? 'Última validación' : 'Last validated'}:{' '}
              {new Date(result.timestamp).toLocaleString(locale)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
