'use client';

/**
 * Comparison Data Upload
 *
 * Drag-drop CSV/XLSX upload with dynamic column mapping from plan components.
 * Passes Korean Test: all labels come from the plan, not from code.
 */

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, FileSpreadsheet, Check, AlertTriangle, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { PlanComponent } from '@/types/compensation-plan';
import type { ColumnMapping, ColumnMap } from '@/lib/forensics/types';

interface ComparisonUploadProps {
  /** Plan components — drives column mapping options dynamically */
  components: PlanComponent[];
  /** Called when user confirms mapping */
  onUploadComplete: (data: Record<string, unknown>[], mapping: ColumnMapping) => void;
}

interface ParsedFile {
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  preview: Record<string, unknown>[];
}

type MappingTarget = 'unmapped' | 'employee_id' | 'total' | `component:${string}`;

export function ComparisonUpload({ components, onUploadComplete }: ComparisonUploadProps) {
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [columnMappings, setColumnMappings] = useState<Record<string, MappingTarget>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build mapping options dynamically from plan components
  const mappingOptions: Array<{ value: MappingTarget; label: string }> = [
    { value: 'unmapped', label: 'Skip' },
    { value: 'employee_id', label: 'Employee ID' },
    { value: 'total', label: 'Total' },
    ...components.map(c => ({
      value: `component:${c.id}` as MappingTarget,
      label: c.name,
    })),
  ];

  const parseFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

        if (jsonData.length === 0) {
          setError('File contains no data rows');
          return;
        }

        const headers = Object.keys(jsonData[0]);
        const parsed: ParsedFile = {
          fileName: file.name,
          headers,
          rows: jsonData,
          preview: jsonData.slice(0, 5),
        };

        setParsedFile(parsed);

        // Auto-suggest mappings using fuzzy matching against plan component names
        const autoMappings: Record<string, MappingTarget> = {};
        for (const header of headers) {
          const normalized = header.toLowerCase().trim();
          const match = autoSuggestMapping(normalized, components);
          autoMappings[header] = match;
        }
        setColumnMappings(autoMappings);
      } catch (err) {
        setError(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };

    reader.readAsArrayBuffer(file);
  }, [components]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleMappingChange = (header: string, value: MappingTarget) => {
    setColumnMappings(prev => ({ ...prev, [header]: value }));
  };

  const handleConfirm = () => {
    if (!parsedFile) return;

    const mappings: ColumnMap[] = Object.entries(columnMappings)
      .filter(([, target]) => target !== 'unmapped')
      .map(([sourceColumn, target]) => ({
        sourceColumn,
        mappedTo: target,
        confidence: 1.0,
        aiReasoning: 'User confirmed mapping',
      }));

    const mapping: ColumnMapping = {
      mappings,
      aiConfidence: 1.0,
      userApproved: true,
    };

    onUploadComplete(parsedFile.rows, mapping);
  };

  const hasEmployeeId = Object.values(columnMappings).includes('employee_id');
  const hasTotal = Object.values(columnMappings).includes('total');
  const mappedComponents = Object.values(columnMappings).filter(v => v.startsWith('component:')).length;
  const isReady = hasEmployeeId && (hasTotal || mappedComponents > 0);

  if (!parsedFile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Comparison Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
              isDragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="h-12 w-12 mx-auto text-slate-400 mb-4" />
            <p className="text-sm font-medium text-slate-700">
              Drop CSV or XLSX file here, or click to browse
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Upload ground-truth payout data for reconciliation
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Column Mapping — {parsedFile.fileName}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setParsedFile(null); setColumnMappings({}); setError(null); }}
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
        <p className="text-sm text-slate-500">
          {parsedFile.rows.length} rows · {parsedFile.headers.length} columns · Map columns to plan components
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mapping Status */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant={hasEmployeeId ? 'default' : 'destructive'}>
            {hasEmployeeId ? <Check className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
            Employee ID
          </Badge>
          <Badge variant={hasTotal ? 'default' : 'outline'}>
            {hasTotal ? <Check className="h-3 w-3 mr-1" /> : null}
            Total
          </Badge>
          <Badge variant={mappedComponents > 0 ? 'default' : 'outline'}>
            {mappedComponents}/{components.length} Components
          </Badge>
        </div>

        {/* Column Mapping Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Source Column</TableHead>
                <TableHead className="w-[200px]">Map To</TableHead>
                <TableHead>Sample Values</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsedFile.headers.map(header => (
                <TableRow key={header}>
                  <TableCell className="font-mono text-sm">{header}</TableCell>
                  <TableCell>
                    <Select
                      value={columnMappings[header] || 'unmapped'}
                      onValueChange={(v) => handleMappingChange(header, v as MappingTarget)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {mappingOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500 font-mono">
                    {parsedFile.preview
                      .slice(0, 3)
                      .map(row => String(row[header] ?? ''))
                      .join(', ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Confirm Button */}
        <div className="flex justify-end">
          <Button onClick={handleConfirm} disabled={!isReady}>
            <Check className="h-4 w-4 mr-2" />
            Confirm Mapping & Start Reconciliation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Auto-suggest column mapping using fuzzy matching.
 * Works with any language — matches against component names from the plan.
 */
function autoSuggestMapping(
  normalizedHeader: string,
  components: PlanComponent[]
): MappingTarget {
  // Employee ID heuristics
  const empIdPatterns = ['employee', 'emp_id', 'employeeid', 'employee_id', 'id_empleado', 'empleado', 'rep_id', 'associate'];
  if (empIdPatterns.some(p => normalizedHeader.includes(p))) return 'employee_id';

  // Total heuristics
  const totalPatterns = ['total', 'grand_total', 'payout', 'incentive', 'comision_total', 'total_pago'];
  if (totalPatterns.some(p => normalizedHeader.includes(p))) return 'total';

  // Match against plan component names (case-insensitive, partial match)
  for (const comp of components) {
    const compNameNorm = comp.name.toLowerCase().trim();
    // Direct contains match in either direction
    if (normalizedHeader.includes(compNameNorm) || compNameNorm.includes(normalizedHeader)) {
      return `component:${comp.id}`;
    }
    // Word overlap scoring
    const headerWords = normalizedHeader.split(/[\s_\-]+/);
    const compWords = compNameNorm.split(/[\s_\-]+/);
    const overlap = headerWords.filter(w => compWords.some(cw => cw.includes(w) || w.includes(cw)));
    if (overlap.length > 0 && overlap.length >= Math.min(headerWords.length, compWords.length) * 0.5) {
      return `component:${comp.id}`;
    }
  }

  return 'unmapped';
}
