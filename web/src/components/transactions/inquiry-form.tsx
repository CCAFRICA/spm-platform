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
import { audit } from '@/lib/audit-service';

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

    // Audit log the inquiry submission
    audit.log({
      action: 'create',
      entityType: 'inquiry',
      entityId: `inquiry-${Date.now()}`,
      metadata: { transactionId, orderId, inquiryType }
    });

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
              We&apos;ll respond within 24-48 hours.
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
