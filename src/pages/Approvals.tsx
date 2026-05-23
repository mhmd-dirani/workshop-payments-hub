import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { translatePaidTo, translateReason } from '@/lib/payment-display-utils';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Check, X, Loader2, ClipboardCheck, ArrowUpCircle } from 'lucide-react';

export default function Approvals() {
  const { t } = useTranslation();
  const { user, role, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectDebtDialogOpen, setRejectDebtDialogOpen] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  if (!user || role !== 'admin') {
    return <Navigate to={!user ? "/auth" : "/"} replace />;
  }

  // Pending payments query
  const { data: pendingPayments, isLoading } = useQuery({
    queryKey: ['pending-payments'],
    queryFn: async () => {
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`*, workshops(name)`)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (paymentsError) throw paymentsError;
      
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.full_name]) || []);
      
      return paymentsData.map(payment => ({
        ...payment,
        creator_name: profileMap.get(payment.created_by) || 'Unknown'
      }));
    },
  });

  // Pending debts query
  const { data: pendingDebts = [], isLoading: loadingDebts } = useQuery({
    queryKey: ['pending-debts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debts')
        .select('*');
      if (error) throw error;
      
      // Filter pending on client side since status column is new
      const pendingData = (data || []).filter((d: any) => d.status === 'pending');
      
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.full_name]) || []);
      
      return pendingData.map((debt: any) => ({
        ...debt,
        creator_name: profileMap.get(debt.created_by) || 'Unknown'
      }));
    },
  });

  // Payment status mutation
  const updateStatus = useMutation({
    mutationFn: async ({ paymentId, status, rejectionReason }: { paymentId: string; status: 'approved' | 'rejected'; rejectionReason?: string }) => {
      // Find the payment to check for debt repayment
      const payment = pendingPayments?.find(p => p.id === paymentId);
      
      const { error } = await supabase
        .from('payments')
        .update({ 
          status, 
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: status === 'rejected' ? rejectionReason || null : null,
        })
        .eq('id', paymentId);
      if (error) throw error;

      // If approved and this is a debt repayment, create the debt_payment and worker_adjustment
      if (status === 'approved' && payment) {
        const debtMatch = payment.reason?.match(/\[DEBT_REPAYMENT:([^\]]+)\]/);
        if (debtMatch) {
          const debtId = debtMatch[1];
          const amount = Number(payment.amount);
          
          // Find worker name from reason
          const workerName = payment.reason?.split(' - Debt repayment')[0] || '';

          // 1. Record debt payment
          await supabase.from('debt_payments').insert({
            debt_id: debtId,
            amount,
            payment_date: payment.payment_date,
            description: `Debt repayment deducted from salary`,
            created_by: payment.created_by,
          });

          // 2. Find worker to get worker_id
          const { data: workerData } = await supabase
            .from('workers')
            .select('id')
            .eq('name', workerName)
            .single();

          if (workerData) {
            // 3. Create discount adjustment to reduce salary
            await supabase.from('worker_adjustments').insert({
              worker_id: workerData.id,
              workshop_id: payment.workshop_id,
              work_date: payment.payment_date,
              adjustment_type: 'discount',
              amount,
              reason: `Debt repayment - ${amount.toLocaleString('fr-FR')} CFA deducted [DEBT_REPAYMENT]`,
              is_paid: false,
              created_by: payment.created_by,
            });
          }

          // 4. Check if debt is fully paid
          const { data: debtData } = await supabase.from('debts').select('amount').eq('id', debtId).single();
          const { data: allDebtPayments } = await supabase.from('debt_payments').select('amount').eq('debt_id', debtId);
          if (debtData && allDebtPayments) {
            const totalPaid = allDebtPayments.reduce((s, p) => s + Number(p.amount), 0);
            if (totalPaid >= Number(debtData.amount)) {
              await supabase.from('debts').update({ is_settled: true }).eq('id', debtId);
            }
          }
        }
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['rejected-payments'] });
      queryClient.invalidateQueries({ queryKey: ['worker-debts'] });
      queryClient.invalidateQueries({ queryKey: ['worker-debt-payments'] });
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      queryClient.invalidateQueries({ queryKey: ['personal-payments'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({
        title: status === 'approved' ? t('approvals.paymentApproved') : t('approvals.paymentRejected'),
        description: status === 'approved' ? t('approvals.hasBeenApproved') : t('approvals.hasBeenRejected'),
      });
      setRejectDialogOpen(false);
      setSelectedPaymentId(null);
      setRejectionReason('');
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Debt status mutation
  const updateDebtStatus = useMutation({
    mutationFn: async ({ debtId, status }: { debtId: string; status: 'approved' | 'rejected' }) => {
      // Find the debt to get person_name for matching the payment
      const debt = pendingDebts.find((d: any) => d.id === debtId);
      
      if (status === 'rejected') {
        // Remove any personal_payments deduction tied to this debt (legacy or otherwise)
        // so the placer's balance is not affected by a rejected debt.
        if (debt) {
          await supabase
            .from('personal_payments')
            .delete()
            .eq('user_id', (debt as any).created_by)
            .or(`reason.ilike.%[WORKER_DEBT:${debtId}]%,reason.ilike.%[WORKER_DEBT]%${(debt as any).person_name}%`);

          // Also delete any associated pending payments (older flow)
          const { data: matchingPayments } = await supabase
            .from('payments')
            .select('id')
            .eq('created_by', (debt as any).created_by)
            .eq('status', 'pending')
            .ilike('reason', `%${(debt as any).person_name}%[WORKER_DEBT]%`);
          
          if (matchingPayments && matchingPayments.length > 0) {
            await supabase.from('payments').delete().in('id', matchingPayments.map((p: any) => p.id));
          }
        }
        const { error } = await supabase.from('debts').delete().eq('id', debtId);
        if (error) throw error;
      } else {
        // Approve the debt
        const { error } = await supabase
          .from('debts')
          .update({ status } as any)
          .eq('id', debtId);
        if (error) throw error;
        
        if (debt) {
          // Deduct from the placer's balance NOW (on approval) by inserting a personal_payment.
          // Skip if a deduction already exists for this debt (idempotent / legacy safety).
          const { data: existing } = await supabase
            .from('personal_payments')
            .select('id')
            .eq('user_id', (debt as any).created_by)
            .ilike('reason', `%[WORKER_DEBT:${debtId}]%`)
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase.from('personal_payments').insert({
              user_id: (debt as any).created_by,
              paid_to: (debt as any).person_name,
              reason: `Worker debt - ${((debt as any).description || 'Debt').replace('[WORKER_DEBT]', '').trim()} [WORKER_DEBT:${debtId}]`,
              amount: (debt as any).amount,
              payment_date: (debt as any).debt_date,
              created_by: user?.id,
            });
          }

          // Also approve any associated pending payment (older flow that pre-created one)
          const { data: matchingPayments } = await supabase
            .from('payments')
            .select('id')
            .eq('created_by', (debt as any).created_by)
            .eq('status', 'pending')
            .ilike('reason', `%${(debt as any).person_name}%[WORKER_DEBT]%`);
          
          if (matchingPayments && matchingPayments.length > 0) {
            await supabase
              .from('payments')
              .update({ 
                status: 'approved',
                approved_by: user?.id,
                approved_at: new Date().toISOString(),
              })
              .in('id', matchingPayments.map((p: any) => p.id));
          }
        }
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['pending-debts'] });
      queryClient.invalidateQueries({ queryKey: ['worker-debts'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      queryClient.invalidateQueries({ queryKey: ['personal-payments'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({
        title: status === 'approved' ? t('approvals.debtApproved') : t('approvals.debtRejected'),
        description: status === 'approved' ? t('approvals.debtHasBeenApproved') : t('approvals.debtHasBeenRejected'),
      });
      setRejectDebtDialogOpen(false);
      setSelectedDebtId(null);
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const handleRejectClick = (paymentId: string) => {
    setSelectedPaymentId(paymentId);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = () => {
    if (selectedPaymentId) {
      updateStatus.mutate({ paymentId: selectedPaymentId, status: 'rejected', rejectionReason: rejectionReason.trim() || undefined });
    }
  };

  const handleRejectDebtClick = (debtId: string) => {
    setSelectedDebtId(debtId);
    setRejectDebtDialogOpen(true);
  };

  const totalPending = (pendingPayments?.length || 0) + pendingDebts.length;
  const allLoading = isLoading || loadingDebts;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('approvals.title')}</h2>
          <p className="text-muted-foreground">{t('approvals.description')}</p>
        </div>

        {allLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : totalPending === 0 ? (
          <Card className="shadow-card">
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('approvals.noPending')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('approvals.allReviewed')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Pending Debts */}
            {pendingDebts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <ArrowUpCircle className="w-4 h-4 text-warning" />
                  {t('approvals.pendingDebts')}
                  <Badge variant="secondary" className="text-xs">{pendingDebts.length}</Badge>
                </h3>
                <div className="grid gap-3">
                  {pendingDebts.map((debt: any) => (
                    <Card key={debt.id} className="shadow-card animate-fade-in border-warning/20">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">
                              {t('approvals.debtFor')} {debt.person_name}
                            </CardTitle>
                            <CardDescription>
                              {debt.description?.replace('[WORKER_DEBT]', '').replace('[ADVANCE_DEBT]', '').trim()}
                            </CardDescription>
                          </div>
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                            {t('payments.pending')}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">{t('common.amount')}:</span>{' '}
                              <span className="font-mono font-medium">
                                {Number(debt.amount).toLocaleString('fr-FR')} CFA
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t('common.date')}:</span>{' '}
                              <span className="font-mono">{format(new Date(debt.debt_date), 'MMM d, yyyy')}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t('approvals.submittedBy')}:</span>{' '}
                              <span>{debt.creator_name}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRejectDebtClick(debt.id)}
                              disabled={updateDebtStatus.isPending}
                              className="gap-2 text-destructive hover:text-destructive"
                            >
                              <X className="w-4 h-4" />
                              {t('approvals.reject')}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => updateDebtStatus.mutate({ debtId: debt.id, status: 'approved' })}
                              disabled={updateDebtStatus.isPending}
                              className="gap-2 bg-success hover:bg-success/90 text-success-foreground"
                            >
                              <Check className="w-4 h-4" />
                              {t('approvals.approve')}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Payments */}
            {pendingPayments && pendingPayments.length > 0 && (
              <div className="grid gap-4">
                {pendingPayments.map((payment) => (
                  <Card key={payment.id} className="shadow-card animate-fade-in">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{translatePaidTo(payment.paid_to, t)}</CardTitle>
                          <CardDescription>{translateReason(payment.reason, t)}</CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                          {t('payments.pending')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">{t('common.amount')}:</span>{' '}
                            <span className="font-mono font-medium">
                              {Number(payment.amount).toLocaleString('fr-FR')} CFA
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('common.date')}:</span>{' '}
                            <span className="font-mono">{format(new Date(payment.payment_date), 'MMM d, yyyy')}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('approvals.workshop')}:</span>{' '}
                            <span>{(payment.workshops as any)?.name}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('approvals.submittedBy')}:</span>{' '}
                            <span>{payment.creator_name}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRejectClick(payment.id)}
                            disabled={updateStatus.isPending}
                            className="gap-2 text-destructive hover:text-destructive"
                          >
                            <X className="w-4 h-4" />
                            {t('approvals.reject')}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => updateStatus.mutate({ paymentId: payment.id, status: 'approved' })}
                            disabled={updateStatus.isPending}
                            className="gap-2 bg-success hover:bg-success/90 text-success-foreground"
                          >
                            <Check className="w-4 h-4" />
                            {t('approvals.approve')}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('approvals.rejectPayment')}</DialogTitle>
            <DialogDescription>{t('approvals.rejectConfirmation')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">{t('approvals.rejectionReason')}</Label>
              <Textarea
                id="rejection-reason"
                placeholder={t('approvals.enterRejectionReason')}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={updateStatus.isPending}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleConfirmReject} disabled={updateStatus.isPending} className="gap-2">
              {updateStatus.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('approvals.confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debt Rejection Dialog */}
      <Dialog open={rejectDebtDialogOpen} onOpenChange={setRejectDebtDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('approvals.rejectPayment')}</DialogTitle>
            <DialogDescription>{t('approvals.rejectConfirmation')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDebtDialogOpen(false)} disabled={updateDebtStatus.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedDebtId && updateDebtStatus.mutate({ debtId: selectedDebtId, status: 'rejected' })}
              disabled={updateDebtStatus.isPending}
              className="gap-2"
            >
              {updateDebtStatus.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('approvals.confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
