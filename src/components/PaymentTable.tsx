import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
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
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Pencil, Trash2, Clock, CheckCircle, XCircle } from 'lucide-react';

interface PaymentTableProps {
  workshopId: string;
  onEdit?: (payment: any) => void;
}

export default function PaymentTable({ workshopId, onEdit }: PaymentTableProps) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments', workshopId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          profiles:created_by(full_name)
        `)
        .eq('workshop_id', workshopId)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!workshopId,
  });

  const deletePayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', workshopId] });
      toast({
        title: 'Payment deleted',
        description: 'The payment record has been removed',
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-success/10 text-success border-success/20 gap-1">
            <CheckCircle className="w-3 h-3" />
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
            <XCircle className="w-3 h-3" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge className="bg-warning/10 text-warning border-warning/20 gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </Badge>
        );
    }
  };

  const canEdit = (payment: any) => {
    if (role === 'admin') return true;
    return payment.created_by === user?.id && payment.status === 'pending';
  };

  const canDelete = (payment: any) => {
    if (role === 'admin') return true;
    return payment.created_by === user?.id && payment.status === 'pending';
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!payments || payments.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No payments recorded for this workshop yet.</p>
        <p className="text-sm mt-1">Click "Add Payment" to create the first one.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Date</TableHead>
            <TableHead>Paid To</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Added By</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id} className="animate-fade-in">
              <TableCell className="font-mono text-sm">
                {format(new Date(payment.payment_date), 'MMM d, yyyy')}
              </TableCell>
              <TableCell className="font-medium">{payment.paid_to}</TableCell>
              <TableCell className="max-w-xs truncate">{payment.reason}</TableCell>
              <TableCell className="text-right font-mono font-medium">
                {Number(payment.amount).toLocaleString('fr-FR')} CFA
              </TableCell>
              <TableCell>{getStatusBadge(payment.status)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {(payment.profiles as any)?.full_name || 'Unknown'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {canEdit(payment) && onEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(payment)}
                      className="h-8 w-8"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {canDelete(payment) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deletePayment.mutate(payment.id)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
