'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { pageVariants } from '@/lib/animations';
import { ManualEntryForm } from '@/components/financial/manual-entry-form';

const mockSalesReps = [
  { id: 'user-001', name: 'Sarah Chen' },
  { id: 'user-002', name: 'Marcus Johnson' },
  { id: 'user-003', name: 'Emily Rodriguez' },
  { id: 'user-004', name: 'David Kim' },
  { id: 'user-005', name: 'Jennifer Lee' },
  { id: 'user-006', name: 'Michael Brown' },
  { id: 'user-007', name: 'Amanda White' },
  { id: 'user-008', name: 'Robert Taylor' },
];

export default function NewTransactionPage() {
  const router = useRouter();

  const handleSubmit = async () => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    toast.success('Transaction Created', {
      description: 'The transaction has been saved successfully.',
    });

    router.push('/data/transactions');
  };

  const handleCancel = () => {
    router.push('/data/transactions');
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900"
    >
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Transactions
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-50">
            New Transaction
          </h1>
          <p className="text-slate-500 mt-1">
            Manually enter a new transaction
          </p>
        </div>

        {/* Form */}
        <ManualEntryForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          salesReps={mockSalesReps}
        />
      </div>
    </motion.div>
  );
}
