'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Check, AlertCircle, HelpCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ColumnMapping, ImportField } from '@/lib/import-service';
import { containerVariants, itemVariants } from '@/lib/animations';

interface ColumnMapperProps {
  sourceHeaders: string[];
  targetFields: ImportField[];
  mappings: ColumnMapping[];
  onMappingChange: (mappings: ColumnMapping[]) => void;
  sampleData?: string[][];
}

export function ColumnMapper({
  sourceHeaders,
  targetFields,
  mappings,
  onMappingChange,
  sampleData = [],
}: ColumnMapperProps) {
  const handleMappingChange = (sourceColumn: string, targetField: string | null) => {
    const newMappings = mappings.map((mapping) =>
      mapping.sourceColumn === sourceColumn
        ? { ...mapping, targetField: targetField === 'none' ? null : targetField }
        : mapping
    );
    onMappingChange(newMappings);
  };

  const getMappedFieldsCount = () => {
    return mappings.filter((m) => m.targetField).length;
  };

  const getRequiredFieldsCount = () => {
    return targetFields.filter((f) => f.required).length;
  };

  const getMappedRequiredFields = () => {
    const mappedKeys = mappings.filter((m) => m.targetField).map((m) => m.targetField);
    return targetFields.filter((f) => f.required && mappedKeys.includes(f.key)).length;
  };

  const isFieldMapped = (fieldKey: string) => {
    return mappings.some((m) => m.targetField === fieldKey);
  };

  const getSampleValue = (headerIndex: number) => {
    if (sampleData.length === 0) return '';
    return sampleData[0]?.[headerIndex] || '';
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">Mapped:</span>
          <Badge variant="secondary">
            {getMappedFieldsCount()} / {sourceHeaders.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">Required:</span>
          <Badge
            variant={
              getMappedRequiredFields() === getRequiredFieldsCount()
                ? 'default'
                : 'destructive'
            }
            className={
              getMappedRequiredFields() === getRequiredFieldsCount()
                ? 'bg-emerald-500'
                : ''
            }
          >
            {getMappedRequiredFields()} / {getRequiredFieldsCount()}
          </Badge>
        </div>
      </div>

      {/* Mapping List */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-3"
      >
        {mappings.map((mapping, index) => {
          const isMapped = mapping.targetField !== null;
          const sampleValue = getSampleValue(index);

          return (
            <motion.div
              key={mapping.sourceColumn}
              variants={itemVariants}
              className={cn(
                'flex items-center gap-4 p-4 border rounded-lg transition-colors',
                isMapped
                  ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                  : 'border-slate-200 dark:border-slate-700'
              )}
            >
              {/* Source Column */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {mapping.sourceColumn}
                  </span>
                  {sampleValue && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-4 w-4 text-slate-400" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Sample: {sampleValue}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                {sampleValue && (
                  <p className="text-xs text-slate-500 truncate mt-1">
                    e.g., &quot;{sampleValue}&quot;
                  </p>
                )}
              </div>

              {/* Arrow */}
              <ArrowRight
                className={cn(
                  'h-5 w-5 flex-shrink-0',
                  isMapped ? 'text-emerald-500' : 'text-slate-300'
                )}
              />

              {/* Target Field Selector */}
              <div className="w-64">
                <Select
                  value={mapping.targetField || 'none'}
                  onValueChange={(value) =>
                    handleMappingChange(mapping.sourceColumn, value)
                  }
                >
                  <SelectTrigger
                    className={cn(
                      isMapped && 'border-emerald-300 dark:border-emerald-700'
                    )}
                  >
                    <SelectValue placeholder="Select field..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-slate-500">Skip this column</span>
                    </SelectItem>
                    {targetFields.map((field) => {
                      const isAlreadyMapped =
                        isFieldMapped(field.key) && mapping.targetField !== field.key;
                      return (
                        <SelectItem
                          key={field.key}
                          value={field.key}
                          disabled={isAlreadyMapped}
                          aria-selected={mapping.targetField === field.key}
                        >
                          <div className="flex items-center gap-2">
                            <span>{field.label}</span>
                            {field.required && (
                              <Badge variant="outline" className="text-xs px-1">
                                Required
                              </Badge>
                            )}
                            {isAlreadyMapped && (
                              <span className="text-xs text-slate-400">(mapped)</span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Status Icon */}
              <div className="w-6">
                {isMapped ? (
                  <Check className="h-5 w-5 text-emerald-500" />
                ) : (
                  <div className="h-5 w-5" />
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Unmapped Required Fields Warning */}
      {getMappedRequiredFields() < getRequiredFieldsCount() && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg"
        >
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">
              Missing required fields
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              Please map the following required fields:{' '}
              {targetFields
                .filter((f) => f.required && !isFieldMapped(f.key))
                .map((f) => f.label)
                .join(', ')}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
