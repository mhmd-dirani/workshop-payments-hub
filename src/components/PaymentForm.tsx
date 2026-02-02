import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

// Validation schema for payment form
const paymentSchema = z.object({
  paid_to: z.string()
    .trim()
    .min(1, 'Paid to is required')
    .max(200, 'Paid to must be less than 200 characters'),
  reason: z.string()
    .trim()
    .min(1, 'Reason is required')
    .max(1000, 'Reason must be less than 1000 characters'),
  amount: z.number()
    .min(0.01, 'Amount must be greater than 0')
    .max(100000000, 'Amount must be less than 100,000,000'),
  payment_date: z.string()
    .min(1, 'Date is required')
    .refine((date) => {
      const d = new Date(date);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return d <= today;
    }, 'Date cannot be in the future'),
});

interface Payment {
  id?: string;
  paid_to: string;
  reason: string;
  amount: number;
  payment_date: string;
  status?: string;
}

interface PaymentFormProps {
  workshopId: string;
  payment?: Payment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PaymentForm({ workshopId, payment, open, onOpenChange }: PaymentFormProps) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<Payment>({
    paid_to: '',
    reason: '',
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (payment) {
      setFormData({
        paid_to: payment.paid_to,
        reason: payment.reason,
        amount: payment.amount,
        payment_date: payment.payment_date,
      });
    } else {
      setFormData({
        paid_to: '',
        reason: '',
        amount: 0,
        payment_date: new Date().toISOString().split('T')[0],
      });
    }
  }, [payment, open]);

  const saveMutation = useMutation({
    mutationFn: async (data: Payment) => {
      if (payment?.id) {
        // Update existing
        const { error } = await supabase
          .from('payments')
          .update({
            paid_to: data.paid_to,
            reason: data.reason,
            amount: data.amount,
            payment_date: data.payment_date,
            // Reset to pending if user edits (unless admin)
            ...(role !== 'admin' && { status: 'pending' }),
          })
          .eq('id', payment.id);
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('payments')
          .insert([{
            workshop_id: workshopId,
            paid_to: data.paid_to,
            reason: data.reason,
            amount: data.amount,
            payment_date: data.payment_date,
            created_by: user?.id,
            // Admin payments are auto-approved
            status: role === 'admin' ? 'approved' : 'pending',
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
      onOpenChange(false);
      toast({
        title: payment?.id ? 'Payment updated' : 'Payment added',
        description: role === 'admin' 
          ? 'The payment has been saved' 
          : 'Your payment is pending admin approval',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data with Zod schema
    const result = paymentSchema.safeParse(formData);
    if (!result.success) {
      const firstError = result.error.errors[0];
      toast({
        title: 'Validation Error',
        description: firstError.message,
        variant: 'destructive',
      });
      return;
    }
    
    saveMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{payment?.id ? 'Edit Payment' : 'Add New Payment'}</DialogTitle>
          <DialogDescription>
            {role === 'admin' 
              ? 'Add a payment record to this workshop' 
              : 'Your payment will be submitted for admin approval'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="paid_to">Paid To *</Label>
            <Input
              id="paid_to"
              placeholder="Name of person or company"
              value={formData.paid_to}
              onChange={(e) => setFormData(prev => ({ ...prev, paid_to: e.target.value }))}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              placeholder="What was this payment for?"
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.amount || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="payment_date">Date *</Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
              />
            </div>
          </div>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={saveMutation.isPending}
              className="gradient-primary text-primary-foreground"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {payment?.id ? 'Save Changes' : 'Add Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
