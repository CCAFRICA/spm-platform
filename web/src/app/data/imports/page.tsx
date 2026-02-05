'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, History, FileText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { pageVariants, containerVariants, itemVariants } from '@/lib/animations';
import { FileUpload } from '@/components/import/file-upload';
import { ImportHistory } from '@/components/import/import-history';
import { getImportHistory } from '@/lib/financial-service';
import { TableSkeleton } from '@/components/ui/skeleton-loaders';

export default function ImportsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [imports] = useState(getImportHistory());

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const handleFileSelect = () => {
    toast.success('File uploaded', {
      description: 'Redirecting to import wizard...',
    });
    router.push('/data/import');
  };

  const handleViewImport = (id: string) => {
    toast.info(`Viewing import ${id}`);
  };

  const handleRetryImport = (id: string) => {
    toast.info(`Retrying import ${id}`);
  };

  // Calculate summary stats
  const stats = {
    total: imports.length,
    completed: imports.filter((i) => i.status === 'completed' && i.errorRows === 0).length,
    partial: imports.filter((i) => i.status === 'completed' && i.errorRows > 0).length,
    failed: imports.filter((i) => i.status === 'failed').length,
    totalRows: imports.reduce((sum, i) => sum + i.totalRows, 0),
    successRows: imports.reduce((sum, i) => sum + i.successRows, 0),
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900"
    >
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Import Data
            </h1>
            <p className="text-slate-500 mt-1">
              Import transactions from external sources
            </p>
          </div>
          <Button onClick={() => router.push('/data/import')}>
            <Upload className="h-4 w-4 mr-2" />
            New Import
          </Button>
        </div>

        {/* Stats Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid gap-4 md:grid-cols-4 mb-6"
        >
          <motion.div variants={itemVariants}>
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <FileText className="h-5 w-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-sm text-slate-500">Total Imports</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={itemVariants}>
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">{stats.completed}</p>
                    <p className="text-sm text-slate-500">Successful</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={itemVariants}>
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600">{stats.partial}</p>
                    <p className="text-sm text-slate-500">Partial</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={itemVariants}>
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <XCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                    <p className="text-sm text-slate-500">Failed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue="history" className="space-y-6">
          <TabsList>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Import History
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Quick Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Import History</CardTitle>
                <CardDescription>
                  View all past imports and their status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <TableSkeleton rows={5} cols={7} />
                ) : (
                  <ImportHistory
                    imports={imports}
                    onView={handleViewImport}
                    onRetry={handleRetryImport}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="upload">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Quick Upload</CardTitle>
                <CardDescription>
                  Drag and drop a file to start a new import
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUpload onFileSelect={handleFileSelect} />
                <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">Supported Sources</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {['Salesforce', 'HubSpot', 'NetSuite', 'CSV/Excel'].map((source) => (
                      <div
                        key={source}
                        className="p-3 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-center text-sm"
                      >
                        {source}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}
