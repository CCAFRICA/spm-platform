'use client';

/**
 * Field Mapper Component
 *
 * Interactive field mapping UI with confidence indicators.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowRight,
  Check,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  Save,
} from 'lucide-react';
import type { FieldMapping } from '@/lib/import-pipeline/smart-mapper';
import { getPlatformFields } from '@/lib/import-pipeline/smart-mapper';
import { useLocale } from '@/contexts/locale-context';
import { cn } from '@/lib/utils';

interface FieldMapperProps {
  mappings: FieldMapping[];
  onMappingsChange: (mappings: FieldMapping[]) => void;
  onSaveTemplate?: (name: string) => void;
  className?: string;
}

export function FieldMapper({
  mappings,
  onMappingsChange,
  onSaveTemplate,
  className,
}: FieldMapperProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const [templateName, setTemplateName] = useState('');

  const platformFields = getPlatformFields();
  const requiredFields = platformFields.filter((f) => f.required).map((f) => f.name);

  const handleMappingChange = (sourceField: string, targetField: string | null) => {
    const updated = mappings.map((m) =>
      m.sourceField === sourceField
        ? { ...m, targetField, matchType: 'manual' as const, confidence: targetField ? 100 : 0 }
        : m
    );
    onMappingsChange(updated);
  };

  const handleAcceptAllSuggestions = () => {
    // Keep only mappings with confidence > 70
    onMappingsChange(mappings);
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 90) return 'text-green-600 bg-green-50 border-green-200';
    if (confidence >= 70) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    if (confidence >= 50) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-gray-500 bg-gray-50 border-gray-200';
  };

  const getMappedRequiredFields = () => {
    return requiredFields.filter((rf) =>
      mappings.some((m) => m.targetField === rf)
    );
  };

  const missingRequired = requiredFields.filter(
    (rf) => !mappings.some((m) => m.targetField === rf)
  );

  const overallConfidence =
    mappings.length > 0
      ? Math.round(mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length)
      : 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {isSpanish ? 'Mapeo de Campos' : 'Field Mapping'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isSpanish
              ? 'Conecte los campos del archivo con los campos de la plataforma'
              : 'Connect file fields to platform fields'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={getConfidenceColor(overallConfidence)}>
            {overallConfidence}% {isSpanish ? 'confianza' : 'confidence'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAcceptAllSuggestions}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            {isSpanish ? 'Aceptar Sugerencias' : 'Accept Suggestions'}
          </Button>
        </div>
      </div>

      {/* Missing required fields warning */}
      {missingRequired.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">
              {isSpanish ? 'Campos requeridos faltantes' : 'Missing required fields'}
            </p>
            <p className="text-sm text-amber-700">
              {missingRequired.map((f) => {
                const field = platformFields.find((pf) => pf.name === f);
                return isSpanish ? field?.labelEs : field?.label;
              }).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Mapping list */}
      <Card>
        <CardHeader className="pb-2">
          <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground">
            <div className="col-span-5">
              {isSpanish ? 'Campo del Archivo' : 'File Field'}
            </div>
            <div className="col-span-1"></div>
            <div className="col-span-4">
              {isSpanish ? 'Campo de Plataforma' : 'Platform Field'}
            </div>
            <div className="col-span-2 text-right">
              {isSpanish ? 'Confianza' : 'Confidence'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {mappings.map((mapping) => {
            const isRequired = mapping.targetField && requiredFields.includes(mapping.targetField);
            const isMapped = !!mapping.targetField;

            return (
              <div
                key={mapping.sourceField}
                className={cn(
                  'grid grid-cols-12 gap-4 items-center p-3 rounded-lg border',
                  isMapped ? 'bg-green-50/50 border-green-200' : 'bg-muted/50'
                )}
              >
                {/* Source field */}
                <div className="col-span-5">
                  <div className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                      {mapping.sourceField}
                    </code>
                    {mapping.matchType === 'historical' && (
                      <Badge variant="secondary" className="text-xs">
                        {isSpanish ? 'Histórico' : 'Historical'}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <div className="col-span-1 flex justify-center">
                  <ArrowRight className={cn(
                    'h-4 w-4',
                    isMapped ? 'text-green-600' : 'text-muted-foreground'
                  )} />
                </div>

                {/* Target field selector */}
                <div className="col-span-4">
                  <Select
                    value={mapping.targetField || 'none'}
                    onValueChange={(value) =>
                      handleMappingChange(mapping.sourceField, value === 'none' ? null : value)
                    }
                  >
                    <SelectTrigger className={cn(
                      'w-full',
                      isMapped && 'border-green-300'
                    )}>
                      <SelectValue placeholder={isSpanish ? 'Seleccionar campo' : 'Select field'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground">
                          {isSpanish ? '— No mapear —' : '— Don\'t map —'}
                        </span>
                      </SelectItem>
                      {platformFields.map((field) => {
                        const isAlreadyMapped = mappings.some(
                          (m) => m.targetField === field.name && m.sourceField !== mapping.sourceField
                        );
                        return (
                          <SelectItem
                            key={field.name}
                            value={field.name}
                            disabled={isAlreadyMapped}
                          >
                            <div className="flex items-center gap-2">
                              <span>{isSpanish ? field.labelEs : field.label}</span>
                              {field.required && (
                                <span className="text-red-500">*</span>
                              )}
                              {isAlreadyMapped && (
                                <span className="text-xs text-muted-foreground">
                                  ({isSpanish ? 'ya mapeado' : 'already mapped'})
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Confidence indicator */}
                <div className="col-span-2 flex items-center justify-end gap-2">
                  {isMapped && (
                    <>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', getConfidenceColor(mapping.confidence))}
                      >
                        {mapping.confidence}%
                      </Badge>
                      {isRequired && (
                        <Check className="h-4 w-4 text-green-600" />
                      )}
                    </>
                  )}
                  {!isMapped && mapping.confidence === 0 && (
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Save template */}
      {onSaveTemplate && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder={isSpanish ? 'Nombre de la plantilla' : 'Template name'}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-md"
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (templateName.trim()) {
                    onSaveTemplate(templateName);
                    setTemplateName('');
                  }
                }}
                disabled={!templateName.trim()}
              >
                <Save className="h-4 w-4 mr-1" />
                {isSpanish ? 'Guardar Plantilla' : 'Save Template'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Required fields status */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">
          {isSpanish ? 'Campos requeridos:' : 'Required fields:'}
        </span>
        <div className="flex items-center gap-2">
          {requiredFields.map((rf) => {
            const field = platformFields.find((f) => f.name === rf);
            const isMapped = getMappedRequiredFields().includes(rf);
            return (
              <Badge
                key={rf}
                variant={isMapped ? 'default' : 'outline'}
                className={cn(
                  'text-xs',
                  isMapped ? 'bg-green-600' : 'border-red-300 text-red-600'
                )}
              >
                {isMapped && <Check className="h-3 w-3 mr-1" />}
                {isSpanish ? field?.labelEs : field?.label}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}
