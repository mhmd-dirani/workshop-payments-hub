import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
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
    .min(0.01, 'Amount must be greater than 0'),
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
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paidToOpen, setPaidToOpen] = useState(false);
  
  const [formData, setFormData] = useState<Payment>({
    paid_to: '',
    reason: '',
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
  });

  // Fetch all payees for autocomplete (uses security definer function to bypass RLS)
  const { data: previousPayees = [] } = useQuery({
    queryKey: ['previous-payees'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_payees');
      
      if (error) throw error;
      
      return data?.map((p: { paid_to: string }) => p.paid_to) || [];
    },
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
        // Create new payment
        const { error: paymentError } = await supabase
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
        if (paymentError) throw paymentError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-stats', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      onOpenChange(false);
      toast({
        title: payment?.id ? t('payments.paymentUpdated') : t('payments.paymentAdded'),
        description: role === 'admin' 
          ? t('payments.paymentSaved')
          : t('payments.pendingApproval'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = paymentSchema.safeParse(formData);
    if (!result.success) {
      const firstError = result.error.errors[0];
      toast({
        title: t('validation.validationError'),
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
          <DialogTitle>{payment?.id ? t('payments.editPayment') : t('payments.addNewPayment')}</DialogTitle>
          <DialogDescription>
            {role === 'admin' 
              ? t('payments.addPaymentRecord')
              : t('payments.submitForApproval')}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('payments.paidTo')} *</Label>
            <Popover open={paidToOpen} onOpenChange={setPaidToOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={paidToOpen}
                  className="w-full justify-between font-normal"
                >
                  {formData.paid_to || t('payments.selectOrTypeName')}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-[--radix-popover-trigger-width] p-0" 
                align="start"
              >
                <Command shouldFilter={true}>
                  <CommandInput 
                    placeholder={t('common.search')}
                    value={formData.paid_to}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, paid_to: value }))}
                  />
                  <div 
                    className="max-h-[200px] overflow-y-auto overscroll-contain"
                    style={{ touchAction: 'pan-y' }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                  >
                    <CommandList className="max-h-none">
                      <CommandEmpty>
                        <div className="py-2 px-2 text-sm">
                          {t('payments.pressEnterToUse')} "<span className="font-medium">{formData.paid_to}</span>"
                        </div>
                      </CommandEmpty>
                      <CommandGroup heading={t('payments.previousRecipients')}>
                        {previousPayees.map((payee) => (
                          <CommandItem
                            key={payee}
                            value={payee}
                            onSelect={(value) => {
                              setFormData(prev => ({ ...prev, paid_to: value }));
                              setPaidToOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.paid_to === payee ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {payee}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </div>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="reason">{t('common.reason')} *</Label>
            <Textarea
              id="reason"
              placeholder={t('payments.whatWasPaymentFor')}
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">{t('common.amount')} *</Label>
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
              <Label htmlFor="payment_date">{t('common.date')} *</Label>
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
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={saveMutation.isPending}
              className="gradient-primary text-primary-foreground"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {payment?.id ? t('payments.saveChanges') : t('payments.addPayment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}