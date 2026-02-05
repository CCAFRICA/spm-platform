'use client';

import { motion } from 'framer-motion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Eye,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { formatFileSize, formatDuration, ImportJob } from '@/lib/financial-service';
import { containerVariants, itemVariants } from '@/lib/animations';

interface ImportHistoryProps {
  imports: ImportJob[];
  onView?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export function ImportHistory({ imports, onView, onRetry }: ImportHistoryProps) {
  const getStatusBadge = (status: string, errorRows: number) => {
    if (status === 'failed') {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    }
    if (status === 'processing') {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Processing
        </Badge>
      );
    }
    if (errorRows > 0) {
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Partial
        </Badge>
      );
    }
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1">
        <CheckCircle className="h-3 w-3" />
        Complete
      </Badge>
    );
  };

  const getSourceBadge = (source: string) => {
    const colors: Record<string, string> = {
      Salesforce: 'bg-blue-100 text-blue-700',
      HubSpot: 'bg-orange-100 text-orange-700',
      NetSuite: 'bg-purple-100 text-purple-700',
      Manual: 'bg-slate-100 text-slate-700',
    };
    return (
      <Badge variant="outline" className={colors[source] || colors.Manual}>
        {source}
      </Badge>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-900">
              <TableHead>File</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Imported</TableHead>
              <TableHead className="text-center">Rows</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.map((job, index) => (
              <motion.tr
                key={job.id}
                variants={itemVariants}
                custom={index}
                className="border-b hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="font-medium text-sm">{job.fileName}</p>
                      <p className="text-xs text-slate-500">
                        {formatFileSize(job.fileSize)}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{getSourceBadge(job.source)}</TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm">{formatDate(job.importedAt)}</p>
                    <p className="text-xs text-slate-500">{job.importedBy}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-center">
                          <p className="font-medium text-sm">
                            {job.successRows}/{job.totalRows}
                          </p>
                          {(job.errorRows > 0 || job.warningRows > 0) && (
                            <div className="flex items-center justify-center gap-2 text-xs mt-1">
                              {job.errorRows > 0 && (
                                <span className="text-red-600">
                                  {job.errorRows} errors
                                </span>
                              )}
                              {job.warningRows > 0 && (
                                <span className="text-amber-600">
                                  {job.warningRows} warnings
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-1">
                          <p>Success: {job.successRows}</p>
                          <p>Errors: {job.errorRows}</p>
                          <p>Warnings: {job.warningRows}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell>
                  {getStatusBadge(job.status, job.errorRows)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-slate-500">
                    <Clock className="h-3 w-3" />
                    <span className="text-sm">{formatDuration(job.duration)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {onView && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onView(job.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {onRetry && job.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onRetry(job.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </div>
    </motion.div>
  );
}
