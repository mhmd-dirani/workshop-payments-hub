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
    mutationFn: async (payment: any) => {
      // First, delete any transfers linked to this payment (for legacy data without payment_id)
      // Try to match by workshop_id, amount, and date
      await supabase
        .from('user_transfers')
        .delete()
        .eq('workshop_id', workshopId)
        .eq('amount', payment.amount)
        .eq('transfer_date', payment.payment_date);

      // Also delete by payment_id if it exists (cascade should handle this, but be explicit)
      await supabase
        .from('user_transfers')
        .delete()
        .eq('payment_id', payment.id);

      // Now delete the payment
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] }); // Sync with admin approvals page
      queryClient.invalidateQueries({ queryKey: ['user-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-stats', workshopId] });
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
    <div className="space-y-3 md:space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-9 md:h-10"
        />
      </div>

      {/* Search Total Card */}
      {searchTerm.trim() && searchTotal !== null && (
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="py-3 px-3 md:px-6">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 rounded-lg bg-destructive/10">
                <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-destructive font-medium">
                  Total paid to "{searchTerm}"
                </p>
                <p className="text-base md:text-xl font-bold font-mono text-destructive">
                  -{searchTotal.toLocaleString('fr-FR')} CFA
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-2">
        {filteredPayments.map((payment) => (
          <Card key={payment.id} className="shadow-card">
            <CardContent className="p-3">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{payment.paid_to}</p>
                  <p className="text-xs text-muted-foreground truncate">{payment.reason}</p>
                </div>
                <div className="text-right ml-2">
                  <p className="font-mono font-bold text-sm text-destructive">
                    -{Number(payment.amount).toLocaleString('fr-FR')}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(payment.payment_date), 'MMM d')}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusBadge(payment.status)}
                  <span className="text-[10px] text-muted-foreground">{payment.creator_name}</span>
                </div>
                <div className="flex gap-1">
                  {canEdit(payment) && onEdit && (
                    <Button variant="ghost" size="icon" onClick={() => onEdit(payment)} className="h-7 w-7">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {canDelete(payment) && (
                    <Button variant="ghost" size="icon" onClick={() => deletePayment.mutate(payment)} className="h-7 w-7 text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-lg border bg-card shadow-card overflow-hidden">
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
                <TableCell className="text-right font-mono font-medium text-destructive">
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
                        onClick={() => deletePayment.mutate(payment)}
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
