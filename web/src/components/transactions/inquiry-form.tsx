'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { audit } from '@/lib/audit-service';
import { LoadingButton } from '@/components/ui/loading-button';
import { modalVariants } from '@/lib/animations';

interface Props {
  orderId: string;
  transactionId: string;
  open: boolean;
  onClose: () => void;
}

interface FormErrors {
  inquiryType?: string;
  description?: string;
}

export function InquiryForm({ orderId, transactionId, open, onClose }: Props) {
  const [inquiryType, setInquiryType] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!inquiryType) {
      newErrors.inquiryType = 'Please select an inquiry type';
    }
    if (!description.trim()) {
      newErrors.description = 'Please describe your inquiry';
    } else if (description.trim().length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Simulate API call
      await new Promise(r => setTimeout(r, 1500));

      console.log('Inquiry submitted:', { orderId, transactionId, inquiryType, description });

      // Audit log the inquiry submission
      audit.log({
        action: 'create',
        entityType: 'inquiry',
        entityId: `inquiry-${Date.now()}`,
        metadata: { transactionId, orderId, inquiryType }
      });

      setIsSubmitting(false);
      setIsSuccess(true);

      toast.success('Inquiry Submitted', {
        description: 'Your inquiry has been received. We\'ll respond within 24-48 hours.'
      });

      // Reset and close after animation
      setTimeout(() => {
        setIsSuccess(false);
        setInquiryType('');
        setDescription('');
        setErrors({});
        onClose();
      }, 2000);
    } catch {
      setIsSubmitting(false);
      toast.error('Submission Failed', {
        description: 'Please try again later.'
      });
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setErrors({});
      setInquiryType('');
      setDescription('');
      setIsSuccess(false);
      onClose();
    }
  };

  const clearError = (field: keyof FormErrors) => {
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              key="success"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="py-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h3 className="font-semibold text-lg">Inquiry Submitted!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  We&apos;ll respond within 24-48 hours.
                </p>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <DialogHeader>
                <DialogTitle>Submit Inquiry</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div>
                  <Label className="text-muted-foreground text-sm">Reference</Label>
                  <p className="font-mono text-sm mt-1">{orderId}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inquiry-type">
                    Inquiry Type <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={inquiryType}
                    onValueChange={(value) => {
                      setInquiryType(value);
                      clearError('inquiryType');
                    }}
                  >
                    <SelectTrigger
                      id="inquiry-type"
                      className={errors.inquiryType ? 'border-destructive' : ''}
                    >
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
                  <AnimatePresence>
                    {errors.inquiryType && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-sm text-destructive flex items-center gap-1"
                      >
                        <AlertCircle className="h-3 w-3" />
                        {errors.inquiryType}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">
                    Description <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="description"
                    placeholder="Describe your inquiry in detail..."
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      clearError('description');
                    }}
                    rows={4}
                    className={errors.description ? 'border-destructive' : ''}
                  />
                  <div className="flex justify-between items-center">
                    <AnimatePresence>
                      {errors.description && (
                        <motion.p
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="text-sm text-destructive flex items-center gap-1"
                        >
                          <AlertCircle className="h-3 w-3" />
                          {errors.description}
                        </motion.p>
                      )}
                    </AnimatePresence>
                    <p className="text-xs text-muted-foreground ml-auto">
                      {description.length} characters
                    </p>
                  </div>
                </div>

                <Alert>
                  <AlertDescription className="text-sm">
                    Our support team will review your inquiry and respond within 24-48 business hours.
                  </AlertDescription>
                </Alert>
              </div>

              <DialogFooter className="mt-6 gap-2 sm:gap-0">
                <LoadingButton
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </LoadingButton>
                <LoadingButton
                  onClick={handleSubmit}
                  loading={isSubmitting}
                  loadingText="Submitting..."
                  className="w-full sm:w-auto"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Submit Inquiry
                </LoadingButton>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
