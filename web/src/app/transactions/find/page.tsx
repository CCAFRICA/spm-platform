'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTenant, useTerm, useCurrency } from '@/contexts/tenant-context';
import { pageVariants } from '@/lib/animations';

interface TransactionResult {
  id: string;
  date: string;
  customer?: string;
  table?: string;
  amount: number;
  commission?: number;
  tip?: number;
  status: string;
  rep?: string;
  server?: string;
}

// Mock search results
const mockResults: Record<string, TransactionResult> = {
  'TXN-001': { id: 'TXN-001', date: '2024-12-15', customer: 'Acme Corp', amount: 125000, commission: 8750, status: 'completed', rep: 'Sarah Chen' },
  'TXN-003': { id: 'TXN-003', date: '2024-12-13', customer: 'Global Solutions', amount: 89000, commission: 6230, status: 'pending', rep: 'Emily Rodriguez' },
  'CHK-001': { id: 'CHK-001', date: '2024-12-15', table: 'Mesa 12', amount: 2450, tip: 490, status: 'paid', server: 'Carlos García' },
  'CHK-003': { id: 'CHK-003', date: '2024-12-15', table: 'Mesa 8', amount: 1850, tip: 370, status: 'pending', server: 'Carlos García' },
};

export default function FindOrderPage() {
  const { currentTenant } = useTenant();
  const transactionTerm = useTerm('transaction');
  const repTerm = useTerm('salesRep');
  const { format } = useCurrency();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<TransactionResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const isHospitality = currentTenant?.industry === 'Hospitality';

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setSearched(true);

    // Simulate API call
    await new Promise(r => setTimeout(r, 500));

    const found = mockResults[query.toUpperCase()];
    setResult(found || null);
    setIsSearching(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'paid':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      completed: 'default',
      paid: 'default',
      pending: 'secondary',
      cancelled: 'destructive',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="p-6 max-w-2xl mx-auto"
    >
      <Card>
        <CardHeader className="text-center">
          <motion.div
            className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <Search className="h-8 w-8 text-primary" />
          </motion.div>
          <CardTitle className="text-2xl">Find My {transactionTerm}</CardTitle>
          <CardDescription>
            Enter your {transactionTerm.toLowerCase()} number or reference ID to look it up
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-2">
            <Input
              placeholder={isHospitality ? 'e.g., CHK-001' : 'e.g., TXN-001'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="text-lg h-12"
            />
            <Button onClick={handleSearch} size="lg" disabled={isSearching}>
              {isSearching ? (
                <span className="animate-pulse">Searching...</span>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>

          {searched && !isSearching && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {result ? (
                <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-900/10">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(result.status)}
                        <div>
                          <h3 className="font-bold text-lg">{result.id}</h3>
                          <p className="text-sm text-muted-foreground">{result.date}</p>
                        </div>
                      </div>
                      {getStatusBadge(result.status)}
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      {isHospitality ? (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground">Table</p>
                            <p className="font-medium">{result.table}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{repTerm}</p>
                            <p className="font-medium">{result.server}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Amount</p>
                            <p className="font-medium">{format(result.amount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Tip</p>
                            <p className="font-medium text-green-600">{format(result.tip)}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground">Customer</p>
                            <p className="font-medium">{result.customer}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{repTerm}</p>
                            <p className="font-medium">{result.rep}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Amount</p>
                            <p className="font-medium">{format(result.amount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Commission</p>
                            <p className="font-medium text-green-600">{format(result.commission)}</p>
                          </div>
                        </>
                      )}
                    </div>

                    <Button className="w-full mt-4" variant="outline">
                      View Full Details
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-900/10">
                  <CardContent className="pt-6 text-center">
                    <XCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                    <h3 className="font-semibold text-lg">No {transactionTerm} Found</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      We couldn&apos;t find a {transactionTerm.toLowerCase()} with ID &quot;{query}&quot;
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Please check the ID and try again, or contact support if you need help.
                    </p>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          <div className="text-center text-sm text-muted-foreground">
            <p>Having trouble finding your {transactionTerm.toLowerCase()}?</p>
            <Button variant="link" className="text-primary">
              Submit an Inquiry
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
