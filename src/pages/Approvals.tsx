import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Check, X, Loader2, ClipboardCheck } from 'lucide-react';

export default function Approvals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pendingPayments, isLoading } = useQuery({
    queryKey: ['pending-payments'],
    queryFn: async () => {
      // Fetch pending payments with workshops
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          *,
          workshops(name)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (paymentsError) throw paymentsError;
      
      // Fetch all profiles to join with payments
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      
      // Create a lookup map
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.full_name]) || []);
      
      // Join the data
      return paymentsData.map(payment => ({
        ...payment,
        creator_name: profileMap.get(payment.created_by) || 'Unknown'
      }));
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ paymentId, status }: { paymentId: string; status: 'approved' | 'rejected' }) => {
      const { error } = await supabase
        .from('payments')
        .update({ 
          status, 
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', paymentId);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({
        title: status === 'approved' ? 'Payment Approved' : 'Payment Rejected',
        description: `The payment has been ${status}`,
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

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pending Approvals</h2>
          <p className="text-muted-foreground">
            Review and approve payments submitted by users
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
              <p className="text-muted-foreground">No pending approvals</p>
              <p className="text-sm text-muted-foreground mt-1">All payments have been reviewed</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {pendingPayments.map((payment) => (
              <Card key={payment.id} className="shadow-card animate-fade-in">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{payment.paid_to}</CardTitle>
                      <CardDescription>{payment.reason}</CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                      Pending
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Amount:</span>{' '}
                        <span className="font-mono font-medium">
                          {Number(payment.amount).toLocaleString('fr-FR')} CFA
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date:</span>{' '}
                        <span className="font-mono">{format(new Date(payment.payment_date), 'MMM d, yyyy')}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Workshop:</span>{' '}
                        <span>{(payment.workshops as any)?.name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Submitted by:</span>{' '}
                        <span>{payment.creator_name}</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateStatus.mutate({ paymentId: payment.id, status: 'rejected' })}
                        disabled={updateStatus.isPending}
                        className="gap-2 text-destructive hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => updateStatus.mutate({ paymentId: payment.id, status: 'approved' })}
                        disabled={updateStatus.isPending}
                        className="gap-2 bg-success hover:bg-success/90 text-success-foreground"
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
