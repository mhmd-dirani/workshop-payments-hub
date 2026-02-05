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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const debtSchema = z.object({
  person_name: z.string().trim().min(1, 'Person name is required').max(100),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  debt_date: z.string().min(1, 'Date is required'),
  debt_type: z.enum(['i_owe', 'they_owe']),
  description: z.string().max(500).optional(),
});

type DebtFormData = z.infer<typeof debtSchema>;

interface DebtFormProps {
  debt?: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledPersonName?: string;
  prefilledDebtType?: 'i_owe' | 'they_owe';
}

export default function DebtForm({ 
  debt, 
  open, 
  onOpenChange, 
  prefilledPersonName = '', 
  prefilledDebtType = 'they_owe' 
}: DebtFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!debt;

  const form = useForm<DebtFormData>({
    resolver: zodResolver(debtSchema),
    defaultValues: {
      person_name: '',
      amount: 0,
      debt_date: format(new Date(), 'yyyy-MM-dd'),
      debt_type: 'they_owe',
      description: '',
    },
  });

  useEffect(() => {
    if (debt) {
      form.reset({
        person_name: debt.person_name,
        amount: debt.amount,
        debt_date: debt.debt_date,
        debt_type: debt.debt_type,
        description: debt.description || '',
      });
    } else {
      form.reset({
        person_name: prefilledPersonName,
        amount: 0,
        debt_date: format(new Date(), 'yyyy-MM-dd'),
        debt_type: prefilledDebtType,
        description: '',
      });
    }
  }, [debt, form, open, prefilledPersonName, prefilledDebtType]);

  const mutation = useMutation({
    mutationFn: async (data: DebtFormData) => {
      if (isEditing) {
        const { error } = await supabase
          .from('debts')
          .update({
            person_name: data.person_name,
            amount: data.amount,
            debt_date: data.debt_date,
            debt_type: data.debt_type,
            description: data.description || null,
          })
          .eq('id', debt.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('debts')
          .insert([{
            person_name: data.person_name,
            amount: data.amount,
            debt_date: data.debt_date,
            debt_type: data.debt_type,
            description: data.description || null,
            created_by: user?.id,
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      onOpenChange(false);
      toast({
        title: isEditing ? t('debts.debtUpdated') : t('debts.debtAdded'),
        description: isEditing ? t('debts.debtUpdatedDesc') : t('debts.debtAddedDesc'),
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

  const onSubmit = (data: DebtFormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('debts.editDebt') : t('debts.addNewDebt')}</DialogTitle>
          <DialogDescription>
            {isEditing ? t('debts.updateDebtDetails') : t('debts.recordNewDebt')}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="debt_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('debts.debtType')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('debts.selectType')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="they_owe">{t('debts.theyOweMe')}</SelectItem>
                      <SelectItem value="i_owe">{t('debts.iOweThem')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="person_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('debts.personName')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('debts.whoPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.amount')} (CFA)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder={t('debts.howMuchPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="debt_date"
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

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('debts.descriptionOptional')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('debts.notesPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button 
                type="submit" 
                disabled={mutation.isPending}
                className="gradient-primary text-primary-foreground"
              >
                {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditing ? t('common.update') : t('debts.addDebt')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
