import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import { Check, X, Loader2, ClipboardCheck } from 'lucide-react';

export default function Approvals() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const { data: pendingPayments, isLoading } = useQuery({
    queryKey: ['pending-payments'],
    queryFn: async () => {
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          *,
          workshops(name)
        `)
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

  const updateStatus = useMutation({
    mutationFn: async ({ 
      paymentId, 
      status, 
      rejectionReason 
    }: { 
      paymentId: string; 
      status: 'approved' | 'rejected';
      rejectionReason?: string;
    }) => {
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
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['rejected-payments'] });
      toast({
        title: status === 'approved' ? t('approvals.paymentApproved') : t('approvals.paymentRejected'),
        description: status === 'approved' ? t('approvals.hasBeenApproved') : t('approvals.hasBeenRejected'),
      });
      setRejectDialogOpen(false);
      setSelectedPaymentId(null);
      setRejectionReason('');
    },
    onError: (error: Error) => {
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleRejectClick = (paymentId: string) => {
    setSelectedPaymentId(paymentId);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = () => {
    if (selectedPaymentId) {
      updateStatus.mutate({ 
        paymentId: selectedPaymentId, 
        status: 'rejected',
        rejectionReason: rejectionReason.trim() || undefined
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('approvals.title')}</h2>
          <p className="text-muted-foreground">
            {t('approvals.description')}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !pendingPayments || pendingPayments.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('approvals.noPending')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('approvals.allReviewed')}</p>
            </CardContent>
          </Card>
        ) : (
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

      {/* Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('approvals.rejectPayment')}</DialogTitle>
            <DialogDescription>
              {t('approvals.rejectConfirmation')}
            </DialogDescription>
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
            <Button 
              variant="outline" 
              onClick={() => setRejectDialogOpen(false)}
              disabled={updateStatus.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={updateStatus.isPending}
              className="gap-2"
            >
              {updateStatus.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('approvals.confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}