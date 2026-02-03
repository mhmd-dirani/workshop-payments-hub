import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const personalPaymentSchema = z.object({
  paid_to: z.string().trim().min(1, 'Paid to is required').max(200),
  reason: z.string().trim().min(1, 'Reason is required').max(1000),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  payment_date: z.string().min(1, 'Date is required'),
});

type PersonalPaymentFormData = z.infer<typeof personalPaymentSchema>;

interface PersonalPaymentFormProps {
  payment?: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PersonalPaymentForm({ 
  payment, 
  open, 
  onOpenChange 
}: PersonalPaymentFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!payment;

  const form = useForm<PersonalPaymentFormData>({
    resolver: zodResolver(personalPaymentSchema),
    defaultValues: {
      paid_to: '',
      reason: '',
      amount: 0,
      payment_date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  useEffect(() => {
    if (open) {
      if (payment) {
        form.reset({
          paid_to: payment.paid_to,
          reason: payment.reason,
          amount: payment.amount,
          payment_date: payment.payment_date,
        });
      } else {
        form.reset({
          paid_to: '',
          reason: '',
          amount: 0,
          payment_date: format(new Date(), 'yyyy-MM-dd'),
        });
      }
    }
  }, [payment, open, form]);

  const mutation = useMutation({
    mutationFn: async (data: PersonalPaymentFormData) => {
      if (isEditing) {
        const { error } = await supabase
          .from('personal_payments')
          .update({
            paid_to: data.paid_to,
            reason: data.reason,
            amount: data.amount,
            payment_date: data.payment_date,
          })
          .eq('id', payment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('personal_payments')
          .insert([{
            user_id: user?.id,
            paid_to: data.paid_to,
            reason: data.reason,
            amount: data.amount,
            payment_date: data.payment_date,
            created_by: user?.id,
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-payments'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      onOpenChange(false);
      toast({
        title: isEditing ? t('personalPayments.updated') : t('personalPayments.added'),
        description: t('personalPayments.balanceDeducted'),
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

  const onSubmit = (data: PersonalPaymentFormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('personalPayments.edit') : t('personalPayments.add')}
          </DialogTitle>
          <DialogDescription>
            {t('personalPayments.description')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="paid_to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('payments.paidTo')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('personalPayments.paidToPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.reason')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('personalPayments.reasonPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.amount')}</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.date')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditing ? t('common.save') : t('common.add')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
