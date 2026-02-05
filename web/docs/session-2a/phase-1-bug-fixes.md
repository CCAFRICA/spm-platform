# Session 2A - Phase 1: Critical Bug Fixes
## Duration: 45 minutes

### Objective
Fix the Orders page 404 error and add transaction drill-down capability.

---

## Task 1.1: Fix Orders Page (20 min)

**Problem:** Navigation to `/transactions/orders` returns 404

**Solution:** Create or fix the orders page

**File:** `src/app/transactions/orders/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, Filter, Download, Eye, FileQuestion } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { TransactionDetailModal } from '@/components/transactions/transaction-detail-modal';

// Mock data - 50 transactions
const mockTransactions = Array.from({ length: 50 }, (_, i) => ({
  id: `txn-${i + 1}`,
  orderId: `ORD-2024-${String(i + 1).padStart(5, '0')}`,
  date: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString(),
  customerName: ['Acme Corp', 'TechGiant', 'Global Solutions', 'Innovative Systems', 'Premier Enterprises'][i % 5],
  productName: ['Enterprise Suite', 'Analytics Module', 'Cloud Infrastructure', 'Support Package'][i % 4],
  salesRepName: ['Sarah Chen', 'Marcus Johnson', 'Emily Rodriguez', 'David Kim'][i % 4],
  amount: Math.floor(Math.random() * 100000) + 5000,
  commissionAmount: Math.floor(Math.random() * 8000) + 500,
  status: ['completed', 'completed', 'completed', 'pending', 'cancelled'][i % 5] as const,
  region: ['West', 'East', 'North', 'South'][i % 4],
}));

export default function OrdersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTransaction, setSelectedTransaction] = useState<typeof mockTransactions[0] | null>(null);

  const filteredTransactions = mockTransactions.filter((t) => {
    const matchesSearch =
      t.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: mockTransactions.length,
    completed: mockTransactions.filter((t) => t.status === 'completed').length,
    pending: mockTransactions.filter((t) => t.status === 'pending').length,
    cancelled: mockTransactions.filter((t) => t.status === 'cancelled').length,
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      completed: 'default',
      pending: 'secondary',
      cancelled: 'destructive',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground">View and manage all transaction orders</p>
        </div>
        <Button><Download className="mr-2 h-4 w-4" />Export</Button>
      </div>

      {/* Status Filter Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {Object.entries(statusCounts).map(([status, count]) => (
          <Card
            key={status}
            className={`cursor-pointer transition-all hover:shadow-md ${
              statusFilter === status ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setStatusFilter(status)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium capitalize">
                {status === 'all' ? 'All Orders' : status}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{count}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by order ID, customer, or product..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Sales Rep</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.slice(0, 20).map((txn) => (
                <TableRow key={txn.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-mono text-sm">{txn.orderId}</TableCell>
                  <TableCell>{formatDate(txn.date)}</TableCell>
                  <TableCell>{txn.customerName}</TableCell>
                  <TableCell>{txn.productName}</TableCell>
                  <TableCell>{txn.salesRepName}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(txn.amount)}
                  </TableCell>
                  <TableCell>
                    <span className="text-green-600 font-medium">
                      {formatCurrency(txn.commissionAmount)}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(txn.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setSelectedTransaction(txn)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {Math.min(filteredTransactions.length, 20)} of {filteredTransactions.length} orders
          </div>
        </CardContent>
      </Card>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          open={!!selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
        />
      )}
    </div>
  );
}
```

---

## Task 1.2: Create Transaction Detail Modal (15 min)

**File:** `src/components/transactions/transaction-detail-modal.tsx`

```typescript
'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, Clock, User, Package, DollarSign, FileQuestion } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { InquiryForm } from './inquiry-form';

interface Transaction {
  id: string;
  orderId: string;
  date: string;
  customerName: string;
  productName: string;
  salesRepName: string;
  amount: number;
  commissionAmount: number;
  status: string;
  region: string;
}

interface Props {
  transaction: Transaction;
  open: boolean;
  onClose: () => void;
}

export function TransactionDetailModal({ transaction, open, onClose }: Props) {
  const [showInquiry, setShowInquiry] = useState(false);

  // Calculate commission breakdown
  const calc = {
    baseRate: 0.08,
    baseCommission: transaction.amount * 0.08,
    hasAccelerator: transaction.amount > 50000,
    acceleratorMultiplier: transaction.amount > 50000 ? 1.5 : 1.0,
    acceleratorBonus: transaction.amount > 50000 ? transaction.amount * 0.04 : 0,
    total: transaction.commissionAmount,
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Transaction Details</DialogTitle>
                <p className="text-sm text-muted-foreground font-mono mt-1">
                  {transaction.orderId}
                </p>
              </div>
              <Badge variant={transaction.status === 'completed' ? 'default' : 'secondary'}>
                {transaction.status}
              </Badge>
            </div>
          </DialogHeader>

          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Order Details</TabsTrigger>
              <TabsTrigger value="calculation">Commission Calculation</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase">
                    Order Info
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {formatDate(transaction.date)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {transaction.productName}
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{formatCurrency(transaction.amount)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase">
                    People
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>Customer: {transaction.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>Rep: {transaction.salesRepName}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Commission Earned</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(transaction.commissionAmount)}
                    </p>
                  </div>
                  <Badge variant="outline">Accelerator Plan</Badge>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="calculation" className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  <h4 className="font-semibold">Commission Breakdown</h4>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm space-y-2">
                  <div className="flex justify-between">
                    <span>Sale Amount:</span>
                    <span>{formatCurrency(transaction.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>× Base Rate ({(calc.baseRate * 100)}%):</span>
                    <span>{formatCurrency(calc.baseCommission)}</span>
                  </div>
                  
                  {calc.hasAccelerator && (
                    <>
                      <Separator />
                      <div className="flex justify-between text-blue-600">
                        <span>+ Accelerator Bonus (1.5x tier):</span>
                        <span>{formatCurrency(calc.acceleratorBonus)}</span>
                      </div>
                    </>
                  )}
                  
                  <Separator />
                  <div className="flex justify-between font-bold text-green-600">
                    <span>Total Commission:</span>
                    <span>{formatCurrency(calc.total)}</span>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-sm">
                  <p className="text-blue-800 dark:text-blue-200">
                    <strong>Plan:</strong> Accelerator Plan
                    {calc.hasAccelerator && ' • Tier 2 bonus applied (sales > $50K)'}
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setShowInquiry(true)}>
              <FileQuestion className="mr-2 h-4 w-4" />
              Submit Inquiry
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <InquiryForm
        orderId={transaction.orderId}
        transactionId={transaction.id}
        open={showInquiry}
        onClose={() => setShowInquiry(false)}
      />
    </>
  );
}
```

---

## Task 1.3: Create Inquiry Form (10 min)

**File:** `src/components/transactions/inquiry-form.tsx`

```typescript
'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  orderId: string;
  transactionId: string;
  open: boolean;
  onClose: () => void;
}

export function InquiryForm({ orderId, transactionId, open, onClose }: Props) {
  const [inquiryType, setInquiryType] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!inquiryType) {
      setError('Please select an inquiry type');
      return;
    }
    if (!description.trim()) {
      setError('Please describe your inquiry');
      return;
    }

    setError('');
    setIsSubmitting(true);

    // Simulate API call
    await new Promise(r => setTimeout(r, 1000));

    console.log('Inquiry submitted:', { orderId, transactionId, inquiryType, description });

    setIsSubmitting(false);
    setIsSuccess(true);

    // Reset and close after 2 seconds
    setTimeout(() => {
      setIsSuccess(false);
      setInquiryType('');
      setDescription('');
      onClose();
    }, 2000);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError('');
      setInquiryType('');
      setDescription('');
      setIsSuccess(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Inquiry</DialogTitle>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <h3 className="font-semibold">Inquiry Submitted!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              We'll respond within 24-48 hours.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div>
                <Label className="text-muted-foreground">Reference</Label>
                <p className="font-mono text-sm">{orderId}</p>
              </div>

              <div className="space-y-2">
                <Label>Inquiry Type *</Label>
                <Select value={inquiryType} onValueChange={setInquiryType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="calculation">Question about calculation</SelectItem>
                    <SelectItem value="incorrect">Incorrect amount</SelectItem>
                    <SelectItem value="missing">Missing transaction</SelectItem>
                    <SelectItem value="plan">Wrong plan applied</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  placeholder="Describe your inquiry..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : (
                  <><Send className="mr-2 h-4 w-4" />Submit</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

---

## Verification

After completing Phase 1:

```bash
npm run build
npm run dev
```

**Test:**
1. Navigate to `/transactions/orders` → Page loads ✓
2. Click status cards → Filter works ✓
3. Click eye icon on a row → Modal opens ✓
4. View "Commission Calculation" tab → Breakdown shown ✓
5. Click "Submit Inquiry" → Form opens ✓
6. Submit inquiry → Success message ✓

**If all tests pass, proceed to Phase 2.**
