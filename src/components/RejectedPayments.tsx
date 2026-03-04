import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { translatePaidTo, translateReason } from '@/lib/payment-display-utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { format } from 'date-fns';
import { XCircle, MessageSquare, Trash2 } from 'lucide-react';

interface RejectedPaymentsProps {
  workshopId: string;
}

export default function RejectedPayments({ workshopId }: RejectedPaymentsProps) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [paymentToDelete, setPaymentToDelete] = useState<any>(null);

  const { data: rejectedPayments, isLoading } = useQuery({
    queryKey: ['rejected-payments', workshopId],
    queryFn: async () => {
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('workshop_id', workshopId)
        .eq('status', 'rejected')
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;

      // Fetch profiles for creator names and rejector names
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.full_name]) || []);

      return paymentsData.map(payment => ({
        ...payment,
        creator_name: profileMap.get(payment.created_by) || 'Unknown',
        rejector_name: payment.approved_by ? profileMap.get(payment.approved_by) || 'Unknown' : null
      }));
    },
    enabled: !!workshopId,
  });

  const deletePayment = useMutation({
    mutationFn: async (paymentId: string) => {
      // Revert linked worker work/adjustments before deleting the payment
      const { data: linkedAttendance, error: linkedAttendanceError } = await supabase
        .from('attendance')
        .select('id, description')
        .eq('payment_id', paymentId);
      if (linkedAttendanceError) throw linkedAttendanceError;

      if (linkedAttendance && linkedAttendance.length > 0) {
        const creditIds = linkedAttendance
          .filter((a) => (a.description || '').includes('[ADVANCE_CREDIT]'))
          .map((a) => a.id);

        const normalIds = linkedAttendance
          .filter((a) => !(a.description || '').includes('[ADVANCE_CREDIT]'))
          .map((a) => a.id);

        if (creditIds.length > 0) {
          const { error: creditDeleteError } = await supabase.from('attendance').delete().in('id', creditIds);
          if (creditDeleteError) throw creditDeleteError;
        }

        if (normalIds.length > 0) {
          const { error: attendanceRevertError } = await supabase
            .from('attendance')
            .update({ is_paid: false, payment_id: null })
            .in('id', normalIds);
          if (attendanceRevertError) throw attendanceRevertError;
        }
      }

       // Revert linked adjustments, but DELETE payment-credit adjustments (otherwise they keep affecting balance)
       const { data: linkedAdjustments, error: linkedAdjustmentsError } = await supabase
         .from('worker_adjustments')
         .select('id, reason')
         .eq('payment_id', paymentId);
       if (linkedAdjustmentsError) throw linkedAdjustmentsError;

       const creditAdjIds = (linkedAdjustments || [])
         .filter((a) => (a.reason || '').includes('[PAYMENT_CREDIT]'))
         .map((a) => a.id);
       const normalAdjIds = (linkedAdjustments || [])
         .filter((a) => !(a.reason || '').includes('[PAYMENT_CREDIT]'))
         .map((a) => a.id);

       if (creditAdjIds.length > 0) {
         const { error: creditAdjDeleteError } = await supabase.from('worker_adjustments').delete().in('id', creditAdjIds);
         if (creditAdjDeleteError) throw creditAdjDeleteError;
       }

       if (normalAdjIds.length > 0) {
         const { error: adjustmentsRevertError } = await supabase
           .from('worker_adjustments')
           .update({ is_paid: false, payment_id: null })
           .in('id', normalAdjIds);
         if (adjustmentsRevertError) throw adjustmentsRevertError;
       }

      // Delete linked contractor_payments
      await supabase.from('contractor_payments').delete().eq('payment_id', paymentId);

      const { error } = await supabase.from('payments').delete().eq('id', paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rejected-payments', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['payments', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['worker-paid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['worker-paid-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-summaries'] });
      setPaymentToDelete(null);
      toast({
        title: t('payments.paymentDeleted'),
        description: t('payments.paymentDeletedDesc'),
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

  // Filter based on role - users only see their own rejected payments
  const filteredPayments = rejectedPayments?.filter(p => 
    role === 'admin' || p.created_by === user?.id
  ) || [];

  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (filteredPayments.length === 0) {
    return null; // Don't show section if no rejected payments
  }

  return (
    <>
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="rejected" className="border rounded-lg bg-card shadow-card">
        <AccordionTrigger className="px-3 md:px-6 hover:no-underline">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="p-1.5 md:p-2 rounded-lg bg-destructive/10">
              <XCircle className="w-4 h-4 md:w-5 md:h-5 text-destructive" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm md:text-base">{t('rejectedPayments.title')}</p>
              <p className="text-xs md:text-sm text-muted-foreground font-normal">
                {t('rejectedPayments.rejectedCount', { count: filteredPayments.length })}
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-0 pb-0">
          <div className="border-t">
            {/* Mobile Card View */}
            <div className="md:hidden p-3 space-y-2">
              {filteredPayments.map((payment) => (
                <div key={payment.id} className="p-3 rounded-lg border bg-destructive/5 border-destructive/20">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{payment.paid_to}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{payment.reason}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-sm text-destructive flex-shrink-0">
                      {Number(payment.amount).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t">
                    <div className="text-[10px] text-muted-foreground">
                      <span>{t('rejectedPayments.by')}: {payment.creator_name}</span>
                      <span className="mx-1">•</span>
                      <span>{t('rejectedPayments.rejected')}: {payment.rejector_name || 'Unknown'}</span>
                      {payment.rejection_reason && (
                        <p className="mt-0.5 text-destructive/80 truncate max-w-[200px]">
                          "{payment.rejection_reason}"
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPaymentToDelete(payment)}
                      disabled={deletePayment.isPending}
                      className="h-7 w-7 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t('common.date')}</TableHead>
                    <TableHead>{t('payments.paidTo')}</TableHead>
                    <TableHead>{t('common.reason')}</TableHead>
                    <TableHead className="text-right">{t('common.amount')}</TableHead>
                    <TableHead>{t('rejectedPayments.rejectedBy')}</TableHead>
                    <TableHead>{t('payments.addedBy')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="font-medium">{payment.paid_to}</TableCell>
                      <TableCell className="max-w-xs truncate">{payment.reason}</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {Number(payment.amount).toLocaleString('fr-FR')} CFA
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{payment.rejector_name || 'Unknown'}</span>
                          {payment.rejection_reason && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <MessageSquare className="w-4 h-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="font-medium text-xs mb-1">{t('rejectedPayments.rejectionReason')}:</p>
                                  <p className="text-xs">{payment.rejection_reason}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {payment.creator_name}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPaymentToDelete(payment)}
                          disabled={deletePayment.isPending}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>

    {/* Delete Confirmation */}
    <AlertDialog open={!!paymentToDelete} onOpenChange={(open) => !open && setPaymentToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmDelete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('confirmDelete.payment', { amount: paymentToDelete ? Number(paymentToDelete.amount).toLocaleString('fr-FR') : '' })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => paymentToDelete && deletePayment.mutate(paymentToDelete.id)}
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
