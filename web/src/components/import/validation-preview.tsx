'use client';

import { motion } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  ArrowRight,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { ImportPreview, ImportField } from '@/lib/import-service';
import { containerVariants, itemVariants } from '@/lib/animations';

interface ValidationPreviewProps {
  preview: ImportPreview;
  targetFields: ImportField[];
}

export function ValidationPreview({ preview, targetFields }: ValidationPreviewProps) {
  const mappingErrors = preview.errors.filter((e) => e.row === 0);
  const dataErrors = preview.errors.filter((e) => e.row !== 0);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Summary Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg text-center">
          <FileText className="h-6 w-6 mx-auto mb-2 text-slate-500" />
          <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">
            {preview.totalRows}
          </p>
          <p className="text-sm text-slate-500">Total Rows</p>
        </div>

        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg text-center">
          <CheckCircle className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
          <p className="text-2xl font-bold text-emerald-600">{preview.validRows}</p>
          <p className="text-sm text-emerald-600">Valid</p>
        </div>

        <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg text-center">
          <XCircle className="h-6 w-6 mx-auto mb-2 text-red-500" />
          <p className="text-2xl font-bold text-red-600">{preview.errorRows}</p>
          <p className="text-sm text-red-600">Errors</p>
        </div>

        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-center">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-amber-500" />
          <p className="text-2xl font-bold text-amber-600">{preview.warningRows}</p>
          <p className="text-sm text-amber-600">Warnings</p>
        </div>
      </motion.div>

      {/* Import Preview Bar */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Import Preview
              </span>
              <span className="text-sm text-slate-500">
                {preview.validRows} of {preview.totalRows} rows will be imported
              </span>
            </div>
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${(preview.validRows / preview.totalRows) * 100}%`,
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="h-full bg-emerald-500 rounded-full"
              />
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-400" />
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{preview.validRows}</p>
            <p className="text-xs text-slate-500">To Import</p>
          </div>
        </div>
      </motion.div>

      {/* Errors Section */}
      {preview.errors.length > 0 && (
        <motion.div variants={itemVariants}>
          <Accordion type="single" collapsible defaultValue="errors">
            <AccordionItem value="errors" className="border rounded-lg">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <span className="font-medium">
                    Issues Found ({preview.errors.length})
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {/* Mapping Errors */}
                {mappingErrors.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                      Mapping Issues
                    </h4>
                    <div className="space-y-2">
                      {mappingErrors.map((error, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/20 rounded text-sm"
                        >
                          <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          <span className="text-red-700 dark:text-red-300">
                            {error.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Errors */}
                {dataErrors.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                      Data Issues
                    </h4>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-2">
                        {dataErrors.slice(0, 20).map((error, index) => (
                          <div
                            key={index}
                            className={cn(
                              'flex items-start gap-2 p-2 rounded text-sm',
                              error.severity === 'error'
                                ? 'bg-red-50 dark:bg-red-950/20'
                                : 'bg-amber-50 dark:bg-amber-950/20'
                            )}
                          >
                            {error.severity === 'error' ? (
                              <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            )}
                            <div>
                              <span
                                className={cn(
                                  'font-medium',
                                  error.severity === 'error'
                                    ? 'text-red-700 dark:text-red-300'
                                    : 'text-amber-700 dark:text-amber-300'
                                )}
                              >
                                Row {error.row}, {error.column}:
                              </span>{' '}
                              <span className="text-slate-600 dark:text-slate-400">
                                {error.message}
                              </span>
                              {error.value && (
                                <span className="text-slate-500 ml-1">
                                  (value: &quot;{error.value}&quot;)
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {dataErrors.length > 20 && (
                          <p className="text-sm text-slate-500 text-center py-2">
                            ... and {dataErrors.length - 20} more issues
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </motion.div>
      )}

      {/* Sample Data Preview */}
      {preview.sampleData.length > 0 && (
        <motion.div variants={itemVariants}>
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">
            Data Preview (first {preview.sampleData.length} rows)
          </h3>
          <div className="border rounded-lg overflow-hidden">
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    {targetFields
                      .filter((f) =>
                        preview.sampleData.some((row) => row[f.key] !== undefined)
                      )
                      .map((field) => (
                        <TableHead key={field.key} className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {field.label}
                            {field.required && (
                              <Badge variant="outline" className="text-xs px-1 py-0">
                                *
                              </Badge>
                            )}
                          </div>
                        </TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.sampleData.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {targetFields
                        .filter((f) =>
                          preview.sampleData.some((r) => r[f.key] !== undefined)
                        )
                        .map((field) => {
                          const value = row[field.key] || '';
                          const hasError = preview.errors.some(
                            (e) =>
                              e.row === rowIndex + 2 &&
                              e.column === field.label &&
                              e.severity === 'error'
                          );
                          const hasWarning = preview.errors.some(
                            (e) =>
                              e.row === rowIndex + 2 &&
                              e.column === field.label &&
                              e.severity === 'warning'
                          );

                          return (
                            <TableCell
                              key={field.key}
                              className={cn(
                                'whitespace-nowrap',
                                hasError && 'bg-red-50 dark:bg-red-950/20',
                                hasWarning &&
                                  !hasError &&
                                  'bg-amber-50 dark:bg-amber-950/20'
                              )}
                            >
                              <span
                                className={cn(
                                  hasError && 'text-red-600',
                                  hasWarning && !hasError && 'text-amber-600'
                                )}
                              >
                                {value || '-'}
                              </span>
                            </TableCell>
                          );
                        })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
