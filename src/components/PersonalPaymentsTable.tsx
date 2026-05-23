import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, Edit, Wallet, Plus, ChevronDown } from 'lucide-react';
import PersonalPaymentForm from './PersonalPaymentForm';
import { useIsMobile } from '@/hooks/use-mobile';

interface PersonalPayment {
  id: string;
  paid_to: string;
  reason: string;
  amount: number;
  payment_date: string;
  created_at: string;
}

export default function PersonalPaymentsTable() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PersonalPayment | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<PersonalPayment | null>(null);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['personal-payments', user?.id],
    queryFn: async () => {
      const { fetchAllPages } = await import('@/lib/paginate');
      const data = await fetchAllPages<any>((from, to) =>
        supabase
          .from('personal_payments')
          .select('*')
          .eq('user_id', user?.id)
          .order('payment_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      );
      return data.filter(p => !p.reason?.includes('[WORKER_DEBT]')) as PersonalPayment[];
    },
    enabled: !!user?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('personal_payments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-payments'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      setPaymentToDelete(null);
      toast({ title: t('personalPayments.deleted'), description: t('personalPayments.deletedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const handleEdit = (payment: PersonalPayment) => {
    setEditingPayment(payment);
    setIsFormOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) setEditingPayment(null);
  };

  const totalSpent = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Card className="shadow-card">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Wallet className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                  <CardTitle className="text-sm md:text-base truncate">{t('personalPayments.title')}</CardTitle>
                  <span className="text-xs md:text-sm font-bold font-mono text-destructive flex-shrink-0">
                    -{totalSpent.toLocaleString('fr-FR')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setIsFormOpen(true); }}
                    className="gap-1 h-7 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CollapsibleTrigger>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : payments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {t('personalPayments.noPayments')}
            </p>
          ) : isMobile ? (
            <div className="space-y-2">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{payment.paid_to}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{payment.reason}</p>
                    </div>
                    <p className="font-bold font-mono text-destructive text-sm ml-2">
                      -{Number(payment.amount).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(payment.payment_date), 'dd/MM/yyyy')}
                    </p>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(payment)} className="h-7 w-7">
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPaymentToDelete(payment)}
                        className="h-7 w-7 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">{t('common.date')}</th>
                    <th className="text-left p-3 font-medium">{t('payments.paidTo')}</th>
                    <th className="text-left p-3 font-medium">{t('common.reason')}</th>
                    <th className="text-right p-3 font-medium">{t('common.amount')}</th>
                    <th className="text-right p-3 font-medium w-24">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-t">
                      <td className="p-3">{format(new Date(payment.payment_date), 'dd/MM/yyyy')}</td>
                      <td className="p-3">{payment.paid_to}</td>
                      <td className="p-3 max-w-[200px] truncate">{payment.reason}</td>
                      <td className="p-3 text-right font-mono font-medium text-destructive">
                        -{Number(payment.amount).toLocaleString('fr-FR')}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(payment)} className="h-8 w-8">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPaymentToDelete(payment)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Form */}
      <PersonalPaymentForm
        payment={editingPayment}
        open={isFormOpen}
        onOpenChange={handleFormClose}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!paymentToDelete} onOpenChange={(open) => !open && setPaymentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('personalPayments.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('personalPayments.deleteWarning', { amount: paymentToDelete?.amount.toLocaleString('fr-FR') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => paymentToDelete && deleteMutation.mutate(paymentToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
