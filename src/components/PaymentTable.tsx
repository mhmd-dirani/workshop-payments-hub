import { useState, useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Pencil, Trash2, Clock, CheckCircle, XCircle, Search, DollarSign } from 'lucide-react';

interface PaymentTableProps {
  workshopId: string;
  onEdit?: (payment: any) => void;
}

export default function PaymentTable({ workshopId, onEdit }: PaymentTableProps) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments', workshopId],
    queryFn: async () => {
      // Fetch payments - for users, only show approved OR their own payments
      let query = supabase
        .from('payments')
        .select('*')
        .eq('workshop_id', workshopId)
        .order('payment_date', { ascending: false });
      
      const { data: paymentsData, error: paymentsError } = await query;
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
    enabled: !!workshopId,
  });

  // Filter payments based on role and search term
  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    
    // Hide rejected payments from dashboard for everyone
    let filtered = payments.filter(p => p.status !== 'rejected');
    
    // For non-admins: only show their OWN payments
    if (role !== 'admin' && user) {
      filtered = filtered.filter(p => p.created_by === user.id);
    }
    
    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(p => 
        p.paid_to.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered;
  }, [payments, role, user, searchTerm]);

  // Calculate total for search results
  const searchTotal = useMemo(() => {
    if (!searchTerm.trim()) return null;
    return filteredPayments
      .filter(p => p.status === 'approved')
      .reduce((sum, p) => sum + Number(p.amount), 0);
  }, [filteredPayments, searchTerm]);

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

  if (!filteredPayments || filteredPayments.length === 0) {
    return (
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name (paid to)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-center py-12 text-muted-foreground">
          <p>{searchTerm ? 'No payments found matching your search.' : 'No payments recorded for this workshop yet.'}</p>
          <p className="text-sm mt-1">{searchTerm ? 'Try a different search term.' : 'Click "Add Payment" to create the first one.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name (paid to)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Search Total Card */}
      {searchTerm.trim() && searchTotal !== null && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-primary font-medium">
                  Total paid to "{searchTerm}" (approved only)
                </p>
                <p className="text-xl font-bold font-mono text-primary">
                  -{searchTotal.toLocaleString('fr-FR')} CFA
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
            {filteredPayments.map((payment) => (
              <TableRow key={payment.id} className="animate-fade-in">
                <TableCell className="font-mono text-sm">
                  {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="font-medium">{payment.paid_to}</TableCell>
                <TableCell className="max-w-xs truncate">{payment.reason}</TableCell>
                <TableCell className="text-right font-mono font-medium text-primary">
                  -{Number(payment.amount).toLocaleString('fr-FR')} CFA
                </TableCell>
                <TableCell>{getStatusBadge(payment.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {payment.creator_name}
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
    </div>
  );
}
