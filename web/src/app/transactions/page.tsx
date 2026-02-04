"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Filter,
  Download,
  MoreHorizontal,
  Eye,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";

type TransactionStatus = "completed" | "pending" | "processing" | "failed";
type TransactionType = "commission" | "bonus" | "spif" | "adjustment" | "clawback";

interface Transaction {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  deal: string;
  amount: number;
  status: TransactionStatus;
  payPeriod: string;
}

const transactions: Transaction[] = [
  {
    id: "TXN-001",
    date: "2024-12-15",
    description: "Commission - Enterprise Deal",
    type: "commission",
    deal: "Acme Corp - Platform License",
    amount: 8450.00,
    status: "completed",
    payPeriod: "Dec 2024",
  },
  {
    id: "TXN-002",
    date: "2024-12-14",
    description: "Q4 Accelerator Bonus",
    type: "bonus",
    deal: "Quota Achievement 115%",
    amount: 5000.00,
    status: "completed",
    payPeriod: "Dec 2024",
  },
  {
    id: "TXN-003",
    date: "2024-12-12",
    description: "Commission - Mid-Market",
    type: "commission",
    deal: "TechStart Inc - Annual",
    amount: 3200.00,
    status: "processing",
    payPeriod: "Dec 2024",
  },
  {
    id: "TXN-004",
    date: "2024-12-10",
    description: "SPIF - Product Launch",
    type: "spif",
    deal: "New Product Attachment",
    amount: 1500.00,
    status: "completed",
    payPeriod: "Dec 2024",
  },
  {
    id: "TXN-005",
    date: "2024-12-08",
    description: "Commission - SMB Deal",
    type: "commission",
    deal: "CloudNine Solutions",
    amount: 1875.00,
    status: "completed",
    payPeriod: "Dec 2024",
  },
  {
    id: "TXN-006",
    date: "2024-12-05",
    description: "Adjustment - Rate Correction",
    type: "adjustment",
    deal: "Q3 Commission Adjustment",
    amount: 750.00,
    status: "completed",
    payPeriod: "Dec 2024",
  },
  {
    id: "TXN-007",
    date: "2024-12-01",
    description: "Commission - Renewal",
    type: "commission",
    deal: "DataFlow Systems - Renewal",
    amount: 2100.00,
    status: "pending",
    payPeriod: "Dec 2024",
  },
  {
    id: "TXN-008",
    date: "2024-11-28",
    description: "Clawback - Churned Account",
    type: "clawback",
    deal: "QuickServe Ltd - Cancelled",
    amount: -1200.00,
    status: "completed",
    payPeriod: "Nov 2024",
  },
  {
    id: "TXN-009",
    date: "2024-11-25",
    description: "Commission - Enterprise",
    type: "commission",
    deal: "Global Industries - Expansion",
    amount: 6800.00,
    status: "completed",
    payPeriod: "Nov 2024",
  },
  {
    id: "TXN-010",
    date: "2024-11-20",
    description: "SPIF - Holiday Push",
    type: "spif",
    deal: "Multi-deal Achievement",
    amount: 2500.00,
    status: "failed",
    payPeriod: "Nov 2024",
  },
  {
    id: "TXN-011",
    date: "2024-11-18",
    description: "Commission - New Logo",
    type: "commission",
    deal: "Innovate Corp - New Business",
    amount: 4500.00,
    status: "completed",
    payPeriod: "Nov 2024",
  },
  {
    id: "TXN-012",
    date: "2024-11-15",
    description: "Commission - Upsell",
    type: "commission",
    deal: "TechGiant - Add-on Modules",
    amount: 2250.00,
    status: "completed",
    payPeriod: "Nov 2024",
  },
];

const summaryData = {
  totalEarnings: 37725.00,
  pendingAmount: 5300.00,
  completedCount: 9,
  pendingCount: 2,
};

const statusConfig: Record<TransactionStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700", icon: Clock },
  processing: { label: "Processing", color: "bg-blue-100 text-blue-700", icon: AlertCircle },
  failed: { label: "Failed", color: "bg-red-100 text-red-700", icon: XCircle },
};

const typeConfig: Record<TransactionType, { label: string; color: string }> = {
  commission: { label: "Commission", color: "bg-indigo-100 text-indigo-700" },
  bonus: { label: "Bonus", color: "bg-purple-100 text-purple-700" },
  spif: { label: "SPIF", color: "bg-pink-100 text-pink-700" },
  adjustment: { label: "Adjustment", color: "bg-slate-100 text-slate-700" },
  clawback: { label: "Clawback", color: "bg-orange-100 text-orange-700" },
};

export default function TransactionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredTransactions = transactions.filter((txn) => {
    const matchesSearch =
      txn.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.deal.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || txn.type === typeFilter;
    const matchesStatus = statusFilter === "all" || txn.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const formatCurrency = (amount: number) => {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Math.abs(amount));
    return amount < 0 ? `-${formatted}` : formatted;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Transactions
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              View and manage your compensation transactions
            </p>
          </div>
          <Button className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Earnings</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                    {formatCurrency(summaryData.totalEarnings)}
                  </p>
                </div>
                <div className="rounded-full bg-emerald-100 p-3 dark:bg-emerald-900/30">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Pending</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                    {formatCurrency(summaryData.pendingAmount)}
                  </p>
                </div>
                <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/30">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Completed</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                    {summaryData.completedCount}
                  </p>
                </div>
                <div className="rounded-full bg-indigo-100 p-3 dark:bg-indigo-900/30">
                  <ArrowUpRight className="h-5 w-5 text-indigo-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">In Progress</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                    {summaryData.pendingCount}
                  </p>
                </div>
                <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/30">
                  <ArrowDownRight className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions Table */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>
                  All compensation transactions for the current period
                </CardDescription>
              </div>
            </div>

            {/* Filters */}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search transactions..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                  <SelectItem value="bonus">Bonus</SelectItem>
                  <SelectItem value="spif">SPIF</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="clawback">Clawback</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead className="font-semibold">Transaction</TableHead>
                    <TableHead className="font-semibold">Type</TableHead>
                    <TableHead className="font-semibold">Deal / Source</TableHead>
                    <TableHead className="font-semibold">Pay Period</TableHead>
                    <TableHead className="text-right font-semibold">Amount</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((txn) => {
                    const status = statusConfig[txn.status];
                    const type = typeConfig[txn.type];
                    const StatusIcon = status.icon;

                    return (
                      <TableRow
                        key={txn.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-50">
                              {txn.description}
                            </p>
                            <p className="text-xs text-slate-500">
                              {txn.id} • {formatDate(txn.date)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`${type.color} font-medium`}
                          >
                            {type.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="max-w-[200px] truncate text-sm text-slate-600 dark:text-slate-400">
                            {txn.deal}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {txn.payPeriod}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`font-semibold ${
                              txn.amount < 0
                                ? "text-red-600"
                                : "text-slate-900 dark:text-slate-50"
                            }`}
                          >
                            {formatCurrency(txn.amount)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`${status.color} gap-1 font-medium`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="gap-2">
                                <Eye className="h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2">
                                <FileText className="h-4 w-4" />
                                Download PDF
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {filteredTransactions.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-slate-500">No transactions found</p>
              </div>
            )}

            {/* Pagination placeholder */}
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <p>
                Showing {filteredTransactions.length} of {transactions.length}{" "}
                transactions
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
