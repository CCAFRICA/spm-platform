"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Database,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Upload,
  FileText,
  Activity,
} from "lucide-react";

// Mock data operations data
const dataMetrics = {
  recordsToday: 2290,
  errorRate: 0.3,
  completeness: 98.5,
  lastSync: "2024-12-15T06:00:00Z",
};

const recentLoads = [
  {
    id: "DL-001",
    timestamp: "2024-12-15T06:00:00Z",
    source: "Salesforce CRM",
    records: 1250,
    success: 1248,
    failed: 2,
    status: "completed",
    duration: 45,
  },
  {
    id: "DL-002",
    timestamp: "2024-12-14T06:00:00Z",
    source: "SAP ERP",
    records: 890,
    success: 890,
    failed: 0,
    status: "completed",
    duration: 32,
  },
  {
    id: "DL-003",
    timestamp: "2024-12-13T06:00:00Z",
    source: "Excel Upload",
    records: 150,
    success: 145,
    failed: 5,
    status: "completed",
    duration: 12,
  },
  {
    id: "DL-004",
    timestamp: "2024-12-15T08:30:00Z",
    source: "API Integration",
    records: 500,
    success: 0,
    failed: 500,
    status: "failed",
    duration: 5,
  },
  {
    id: "DL-005",
    timestamp: "2024-12-12T06:00:00Z",
    source: "Salesforce CRM",
    records: 1180,
    success: 1180,
    failed: 0,
    status: "completed",
    duration: 42,
  },
  {
    id: "DL-006",
    timestamp: "2024-12-11T06:00:00Z",
    source: "Manual Entry",
    records: 25,
    success: 25,
    failed: 0,
    status: "completed",
    duration: 3,
  },
];

const dataErrors = [
  {
    id: "ERR-001",
    timestamp: "2024-12-15T08:30:00Z",
    severity: "critical",
    source: "API Integration",
    message: "Authentication token expired - connection refused",
    affectedRecords: 500,
  },
  {
    id: "ERR-002",
    timestamp: "2024-12-15T06:02:00Z",
    severity: "warning",
    source: "Salesforce CRM",
    message: "Duplicate record detected - skipped insertion",
    affectedRecords: 2,
  },
  {
    id: "ERR-003",
    timestamp: "2024-12-13T06:05:00Z",
    severity: "warning",
    source: "Excel Upload",
    message: "Invalid date format in column 'Close Date'",
    affectedRecords: 5,
  },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "in_progress":
      return <Clock className="h-4 w-4 text-blue-500" />;
    default:
      return <Clock className="h-4 w-4 text-slate-500" />;
  }
}

function getSeverityStyle(severity: string): { bg: string; text: string } {
  switch (severity) {
    case "critical":
      return { bg: "bg-red-100", text: "text-red-700" };
    case "warning":
      return { bg: "bg-amber-100", text: "text-amber-700" };
    default:
      return { bg: "bg-slate-100", text: "text-slate-700" };
  }
}

export default function DataPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-50">
              Data Operations
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Monitor data loads, quality metrics, and system health
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Data
            </Button>
            <Button className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync Now
            </Button>
          </div>
        </div>

        {/* Data Quality Metrics */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Records Today</p>
                  <p className="text-2xl font-bold">{dataMetrics.recordsToday.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-indigo-100 rounded-full">
                  <Database className="h-5 w-5 text-indigo-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Error Rate</p>
                  <p className="text-2xl font-bold">{dataMetrics.errorRate}%</p>
                  <Badge className="mt-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    Healthy
                  </Badge>
                </div>
                <div className="p-3 bg-emerald-100 rounded-full">
                  <Activity className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Data Completeness</p>
                  <p className="text-2xl font-bold">{dataMetrics.completeness}%</p>
                  <div className="mt-2 h-2 w-20 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${dataMetrics.completeness}%` }}
                    />
                  </div>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <FileText className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Last Sync</p>
                  <p className="text-lg font-bold">
                    {formatDate(dataMetrics.lastSync)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Scheduled: Daily 6AM</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <RefreshCw className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Data Loads */}
        <Card className="border-0 shadow-lg mb-6">
          <CardHeader>
            <CardTitle>Recent Data Loads</CardTitle>
            <CardDescription>History of data synchronization operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-800/50">
                    <TableHead className="font-semibold">Timestamp</TableHead>
                    <TableHead className="font-semibold">Source</TableHead>
                    <TableHead className="font-semibold text-right">Records</TableHead>
                    <TableHead className="font-semibold text-right">Success</TableHead>
                    <TableHead className="font-semibold text-right">Failed</TableHead>
                    <TableHead className="font-semibold">Duration</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLoads.map((load) => (
                    <TableRow key={load.id} className="hover:bg-slate-800/50">
                      <TableCell className="text-slate-600">
                        {formatDate(load.timestamp)}
                      </TableCell>
                      <TableCell className="font-medium">{load.source}</TableCell>
                      <TableCell className="text-right">{load.records.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-emerald-600 font-medium">
                        {load.success.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {load.failed > 0 ? (
                          <span className="text-red-600 font-medium">{load.failed}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600">{load.duration}s</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(load.status)}
                          <span className={load.status === "failed" ? "text-red-600" : "text-slate-600"}>
                            {load.status.charAt(0).toUpperCase() + load.status.slice(1)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Data Quality Errors */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Data Quality Issues
                </CardTitle>
                <CardDescription>Recent errors and warnings</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                {dataErrors.length} Issues
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dataErrors.map((error) => {
                const style = getSeverityStyle(error.severity);
                return (
                  <div
                    key={error.id}
                    className="p-4 rounded-lg border border-slate-700"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Badge variant="secondary" className={`${style.bg} ${style.text}`}>
                          {error.severity.charAt(0).toUpperCase() + error.severity.slice(1)}
                        </Badge>
                        <div>
                          <p className="font-medium text-slate-50">
                            {error.message}
                          </p>
                          <p className="text-sm text-slate-500 mt-1">
                            Source: {error.source} • {error.affectedRecords} records affected
                          </p>
                        </div>
                      </div>
                      <span className="text-sm text-slate-500">
                        {formatDate(error.timestamp)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
